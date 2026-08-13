-- Egne satser per bruker.
--
-- Bakgrunn: satsene lå hardkodet i lib/priser.ts. En håndverker som mente at
-- 0,15 t per m² vegg var feil for måten han jobber på, måtte få en utvikler til
-- å endre kode og deploye. Hele tilbakemeldingen fra kollegatesten var
-- «tallene stemmer ikke» — og løsningen lå utenfor brukerens rekkevidde.
--
-- Verdiene i lib/priser.ts er fortsatt utgangspunktet. Denne tabellen holder
-- kun det brukeren har endret, slik at oppdaterte markedstall i koden fortsatt
-- slår gjennom på alt en bruker ikke har rørt.
--
-- Idempotent: trygg å kjøre om igjen.

create table if not exists prissatser (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  operasjon_id text not null,
  timer_per_enhet numeric,
  material_per_enhet numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operasjon_id)
);

create index if not exists prissatser_user_id_idx on prissatser (user_id);

-- Negative satser gir negativ pris. Null er lov og betyr «bruk standarden».
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prissatser_ikke_negative'
  ) then
    alter table prissatser add constraint prissatser_ikke_negative
      check (
        (timer_per_enhet is null or timer_per_enhet >= 0)
        and (material_per_enhet is null or material_per_enhet >= 0)
      );
  end if;
end $$;

comment on table prissatser is
  'Brukerens egne overstyringer av satsene i lib/priser.ts. Kun endrede verdier lagres.';
