-- ============================================================================
-- TilbudsMaskinen — fakturanummer per bruker
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor, etter
-- 20260809_add_invoice_public_token.sql. Trygg å kjøre om igjen.
--
-- PROBLEMET: public.next_invoice_number() brukte ÉN global sekvens
-- (public.invoice_seq) for hele installasjonen. Appen er flerbruker —
-- invoices, firma og customers er alle scopet på user_id — så to håndverkere
-- som fakturerer om hverandre får hver sin hullete serie:
--   Håndverker A: INV-000001, INV-000003, INV-000006
--   Håndverker B: INV-000002, INV-000004, INV-000005
-- Bokføringsforskriften krever fortløpende nummerering per utsteder, uten
-- hull. Med bare én bruker i basen har dette aldri vist seg — det slår først
-- inn i det bruker nummer to oppretter sin første faktura.
--
-- LØSNINGEN: en teller per bruker, og en ny next_invoice_number(uuid).
-- Den gamle parameterløse funksjonen beholdes bevisst (Postgres tillater
-- overloading), slik at en app-versjon som ikke er oppdatert ennå ikke
-- knekker idet migrasjonen kjøres.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- DEL 1: Teller per bruker
-- ----------------------------------------------------------------------------

create table if not exists public.invoice_counters (
  user_id uuid primary key references public.users(id) on delete cascade,
  neste_nummer integer not null default 1
);

alter table public.invoice_counters enable row level security;
-- Ingen policyer: samme mønster som resten av appen — all tilgang går via
-- service_role på serveren, se lib/supabase.ts.


-- ----------------------------------------------------------------------------
-- DEL 2: Sett telleren over det høyeste nummeret hver bruker allerede har
--
-- Ikke count(*) + 1: hadde en bruker hull i serien fra den globale sekvensen,
-- ville count gitt et nummer brukeren allerede har, og truffet unique-indeksen
-- i DEL 4. Vi tar høyeste faktiske nummer + 1.
-- ----------------------------------------------------------------------------

insert into public.invoice_counters (user_id, neste_nummer)
select
  user_id,
  coalesce(max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::integer), 0) + 1
from public.invoices
group by user_id
on conflict (user_id) do nothing;


-- ----------------------------------------------------------------------------
-- DEL 3: Ny nummergenerator
--
-- UPDATE ... RETURNING tar radlås, så samtidige kall serialiseres og to
-- fakturaer kan ikke få samme nummer.
-- ----------------------------------------------------------------------------

create or replace function public.next_invoice_number(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  nr integer;
begin
  insert into public.invoice_counters (user_id, neste_nummer)
  values (p_user_id, 1)
  on conflict (user_id) do nothing;

  update public.invoice_counters
     set neste_nummer = neste_nummer + 1
   where user_id = p_user_id
  returning neste_nummer - 1 into nr;

  return 'INV-' || lpad(nr::text, 6, '0');
end $$;


-- ----------------------------------------------------------------------------
-- DEL 4: Unikhet må nå gjelde per bruker, ikke globalt
--
-- Med per-bruker-nummerering får både håndverker A og B en INV-000001. Den
-- gamle globale unique-constrainten på invoice_number ville avvist den andre.
-- ----------------------------------------------------------------------------

alter table public.invoices drop constraint if exists invoices_invoice_number_key;

create unique index if not exists invoices_user_invoice_number_idx
  on public.invoices (user_id, invoice_number);


-- ----------------------------------------------------------------------------
-- DEL 5: Sluttkontroll — samme mønster som 20260808-migrasjonen
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.invoice_counters') is null then
    raise exception 'invoice_counters ble ikke opprettet.';
  end if;

  if to_regprocedure('public.next_invoice_number(uuid)') is null then
    raise exception 'next_invoice_number(uuid) ble ikke opprettet.';
  end if;

  if to_regclass('public.invoices_user_invoice_number_idx') is null then
    raise exception 'invoices_user_invoice_number_idx ble ikke opprettet.';
  end if;

  raise notice 'TilbudsMaskinen: fakturanummer per bruker er aktivert.';
end $$;
