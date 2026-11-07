-- Huishouden: De balans, het leven na de verdeling. Een kaart tijdelijk
-- uitlenen, en een nieuwe ronde starten. Zie huishouden/LEESMIJ.md.
--
-- Zelfde huisregels als de rest: idempotent, Row Level Security aan zonder
-- policies, enkel de service-role sleutel mag erbij.

-- ---------------------------------------------------------------------------
-- Een uitlening: een kaart die de owner in deze ronde tijdelijk aan de ander
-- geeft, bv. bij ziekte of een drukke periode. Ook vaste kaarten, die niet
-- in huishouden_verdeling staan. De kaart blijft meetellen bij de owner.
-- ---------------------------------------------------------------------------
create table if not exists huishouden_uitleningen (
  ronde_id     bigint      not null references huishouden_rondes (id) on delete cascade,
  kaart_id     bigint      not null references huishouden_kaarten (id) on delete cascade,
  aan          text        not null check (aan in ('jan', 'sandra')),
  sinds        timestamptz not null default now(),
  primary key (ronde_id, kaart_id)
);

alter table huishouden_uitleningen enable row level security;

-- De kolom die hiervoor bedoeld was, maar enkel kaarten via het spel kon
-- dragen. Ze werd nooit gebruikt.
alter table huishouden_verdeling drop column if exists uitgeleend_aan;

-- ---------------------------------------------------------------------------
-- Welke ronde een nieuwe ronde opvolgt. Uniek: tikken jullie allebei
-- tegelijk op "Nieuwe ronde starten", dan komt er toch maar één nieuwe ronde.
-- ---------------------------------------------------------------------------
alter table huishouden_rondes
  add column if not exists vorige_ronde_id bigint references huishouden_rondes (id) on delete set null;

create unique index if not exists huishouden_rondes_vorige_uniek
  on huishouden_rondes (vorige_ronde_id)
  where vorige_ronde_id is not null;
