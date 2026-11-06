-- Huishouden: De balans, stap 4 en 5. Wat Jan en Sandra samen verschuiven
-- in het voorstel, en de verdeling die ze vastleggen. Zie
-- huishouden/LEESMIJ.md.
--
-- Zelfde huisregels als de rest: idempotent, Row Level Security aan zonder
-- policies, enkel de service-role sleutel mag erbij.

-- ---------------------------------------------------------------------------
-- Het moment van de laatste wijziging aan het voorstel: een verschuiving, of
-- een gewijzigde claim of inschatting. "Dit voelt goed voor mij" slaat op die
-- versie, net zoals het akkoord met de lijst op lijst_versie.
-- ---------------------------------------------------------------------------
alter table huishouden_rondes
  add column if not exists voorstel_versie timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Een verschuiving in het voorstel: een kaart die jullie samen bij de ander
-- of uitbesteed zetten. Enkel kaarten via het spel.
-- ---------------------------------------------------------------------------
create table if not exists huishouden_verschuivingen (
  ronde_id     bigint      not null references huishouden_rondes (id) on delete cascade,
  kaart_id     bigint      not null references huishouden_kaarten (id) on delete cascade,
  naar         text        not null check (naar in ('jan', 'sandra', 'uitbesteed')),
  gewijzigd_op timestamptz not null default now(),
  primary key (ronde_id, kaart_id)
);

-- ---------------------------------------------------------------------------
-- De vastgelegde verdeling: wie owner is van elke kaart via het spel. Vaste
-- kaarten staan hier niet: hun verdeling staat op de kaart zelf.
-- uitgeleend_aan is voor later (tijdelijk uitlenen, stap 5).
-- ---------------------------------------------------------------------------
create table if not exists huishouden_verdeling (
  ronde_id        bigint      not null references huishouden_rondes (id) on delete cascade,
  kaart_id        bigint      not null references huishouden_kaarten (id) on delete cascade,
  eigenaar        text        not null check (eigenaar in ('jan', 'sandra', 'uitbesteed')),
  uitgeleend_aan  text        check (uitgeleend_aan is null or uitgeleend_aan in ('jan', 'sandra')),
  vastgelegd_op   timestamptz not null default now(),
  primary key (ronde_id, kaart_id)
);

do $$
declare
  target text;
begin
  foreach target in array array['huishouden_verschuivingen', 'huishouden_verdeling']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
