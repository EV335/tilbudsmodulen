# CURRENT_TASK

Auto-mode stabilisering fullført (commit e31d29a).

Nye moduler lagt til via patch:
- Migrasjoner: payments, invoices, customers, firma
- API: payments/create-checkout, payments/create-payment-intent, webhooks/stripe
- Libs: lib/payments.ts, lib/invoice.ts
- Frontend: CheckoutButton, PaymentIntentForm, Firma page, Invoices page, InvoiceView
- Docs: docs/payments-setup.md

Status: patch applied (pending). Kjør migrasjoner i Supabase og sett env vars som dokumentert i docs/payments-setup.md.

