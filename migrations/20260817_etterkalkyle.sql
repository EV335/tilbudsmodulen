-- ============================================================================
-- TilbudsMaskinen — etterkalkyle
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor, etter
-- 20260813_prissatser.sql. Trygg å kjøre om igjen.
--
-- Bakgrunn: prisboka i lib/priser.ts og brukerens egne satser i `prissatser`
-- er begge ANSLAG. Ingenting i appen har hittil visst hva jobben faktisk tok.
-- Håndverkeren kunne ligge 30 % feil på hver eneste jobb i et år uten at noe
-- fanget det opp — og uten det tallet er «dine satser» bare en gjetning han
-- selv må vedlikeholde.
--
-- Denne tabellen holder ett tall per fullført jobb: hvor lang tid den faktisk
-- tok. Sammenligningen mot estimatet gir avviket, og avvikene samlet over
-- flere jobber gir et forslag til ny `timer_per_enhet` i `prissatser`.
--
-- `linjer` er et ØYEBLIKKSBILDE av tilbudets linjer slik de var da timene ble
-- registrert. Uten det ville en senere redigering av tilbudet (antall m² opp
-- eller ned) stille endret grunnlaget for et forslag som allerede er gitt, og
-- satsen ville drevet i en retning ingen hadde bedt om.
-- ============================================================================

create table if not exists public.etterkalkyler (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tilbud_id uuid not null references public.tilbud(id) on delete cascade,
  faktiske_timer numeric not null,
  faktisk_material_kr numeric,
  notat text,
  linjer jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Én registrering per jobb. Uten denne ville «lagre» på nytt lagt til en ny
  -- rad i stedet for å rette den forrige, og samme jobb ville telt flere
  -- ganger i grunnlaget for satsforslaget.
  unique (tilbud_id)
);

create index if not exists etterkalkyler_user_id_idx on public.etterkalkyler (user_id);

-- Null eller negative timer gir et forslag på null timer per enhet, altså en
-- sats som sier at jobben er gratis. Taket på 100 000 stopper tastefeil som
-- «14000» der det skulle stått «14».
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'etterkalkyler_rimelige_tall'
  ) then
    alter table public.etterkalkyler add constraint etterkalkyler_rimelige_tall
      check (
        faktiske_timer > 0
        and faktiske_timer <= 100000
        and (faktisk_material_kr is null or faktisk_material_kr >= 0)
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Radsikkerhet — samme mønster som resten av appen
--
-- Ingen policyer for anon/authenticated: all tilgang går via service_role på
-- serveren (lib/supabase.ts), som omgår RLS. Uten dette ville tabellen ligget
-- åpen gjennom PostgREST for den som har anon-nøkkelen.
-- ----------------------------------------------------------------------------

alter table public.etterkalkyler enable row level security;

comment on table public.etterkalkyler is
  'Faktisk tidsbruk per fullført jobb. Grunnlaget for satsforslagene i Dine satser.';

-- ----------------------------------------------------------------------------
-- Sluttkontroll — samme mønster som de øvrige migrasjonene
-- ----------------------------------------------------------------------------

do $$
declare
  manglende text[];
begin
  if to_regclass('public.etterkalkyler') is null then
    raise exception 'etterkalkyler ble ikke opprettet.';
  end if;

  select array_agg(k.kolonne order by k.kolonne) into manglende
  from (values
    ('user_id'), ('tilbud_id'), ('faktiske_timer'),
    ('faktisk_material_kr'), ('notat'), ('linjer'), ('updated_at')
  ) as k(kolonne)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'etterkalkyler'
      and c.column_name = k.kolonne
  );

  if manglende is not null then
    raise exception 'etterkalkyler mangler kolonner appen skriver til.'
      using detail = 'Disse mangler: ' || array_to_string(manglende, ', ');
  end if;

  -- Appen upserter med onConflict tilbud_id. Uten denne constrainten feiler
  -- hver eneste registrering av timer.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.etterkalkyler'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.etterkalkyler'::regclass and attname = 'tilbud_id')
      ]::int2[]
  ) then
    raise exception 'Unik constraint på (tilbud_id) mangler.';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.etterkalkyler'::regclass and relrowsecurity
  ) then
    raise exception 'Radsikkerhet er ikke slått på for etterkalkyler.';
  end if;

  raise notice 'TilbudsMaskinen: etterkalkyle er aktivert.';
end $$;
