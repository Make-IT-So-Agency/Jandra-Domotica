-- Huishouden: De balans, stap 3. Wat Jan en Sandra elk bieden op de kaarten
-- die ze allebei graag doen. Zie huishouden/LEESMIJ.md.
--
-- Zelfde huisregels als de rest: idempotent, Row Level Security aan zonder
-- policies, enkel de service-role sleutel mag erbij.

-- ---------------------------------------------------------------------------
-- Een bod: hoeveel van de 100 punten iemand in een ronde op een kaart zet,
-- in stappen van 5. Enkel bij kaarten waar allebei "Wil ik" zeiden; dat en
-- het budget van 100 bewaakt de app, want het hangt af van de claims.
-- "Klaar met bieden" staat bij de akkoorden, soort "bieden".
-- ---------------------------------------------------------------------------
create table if not exists huishouden_biedingen (
  ronde_id     bigint      not null references huishouden_rondes (id) on delete cascade,
  persoon      text        not null check (persoon in ('jan', 'sandra')),
  kaart_id     bigint      not null references huishouden_kaarten (id) on delete cascade,
  punten       smallint    not null check (punten between 0 and 100 and punten % 5 = 0),
  gewijzigd_op timestamptz not null default now(),
  primary key (ronde_id, persoon, kaart_id)
);

alter table huishouden_biedingen enable row level security;
