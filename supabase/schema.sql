-- ============================================================================
-- TilbudsMaskinen — Supabase-skjema (v2: alt i public)
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor på ditt eget prosjekt.
-- Jeg (Claude) har ikke tilgang til å kjøre dette mot en levende database —
-- du må kjøre denne filen selv.
--
-- ENDRING FRA FORRIGE VERSJON: NextAuth sine egne tabeller (users, sessions,
-- accounts, verification_tokens) lå tidligere i et eget "next_auth"-skjema,
-- slik den offisielle @next-auth/supabase-adapter krever. Det skjemaet må
-- eksponeres manuelt via PostgREST (Project Settings > API > Exposed
-- schemas), og det viste seg upålitelig å få til å slå igjennom i dette
-- prosjektet. Løsningen: en lokal adapter (lib/supabaseAuthAdapter.ts) som
-- bruker public-skjemaet i stedet, som alltid er eksponert som standard.
--
-- Denne filen rydder derfor først opp i det gamle forsøket (next_auth-skjema
-- + den midlertidige public.users-speilingen), og oppretter deretter alt i
-- public direkte. Trygt å kjøre selv om ingen har logget inn ennå (ingen
-- ekte brukerdata går tapt — verifikasjonsforsøk som feilet er allerede
-- kastet av Postgres).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- DEL 0: Opprydding av forrige forsøk (next_auth-skjema)
-- ----------------------------------------------------------------------------

drop trigger if exists on_next_auth_user_created on next_auth.users;
drop function if exists public.sync_next_auth_user();
drop table if exists public.tilbud cascade;
drop table if exists public.kunder cascade;
drop table if exists public.firma cascade;
drop table if exists public.users cascade;
drop schema if exists next_auth cascade;
create schema if not exists next_auth;


-- ----------------------------------------------------------------------------
-- DEL 1: NextAuth sine egne tabeller, nå i public
-- (kolonnenavn i camelCase er de eksakte navnene lib/supabaseAuthAdapter.ts
-- spør etter — ikke endre dem uten å oppdatere adapteren tilsvarende)
-- ----------------------------------------------------------------------------

create table public.users (
  id uuid not null default gen_random_uuid(),
  name text,
  email text,
  "emailVerified" timestamp with time zone,
  image text,
  constraint users_pkey primary key (id),
  constraint users_email_unique unique (email)
);

create table public.sessions (
  id uuid not null default gen_random_uuid(),
  expires timestamp with time zone not null,
  "sessionToken" text not null,
  "userId" uuid references public.users(id) on delete cascade,
  constraint sessions_pkey primary key (id),
  constraint sessiontoken_unique unique ("sessionToken")
);

create table public.accounts (
  id uuid not null default gen_random_uuid(),
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  oauth_token_secret text,
  oauth_token text,
  "userId" uuid references public.users(id) on delete cascade,
  constraint accounts_pkey primary key (id),
  constraint provider_unique unique (provider, "providerAccountId")
);

create table public.verification_tokens (
  identifier text,
  token text,
  expires timestamp with time zone not null,
  constraint verification_tokens_pkey primary key (token),
  constraint token_unique unique (token),
  constraint token_identifier_unique unique (token, identifier)
);


-- ----------------------------------------------------------------------------
-- DEL 2: Applikasjonstabeller
-- ----------------------------------------------------------------------------

create table public.firma (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  firmanavn text not null,
  logo_url text,
  orgnr text,
  adresse text,
  created_at timestamptz not null default now(),
  constraint firma_user_unique unique (user_id)
);

create table public.kunder (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  navn text not null,
  adresse text,
  telefon text,
  created_at timestamptz not null default now()
);

create table public.tilbud (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  firma_id uuid references public.firma(id) on delete set null,
  kunde_navn text,
  pris numeric not null,
  pdf_url text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index tilbud_user_id_idx on public.tilbud (user_id);
create index tilbud_created_at_idx on public.tilbud (created_at desc);

-- Rad-nivå-sikring: appen snakker med disse tabellene utelukkende via
-- service_role-nøkkelen på serveren (se lib/supabase.ts og
-- lib/supabaseAuthAdapter.ts), som omgår RLS. RLS aktiveres likevel som
-- forsvar i dybden, i tilfelle anon/authenticated-nøkkelen noensinne brukes
-- direkte mot disse tabellene.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.accounts enable row level security;
alter table public.verification_tokens enable row level security;
alter table public.firma enable row level security;
alter table public.kunder enable row level security;
alter table public.tilbud enable row level security;

-- Ingen policyer opprettes for anon/authenticated -> all tilgang utenfra
-- service_role blir dermed nektet by default.


-- ----------------------------------------------------------------------------
-- DEL 3: Storage-bucket for firmalogoer
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;
