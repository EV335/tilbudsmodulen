-- ============================================================================
-- TilbudsMaskinen — egne satser per bruker
--
-- Kjøres manuelt i Supabase Dashboard > SQL Editor, etter
-- 20260811_mva.sql. Trygg å kjøre om igjen.
--
-- Bakgrunn: satsene lå hardkodet i lib/priser.ts. En håndverker som mente at
-- 0,15 t per m² vegg var feil for måten han jobber på, måtte få en utvikler til
-- å endre kode og deploye. Hele tilbakemeldingen fra kollegatesten var
-- «tallene stemmer ikke» — og løsningen lå utenfor brukerens rekkevidde.
--
-- Verdiene i lib/priser.ts er fortsatt utgangspunktet. Denne tabellen holder
-- kun det brukeren har endret, slik at oppdaterte markedstall i koden fortsatt
-- slår gjennom på alt en bruker ikke har rørt.
-- ============================================================================

create table if not exists public.prissatser (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  operasjon_id text not null,
  timer_per_enhet numeric,
  material_per_enhet numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operasjon_id)
);

create index if not exists prissatser_user_id_idx on public.prissatser (user_id);

-- Negative satser gir negativ pris. Null er lov og betyr «bruk standarden».
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prissatser_ikke_negative'
  ) then
    alter table public.prissatser add constraint prissatser_ikke_negative
      check (
        (timer_per_enhet is null or timer_per_enhet >= 0)
        and (material_per_enhet is null or material_per_enhet >= 0)
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Radsikkerhet — samme mønster som resten av appen
--
-- Ingen policyer for anon/authenticated: all tilgang går via service_role på
-- serveren (lib/supabase.ts), som omgår RLS. Uten dette ville tabellen ligget
-- åpen gjennom PostgREST for den som har anon-nøkkelen — og innholdet her er
-- håndverkerens egen prisbok, det mest sensitive vi lagrer om ham.
-- ----------------------------------------------------------------------------

alter table public.prissatser enable row level security;

comment on table public.prissatser is
  'Brukerens egne overstyringer av satsene i lib/priser.ts. Kun endrede verdier lagres.';

-- ----------------------------------------------------------------------------
-- Sluttkontroll — samme mønster som de øvrige migrasjonene
-- ----------------------------------------------------------------------------

do $$
declare
  manglende text[];
begin
  if to_regclass('public.prissatser') is null then
    raise exception 'prissatser ble ikke opprettet.';
  end if;

  select array_agg(k.kolonne order by k.kolonne) into manglende
  from (values
    ('user_id'), ('operasjon_id'), ('timer_per_enhet'),
    ('material_per_enhet'), ('updated_at')
  ) as k(kolonne)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'prissatser'
      and c.column_name = k.kolonne
  );

  if manglende is not null then
    raise exception 'prissatser mangler kolonner appen skriver til.'
      using detail = 'Disse mangler: ' || array_to_string(manglende, ', ');
  end if;

  -- Appen upserter med onConflict user_id,operasjon_id. Uten denne
  -- constrainten feiler hver eneste lagring i «Mine satser».
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.prissatser'::regclass and contype = 'u'
  ) then
    raise exception 'Unik constraint på (user_id, operasjon_id) mangler.';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.prissatser'::regclass and relrowsecurity
  ) then
    raise exception 'Radsikkerhet er ikke slått på for prissatser.';
  end if;

  raise notice 'TilbudsMaskinen: egne satser per bruker er aktivert.';
end $$;
