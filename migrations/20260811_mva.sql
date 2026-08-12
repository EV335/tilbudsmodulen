-- ============================================================================
-- TilbudsMaskinen — merverdiavgift
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor, etter
-- 20260810_per_user_invoice_numbering.sql. Trygg å kjøre om igjen.
--
-- MODELL:
--   firma.mva_sats            — 0 betyr ikke mva-registrert. Ingen egen
--                               boolean: satsen ER av/på-bryteren, så de to
--                               kan ikke komme i utakt med hverandre.
--   invoices.mva_sats         — SNAPSHOT av satsen da fakturaen ble laget.
--                               Endrer firmaet sats senere, skal gamle
--                               fakturaer stå urørt — de er sendt.
--   invoices.mva_inkludert    — om invoices.amount allerede inneholder mva.
--
-- Alle defaults er 0/false med vilje: eksisterende fakturaer får dermed
-- total = amount, nøyaktig det beløpet de allerede krever. Migrasjonen endrer
-- ikke hva én eneste eksisterende faktura koster.
-- ============================================================================

alter table public.firma
  add column if not exists mva_sats numeric not null default 0;

alter table public.firma
  add column if not exists mva_inkludert_standard boolean not null default false;

alter table public.invoices
  add column if not exists mva_sats numeric not null default 0;

alter table public.invoices
  add column if not exists mva_inkludert boolean not null default false;

-- Negativ sats gir negativ faktura. Over 100 gir mer mva enn grunnlag.
alter table public.firma drop constraint if exists firma_mva_sats_gyldig;
alter table public.firma
  add constraint firma_mva_sats_gyldig check (mva_sats >= 0 and mva_sats <= 100);

alter table public.invoices drop constraint if exists invoices_mva_sats_gyldig;
alter table public.invoices
  add constraint invoices_mva_sats_gyldig check (mva_sats >= 0 and mva_sats <= 100);

-- ----------------------------------------------------------------------------
-- Sluttkontroll — samme mønster som de øvrige migrasjonene
-- ----------------------------------------------------------------------------

do $$
declare
  manglende text[];
begin
  select array_agg(format('%s.%s', f.tabell, f.kolonne) order by f.tabell, f.kolonne)
    into manglende
  from (values
    ('firma', 'mva_sats'), ('firma', 'mva_inkludert_standard'),
    ('invoices', 'mva_sats'), ('invoices', 'mva_inkludert')
  ) as f(tabell, kolonne)
  where not exists (
    select 1 from information_schema.columns k
    where k.table_schema = 'public' and k.table_name = f.tabell and k.column_name = f.kolonne
  );

  if manglende is not null then
    raise exception 'Mva-migrasjonen fullførte IKKE riktig.'
      using detail = 'Disse kolonnene mangler: ' || array_to_string(manglende, ', ');
  end if;

  raise notice 'TilbudsMaskinen: mva-kolonner er på plass.';
end $$;
