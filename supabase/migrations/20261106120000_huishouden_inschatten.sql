-- Huishouden: De balans, stap 2. Wat Jan en Sandra elk apart invullen per
-- kaart, en hun beschikbare tijd. Zie huishouden/LEESMIJ.md.
--
-- Zelfde huisregels als de rest: idempotent, Row Level Security aan zonder
-- policies, enkel de service-role sleutel mag erbij.

-- ---------------------------------------------------------------------------
-- Een inschatting: hoeveel fysieke tijd en mentale last een kaart voor
-- iemand vraagt, elk op een schaal van 1 tot 5. Blijft staan over rondes
-- heen. Tijd en last zijn apart te bewaren, zodat twee snelle tikken op
-- dezelfde kaart elkaar niet overschrijven.
-- ---------------------------------------------------------------------------
create table if not exists huishouden_inschattingen (
  persoon      text        not null check (persoon in ('jan', 'sandra')),
  kaart_id     bigint      not null references huishouden_kaarten (id) on delete cascade,
  tijd         smallint    check (tijd between 1 and 5),
  last         smallint    check (last between 1 and 5),
  gewijzigd_op timestamptz not null default now(),
  primary key (persoon, kaart_id)
);

-- ---------------------------------------------------------------------------
-- Een claim: hoe graag iemand een kaart doet, in één ronde.
--   wil · mag · liever_niet · echt_niet
-- ---------------------------------------------------------------------------
create table if not exists huishouden_claims (
  ronde_id     bigint      not null references huishouden_rondes (id) on delete cascade,
  persoon      text        not null check (persoon in ('jan', 'sandra')),
  kaart_id     bigint      not null references huishouden_kaarten (id) on delete cascade,
  claim        text        not null check (claim in ('wil', 'mag', 'liever_niet', 'echt_niet')),
  gewijzigd_op timestamptz not null default now(),
  primary key (ronde_id, persoon, kaart_id)
);

-- ---------------------------------------------------------------------------
-- De beschikbare tijd voor gezin en hobby, in uren per week. Blijft staan
-- over rondes heen. Geen rij is "nog niet ingevuld".
-- ---------------------------------------------------------------------------
create table if not exists huishouden_tijd (
  persoon      text        primary key check (persoon in ('jan', 'sandra')),
  uren         smallint    not null check (uren between 1 and 80),
  gewijzigd_op timestamptz not null default now()
);

do $$
declare
  target text;
begin
  foreach target in array array['huishouden_inschattingen', 'huishouden_claims', 'huishouden_tijd']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
