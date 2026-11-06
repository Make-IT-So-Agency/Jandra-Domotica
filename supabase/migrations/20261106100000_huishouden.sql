-- Huishouden: De balans. De werkstromen van het gezin ("kaarten"), de
-- rondes waarin Jan en Sandra ze verdelen, en hun akkoorden.
--
-- Zie huishouden/LEESMIJ.md. Zelfde huisregels als de rest: idempotent, Row
-- Level Security aan zonder policies, enkel de service-role sleutel mag
-- erbij (de webapp op Vercel).

-- ---------------------------------------------------------------------------
-- Wie in Huishouden Jan is en wie Sandra. Wie hier niets heeft, ziet de
-- module niet. Elke persoon hoort bij hoogstens één gebruiker.
-- ---------------------------------------------------------------------------
alter table app_users add column if not exists huishouden_persoon text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_huishouden_persoon_check'
  ) then
    alter table app_users
      add constraint app_users_huishouden_persoon_check
      check (huishouden_persoon is null or huishouden_persoon in ('jan', 'sandra'));
  end if;
end;
$$;

create unique index if not exists app_users_huishouden_persoon_uniek
  on app_users (huishouden_persoon)
  where huishouden_persoon is not null;

-- ---------------------------------------------------------------------------
-- Een kaart: één werkstroom van het gezin, bv. "Maaltijden".
--
--   verdeling  spel    via het spel: inschatten, claimen en het voorstel
--              jan     vast bij Jan
--              sandra  vast bij Sandra
--              elk     elk voor zich, zoals hobbytijd: telt bij allebei
--              samen   samen, telt nergens mee
--
-- Een geschrapte kaart blijft staan maar telt nergens meer mee.
-- ---------------------------------------------------------------------------
create table if not exists huishouden_kaarten (
  id            bigint generated always as identity primary key,
  titel         text        not null check (char_length(titel) between 1 and 60),
  domein        text        not null check (char_length(domein) between 1 and 40),
  omschrijving  text        check (omschrijving is null or char_length(omschrijving) <= 300),
  goed_genoeg   text        check (goed_genoeg is null or char_length(goed_genoeg) <= 300),
  frequentie    text        not null default 'wekelijks'
                check (frequentie in ('dagelijks', 'wekelijks', 'maandelijks', 'kwartaal', 'jaarlijks', 'project')),
  verdeling     text        not null default 'spel'
                check (verdeling in ('spel', 'jan', 'sandra', 'elk', 'samen')),
  -- Enkel bij "elk voor zich": de vaste uren per week voor elk, bv. 5.
  vaste_uren    numeric(4, 1) check (vaste_uren is null or (vaste_uren > 0 and vaste_uren <= 80)),
  geschrapt     boolean     not null default false,
  volgorde      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Een ronde: één doorloop van stap 1 tot 5. De ronde met het hoogste nummer
-- is de huidige.
--
--   fase  lijst        stap 1, de lijst opstellen
--         inschatten   stap 2
--         bieden       stap 3
--         voorstel     stap 4
--         vastgelegd   stap 5
--
-- lijst_versie is het moment van de laatste wijziging aan de lijst. Een
-- akkoord geldt enkel voor de versie die je zag: zo wist een wijziging het
-- akkoord van allebei, zonder dat een akkoord van de een dat van de ander
-- kan overschrijven.
-- ---------------------------------------------------------------------------
create table if not exists huishouden_rondes (
  id             bigint generated always as identity primary key,
  fase           text        not null default 'lijst'
                 check (fase in ('lijst', 'inschatten', 'bieden', 'voorstel', 'vastgelegd')),
  lijst_versie   timestamptz not null default now(),
  gestart_op     timestamptz not null default now(),
  vastgelegd_op  timestamptz
);

-- De eerste ronde staat er meteen, zodat twee mensen die tegelijk de pagina
-- openen niet elk een eigen ronde beginnen.
insert into huishouden_rondes (fase)
select 'lijst'
where not exists (select 1 from huishouden_rondes);

-- ---------------------------------------------------------------------------
-- Een akkoord van één persoon in één ronde. Eén rij per persoon en per soort,
-- zodat de een nooit het akkoord van de ander overschrijft.
--
--   soort  lijst     akkoord met de lijst (stap 1); versie = lijst_versie
--          bieden    klaar met bieden (stap 3)
--          voorstel  voelt goed bij het voorstel (stap 4)
-- ---------------------------------------------------------------------------
create table if not exists huishouden_akkoorden (
  ronde_id    bigint      not null references huishouden_rondes (id) on delete cascade,
  persoon     text        not null check (persoon in ('jan', 'sandra')),
  soort       text        not null check (soort in ('lijst', 'bieden', 'voorstel')),
  versie      timestamptz,
  gegeven_op  timestamptz not null default now(),
  primary key (ronde_id, persoon, soort)
);

do $$
declare
  target text;
begin
  foreach target in array array['huishouden_kaarten', 'huishouden_rondes', 'huishouden_akkoorden']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
