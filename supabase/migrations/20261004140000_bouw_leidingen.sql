-- Bouw, 3D: leidingen. Water, afvoer, regenwater, ventilatie, elektriciteit,
-- data en vloerverwarming, getekend op het plan van een verdieping, in meter
-- in het assenstelsel van het gebouw, zoals de punten. Zo overleven ze een
-- nieuwe versie van het plan.
--
-- Een leiding is een lijn door punten ([x, y]), een stijgleiding één punt met
-- de verdieping waar ze naartoe loopt, en een zone (vloerverwarming) een
-- veelhoek.
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/leidingen.ts. Idempotent, Row Level
-- Security aan zonder policies. Voegt enkel iets toe: de oude code kent de
-- tabel niet. De soorten staan in de code; hier enkel een controle op de vorm.

create table if not exists bouw_leidingen (
  id                 bigint           generated always as identity primary key,
  verdieping_id      bigint           not null references bouw_verdiepingen (id) on delete cascade,
  soort              text             not null check (soort ~ '^[a-z][a-z0-9_]{1,39}$'),
  punten             jsonb            not null
                     check (jsonb_typeof(punten) = 'array' and jsonb_array_length(punten) between 1 and 200),
  ligging            text             not null
                     check (ligging in ('vloer', 'muur', 'plafond', 'grond', 'stijg', 'zone')),
  -- In de muur: de hoogte boven de vloer.
  hoogte_m           double precision check (hoogte_m is null or hoogte_m between 0 and 10),
  diameter_mm        integer          not null check (diameter_mm between 4 and 500),
  -- Een stijgleiding: tot welke verdieping. Verdwijnt die, dan blijft de leiding.
  tot_verdieping_id  bigint           references bouw_verdiepingen (id) on delete set null,
  label              text             check (label is null or char_length(label) <= 80),
  created_at         timestamptz      not null default now(),
  updated_at         timestamptz      not null default now()
);

create index if not exists bouw_leidingen_verdieping on bouw_leidingen (verdieping_id);
create index if not exists bouw_leidingen_tot_verdieping on bouw_leidingen (tot_verdieping_id);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_leidingen']
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
