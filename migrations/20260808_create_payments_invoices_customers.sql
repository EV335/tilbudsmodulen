-- ============================================================================
-- TilbudsMaskinen — Betaling og fakturering (Stripe)
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor på ditt eget prosjekt,
-- etter supabase/schema.sql. Jeg (Claude) har ikke tilgang til å kjøre dette
-- mot en levende database — du må kjøre denne filen selv.
--
-- MERK — forholdet til public.kunder:
-- Prosjektet har fra før en enkel public.kunder-tabell (navn, adresse,
-- telefon) brukt som fritekst-snapshot på tilbud (tilbud.kunde_navn).
-- Denne migrasjonen oppretter en EGEN public.customers-tabell for
-- betaling/fakturering, fordi den trenger felter kunder-tabellen ikke har
-- (e-post, type privat/bedrift, org.nr, stripe_customer_id) og fordi
-- oppgaven eksplisitt ba om en "customers"-tabell. De to tabellene
-- overlapper i praksis (samme virkelighet: håndverkerens egne kunder).
-- Anbefalt oppfølging senere: slå dem sammen (migrer kunder -> customers,
-- eller omvendt) — se docs/payments-setup.md.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- DEL 0: Faktura-innstillinger på eksisterende firma-tabell
-- ----------------------------------------------------------------------------

alter table public.firma add column if not exists betalingsbetingelser_dager integer not null default 14;
alter table public.firma add column if not exists bankkonto text;

-- ----------------------------------------------------------------------------
-- DEL 1: Kunderegister for betaling/fakturering
-- ----------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('privat', 'bedrift')),
  navn text not null,
  epost text,
  telefon text,
  adresse text,
  orgnr text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers (user_id);

-- ----------------------------------------------------------------------------
-- DEL 2: Fakturanummerering
-- ----------------------------------------------------------------------------

create sequence if not exists public.invoice_seq start with 1 increment by 1;

create or replace function public.next_invoice_number()
returns text
language sql
as $$
  select 'INV-' || lpad(nextval('public.invoice_seq')::text, 6, '0');
$$;

-- ----------------------------------------------------------------------------
-- DEL 3: Fakturaer
-- ----------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  tilbud_id uuid references public.tilbud(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric not null check (amount >= 0),
  currency text not null default 'nok',
  status text not null default 'draft' check (status in ('draft', 'pending', 'paid', 'failed', 'cancelled')),
  payment_type text check (payment_type in ('checkout', 'payment_intent')),
  pdf_url text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

-- ----------------------------------------------------------------------------
-- DEL 4: Betalinger (én rad per behandlet Stripe-event — idempotency-grunnlag)
-- ----------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null,
  currency text not null default 'nok',
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  payment_method_type text check (payment_method_type in ('checkout', 'payment_intent')),
  stripe_event_id text not null unique,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);

-- stripe_event_id har allerede en unique-constraint over — det er selve
-- idempotency-mekanismen. lib/payments.ts sjekker om raden finnes før den
-- behandler et webhook-event.

-- ----------------------------------------------------------------------------
-- DEL 5: Rad-nivå-sikring — samme mønster som supabase/schema.sql
-- ----------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

-- Ingen policyer for anon/authenticated. Appen snakker med disse tabellene
-- utelukkende via service_role-nøkkelen på serveren (se lib/supabase.ts),
-- som omgår RLS. Merk: denne appen bruker NextAuth, ikke Supabase Auth, så
-- auth.uid()-baserte policyer ville uansett aldri truffet noe — riktig
-- sikkerhetsmodell her er autorisasjonssjekk i API-rutene (session.user.id),
-- ikke RLS.

-- ----------------------------------------------------------------------------
-- DEL 6: Storage-bucket for fakturapdf-er
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do nothing;

