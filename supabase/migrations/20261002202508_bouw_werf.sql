-- Bouw, fase 6: de werf. Foto's (met de gsm, per ruimte of geprikt op het
-- plan), een werfdagboek, actiepunten uit de werfvergadering,
-- opleverpunten per aannemer, en per ruimte een checklist vóór alles
-- dichtgaat.
--
-- Zie bouw/LEESMIJ.md. Idempotent, Row Level Security aan zonder policies.
-- De lijsten horen bij web/lib/bouw/werf.ts.

-- ---------------------------------------------------------------------------
-- Het werfdagboek: per dag wat er gebeurde, wie er was, en het weer.
-- ---------------------------------------------------------------------------
create table if not exists bouw_dagboek (
  id          bigint generated always as identity primary key,
  datum       date        not null,
  tekst       text        not null,
  aanwezig    text,
  weer        text,
  door        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists bouw_dagboek_datum on bouw_dagboek (datum);

-- ---------------------------------------------------------------------------
-- Een opleverpunt: iets dat een aannemer nog moet herstellen. Het is pas af
-- als wij het gecontroleerd hebben, niet als de aannemer zegt dat het
-- hersteld is.
-- ---------------------------------------------------------------------------
create table if not exists bouw_opleverpunten (
  id                  bigint generated always as identity primary key,
  titel               text           not null,
  omschrijving        text,
  partij_id           bigint         references bouw_partijen (id) on delete set null,
  verdieping_id       bigint         references bouw_verdiepingen (id) on delete set null,
  ruimte_id           bigint         references bouw_ruimtes (id) on delete set null,
  x_m                 numeric(8, 3),
  y_m                 numeric(8, 3),
  ronde               text           not null default 'voorlopig'
                      check (ronde in ('werf', 'voorlopig', 'definitief')),
  status              text           not null default 'open'
                      check (status in ('open', 'gemeld', 'hersteld', 'gecontroleerd')),
  gemeld_op           timestamptz,
  hersteld_op         timestamptz,
  hersteld_door       text,
  herstelopmerking    text,
  gecontroleerd_op    timestamptz,
  gecontroleerd_door  text,
  door                text,
  created_at          timestamptz    not null default now(),
  updated_at          timestamptz    not null default now(),
  check ((x_m is null) = (y_m is null))
);

create index if not exists bouw_opleverpunten_partij on bouw_opleverpunten (partij_id, status);

-- ---------------------------------------------------------------------------
-- Een foto van de werf. Het bestand zelf staat in de privé-bucket, onder
-- fotos/, verkleind en zonder EXIF, met een kleine versie voor de
-- overzichten. Een foto kan bij een ruimte horen, op het plan geprikt zijn,
-- bij een dag van het dagboek horen, of bij een opleverpunt.
-- ---------------------------------------------------------------------------
create table if not exists bouw_werffotos (
  id              bigint generated always as identity primary key,
  bestand_id      bigint         not null references bouw_bestanden (id) on delete cascade,
  duim_bestand_id bigint         references bouw_bestanden (id) on delete set null,
  genomen_op      timestamptz    not null,
  onderschrift    text,
  verdieping_id   bigint         references bouw_verdiepingen (id) on delete set null,
  ruimte_id       bigint         references bouw_ruimtes (id) on delete set null,
  x_m             numeric(8, 3),
  y_m             numeric(8, 3),
  dagboek_id      bigint         references bouw_dagboek (id) on delete set null,
  opleverpunt_id  bigint         references bouw_opleverpunten (id) on delete set null,
  door            text,
  created_at      timestamptz    not null default now(),
  check ((x_m is null) = (y_m is null))
);

create index if not exists bouw_werffotos_genomen on bouw_werffotos (genomen_op);
create index if not exists bouw_werffotos_ruimte on bouw_werffotos (ruimte_id);
create index if not exists bouw_werffotos_bestand on bouw_werffotos (bestand_id);

-- ---------------------------------------------------------------------------
-- Een actiepunt, bv. uit de werfvergadering: wie, wat, tegen wanneer.
-- ---------------------------------------------------------------------------
create table if not exists bouw_actiepunten (
  id            bigint generated always as identity primary key,
  titel         text        not null,
  omschrijving  text,
  partij_id     bigint      references bouw_partijen (id) on delete set null,
  deadline      date,
  status        text        not null default 'open' check (status in ('open', 'klaar')),
  klaar_op      timestamptz,
  door          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists bouw_actiepunten_status on bouw_actiepunten (status, deadline);

-- ---------------------------------------------------------------------------
-- De checklist per ruimte vóór alles dichtgaat: wat er afgevinkt is. De
-- lijst zelf staat in de code.
-- ---------------------------------------------------------------------------
create table if not exists bouw_checklist (
  id         bigint generated always as identity primary key,
  ruimte_id  bigint      not null references bouw_ruimtes (id) on delete cascade,
  sleutel    text        not null check (sleutel ~ '^[a-z0-9_]{1,40}$'),
  gedaan_op  timestamptz not null default now(),
  door       text
);

create unique index if not exists bouw_checklist_ruimte_sleutel on bouw_checklist (ruimte_id, sleutel);

-- Een aannemer ziet via zijn link zijn opleverpunten, en meldt wat hersteld is.
alter table bouw_links drop constraint if exists bouw_links_rechten_check;
alter table bouw_links add constraint bouw_links_rechten_check
  check (rechten <@ array['plannen', 'inzenden', 'keuzes', 'planning', 'wensenlijst', 'offertes', 'facturen', 'oplevering']::text[]);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_dagboek', 'bouw_opleverpunten', 'bouw_actiepunten']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
  end loop;

  foreach target in array array['bouw_dagboek', 'bouw_opleverpunten', 'bouw_werffotos', 'bouw_actiepunten', 'bouw_checklist']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
