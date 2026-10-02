-- Bouw: ons bouwproject. De partijen, de verdiepingen, de plannen van de
-- architect met hun versies, en het register van de bestanden in Storage.
--
-- Zie bouw/LEESMIJ.md. Zelfde huisregels als de rest: idempotent, Row Level
-- Security aan zonder policies, enkel de service-role sleutel mag erbij (de
-- webapp op Vercel).
--
-- Wat over het huis zelf gaat (de projectnaam, het adres, de plannen) staat
-- enkel in deze databank en in de privé-bucket, nooit in de repository: die
-- is publiek.

-- ---------------------------------------------------------------------------
-- Losse instellingen, zoals de projectnaam en het adres.
-- ---------------------------------------------------------------------------
create table if not exists bouw_instellingen (
  sleutel     text primary key,
  waarde      text        not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Iedereen met wie we te maken hebben: architect, aannemers, leveranciers,
-- adviseurs, nutsbedrijven, de bank. vak is vrij, bv. "ruwbouw".
-- ---------------------------------------------------------------------------
create table if not exists bouw_partijen (
  id              bigint generated always as identity primary key,
  soort           text        not null
                  check (soort in ('architect', 'aannemer', 'leverancier', 'adviseur',
                                   'overheid', 'nutsbedrijf', 'bank', 'verzekeraar', 'andere')),
  naam            text        not null,
  vak             text,
  contactpersoon  text,
  email           text,
  telefoon        text,
  adres           text,
  website         text,
  btw_nummer      text,
  opmerking       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Elk bestand in de bucket "bouw". pad is een UUID, nooit de oorspronkelijke
-- naam: daar kan de straat in staan.
--
--   wacht  de browser kreeg een upload-URL, het bestand is nog niet bevestigd
--   klaar  het bestand staat er en is gecontroleerd
-- ---------------------------------------------------------------------------
create table if not exists bouw_bestanden (
  id                   bigint generated always as identity primary key,
  pad                  text        not null unique,
  doel                 text        not null,
  oorspronkelijke_naam text        not null,
  mime_type            text        not null,
  grootte_bytes        bigint      check (grootte_bytes is null or grootte_bytes >= 0),
  status               text        not null default 'wacht'
                       check (status in ('wacht', 'klaar')),
  opgeladen_door       text,
  created_at           timestamptz not null default now(),
  klaar_op             timestamptz
);

create index if not exists bouw_bestanden_status on bouw_bestanden (status, created_at);

-- ---------------------------------------------------------------------------
-- Verdiepingen. Peil en hoogtes in meter; ze dienen later voor het 3D-model.
-- ---------------------------------------------------------------------------
create table if not exists bouw_verdiepingen (
  id                   bigint generated always as identity primary key,
  naam                 text           not null unique,
  volgorde             integer        not null default 0,
  vloerpeil_m          numeric(6, 3),
  verdiepingshoogte_m  numeric(6, 3)  check (verdiepingshoogte_m is null or verdiepingshoogte_m > 0),
  plafondhoogte_m      numeric(6, 3)  check (plafondhoogte_m is null or plafondhoogte_m > 0),
  created_at           timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- Gekende punten in het assenstelsel van het huis (meter, y naar beneden),
-- bv. twee hoeken van de buitenmuur. Daarmee worden versies en verdiepingen
-- op elkaar gelegd.
-- ---------------------------------------------------------------------------
create table if not exists bouw_referentiepunten (
  id            bigint generated always as identity primary key,
  code          text             not null unique,
  omschrijving  text,
  x_m           double precision not null,
  y_m           double precision not null,
  created_at    timestamptz      not null default now()
);

-- ---------------------------------------------------------------------------
-- Een plan van de architect, los van zijn versies.
-- ---------------------------------------------------------------------------
create table if not exists bouw_plannen (
  id             bigint generated always as identity primary key,
  titel          text        not null,
  soort          text        not null
                 check (soort in ('grondplan', 'gevel', 'doorsnede', 'inplanting',
                                  'technieken', 'detail', 'andere')),
  verdieping_id  bigint      references bouw_verdiepingen (id) on delete restrict,
  opmerking      text,
  created_at     timestamptz not null default now()
);

create index if not exists bouw_plannen_verdieping on bouw_plannen (verdieping_id);

-- ---------------------------------------------------------------------------
-- Een versie van een plan: één blad (pagina) uit een PDF. Meerdere versies
-- mogen dezelfde PDF delen, elk met een eigen pagina. kalibratie legt het
-- blad in het assenstelsel van het huis; die vult de omzetting later in.
-- ---------------------------------------------------------------------------
create table if not exists bouw_planversies (
  id          bigint generated always as identity primary key,
  plan_id     bigint      not null references bouw_plannen (id) on delete cascade,
  bestand_id  bigint      not null references bouw_bestanden (id) on delete restrict,
  label       text        not null,
  pagina      integer     not null default 1 check (pagina >= 1),
  datum       date,
  kalibratie  jsonb       check (kalibratie is null or jsonb_typeof(kalibratie) = 'object'),
  opmerking   text,
  created_at  timestamptz not null default now(),
  unique (plan_id, label)
);

create index if not exists bouw_planversies_bestand on bouw_planversies (bestand_id);

-- updated_at bijhouden, met de functie uit het basisschema.
do $$
declare
  target text;
begin
  foreach target in array array['bouw_partijen']
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
  foreach target in array array[
    'bouw_instellingen', 'bouw_partijen', 'bouw_bestanden', 'bouw_verdiepingen',
    'bouw_referentiepunten', 'bouw_plannen', 'bouw_planversies'
  ]
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- De privé-bucket voor plannen en later foto's en facturen.
--
-- Enkel als Supabase Storage er is: de CI draait deze migraties tegen een
-- gewone PostgreSQL, en daar bestaat het schema storage niet. to_regclass
-- geeft dan null in plaats van een fout.
--
-- Bestaat de bucket al, dan wordt hij hoe dan ook terug privé gezet. Objecten
-- verwijderen gebeurt altijd via de Storage-API: Supabase blokkeert DELETE op
-- storage.objects vanuit SQL.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Geen Supabase Storage in deze databank: bucket bouw overgeslagen.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('bouw', 'bouw', false, 52428800,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;
