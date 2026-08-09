-- ============================================================================
-- TilbudsMaskinen — offentlig betalingslenke for sluttkunden
--
-- Legger til en uggjettbar public_token på hver faktura, slik at en
-- sluttkunde (uten TilbudsMaskinen-konto) kan åpne en delt lenke
-- (/betal/[token]) og betale, uten å logge inn. Selve tokenet ER
-- autentiseringen her — samme mønster som Stripe/Xero sine egne
-- "payment link"-funksjoner. Kjøres etter
-- 20260808_create_payments_invoices_customers.sql.
-- ============================================================================

alter table public.invoices
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists invoices_public_token_idx on public.invoices (public_token);
