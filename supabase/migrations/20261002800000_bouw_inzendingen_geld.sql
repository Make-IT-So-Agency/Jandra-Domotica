-- Bouw, fase 4: een aannemer of leverancier stuurt via zijn link zelf een
-- offerte of factuur in. Twee nieuwe rechten op een link, en een inzending
-- krijgt een soort en de gegevens die de partij erbij invult. Wij boeken ze
-- in bij Geld, of negeren ze.
--
-- Zie bouw/LEESMIJ.md. Idempotent. De rechten horen bij RECHTEN_LINK, de
-- soorten bij SOORTEN_INZENDING in web/lib/bouw/linkregels.ts.

alter table bouw_links drop constraint if exists bouw_links_rechten_check;
alter table bouw_links add constraint bouw_links_rechten_check
  check (rechten <@ array['plannen', 'inzenden', 'keuzes', 'planning', 'wensenlijst', 'offertes', 'facturen']::text[]);

-- Wat er bestond, was een plan of dossier.
alter table bouw_inzendingen add column if not exists soort text not null default 'plan';
alter table bouw_inzendingen drop constraint if exists bouw_inzendingen_soort_check;
alter table bouw_inzendingen add constraint bouw_inzendingen_soort_check
  check (soort in ('plan', 'offerte', 'factuur'));

-- Wat de partij erbij invult, inclusief btw. Bij het inboeken kijken wij het
-- na; daarna telt de offerte of factuur zelf.
alter table bouw_inzendingen add column if not exists bedrag numeric(12, 2);
alter table bouw_inzendingen add column if not exists nummer text;
alter table bouw_inzendingen add column if not exists datum date;
alter table bouw_inzendingen add column if not exists vervaldag date;

-- Waar de inzending terechtkwam.
alter table bouw_inzendingen add column if not exists offerte_id bigint references bouw_offertes (id) on delete set null;
alter table bouw_inzendingen add column if not exists factuur_id bigint references bouw_facturen (id) on delete set null;
