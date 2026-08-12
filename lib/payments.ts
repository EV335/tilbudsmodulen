import { supabase } from '@/lib/supabase'
import { getStripe } from '@/lib/stripe'
import { fakturaBelop, type MvaLinjer } from '@/lib/mva'

// Re-eksport for server-side kallere, som allerede importerer fra payments.
export { fakturaBelop }

export type KundeType = 'privat' | 'bedrift'

export interface Kunde {
  id: string
  user_id: string
  type: KundeType
  navn: string
  epost: string | null
  telefon: string | null
  adresse: string | null
  orgnr: string | null
  stripe_customer_id: string | null
  created_at: string
}

export type FakturaStatus = 'draft' | 'pending' | 'paid' | 'failed' | 'cancelled'
export type BetalingsType = 'checkout' | 'payment_intent'

export interface Faktura {
  id: string
  invoice_number: string
  user_id: string
  tilbud_id: string | null
  customer_id: string
  amount: number
  currency: string
  status: FakturaStatus
  payment_type: BetalingsType | null
  pdf_url: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string
  public_token: string
  // Snapshot av satsen da fakturaen ble laget — endrer firmaet sats senere,
  // skal en allerede sendt faktura stå urørt. 0 = ingen mva.
  mva_sats: number
  // Om `amount` allerede inneholder mva.
  mva_inkludert: boolean
  kunde?: Kunde
}

// ---------------------------------------------------------------------------
// Kunderegister (customers)
// ---------------------------------------------------------------------------

export async function hentKunder(userId: string): Promise<Kunde[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Klarte ikke å hente kunder: ${error.message}`)
  return data as Kunde[]
}

export async function hentKunde(userId: string, id: string): Promise<Kunde | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å hente kunde: ${error.message}`)
  return data as Kunde | null
}

export interface OpprettKundeInput {
  type: KundeType
  navn: string
  epost?: string | null
  telefon?: string | null
  adresse?: string | null
  orgnr?: string | null
}

export async function opprettKunde(userId: string, input: OpprettKundeInput): Promise<Kunde> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id: userId,
      type: input.type,
      navn: input.navn,
      epost: input.epost || null,
      telefon: input.telefon || null,
      adresse: input.adresse || null,
      orgnr: input.type === 'bedrift' ? input.orgnr || null : null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Klarte ikke å opprette kunde: ${error.message}`)
  return data as Kunde
}

export async function oppdaterKunde(
  userId: string,
  id: string,
  input: OpprettKundeInput
): Promise<Kunde | null> {
  const { data, error } = await supabase
    .from('customers')
    .update({
      type: input.type,
      navn: input.navn,
      epost: input.epost || null,
      telefon: input.telefon || null,
      adresse: input.adresse || null,
      orgnr: input.type === 'bedrift' ? input.orgnr || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å oppdatere kunde: ${error.message}`)
  return data as Kunde | null
}

// Kaster HarFakturaerError hvis kunden er brukt på en faktura. Det er ikke en
// feil som skal skjules: invoices.customer_id har `on delete restrict` nettopp
// fordi en faktura uten kunde ikke gir mening i et regnskap.
export class KundeHarFakturaerError extends Error {
  constructor() {
    super('Kunden har fakturaer og kan ikke slettes.')
    this.name = 'KundeHarFakturaerError'
  }
}

export async function slettKunde(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id).eq('user_id', userId)

  // 23503 = foreign_key_violation
  if ((error as { code?: string } | null)?.code === '23503') {
    throw new KundeHarFakturaerError()
  }
  if (error) throw new Error(`Klarte ikke å slette kunde: ${error.message}`)
}

// Sikrer at kunden har en Stripe Customer-id. Oppretter i Stripe + lagrer
// på raden hvis den mangler. Kun intern — går via klargjorPaymentIntent().
async function hentEllerOpprettStripeCustomerId(kunde: Kunde): Promise<string> {
  if (kunde.stripe_customer_id) return kunde.stripe_customer_id

  const stripe = getStripe()
  const stripeCustomer = await stripe.customers.create({
    name: kunde.navn,
    email: kunde.epost || undefined,
    phone: kunde.telefon || undefined,
    metadata: { kundeId: kunde.id, userId: kunde.user_id },
  })

  const { error } = await supabase
    .from('customers')
    .update({ stripe_customer_id: stripeCustomer.id, updated_at: new Date().toISOString() })
    .eq('id', kunde.id)

  if (error) throw new Error(`Klarte ikke å lagre Stripe-kunde-id: ${error.message}`)

  return stripeCustomer.id
}

// ---------------------------------------------------------------------------
// Fakturaer (invoices)
// ---------------------------------------------------------------------------

