import { jsPDF } from 'jspdf'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'
import { Faktura, settFakturaPdfUrl, fakturaBelop } from '@/lib/payments'
import { formatKr } from '@/lib/format'
import { appUrl } from '@/lib/env'
import { tilPdfTekst } from '@/lib/pdftekst'

export interface FirmaInfo {
  firmanavn: string
  mva_sats?: number | null
  logo_url?: string | null
  orgnr?: string | null
  adresse?: string | null
  bankkonto?: string | null
}

export function fakturaBetalingslenke(faktura: Faktura): string {
  return `${appUrl()}/betal/${faktura.public_token}`
}

export async function hentFirmaForBruker(userId: string): Promise<FirmaInfo | null> {
  const { data, error } = await supabase.from('firma').select('*').eq('user_id', userId).maybeSingle()
  if (error) {
    // Feilen ble tidligere slukt helt. Konsekvensen var stille og forvirrende:
    // fakturaen ble generert med avsender "TilbudsMaskinen" i stedet for
    // firmanavnet, uten spor noe sted av hvorfor.
    console.error(`Klarte ikke å hente firma for bruker ${userId}:`, error)
    return null
  }
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
  // Timeout er ikke pynt: denne funksjonen kjører inne i Stripe-webhooken.
  // Henger Storage, henger webhook-svaret, Stripe gir opp og prøver igjen —
  // og da stopper idempotency-sjekken det andre forsøket, slik at fakturaen
  // blir stående betalt UTEN PDF og e-post.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || 'image/png'
    const { w, h } = lesBildeStorrelse(buffer)
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`, w, h }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// PDF-generering (server-side — jsPDF v4 støtter Node nativt)
// ---------------------------------------------------------------------------

export async function genererFakturaPdf(faktura: Faktura, firma: FirmaInfo | null): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  // ALL tekst inn i fakturaen går gjennom denne. Firmanavn, adresse og kundenavn
  // er frie tekstfelt, og jsPDFs standardfont sletter stille tegn utenfor
  // WinAnsi — en kunde som heter «Kjell–Ove» ville fått navnet sitt feilstavet
  // på en faktura som allerede er sendt. Bruk `skriv`, aldri `doc.text`.
  const skriv = (tekst: string, x: number, yPos: number, opts?: Parameters<typeof doc.text>[3]) =>
    doc.text(tilPdfTekst(tekst), x, yPos, opts)
  const margLeft = 56
  const margRight = 56
  const sideBredde = doc.internal.pageSize.getWidth()
  const tekstBredde = sideBredde - margLeft - margRight
  let y = 64

  // jsPDF bryter ikke tekst selv — den tegner rett videre forbi margen og til
  // slutt utenfor arket, uten å si fra. Betalingslenken målte 530 pt mot 483 pt
  // tilgjengelig: den lå 47 pt inne i høyremargen og 9 pt fra å bli kuttet av
  // arkkanten. En avkortet betalingslenke er ubrukelig for kunden.
  //
  // Gjelder også de frie tekstfeltene (firmaadresse, kundenavn, kundeadresse) —
  // de er korte i dagens data, men ingenting hindrer en lang verdi.
  // Returnerer ny y, slik at kallstedet kan fortsette å telle nedover.
  const skrivBrutt = (tekst: string, x: number, yPos: number, linjehoyde = 14): number => {
    const linjer: string[] = doc.splitTextToSize(tilPdfTekst(tekst), tekstBredde)
    for (const linje of linjer) {
      doc.text(linje, x, yPos)
      yPos += linjehoyde
    }
    return yPos
  }

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
  skriv('FAKTURA', margLeft, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  skriv(faktura.invoice_number, sideBredde - margRight, y, { align: 'right' })
  y += 24

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  skriv(firma?.firmanavn || 'TilbudsMaskinen', margLeft, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (firma?.adresse) {
    y = skrivBrutt(firma.adresse, margLeft, y)
  }
  if (firma?.orgnr) {
    // Mva-registrerte foretak skal oppgi org.nr etterfulgt av MVA.
    const erMvaRegistrert = (firma.mva_sats ?? 0) > 0
    skriv(`Org.nr: ${firma.orgnr}${erMvaRegistrert ? ' MVA' : ''}`, margLeft, y)
    y += 14
  }

  y += 20
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  skriv('Faktureres til', margLeft, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  y = skrivBrutt(faktura.kunde?.navn || 'Ukjent kunde', margLeft, y)
  if (faktura.kunde?.adresse) {
    y = skrivBrutt(faktura.kunde.adresse, margLeft, y)
  }
  if (faktura.kunde?.type === 'bedrift' && faktura.kunde?.orgnr) {
    skriv(`Org.nr: ${faktura.kunde.orgnr}`, margLeft, y)
    y += 14
  }
  if (faktura.kunde?.epost) {
    skriv(faktura.kunde.epost, margLeft, y)
    y += 14
  }

  y += 30
  doc.setDrawColor(200)
  doc.line(margLeft, y, sideBredde - margRight, y)
  y += 24

  const belop = fakturaBelop(faktura)

  doc.setFontSize(11)
  if (belop.sats > 0) {
    // Uten spesifisert grunnlag og mva-beløp er fakturaen ikke gyldig for en
    // mva-registrert utsteder.
    doc.setFont('helvetica', 'normal')
    skriv('Grunnlag', margLeft, y)
    skriv(formatKr(belop.grunnlag), sideBredde - margRight, y, { align: 'right' })
    y += 16
    skriv(`Merverdiavgift ${belop.sats} %`, margLeft, y)
    skriv(formatKr(belop.mva), sideBredde - margRight, y, { align: 'right' })
    y += 16
    doc.setDrawColor(200)
    doc.line(sideBredde - margRight - 160, y - 6, sideBredde - margRight, y - 6)
  }

  doc.setFont('helvetica', 'bold')
  skriv(belop.sats > 0 ? 'Å betale' : 'Beløp', margLeft, y)
  skriv(formatKr(belop.total), sideBredde - margRight, y, { align: 'right' })
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  skriv(`Opprettet: ${new Date(faktura.created_at).toLocaleDateString('nb-NO')}`, margLeft, y)
  y += 14
  if (faktura.due_date) {
    skriv(`Forfallsdato: ${new Date(faktura.due_date).toLocaleDateString('nb-NO')}`, margLeft, y)
    y += 14
  }
  const statusTekst: Record<Faktura['status'], string> = {
    draft: 'Utkast',
    pending: 'Venter på betaling',
    paid: 'Betalt',
    failed: 'Betaling feilet',
    cancelled: 'Kansellert',
  }
  skriv(`Status: ${statusTekst[faktura.status]}`, margLeft, y)
  y += 14
  if (faktura.paid_at) {
    skriv(`Betalt: ${new Date(faktura.paid_at).toLocaleDateString('nb-NO')}`, margLeft, y)
    y += 14
  }

  if (faktura.status !== 'paid') {
    y += 20
    doc.setFont('helvetica', 'bold')
    skriv('Betalingsinformasjon', margLeft, y)
    y += 14
    doc.setFont('helvetica', 'normal')
    y = skrivBrutt(`Betal enkelt med kort: ${fakturaBetalingslenke(faktura)}`, margLeft, y)
    if (firma?.bankkonto) {
      skriv(`Eller via bank, kontonummer: ${firma.bankkonto}`, margLeft, y)
      y += 14
    }
    skriv(`Merk betalingen med fakturanummer ${faktura.invoice_number}.`, margLeft, y)
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

/**
 * Utfallet av et forsøk på å sende fakturaen.
 *
 * Funksjonen kaster aldri — se catch-blokken nedenfor for hvorfor. Men den må
 * kunne SI FRA at den ikke sendte: webhooken skal svelge feilen (betalingen har
 * allerede skjedd), mens «Send på nytt» må vise den, for det er der
 * håndverkeren aktivt ber om å få e-posten av gårde.
 *
 * `kanProeveIgjen` skiller infrastruktur fra data: en SMTP-feil går som regel
 * over, en kunde uten e-postadresse gjør ikke det — der må håndverkeren fikse
 * kundekortet, og «prøv igjen» er feil råd.
 */
export type EpostResultat =
  | { sendt: true }
  | { sendt: false; grunn: string; kanProeveIgjen: boolean }

export async function sendFakturaEpost(
  faktura: Faktura,
  pdfBuffer: Buffer,
  firma: FirmaInfo | null
): Promise<EpostResultat> {
  if (!faktura.kunde?.epost) {
    console.warn(`Faktura ${faktura.invoice_number}: kunden mangler e-post, hopper over utsending.`)
    return {
      sendt: false,
      grunn: 'Kunden mangler e-postadresse. Legg den inn på kundekortet og prøv igjen.',
      kanProeveIgjen: false,
    }
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
      text:
        faktura.status === 'paid'
          ? `Hei ${faktura.kunde.navn},\n\nVedlagt finner du faktura ${faktura.invoice_number} på ${formatKr(fakturaBelop(faktura).total)} — betalt, kvittering vedlagt.\n\nMed vennlig hilsen\n${firma?.firmanavn || 'TilbudsMaskinen'}`
          : `Hei ${faktura.kunde.navn},\n\nVedlagt finner du faktura ${faktura.invoice_number} på ${formatKr(fakturaBelop(faktura).total)}.\n\nBetal enkelt og trygt her: ${fakturaBetalingslenke(faktura)}\n\nMed vennlig hilsen\n${firma?.firmanavn || 'TilbudsMaskinen'}`,
      attachments: [
        {
          filename: `faktura-${faktura.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
    return { sendt: true }
  } catch (err) {
    // Denne funksjonen kalles fra Stripe-webhooken, etter at betalingen er
    // registrert og fakturaen markert betalt. En e-postfeil skal derfor ikke
    // kaste videre: da ville webhooken svart 500, Stripe prøvd igjen, og
    // idempotency-sjekken stoppet det andre forsøket — uten at e-posten kom
    // frem uansett. Vi logger i stedet, og håndverkeren kan bruke "Send på
    // nytt" på fakturasiden.
    console.error(`Klarte ikke å sende faktura-e-post for ${faktura.invoice_number}:`, err)
    return {
      sendt: false,
      grunn: 'E-posten kunne ikke sendes akkurat nå.',
      kanProeveIgjen: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Orkestrering — brukes av webhook og "send på nytt"
// ---------------------------------------------------------------------------

/**
 * PDF-en er generert og lagret uansett hva som skjer med e-posten — derfor
 * returneres begge delene. Webhooken bryr seg bare om at det ikke kastes;
 * «Send på nytt» må vite om e-posten faktisk gikk, og skal fortsatt få
 * `pdfUrl` selv når den ikke gjorde det.
 */
export async function genererLagreOgSendFaktura(
  faktura: Faktura
): Promise<{ pdfUrl: string; epost: EpostResultat }> {
  const firma = await hentFirmaForBruker(faktura.user_id)
  const pdfBuffer = await genererFakturaPdf(faktura, firma)
  const pdfUrl = await lastOppFakturaPdf(faktura.id, pdfBuffer)
  await settFakturaPdfUrl(faktura.id, pdfUrl)
  const epost = await sendFakturaEpost(faktura, pdfBuffer, firma)
  return { pdfUrl, epost }
}
