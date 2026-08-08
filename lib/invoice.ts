import { jsPDF } from 'jspdf'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'
import { Faktura, settFakturaPdfUrl } from '@/lib/payments'

interface FirmaInfo {
  firmanavn: string
  logo_url?: string | null
  orgnr?: string | null
  adresse?: string | null
  bankkonto?: string | null
}

function formatKr(beløp: number) {
  return `kr ${Math.round(beløp).toLocaleString('nb-NO')},-`
}

async function hentFirmaForBruker(userId: string): Promise<FirmaInfo | null> {
  const { data } = await supabase.from('firma').select('*').eq('user_id', userId).maybeSingle()
  return (data as FirmaInfo) ?? null
}

// --- Bildedimensjoner uten nettleser-API-er (Image()/FileReader finnes ikke i Node) ---

function lesPngStorrelse(buf: Buffer): { w: number; h: number } | null {
  const signatur = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signatur)) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function lesJpegStorrelse(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    const erSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (erSofMarker) {
      return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) }
    }
    const segmentLengde = buf.readUInt16BE(offset + 2)
    offset += 2 + segmentLengde
  }
  return null
}

function lesBildeStorrelse(buf: Buffer): { w: number; h: number } {
  const fallback = { w: 100, h: 44 }
  return lesPngStorrelse(buf) ?? lesJpegStorrelse(buf) ?? fallback
}

async function hentLogo(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    const { w, h } = lesBildeStorrelse(buffer)
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`, w, h }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PDF-generering (server-side — jsPDF v4 støtter Node nativt)
// ---------------------------------------------------------------------------

export async function genererFakturaPdf(faktura: Faktura, firma: FirmaInfo | null): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margLeft = 56
  const margRight = 56
  const sideBredde = doc.internal.pageSize.getWidth()
  let y = 64

  if (firma?.logo_url) {
    const logo = await hentLogo(firma.logo_url)
    if (logo) {
      try {
        const maksBredde = 100
        const maksHoyde = 44
        const skala = Math.min(maksBredde / logo.w, maksHoyde / logo.h)
        doc.addImage(logo.dataUrl, margLeft, y, logo.w * skala, logo.h * skala, undefined, 'FAST')
        y += logo.h * skala + 16
      } catch {
        // ugyldig bildeformat for PDF – hopp over logo
      }
    }
  }

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('FAKTURA', margLeft, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(faktura.invoice_number, sideBredde - margRight, y, { align: 'right' })
  y += 24

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(firma?.firmanavn || 'TilbudsMaskinen', margLeft, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (firma?.adresse) {
    doc.text(firma.adresse, margLeft, y)
    y += 14
  }
  if (firma?.orgnr) {
    doc.text(`Org.nr: ${firma.orgnr}`, margLeft, y)
    y += 14
  }

  y += 20
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Faktureres til', margLeft, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.text(faktura.kunde?.navn || 'Ukjent kunde', margLeft, y)
  y += 14
  if (faktura.kunde?.adresse) {
    doc.text(faktura.kunde.adresse, margLeft, y)
    y += 14
  }
  if (faktura.kunde?.type === 'bedrift' && faktura.kunde?.orgnr) {
    doc.text(`Org.nr: ${faktura.kunde.orgnr}`, margLeft, y)
    y += 14
  }
  if (faktura.kunde?.epost) {
    doc.text(faktura.kunde.epost, margLeft, y)
    y += 14
  }

  y += 30
  doc.setDrawColor(200)
  doc.line(margLeft, y, sideBredde - margRight, y)
  y += 24

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Beløp', margLeft, y)
  doc.text(formatKr(faktura.amount), sideBredde - margRight, y, { align: 'right' })
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Opprettet: ${new Date(faktura.created_at).toLocaleDateString('nb-NO')}`, margLeft, y)
  y += 14
  if (faktura.due_date) {
    doc.text(`Forfallsdato: ${new Date(faktura.due_date).toLocaleDateString('nb-NO')}`, margLeft, y)
    y += 14
  }
  const statusTekst: Record<Faktura['status'], string> = {
    draft: 'Utkast',
    pending: 'Venter på betaling',
    paid: 'Betalt',
    failed: 'Betaling feilet',
    cancelled: 'Kansellert',
  }
  doc.text(`Status: ${statusTekst[faktura.status]}`, margLeft, y)
  y += 14
  if (faktura.paid_at) {
    doc.text(`Betalt: ${new Date(faktura.paid_at).toLocaleDateString('nb-NO')}`, margLeft, y)
    y += 14
  }

  if (faktura.status !== 'paid' && firma?.bankkonto) {
    y += 20
    doc.setFont('helvetica', 'bold')
    doc.text('Betalingsinformasjon', margLeft, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.text(`Kontonummer: ${firma.bankkonto}`, margLeft, y)
    y += 14
    doc.text(`Merk betalingen med fakturanummer ${faktura.invoice_number}.`, margLeft, y)
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// ---------------------------------------------------------------------------
// Supabase Storage
// ---------------------------------------------------------------------------

export async function lastOppFakturaPdf(fakturaId: string, pdfBuffer: Buffer): Promise<string> {
  const filsti = `${fakturaId}.pdf`
  const { error } = await supabase.storage
    .from('invoices')
    .upload(filsti, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(`Klarte ikke å laste opp faktura-PDF: ${error.message}`)

  const { data } = supabase.storage.from('invoices').getPublicUrl(filsti)
  return data.publicUrl
}

// ---------------------------------------------------------------------------
// E-postutsending — gjenbruker samme SMTP-transport (Resend) som magic-link
// ---------------------------------------------------------------------------

export async function sendFakturaEpost(faktura: Faktura, pdfBuffer: Buffer, firma: FirmaInfo | null): Promise<void> {
  if (!faktura.kunde?.epost) {
    console.warn(`Faktura ${faktura.invoice_number}: kunden mangler e-post, hopper over utsending.`)
    return
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  })

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: faktura.kunde.epost,
      subject: `Faktura ${faktura.invoice_number} fra ${firma?.firmanavn || 'TilbudsMaskinen'}`,
      text: `Hei ${faktura.kunde.navn},\n\nVedlagt finner du faktura ${faktura.invoice_number} på ${formatKr(faktura.amount)}.\n\nMed vennlig hilsen\n${firma?.firmanavn || 'TilbudsMaskinen'}`,
      attachments: [
        {
          filename: `faktura-${faktura.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
  } catch (err) {
    // I Resend sandbox-modus kan e-post KUN sendes til kontoens egen adresse
    // (tilbudsmaskinen.no@gmail.com) — se docs/payments-setup.md. Dette er en
    // forventet, kjent begrensning, ikke en uventet feil, så vi logger og
    // fortsetter i stedet for å kaste videre og feile hele webhook-kallet.
    console.error(`Klarte ikke å sende faktura-e-post for ${faktura.invoice_number}:`, err)
  }
}

// ---------------------------------------------------------------------------
// Orkestrering — brukes av webhook og "send på nytt"
// ---------------------------------------------------------------------------

export async function genererLagreOgSendFaktura(faktura: Faktura): Promise<string> {
  const firma = await hentFirmaForBruker(faktura.user_id)
  const pdfBuffer = await genererFakturaPdf(faktura, firma)
  const pdfUrl = await lastOppFakturaPdf(faktura.id, pdfBuffer)
  await settFakturaPdfUrl(faktura.id, pdfUrl)
  await sendFakturaEpost(faktura, pdfBuffer, firma)
  return pdfUrl
}