export async function hentFakturaer(userId: string, status?: FakturaStatus): Promise<Faktura[]> {
  let query = supabase
    .from('invoices')
    .select('*, kunde:customers(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw new Error(`Klarte ikke å hente fakturaer: ${error.message}`)
  return data as unknown as Faktura[]
}

// Uscopet oppslag — brukes KUN fra webhook-handleren, som autentiserer via
// Stripe-signatur (STRIPE_WEBHOOK_SECRET) i stedet for en innlogget sesjon.
export async function hentFakturaById(id: string): Promise<Faktura | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, kunde:customers(*)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å hente faktura: ${error.message}`)
  return data as unknown as Faktura | null
}

// Uscopet oppslag via public_token — brukes av de token-baserte /api/public/*-
// rutene slik at en sluttkunde uten TilbudsMaskinen-konto kan se og betale
// egen faktura. Tokenet (uuid, se migrasjonen) ER autentiseringen her.
export async function hentFakturaByPublicToken(token: string): Promise<Faktura | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, kunde:customers(*)')
    .eq('public_token', token)
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å hente faktura: ${error.message}`)
  return data as unknown as Faktura | null
}

// Det sluttkunden på /betal/[token] faktisk trenger å se. Ruten er
// uautentisert (tokenet ER autentiseringen), så den skal ikke røpe interne
// felter: user_id, customer_id, tilbud_id, Stripe-id-er, eller håndverkerens
// org.nr/bankkonto/kundens kontaktopplysninger.
export interface OffentligFaktura {
  invoice_number: string
  amount: number
  currency: string
  status: FakturaStatus
  due_date: string | null
  paid_at: string | null
  created_at: string
  pdf_url: string | null
  // Avgjør om kunden får Stripe Checkout (privat) eller Elements (bedrift).
  kundetype: KundeType | null
  firmanavn: string | null
  // Kunden skal kunne se hva de betaler mva av.
  mva: MvaLinjer
}

export function tilOffentligFaktura(faktura: Faktura, firmanavn: string | null): OffentligFaktura {
  return {
    invoice_number: faktura.invoice_number,
    amount: faktura.amount,
    currency: faktura.currency,
    status: faktura.status,
    due_date: faktura.due_date,
    paid_at: faktura.paid_at,
    created_at: faktura.created_at,
    pdf_url: faktura.pdf_url,
    kundetype: faktura.kunde?.type ?? null,
    firmanavn,
    mva: fakturaBelop(faktura),
  }
}

export async function hentFaktura(userId: string, id: string): Promise<Faktura | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, kunde:customers(*)')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å hente faktura: ${error.message}`)
  return data as unknown as Faktura | null
}

export interface OpprettFakturaInput {
  customerId: string
  amount: number
  tilbudId?: string | null
  dueDate?: string | null
  mvaSats?: number
  mvaInkludert?: boolean
}

// Fakturanummer er en egen, fortløpende serie PER bruker — bokføringsforskriften
// krever nummerering uten hull per utsteder, og appen er flerbruker.
// Se migrations/20260810_per_user_invoice_numbering.sql.
//
// Faller tilbake på den gamle globale sekvensen hvis migrasjonen ikke er kjørt,
// slik at fakturering ikke stopper opp — men logger høylytt, for da har hver
// bruker fortsatt en hullete serie.
async function nesteFakturanummer(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number', { p_user_id: userId })
  if (!error) return data as string

  const { data: globalt, error: globalFeil } = await supabase.rpc('next_invoice_number')
  if (globalFeil) {
    throw new Error(`Klarte ikke å generere fakturanummer: ${error.message}`)
  }

  console.error(
    'VARSEL: migrations/20260810_per_user_invoice_numbering.sql er ikke kjørt ennå. ' +
      'Bruker den globale fakturasekvensen — nummerseriene blir hullete per bruker.'
  )
  return globalt as string
}

export async function opprettFaktura(userId: string, input: OpprettFakturaInput): Promise<Faktura> {
  const invoiceNumber = await nesteFakturanummer(userId)

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      user_id: userId,
      tilbud_id: input.tilbudId || null,
      customer_id: input.customerId,
      amount: input.amount,
      currency: 'nok',
      status: 'draft',
      due_date: input.dueDate || null,
      mva_sats: input.mvaSats ?? 0,
      mva_inkludert: input.mvaInkludert ?? false,
    })
    .select('*, kunde:customers(*)')
    .single()

  if (error) throw new Error(`Klarte ikke å opprette faktura: ${error.message}`)
  return data as unknown as Faktura
}

export async function settFakturaCheckoutSession(invoiceId: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      stripe_checkout_session_id: sessionId,
      payment_type: 'checkout',
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (error) throw new Error(`Klarte ikke å oppdatere faktura med checkout-session: ${error.message}`)
}

