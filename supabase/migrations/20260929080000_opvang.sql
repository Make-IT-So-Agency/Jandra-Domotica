-- Opvang: de kinderen, de inschrijfrondes, de tegels uit de kalender van
-- i-Active, wat Jan en Sandra aanduiden, en wat de bot ervan maakte.
--
-- Zie opvang/LEESMIJ.md. Zelfde huisregels als de rest: idempotent, Row
-- Level Security aan zonder policies, enkel de service-role sleutel mag
-- erbij (de webapp op Vercel en de workflows in GitHub Actions).

-- ---------------------------------------------------------------------------
-- De kinderen zoals i-Active ze kent. De bot vindt ze zelf in de kalender;
-- ingepland wordt pas als iemand dat in Telegram expliciet aanzet.
-- ---------------------------------------------------------------------------
create table if not exists opvang_kinderen (
  id            bigint generated always as identity primary key,
  leerling_id   text        not null unique,
  naam          text        not null,
  plannen       boolean     not null default false,
  gezien_op     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Eén inschrijfronde: een opvangmaand ("2026-12") en het moment waarop
-- i-Active de inschrijvingen opent.
--
--   open        Jan en Sandra duiden aan
--   definitief  vastgelegd; dit en enkel dit wordt ingeschreven
--   bezig       de workflow is aan het inschrijven
--   klaar       ingeschreven en gecontroleerd
--   gemist      de opening is voorbij zonder definitieve keuze
-- ---------------------------------------------------------------------------
create table if not exists opvang_rondes (
  id                  bigint generated always as identity primary key,
  maand               text        not null,
  ronde               text        not null default 'inwoners',
  opent               timestamptz not null,
  status              text        not null default 'open'
                      check (status in ('open', 'definitief', 'bezig', 'klaar', 'gemist')),
  definitief_door     text,
  definitief_op       timestamptz,
  stop_gevraagd       boolean     not null default false,
  kalender_gelezen_op timestamptz,
  gevraagd_op         timestamptz,
  herinnerd_op        timestamptz,
  bezig_sinds         timestamptz,
  klaar_op            timestamptz,
  created_at          timestamptz not null default now(),
  unique (maand, ronde)
);

-- ---------------------------------------------------------------------------
-- Een tegel uit de kalender: één slot, voor één kind, op één dag en locatie.
-- maand is de kalendermaand ("2026-12"), staat wat de tegel het laatst zei.
-- ---------------------------------------------------------------------------
create table if not exists opvang_slots (
  id          bigint generated always as identity primary key,
  kind_id     bigint      not null references opvang_kinderen (id) on delete cascade,
  maand       text        not null,
  datum       date        not null,
  moment      text        not null,
  locatie     text        not null default '',
  staat       text        not null,
  titel       text,
  gezien_op   timestamptz not null default now(),
  unique (kind_id, datum, moment, locatie)
);

create index if not exists opvang_slots_maand on opvang_slots (kind_id, maand);

-- ---------------------------------------------------------------------------
-- Wat aangeduid is. Een rij is een expliciete keuze; geen rij is niet nodig.
-- ---------------------------------------------------------------------------
create table if not exists opvang_keuzes (
  ronde_id      bigint      not null references opvang_rondes (id) on delete cascade,
  slot_id       bigint      not null references opvang_slots (id) on delete cascade,
  gekozen_door  text,
  gekozen_op    timestamptz not null default now(),
  primary key (ronde_id, slot_id)
);

-- ---------------------------------------------------------------------------
-- Wat de bot deed, per gekozen slot, zoals i-Active het nadien toonde.
-- ---------------------------------------------------------------------------
create table if not exists opvang_resultaten (
  ronde_id   bigint      not null references opvang_rondes (id) on delete cascade,
  slot_id    bigint      not null references opvang_slots (id) on delete cascade,
  uitkomst   text        not null
             check (uitkomst in ('ingeschreven', 'reservelijst', 'al_ingeschreven', 'mislukt', 'gestopt')),
  melding    text,
  op         timestamptz not null default now(),
  primary key (ronde_id, slot_id)
);

-- ---------------------------------------------------------------------------
-- Het keuzemenu in Telegram: één bericht per ronde en kind, dat bij elke
-- klik bijgewerkt wordt. week is de week die het bericht nu toont.
-- ---------------------------------------------------------------------------
create table if not exists opvang_menus (
  ronde_id    bigint  not null references opvang_rondes (id) on delete cascade,
  kind_id     bigint  not null references opvang_kinderen (id) on delete cascade,
  chat_id     bigint  not null,
  bericht_id  bigint  not null,
  week        integer not null default 0,
  primary key (ronde_id, kind_id)
);

-- Losse instellingen, zoals de Telegram-groep waarin de bot praat.
create table if not exists opvang_instellingen (
  sleutel     text primary key,
  waarde      text not null,
  updated_at  timestamptz not null default now()
);

do $$
declare
  target text;
begin
  foreach target in array array[
    'opvang_kinderen', 'opvang_rondes', 'opvang_slots', 'opvang_keuzes',
    'opvang_resultaten', 'opvang_menus', 'opvang_instellingen'
  ]
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
