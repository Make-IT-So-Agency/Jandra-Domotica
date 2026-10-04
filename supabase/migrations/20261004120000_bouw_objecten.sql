-- Bouw, 3D: meubels en toestellen. Een bed, een zetel, de keuken, een
-- warmtepomp, een regenwaterput: per verdieping, in meter in het
-- assenstelsel van het gebouw, zoals de punten. Zo overleven ze een nieuwe
-- versie van het plan. Later komen hier ook de zonnepanelen, schuin op het
-- dak (de kanteling).
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/inrichting.ts. Idempotent, Row Level
-- Security aan zonder policies. Voegt enkel iets toe: de oude code kent de
-- tabel niet.
--
-- De soorten staan in de code, zoals bij de punten. Hier enkel een controle op
-- de vorm, en op de maten: een getal, binnen de perken.

create table if not exists bouw_objecten (
  id             bigint           generated always as identity primary key,
  verdieping_id  bigint           not null references bouw_verdiepingen (id) on delete cascade,
  soort          text             not null check (soort ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- Het midden op het plan.
  x_m            double precision not null check (x_m between -1000 and 1000),
  y_m            double precision not null check (y_m between -1000 and 1000),
  -- De onderkant boven de vloer van de verdieping; een put zit eronder.
  z_m            double precision not null default 0 check (z_m between -10 and 30),
  -- Met de klok mee op het plan, en hoe schuin het ligt (zonnepanelen).
  hoek           double precision not null default 0 check (hoek between -180 and 180),
  kanteling      double precision not null default 0 check (kanteling between 0 and 90),
  breedte_m      double precision not null check (breedte_m > 0 and breedte_m <= 30),
  diepte_m       double precision not null check (diepte_m > 0 and diepte_m <= 30),
  hoogte_m       double precision not null check (hoogte_m > 0 and hoogte_m <= 30),
  label          text             check (label is null or char_length(label) <= 80),
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

create index if not exists bouw_objecten_verdieping on bouw_objecten (verdieping_id);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_objecten']
  loop
    execute format('drop trigger if exists %I_set_updated_at on %I', target, target);
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()',
      target, target
    );
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