// Kun intern — rutene går via klargjorPaymentIntent(), som også gjenbruker en
// eksisterende PaymentIntent i stedet for å lage en ny per sidevisning.
async function settFakturaPaymentIntent(invoiceId: string, paymentIntentId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({
      stripe_payment_intent_id: paymentIntentId,
      payment_type: 'payment_intent',
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (error) throw new Error(`Klarte ikke å oppdatere faktura med payment intent: ${error.message}`)
}

// PaymentIntent-statuser der intenten fortsatt kan betales av kunden.
// 'succeeded'/'processing'/'canceled' er ferdigbehandlet og kan ikke gjenbrukes.
const GJENBRUKBARE_PI_STATUSER = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
] as const

// Klargjør en betaling på fakturaen og returnerer client_secret til Stripe
// Elements. Gjenbruker en eksisterende PaymentIntent når den fortsatt kan
// betales — uten dette opprettet hver eneste visning av betalingsskjemaet en
// ny PaymentIntent (og risikerte en ny Stripe Customer i samme slengen), som
// ble liggende igjen som støy i Stripe-kontoen.
export async function klargjorPaymentIntent(faktura: Faktura): Promise<string> {
  if (!faktura.kunde) throw new Error('Fakturaen mangler kundeinformasjon.')

  const stripe = getStripe()
  // Total, ikke amount: legges mva på toppen, er totalen det kunden skylder.
  const belopIOre = Math.round(fakturaBelop(faktura).total * 100)

  if (faktura.stripe_payment_intent_id) {
    try {
      const eksisterende = await stripe.paymentIntents.retrieve(faktura.stripe_payment_intent_id)
      const kanBetalesFortsatt = (GJENBRUKBARE_PI_STATUSER as readonly string[]).includes(eksisterende.status)

      if (kanBetalesFortsatt && eksisterende.amount === belopIOre && eksisterende.currency === faktura.currency) {
        if (eksisterende.client_secret) return eksisterende.client_secret
      } else if (kanBetalesFortsatt) {
        // Beløp eller valuta er endret siden sist — den gamle intenten ville
        // trukket feil sum, så den kanselleres i stedet for å bli liggende.
        await stripe.paymentIntents.cancel(eksisterende.id)
      }
    } catch (err) {
      // Intenten finnes ikke lenger, eller tilhører en annen Stripe-konto
      // (typisk etter nøkkelbytte test/live). Lag en ny i stedet for å feile.
      console.warn(`Kunne ikke gjenbruke PaymentIntent ${faktura.stripe_payment_intent_id}:`, err)
    }
  }

  const stripeCustomerId = await hentEllerOpprettStripeCustomerId(faktura.kunde)

  const paymentIntent = await stripe.paymentIntents.create({
    amount: belopIOre,
    currency: faktura.currency,
    customer: stripeCustomerId,
    automatic_payment_methods: { enabled: true },
    setup_future_usage: 'off_session',
    metadata: { invoiceId: faktura.id },
  })

  await settFakturaPaymentIntent(faktura.id, paymentIntent.id)

  if (!paymentIntent.client_secret) {
    throw new Error('Stripe returnerte ingen client secret for betalingen.')
  }
  return paymentIntent.client_secret
}

export async function markerFakturaBetalt(invoiceId: string): Promise<Faktura> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .select('*, kunde:customers(*)')
    .single()

  if (error) throw new Error(`Klarte ikke å markere faktura som betalt: ${error.message}`)
  return data as unknown as Faktura
}

// Annullerer en faktura som ikke skulle vært sendt. En BETALT faktura kan ikke
// kanselleres — da har penger skiftet hender, og riktig behandling er en
// kreditnota/refusjon, ikke å omskrive historikken. `.neq('status', 'paid')`
// gjør den regelen til en databasebetingelse, ikke bare en sjekk i ruten.
export async function kansellerFaktura(userId: string, id: string): Promise<Faktura | null> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .neq('status', 'paid')
    .select('*, kunde:customers(*)')
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å kansellere faktura: ${error.message}`)
  return data as unknown as Faktura | null
}

export async function markerFakturaFeilet(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', invoiceId)

  if (error) throw new Error(`Klarte ikke å markere faktura som feilet: ${error.message}`)
}

export async function settFakturaPdfUrl(invoiceId: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)

  if (error) throw new Error(`Klarte ikke å lagre faktura-PDF-url: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Betalinger (payments) — idempotency-grunnlag for webhook
// ---------------------------------------------------------------------------

// stripe_event_id har en unique-constraint i databasen. Denne sjekken +
// constrainten sammen gjør webhook-behandlingen trygg mot Stripes
// at-least-once levering (samme event kan i prinsippet komme flere ganger).
export async function harBehandletStripeEvent(stripeEventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle()

  if (error) throw new Error(`Klarte ikke å sjekke idempotency: ${error.message}`)
  return !!data
}

export interface LagreBetalingInput {
  invoiceId: string
  userId: string
  amount: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed'
  paymentMethodType: BetalingsType
  stripeEventId: string
  stripePaymentIntentId?: string | null
  stripeCheckoutSessionId?: string | null
  rawEvent?: unknown
}

export async function lagreBetaling(input: LagreBetalingInput): Promise<void> {
  const { error } = await supabase.from('payments').insert({
    invoice_id: input.invoiceId,
    user_id: input.userId,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    payment_method_type: input.paymentMethodType,
    stripe_event_id: input.stripeEventId,
    stripe_payment_intent_id: input.stripePaymentIntentId || null,
    stripe_checkout_session_id: input.stripeCheckoutSessionId || null,
    raw_event: input.rawEvent ?? null,
  })

  // 23505 = unique_violation. Samme event forsøkt lagret to ganger —
  // dette er forventet ved Stripes at-least-once levering, ikke en feil.
  if (error && (error as { code?: string }).code !== '23505') {
    throw new Error(`Klarte ikke å lagre betaling: ${error.message}`)
  }
}
