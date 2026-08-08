import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export async function recordPayment(payment: {
  tilbud_id?: string;
  user_id?: string;
  stripe_payment_intent?: string;
  stripe_checkout_session?: string;
  amount: number;
  currency?: string;
  status: string;
  stripe_event_id?: string;
}) {
  // Idempotency: sjekk stripe_event_id eller stripe_payment_intent/checkout
  if (payment.stripe_event_id) {
    const { data } = await supabase.from('payments').select('*').eq('stripe_event_id', payment.stripe_event_id).limit(1);
    if (data && data.length) return data[0];
  }
  const { data, error } = await supabase.from('payments').insert(payment).select().single();
  if (error) throw error;
  return data;
}

export async function createInvoiceRow(invoice: {
  invoice_number: string;
  tilbud_id?: string;
  customer_id?: string;
  amount: number;
  currency?: string;
  status?: string;
  pdf_url?: string;
  due_date?: string;
}) {
  const { data, error } = await supabase.from('invoices').insert(invoice).select().single();
  if (error) throw error;
  return data;
}