-- NB: bucketen er satt public (samme mønster som 'logos'), altså gjettbare
-- men ikke-listbare URL-er. Fakturaer inneholder beløp/kundenavn — for
-- produksjon med reelle kunder bør dette byttes til en privat bucket med
-- signerte URL-er. Se docs/payments-setup.md.

-- ----------------------------------------------------------------------------
-- DEL 7: Sluttkontroll — feiler HØYLYTT hvis skjemaet ikke stemmer
--
-- Hvorfor dette finnes: `create table if not exists` over gjør skriptet trygt
-- å kjøre om igjen, men den har en farlig bakside — finnes tabellen fra før
-- med et ANNET skjema, hoppes den stille over, skriptet melder "Success", og
-- appen knekker først senere med kryptiske feil som
-- "column customers.user_id does not exist".
--
-- Det skjedde faktisk i dette prosjektet 2026-08-09: Supabase-prosjektet hadde
-- customers/invoices/payments fra et eldre, ukjent oppsett (norske kolonnenavn:
-- navn, belop, kunde_id). Migrasjonen så ut til å gå fint, men hele
-- betalingsmodulen var død.
--
-- Denne blokken sammenligner faktisk skjema mot det koden forventer og kaster
-- en tydelig feil som sier nøyaktig hva som mangler og hva du skal gjøre.
-- ----------------------------------------------------------------------------

do $$
declare
  manglende text[];
begin
  select array_agg(format('%s.%s', forventet.tabell, forventet.kolonne)
                   order by forventet.tabell, forventet.kolonne)
    into manglende
  from (values
    ('customers', 'id'), ('customers', 'user_id'), ('customers', 'type'),
    ('customers', 'navn'), ('customers', 'epost'), ('customers', 'telefon'),
    ('customers', 'adresse'), ('customers', 'orgnr'),
    ('customers', 'stripe_customer_id'), ('customers', 'created_at'),
    ('customers', 'updated_at'),

    ('invoices', 'id'), ('invoices', 'invoice_number'), ('invoices', 'user_id'),
    ('invoices', 'tilbud_id'), ('invoices', 'customer_id'), ('invoices', 'amount'),
    ('invoices', 'currency'), ('invoices', 'status'), ('invoices', 'payment_type'),
    ('invoices', 'pdf_url'), ('invoices', 'stripe_checkout_session_id'),
    ('invoices', 'stripe_payment_intent_id'), ('invoices', 'due_date'),
    ('invoices', 'paid_at'), ('invoices', 'created_at'), ('invoices', 'updated_at'),

    ('payments', 'id'), ('payments', 'invoice_id'), ('payments', 'user_id'),
    ('payments', 'amount'), ('payments', 'currency'), ('payments', 'status'),
    ('payments', 'payment_method_type'), ('payments', 'stripe_event_id'),
    ('payments', 'stripe_payment_intent_id'),
    ('payments', 'stripe_checkout_session_id'), ('payments', 'raw_event'),
    ('payments', 'created_at'),

    ('firma', 'betalingsbetingelser_dager'), ('firma', 'bankkonto')
  ) as forventet(tabell, kolonne)
  where not exists (
    select 1
    from information_schema.columns k
    where k.table_schema = 'public'
      and k.table_name = forventet.tabell
      and k.column_name = forventet.kolonne
  );

  if manglende is not null then
    raise exception 'TilbudsMaskinen-migrasjonen fullførte IKKE riktig.'
      using
        detail = 'Disse kolonnene mangler: ' || array_to_string(manglende, ', '),
        hint = 'Tabellene finnes trolig fra før med et annet skjema, så '
            || '"create table if not exists" hoppet stille over dem. '
            || 'Sjekk at tabellene er tomme (select count(*) from public.invoices osv.), '
            || 'og kjør deretter: drop table if exists public.payments, '
            || 'public.invoices, public.customers cascade;  — og kjør så denne '
            || 'filen på nytt.';
  end if;

  raise notice 'TilbudsMaskinen: skjema verifisert OK.';
end $$;
