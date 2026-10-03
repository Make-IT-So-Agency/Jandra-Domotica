-- Bouw, fase 1b: van PDF naar plan. De gebouwen, de bladcode van een plan, de
-- omzetting van een grondplan en de ruimtes die eruit komen.
--
-- Zie bouw/LEESMIJ.md. Zelfde huisregels als de eerste Bouw-migratie:
-- idempotent, Row Level Security aan zonder policies. Een lijst in een
-- check-constraint hoort bij een lijst in web/lib/bouw/types.ts: wie er een
-- aanpast, past de andere mee aan.

-- ---------------------------------------------------------------------------
-- Gebouwen: de woning, een bijgebouw. Elke verdieping hoort bij één gebouw, en
-- elk gebouw heeft zijn eigen assenstelsel (meter, y naar beneden).
-- ---------------------------------------------------------------------------
create table if not exists bouw_gebouwen (
  id          bigint generated always as identity primary key,
  naam        text        not null unique,
  volgorde    integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- Er is altijd minstens één gebouw: de woning. In productie draait een
-- migratie maar één keer, dus wie ze later hernoemt, krijgt er geen tweede bij.
-- Niet met "on conflict (naam)": sinds 20261003114500_bouw_huizen.sql is de
-- naam enkel uniek per huis, en CI draait alle migraties twee keer.
insert into bouw_gebouwen (naam) select 'Woning' where not exists (select 1 from bouw_gebouwen);

-- ---------------------------------------------------------------------------
-- Verdiepingen horen voortaan bij een gebouw. Wat er al was, hoort bij de
-- woning. Een naam is uniek binnen een gebouw: de woning en het bijgebouw
-- hebben elk hun gelijkvloers.
-- ---------------------------------------------------------------------------
alter table bouw_verdiepingen
  add column if not exists gebouw_id bigint references bouw_gebouwen (id) on delete restrict;

update bouw_verdiepingen
   set gebouw_id = (select id from bouw_gebouwen order by (naam = 'Woning') desc, id limit 1)
 where gebouw_id is null;

alter table bouw_verdiepingen alter column gebouw_id set not null;

alter table bouw_verdiepingen drop constraint if exists bouw_verdiepingen_naam_key;
create unique index if not exists bouw_verdiepingen_gebouw_naam on bouw_verdiepingen (gebouw_id, naam);

-- ---------------------------------------------------------------------------
-- Plannen: bij welk gebouw (leeg voor het hele project, zoals het
-- inplantingsplan), en de bladcode uit het titelblok, bv. BA_woning_P_N_1.
-- Met die code wordt een volgend dossier een nieuwe versie van hetzelfde plan.
-- ---------------------------------------------------------------------------
alter table bouw_plannen
  add column if not exists gebouw_id bigint references bouw_gebouwen (id) on delete restrict;
alter table bouw_plannen add column if not exists bladcode text;

create unique index if not exists bouw_plannen_bladcode on bouw_plannen (bladcode) where bladcode is not null;
create index if not exists bouw_plannen_gebouw on bouw_plannen (gebouw_id);

-- Een grondplan hangt aan een verdieping, en die aan een gebouw.
update bouw_plannen p
   set gebouw_id = v.gebouw_id
  from bouw_verdiepingen v
 where p.verdieping_id = v.id and p.gebouw_id is null;

alter table bouw_plannen drop constraint if exists bouw_plannen_soort_check;
alter table bouw_plannen add constraint bouw_plannen_soort_check
  check (soort in ('grondplan', 'dakplan', 'funderingsplan', 'gevel', 'doorsnede', 'inplanting',
                   'technieken', 'detail', 'andere'));

-- ---------------------------------------------------------------------------
-- Een bevestigde omzetting van een planversie: het nagekeken voorstel, met de
-- ruimtes, de openingen (in meter, voor het 3D-model later) en het bewijs
-- voor de schaal. Vrije teksten uit het titelblok komen hier niet in: daar
-- staan namen en adressen.
-- ---------------------------------------------------------------------------
create table if not exists bouw_omzettingen (
  id              bigint generated always as identity primary key,
  planversie_id   bigint      not null unique references bouw_planversies (id) on delete cascade,
  werkwijze       integer     not null default 1,
  voorstel        jsonb       not null check (jsonb_typeof(voorstel) = 'object'),
  bevestigd_door  text,
  bevestigd_op    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- De ruimtes van een verdieping. De veelhoek is een lijst van ringen, elk een
-- lijst van [x, y] in meter, in het assenstelsel van het gebouw. De
-- oppervlakte volgens het plan is die van het label van de architect.
-- ---------------------------------------------------------------------------
create table if not exists bouw_ruimtes (
  id                  bigint generated always as identity primary key,
  verdieping_id       bigint         not null references bouw_verdiepingen (id) on delete cascade,
  naam                text           not null,
  soort               text           not null default 'andere'
                      check (soort in ('leefruimte', 'keuken', 'slaapkamer', 'badkamer', 'wc', 'inkom',
                                       'nachthal', 'berging', 'technieken', 'bureau', 'dressing',
                                       'wasplaats', 'garage', 'terras', 'trap', 'andere')),
  veelhoek            jsonb          not null check (jsonb_typeof(veelhoek) = 'array'),
  oppervlakte_m2      numeric(9, 3)  not null check (oppervlakte_m2 > 0),
  oppervlakte_plan_m2 numeric(9, 3)  check (oppervlakte_plan_m2 is null or oppervlakte_plan_m2 > 0),
  plafondhoogte_m     numeric(6, 3)  check (plafondhoogte_m is null or plafondhoogte_m > 0),
  vloerpeil_m         numeric(6, 3),
  omzetting_id        bigint         references bouw_omzettingen (id) on delete set null,
  created_at          timestamptz    not null default now(),
  updated_at          timestamptz    not null default now()
);

create index if not exists bouw_ruimtes_verdieping on bouw_ruimtes (verdieping_id);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_ruimtes']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['bouw_gebouwen', 'bouw_omzettingen', 'bouw_ruimtes']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
