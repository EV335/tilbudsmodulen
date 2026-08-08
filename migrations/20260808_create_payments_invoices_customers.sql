-- Migrasjon: payments, invoices, customers, invoice_seq
create sequence if not exists public.invoice_seq;

create table if not exists public.payments (
  id uuid default gen_random_uuid() primary key,
  tilbud_id uuid references public.tilbud(id),
  user_id uuid references public.users(id),
  stripe_payment_intent text,
  stripe_checkout_session text,
  amount integer not null,
  currency text not null default 'NOK',
  status text not null,
  stripe_event_id text,
  created_at timestamptz default now()
);

create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  invoice_number text unique not null,
  tilbud_id uuid references public.tilbud(id),
  customer_id uuid references public.kunder(id),
  amount integer not null,
  currency text not null default 'NOK',
  status text not null default 'SENT',
  pdf_url text,
  due_date date,
  stripe_payment_intent text,
  created_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  name text,
  email text,
  org_number text,
  address jsonb,
  vat_number text,
  created_at timestamptz default now()
);

create table if not exists public.firma (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  name text,
  org_number text,
  address jsonb,
  phone text,
  email text,
  logo_path text,
  invoice_info jsonb,
  created_at timestamptz default now()
);

alter table public.tilbud add column if not exists firma_id uuid references public.firma(id);

