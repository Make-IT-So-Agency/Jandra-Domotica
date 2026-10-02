-- Bouw, fase 4: geld. Posten met een raming, de offertes per post, meer- en
-- minwerken, de facturen met hun vervaldag, en de opnames van het
-- bouwkrediet. Alle bedragen zijn inclusief btw.
--
-- Zie bouw/LEESMIJ.md. Idempotent, Row Level Security aan zonder policies.
-- De lijsten horen bij web/lib/bouw/geld.ts.

-- ---------------------------------------------------------------------------
-- Een post: een deel van de bouw dat geld kost. Ruwbouw, elektriciteit, de
-- architect, de aansluitingen... De raming is wat we verwachten; wat het
-- echt kost, volgt uit de gekozen offerte en de aanvaarde meerwerken.
-- ---------------------------------------------------------------------------
create table if not exists bouw_posten (
  id           bigint generated always as identity primary key,
  naam         text           not null,
  categorie    text           not null default 'werken'
               check (categorie in ('werken', 'studies', 'vergunning', 'nutsvoorzieningen', 'inrichting', 'andere')),
  raming       numeric(12, 2) check (raming is null or raming >= 0),
  partij_id    bigint         references bouw_partijen (id) on delete set null,
  planning_id  bigint         references bouw_planning (id) on delete set null,
  opmerking    text,
  created_at   timestamptz    not null default now(),
  updated_at   timestamptz    not null default now()
);

-- Een offerte voor een post. Hoogstens één per post is gekozen.
create table if not exists bouw_offertes (
  id            bigint generated always as identity primary key,
  post_id       bigint         not null references bouw_posten (id) on delete cascade,
  partij_id     bigint         references bouw_partijen (id) on delete set null,
  omschrijving  text,
  bedrag        numeric(12, 2) not null check (bedrag >= 0),
  datum         date,
  geldig_tot    date,
  bestand_id    bigint         references bouw_bestanden (id) on delete set null,
  status        text           not null default 'ontvangen'
                check (status in ('ontvangen', 'gekozen', 'afgewezen')),
  opmerking     text,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now()
);

create index if not exists bouw_offertes_post on bouw_offertes (post_id);
create unique index if not exists bouw_offertes_gekozen on bouw_offertes (post_id) where status = 'gekozen';

-- Meer- of minwerk op een post: een positief of negatief bedrag. Enkel wat
-- aanvaard is, telt mee.
create table if not exists bouw_meerwerken (
  id            bigint generated always as identity primary key,
  post_id       bigint         not null references bouw_posten (id) on delete cascade,
  omschrijving  text           not null,
  bedrag        numeric(12, 2) not null,
  datum         date           not null default current_date,
  status        text           not null default 'voorgesteld'
                check (status in ('voorgesteld', 'aanvaard', 'geweigerd')),
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now()
);

create index if not exists bouw_meerwerken_post on bouw_meerwerken (post_id);

-- Een factuur, of een creditnota met een negatief bedrag. Een kost kan aan
-- een vennootschap toegewezen worden, bv. een laadpaal.
create table if not exists bouw_facturen (
  id               bigint generated always as identity primary key,
  post_id          bigint         references bouw_posten (id) on delete set null,
  partij_id        bigint         references bouw_partijen (id) on delete set null,
  nummer           text,
  omschrijving     text,
  bedrag           numeric(12, 2) not null check (bedrag <> 0),
  factuurdatum     date           not null,
  vervaldag        date,
  betaald_op       date,
  bestand_id       bigint         references bouw_bestanden (id) on delete set null,
  vennootschap_id  uuid           references companies (id) on delete set null,
  opmerking        text,
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now(),
  check (vervaldag is null or vervaldag >= factuurdatum)
);

create index if not exists bouw_facturen_vervaldag on bouw_facturen (vervaldag);
create index if not exists bouw_facturen_post on bouw_facturen (post_id);

-- Een opname van het bouwkrediet, eventueel voor een bepaalde factuur. Het
-- bedrag van het krediet en de eigen inbreng staan in bouw_instellingen.
create table if not exists bouw_kredietopnames (
  id          bigint generated always as identity primary key,
  datum       date           not null,
  bedrag      numeric(12, 2) not null check (bedrag > 0),
  factuur_id  bigint         references bouw_facturen (id) on delete set null,
  opmerking   text,
  created_at  timestamptz    not null default now()
);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_posten', 'bouw_offertes', 'bouw_meerwerken', 'bouw_facturen']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;

  foreach target in array array['bouw_posten', 'bouw_offertes', 'bouw_meerwerken', 'bouw_facturen', 'bouw_kredietopnames']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
