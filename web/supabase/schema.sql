-- Databankschema voor de laadkostenrapportage.
--
-- Plak dit één keer volledig in de SQL Editor van Supabase en klik "Run".
-- Het script mag je gerust opnieuw draaien: alles is idempotent.
--
-- Toegang: de webapp praat met Supabase via de service-role sleutel, die
-- server-side blijft. Row Level Security staat daarom aan zonder policies,
-- zodat de publieke anon-sleutel niets kan lezen of schrijven.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Vennootschappen die hun deel terugbetalen
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  vat_number    text,
  address       text,
  email         text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists companies_name_key on companies (lower(name));

-- ---------------------------------------------------------------------------
-- Laadpalen. De naam is die van het laadpunt in evcc; daarop koppelen we.
-- ---------------------------------------------------------------------------
create table if not exists loadpoints (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  display_name  text,
  company_id    uuid        references companies (id) on delete set null,
  region        text        not null default 'vlaanderen',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists loadpoints_name_key on loadpoints (lower(name));

-- ---------------------------------------------------------------------------
-- Laadsessies zoals evcc ze kent. external_id maakt de import herhaalbaar:
-- dezelfde sessie twee keer binnensturen werkt bij, dupliceert niet.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text        not null,
  loadpoint_name      text,
  vehicle             text,
  started_at          timestamptz,
  finished_at         timestamptz,
  energy_kwh          numeric(12, 3),
  meter_start_kwh     numeric(14, 3),
  meter_stop_kwh      numeric(14, 3),
  duration_seconds    numeric(12, 1),
  solar_percentage    numeric(5, 2),
  odometer_km         numeric(12, 1),
  evcc_price_eur      numeric(12, 4),
  evcc_price_per_kwh  numeric(12, 5),
  is_complete         boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists sessions_external_id_key on sessions (external_id);
create index if not exists sessions_finished_at_idx on sessions (finished_at);
create index if not exists sessions_loadpoint_idx on sessions (lower(loadpoint_name));

-- ---------------------------------------------------------------------------
-- Kwartaaltarieven (CREG-maximum voor terugbetaling van thuisladen).
-- period_start is telkens de eerste dag van het kwartaal.
-- ---------------------------------------------------------------------------
create table if not exists tariffs (
  id                  uuid primary key default gen_random_uuid(),
  region              text        not null default 'vlaanderen',
  period_start        date        not null,
  period_end          date        not null,
  eur_per_kwh         numeric(10, 5) not null check (eur_per_kwh > 0),
  includes_vat        boolean     not null default true,
  vat_rate            numeric(5, 4) not null default 0.06,
  source              text        not null default 'manual',
  source_url          text,
  note                text,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists tariffs_period_key on tariffs (region, period_start);

-- ---------------------------------------------------------------------------
-- Meterstanden per laadpaal, als controlegetal naast de sessieoptelling.
-- ---------------------------------------------------------------------------
create table if not exists meter_readings (
  id              uuid primary key default gen_random_uuid(),
  loadpoint_name  text        not null,
  reading_kwh     numeric(14, 3) not null,
  read_at         timestamptz not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists meter_readings_unique
  on meter_readings (lower(loadpoint_name), read_at);
create index if not exists meter_readings_read_at_idx on meter_readings (read_at);

-- ---------------------------------------------------------------------------
-- Gegenereerde rapporten. De inhoud wordt als momentopname bewaard, zodat een
-- rapport van vorig kwartaal niet verandert als je nadien een tarief corrigeert.
-- ---------------------------------------------------------------------------
create table if not exists reports (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid        not null references companies (id) on delete cascade,
  reference       text        not null,
  period_start    date        not null,
  period_end      date        not null,
  period_kind     text        not null default 'month',
  session_count   integer     not null default 0,
  total_kwh       numeric(14, 3) not null default 0,
  total_excl_vat  numeric(14, 2) not null default 0,
  total_vat       numeric(14, 2) not null default 0,
  total_incl_vat  numeric(14, 2) not null default 0,
  snapshot        jsonb       not null,
  generated_by    text,
  generated_at    timestamptz not null default now()
);

create unique index if not exists reports_reference_key on reports (reference);
create index if not exists reports_company_period_idx
  on reports (company_id, period_start desc);

-- ---------------------------------------------------------------------------
-- Instellingen van de app (naam en adres van de begunstigde, btw-keuzes, ...)
-- Eén rij, sleutel-waarde, zodat er geen migratie nodig is bij een nieuwe optie.
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gebruikers en hun rol.
--
-- hoofdbeheerder          ziet en beheert alles, over de vennootschappen heen
-- vennootschapsbeheerder  ziet enkel de eigen vennootschap en nodigt daar zelf
--                         mensen voor uit
-- kijker                  ziet enkel de eigen vennootschap, wijzigt niets
-- ---------------------------------------------------------------------------
create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null,
  name          text,
  role          text        not null default 'kijker',
  company_id    uuid        references companies (id) on delete cascade,
  invited_by    text,
  invited_at    timestamptz not null default now(),
  last_login_at timestamptz,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint app_users_role_check
    check (role in ('hoofdbeheerder', 'vennootschapsbeheerder', 'kijker')),

  -- Een hoofdbeheerder kijkt over alle vennootschappen heen en hangt dus aan
  -- geen enkele. Wie dat niet is, hoort altijd bij precies één vennootschap.
  constraint app_users_company_check check (
    (role = 'hoofdbeheerder' and company_id is null)
    or (role <> 'hoofdbeheerder' and company_id is not null)
  )
);

create unique index if not exists app_users_email_key on app_users (lower(email));
create index if not exists app_users_company_idx on app_users (company_id);

-- ---------------------------------------------------------------------------
-- Logboek van binnenkomende synchronisaties, handig bij het zoeken naar een
-- ontbrekende sessie.
-- ---------------------------------------------------------------------------
create table if not exists ingest_log (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  installation_id text,
  session_count   integer     not null default 0,
  inserted_count  integer     not null default 0,
  updated_count   integer     not null default 0,
  error           text
);

create index if not exists ingest_log_received_at_idx on ingest_log (received_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automatisch bijhouden
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['companies', 'loadpoints', 'sessions', 'tariffs', 'app_users']
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

-- ---------------------------------------------------------------------------
-- Alles afgeschermd: enkel de service-role sleutel (server-side) mag erbij.
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'companies', 'loadpoints', 'sessions', 'tariffs',
    'meter_readings', 'reports', 'app_settings', 'ingest_log', 'app_users'
  ]
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
