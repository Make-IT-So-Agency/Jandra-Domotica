-- Bouw, fase 7: het woningdossier en de nazorg. De documenten die bij het
-- huis horen (as-built, AREI, EPB, postinterventiedossier, handleidingen,
-- garantiebewijzen), de garanties met hun einde, en het onderhoud met wat
-- wanneer opnieuw moet.
--
-- Zie bouw/LEESMIJ.md. Idempotent, Row Level Security aan zonder policies.
-- De lijsten horen bij web/lib/bouw/nazorg.ts.

-- ---------------------------------------------------------------------------
-- Een document van het woningdossier: een PDF in de privé-bucket, onder
-- documenten/, zoals een offerte of factuur.
-- ---------------------------------------------------------------------------
create table if not exists bouw_documenten (
  id           bigint generated always as identity primary key,
  bestand_id   bigint      not null references bouw_bestanden (id) on delete cascade,
  soort        text        not null default 'andere'
               check (soort in ('as_built', 'arei', 'epb', 'pid', 'vergunning', 'attest', 'handleiding', 'garantie', 'andere')),
  titel        text        not null,
  partij_id    bigint      references bouw_partijen (id) on delete set null,
  datum        date,
  opmerking    text,
  door         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bouw_documenten_soort on bouw_documenten (soort);

-- ---------------------------------------------------------------------------
-- Een garantie: wat, van wie, vanaf wanneer en hoe lang. Het einde rekent
-- de app uit.
-- ---------------------------------------------------------------------------
create table if not exists bouw_garanties (
  id             bigint generated always as identity primary key,
  wat            text        not null,
  partij_id      bigint      references bouw_partijen (id) on delete set null,
  begin          date        not null,
  duur_maanden   integer     not null check (duur_maanden between 1 and 600),
  document_id    bigint      references bouw_documenten (id) on delete set null,
  opmerking      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Onderhoud dat terugkomt: wat, om de hoeveel maanden, en wanneer het
-- laatst gebeurde. Elke beurt blijft bewaard; laatst_gedaan is de laatste
-- beurt, zodat een verkeerd genoteerde beurt weer weg kan.
-- ---------------------------------------------------------------------------
create table if not exists bouw_onderhoud (
  id                bigint generated always as identity primary key,
  wat               text        not null,
  interval_maanden  integer     not null check (interval_maanden between 1 and 240),
  laatst_gedaan     date,
  partij_id         bigint      references bouw_partijen (id) on delete set null,
  opmerking         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists bouw_onderhoudsbeurten (
  id            bigint generated always as identity primary key,
  onderhoud_id  bigint      not null references bouw_onderhoud (id) on delete cascade,
  datum         date        not null,
  opmerking     text,
  door          text,
  created_at    timestamptz not null default now()
);

-- Eén beurt per dag: wie twee keer tikt, noteert ze één keer.
create unique index if not exists bouw_onderhoudsbeurten_dag on bouw_onderhoudsbeurten (onderhoud_id, datum);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_documenten', 'bouw_garanties', 'bouw_onderhoud']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;

  foreach target in array array['bouw_documenten', 'bouw_garanties', 'bouw_onderhoud', 'bouw_onderhoudsbeurten']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
