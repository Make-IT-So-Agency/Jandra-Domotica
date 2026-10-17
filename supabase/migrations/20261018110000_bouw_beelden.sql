-- Bouw, 3D: beelden van het huis, zoals de renders van de keukenbouwer of de
-- schrijnwerker. Per huis, bij een ruimte, en met het standpunt van de camera:
-- zo legt het 3D-scherm het beeld over het model, vanuit dezelfde plaats.
--
-- Het standpunt staat in meter in het assenstelsel van het gebouw van de
-- verdieping, zoals de punten: het oog, een punt waar het naar kijkt, en hoe
-- breed het beeld kijkt. De vorm kijkt de webapp na, zie
-- web/lib/bouw/drie/beelden.ts; hier enkel: een object of leeg.
--
-- Idempotent, Row Level Security aan zonder policies. Voegt enkel iets toe: de
-- oude code kent de tabel niet.

create table if not exists bouw_beelden (
  id             bigint       generated always as identity primary key,
  huis_id        bigint       not null references bouw_huizen (id) on delete restrict,
  bestand_id     bigint       not null references bouw_bestanden (id) on delete cascade,
  titel          text         not null check (char_length(titel) between 1 and 80),
  -- Wat het beeld toont.
  ruimte_id      bigint       references bouw_ruimtes (id) on delete set null,
  -- Waar het oog staat, met het standpunt.
  verdieping_id  bigint       references bouw_verdiepingen (id) on delete set null,
  standpunt      jsonb        check (standpunt is null or jsonb_typeof(standpunt) = 'object'),
  volgorde       integer      not null default 0,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists bouw_beelden_huis on bouw_beelden (huis_id);
create index if not exists bouw_beelden_bestand on bouw_beelden (bestand_id);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_beelden']
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
