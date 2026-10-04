-- Bouw, 3D: wat iemand op het plan verbeterde aan de muren, ramen en deuren
-- van een verdieping. De muren en openingen komen uit de omzetting (in
-- bouw_omzettingen.voorstel); hier staat enkel wat erbij of weg moest: een
-- muur erbij, een stuk muur weg, een raam of deur erbij, een opening anders of
-- dicht. In meter, in het assenstelsel van het gebouw, zodat het een nieuwe
-- versie van het plan overleeft.
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/drie/correcties.ts. Idempotent. Voegt
-- enkel iets toe: de oude code negeert de kolom.

alter table bouw_verdiepingen add column if not exists correcties jsonb not null default '[]'::jsonb;

alter table bouw_verdiepingen drop constraint if exists bouw_verdiepingen_correcties_check;
alter table bouw_verdiepingen add constraint bouw_verdiepingen_correcties_check check (
  jsonb_typeof(correcties) = 'array' and jsonb_array_length(correcties) <= 200
);

notify pgrst, 'reload schema';
