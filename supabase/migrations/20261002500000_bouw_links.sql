-- Bouw, fase 3: een persoonlijke link voor een partij (eerst de architect),
-- zonder account. En wat die partij via haar link instuurt.
--
-- Zie bouw/LEESMIJ.md. Idempotent, Row Level Security aan zonder policies.
-- De rechten horen bij RECHTEN_LINK in web/lib/bouw/linkregels.ts.

-- ---------------------------------------------------------------------------
-- Een link: enkel de SHA-256 van het token staat hier, nooit het token zelf.
-- Wie de databank leest, kan er dus niets mee. Een link vervalt altijd, en kan
-- vroeger ingetrokken worden.
-- ---------------------------------------------------------------------------
create table if not exists bouw_links (
  id                  bigint generated always as identity primary key,
  partij_id           bigint      not null references bouw_partijen (id) on delete cascade,
  token_hash          text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  rechten             text[]      not null default '{}'
                      check (rechten <@ array['plannen', 'inzenden', 'keuzes', 'planning', 'wensenlijst']::text[]),
  vervalt_op          timestamptz not null,
  ingetrokken_op      timestamptz,
  laatst_gebruikt_op  timestamptz,
  gemaakt_door        text,
  created_at          timestamptz not null default now()
);

create index if not exists bouw_links_partij on bouw_links (partij_id);

-- ---------------------------------------------------------------------------
-- Wat een partij instuurt, bv. de architect een nieuw dossier. Het komt niet
-- meteen bij de plannen: Jan of Sandra leest het in, of negeert het.
-- ---------------------------------------------------------------------------
create table if not exists bouw_inzendingen (
  id             bigint generated always as identity primary key,
  link_id        bigint      references bouw_links (id) on delete set null,
  partij_id      bigint      references bouw_partijen (id) on delete set null,
  bestand_id     bigint      not null references bouw_bestanden (id) on delete cascade,
  opmerking      text,
  status         text        not null default 'nieuw'
                 check (status in ('nieuw', 'verwerkt', 'genegeerd')),
  verwerkt_op    timestamptz,
  verwerkt_door  text,
  created_at     timestamptz not null default now()
);

create index if not exists bouw_inzendingen_status on bouw_inzendingen (status);

do $$
declare
  target text;
begin
  foreach target in array array['bouw_links', 'bouw_inzendingen']
  loop
    execute format('alter table %I enable row level security', target);
  end loop;
end;
$$;
