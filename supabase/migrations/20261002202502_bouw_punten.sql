-- Bouw, fase 2: punten op het plan. Lichtpunten, schakelaars, stopcontacten,
-- netwerk, sensoren en zo verder, per verdieping, in het assenstelsel van het
-- gebouw. Daaruit volgt de wensenlijst voor de elektricien en de
-- domotica-installateur.
--
-- Zie bouw/LEESMIJ.md. Idempotent, Row Level Security aan zonder policies.
--
-- De soorten staan in web/lib/bouw/punten.ts. Hier enkel een controle op de
-- vorm: de catalogus groeit met wat we onderweg tegenkomen, en daar hoort
-- geen migratie bij. De webapp aanvaardt enkel soorten uit de catalogus.
--
-- In welke ruimte een punt ligt, staat hier bewust niet: dat volgt uit de
-- veelhoeken van de ruimtes, en die kunnen bij een nieuwe versie van het
-- plan veranderen.

create table if not exists bouw_punten (
  id             bigint generated always as identity primary key,
  verdieping_id  bigint           not null references bouw_verdiepingen (id) on delete cascade,
  soort          text             not null check (soort ~ '^[a-z][a-z0-9_]{1,39}$'),
  x_m            double precision not null,
  y_m            double precision not null,
  -- Boven de afgewerkte vloer; leeg betekent: aan het plafond.
  hoogte_m       numeric(5, 2)    check (hoogte_m is null or (hoogte_m >= 0 and hoogte_m <= 20)),
  aantal         integer          not null default 1 check (aantal between 1 and 99),
  label          text,
  opmerking      text,
  status         text             not null default 'gewenst'
                 check (status in ('gewenst', 'in_offerte', 'geplaatst', 'getest')),
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now()
);

create index if not exists bouw_punten_verdieping on bouw_punten (verdieping_id);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_punten']
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
