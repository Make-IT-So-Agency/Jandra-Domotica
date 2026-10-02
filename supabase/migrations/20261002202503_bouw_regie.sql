-- Bouw, fase 3: regie. De planning, de keuzes met hun opties en onze
-- voorkeur, het beslissingslog, en wat de eigen bot van Bouw al gemeld heeft.
--
-- Zie bouw/LEESMIJ.md. Zelfde huisregels als de andere Bouw-migraties:
-- idempotent, Row Level Security aan zonder policies. Een lijst in een
-- check-constraint hoort bij een lijst in web/lib/bouw/keuzes.ts of
-- planning.ts: wie er een aanpast, past de andere mee aan.

-- ---------------------------------------------------------------------------
-- De planning: fasen, taken en mijlpalen. Een taak hoort bij een fase en
-- eventueel bij een partij (de aannemer die ze uitvoert). Een mijlpaal heeft
-- enkel een begindatum.
-- ---------------------------------------------------------------------------
create table if not exists bouw_planning (
  id           bigint generated always as identity primary key,
  soort        text        not null check (soort in ('fase', 'taak', 'mijlpaal')),
  titel        text        not null,
  begindatum   date        not null,
  einddatum    date,
  fase_id      bigint      references bouw_planning (id) on delete set null,
  partij_id    bigint      references bouw_partijen (id) on delete set null,
  status       text        not null default 'gepland'
               check (status in ('gepland', 'bezig', 'klaar')),
  opmerking    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (einddatum is null or einddatum >= begindatum)
);

create index if not exists bouw_planning_begindatum on bouw_planning (begindatum);

-- ---------------------------------------------------------------------------
-- Keuzes: gevelsteen, dakpan, ramen, vloeren, keuken, warmtepomp... Elk met
-- een deadline: vast, of berekend uit de taak die het nodig heeft min de
-- levertermijn. De hoeveelheid komt uit de gekoppelde ruimtes (m²) of wordt
-- met de hand ingevuld; zo volgt de meerprijs van een optie.
-- ---------------------------------------------------------------------------
create table if not exists bouw_keuzes (
  id                  bigint generated always as identity primary key,
  titel               text        not null,
  categorie           text        not null default 'andere'
                      check (categorie in ('ruwbouw', 'gevel', 'dak', 'buitenschrijnwerk',
                                           'binnenschrijnwerk', 'vloeren', 'wanden', 'sanitair',
                                           'keuken', 'klimaat', 'elektriciteit', 'energie',
                                           'buiten', 'andere')),
  omschrijving        text,
  deadline            date,
  planning_id         bigint      references bouw_planning (id) on delete set null,
  levertermijn_weken  integer     check (levertermijn_weken is null or levertermijn_weken between 0 and 104),
  eenheid             text        not null default 'totaal'
                      check (eenheid in ('totaal', 'm2', 'm', 'stuk')),
  hoeveelheid         numeric(10, 2) check (hoeveelheid is null or hoeveelheid >= 0),
  partij_id           bigint      references bouw_partijen (id) on delete set null,
  gekozen_optie_id    bigint,
  beslist_op          timestamptz,
  beslist_door        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists bouw_keuzes_deadline on bouw_keuzes (deadline);

-- Een optie: een product, een kleur, een uitvoering. De prijs is inclusief
-- btw, per eenheid van de keuze. Hoogstens één optie per keuze is de basis
-- (wat in de offerte staat); de meerprijs van de andere is daartegenover.
create table if not exists bouw_opties (
  id               bigint generated always as identity primary key,
  keuze_id         bigint        not null references bouw_keuzes (id) on delete cascade,
  naam             text          not null,
  leverancier_id   bigint        references bouw_partijen (id) on delete set null,
  prijs            numeric(12, 2) check (prijs is null or prijs >= 0),
  basis            boolean       not null default false,
  kleur            text          check (kleur is null or kleur ~ '^#[0-9a-f]{6}$'),
  url              text,
  foto_bestand_id  bigint        references bouw_bestanden (id) on delete set null,
  opmerking        text,
  volgorde         integer       not null default 0,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

create index if not exists bouw_opties_keuze on bouw_opties (keuze_id);
create unique index if not exists bouw_opties_basis on bouw_opties (keuze_id) where basis;

-- De gekozen optie. Pas hier, want bouw_opties moest eerst bestaan. Dat ze
-- bij dezelfde keuze hoort, controleert de webapp.
alter table bouw_keuzes drop constraint if exists bouw_keuzes_gekozen_optie_fkey;
alter table bouw_keuzes add constraint bouw_keuzes_gekozen_optie_fkey
  foreign key (gekozen_optie_id) references bouw_opties (id) on delete set null;

-- Op welke ruimtes een keuze slaat, voor de hoeveelheid in m².
create table if not exists bouw_keuze_ruimtes (
  keuze_id   bigint not null references bouw_keuzes (id) on delete cascade,
  ruimte_id  bigint not null references bouw_ruimtes (id) on delete cascade,
  primary key (keuze_id, ruimte_id)
);

-- Ieders voorkeur: één optie per keuze per persoon. wie is het e-mailadres
-- van de gebruiker, naam wat we tonen.
create table if not exists bouw_voorkeuren (
  keuze_id    bigint      not null references bouw_keuzes (id) on delete cascade,
  wie         text        not null,
  naam        text        not null,
  optie_id    bigint      not null references bouw_opties (id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (keuze_id, wie)
);

-- ---------------------------------------------------------------------------
-- Het beslissingslog: wat we wanneer beslist hebben. Een definitieve keuze
-- schrijft er zelf een regel bij; andere beslissingen (geen kelder, systeem D)
-- komen er met de hand bij. Een regel blijft staan als de keuze verdwijnt.
-- ---------------------------------------------------------------------------
create table if not exists bouw_beslissingen (
  id          bigint generated always as identity primary key,
  datum       date        not null default current_date,
  onderwerp   text        not null,
  beslissing  text        not null,
  keuze_id    bigint      references bouw_keuzes (id) on delete set null,
  door        text,
  created_at  timestamptz not null default now()
);

create index if not exists bouw_beslissingen_datum on bouw_beslissingen (datum);

-- ---------------------------------------------------------------------------
-- Wat de bot van Bouw al gemeld heeft, zodat een herinnering maar één keer
-- vertrekt, ook als de dagelijkse ronde twee keer loopt. De sleutel zegt
-- waarover het ging, bv. deadline:12:7 (keuze 12, nog 7 dagen).
-- ---------------------------------------------------------------------------
create table if not exists bouw_meldingen (
  sleutel       text        primary key,
  verstuurd_op  timestamptz not null default now()
);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_planning', 'bouw_keuzes', 'bouw_opties']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;

  foreach target in array array[
    'bouw_planning', 'bouw_keuzes', 'bouw_opties', 'bouw_keuze_ruimtes',
    'bouw_voorkeuren', 'bouw_beslissingen', 'bouw_meldingen'
  ]
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
