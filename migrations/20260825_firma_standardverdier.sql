-- ============================================================================
-- TilbudsMaskinen — standardverdier for tilbudsskjemaet
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor. Trygg å kjøre om igjen.
--
-- HVORFOR:
--   Timeprisen er den samme hver eneste gang. Likevel startet skjemaet tomt og
--   krevde at den ble tastet inn på nytt for hvert tilbud — for alle sju fagene.
--   Marginen sto på fagets standard, som den som har bestemt seg for 30 % måtte
--   rette hver gang. Og faget står fast for den som bare driver med ett.
--
--   Tre felter som ikke endrer seg, tastet inn på nytt ved hvert tilbud, er den
--   billigste friksjonen i hele appen å bli kvitt.
--
-- MODELL:
--   Alle tre er NULLABLE med vilje. NULL betyr «ikke bestemt», og da oppfører
--   skjemaet seg nøyaktig som før: tom timepris, fagets egen margin, Maler
--   først i lista. Ingen eksisterende bruker får en verdi han ikke har valgt.
--
--   Verdiene er STANDARDER, ikke låser. De fyller feltene ved åpning; alt kan
--   overstyres per tilbud, og det som faktisk ble brukt lagres på tilbudet slik
--   det alltid har gjort.
-- ============================================================================

alter table public.firma
  add column if not exists standard_timepris numeric;

alter table public.firma
  add column if not exists standard_margin_prosent numeric;

alter table public.firma
  add column if not exists standard_fag text;

-- Samme grenser som beregnLinje() i lib/priser.ts krever. Står de fra hverandre,
-- er det databasen som avviser, og da får brukeren en Postgres-melding i stedet
-- for en setning han kan gjøre noe med.
alter table public.firma drop constraint if exists firma_standard_timepris_gyldig;
alter table public.firma
  add constraint firma_standard_timepris_gyldig
  check (standard_timepris is null or (standard_timepris > 0 and standard_timepris <= 100000));

-- Margin 100 % gir divisjon på null, over 100 % gir negativ pris.
alter table public.firma drop constraint if exists firma_standard_margin_gyldig;
alter table public.firma
  add constraint firma_standard_margin_gyldig
  check (standard_margin_prosent is null or (standard_margin_prosent >= 0 and standard_margin_prosent < 100));

-- Kontroll: viser at kolonnene finnes etter kjøring.
do $$
declare
  mangler text;
begin
  select string_agg(k.kolonne, ', ')
  into mangler
  from (values
    ('firma', 'standard_timepris'),
    ('firma', 'standard_margin_prosent'),
    ('firma', 'standard_fag')
  ) as k(tabell, kolonne)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = k.tabell and c.column_name = k.kolonne
  );

  if mangler is not null then
    raise exception 'Migrasjonen kjørte ikke helt ut. Mangler: %', mangler;
  end if;

  raise notice 'Standardverdier på firma er på plass.';
end $$;
