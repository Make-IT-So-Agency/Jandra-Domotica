-- Bouw, materialen van een site of foto.
--
-- Een optie van een keuze krijgt:
-- - een tweede foto, een referentie: een huis of een ruimte met dat materiaal,
--   naast de foto van het materiaal zelf;
-- - hoe 3D haar foto gebruikt (staal): één steen, tegel of plank die elk stuk
--   van het patroon vult, of een stuk muur of vloer met zijn echte breedte.
--   De vorm (bron, uitsnede, breedte) kijkt de webapp na, zie
--   web/lib/bouw/drie/fotostaal.ts; hier enkel: een object of leeg.
--
-- Een meubel of toestel bij Inrichten krijgt een eigen materiaal: een kleur,
-- een patroon of een optie van een keuze, zoals een deel van een muur (zie
-- web/lib/bouw/drie/delen.ts). Leeg: de kleur van zijn groep.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolommen.

alter table bouw_opties add column if not exists referentie_bestand_id bigint references bouw_bestanden (id) on delete set null;
alter table bouw_opties add column if not exists staal jsonb;

alter table bouw_opties drop constraint if exists bouw_opties_staal_check;
alter table bouw_opties add constraint bouw_opties_staal_check check (
  staal is null or jsonb_typeof(staal) = 'object'
);

alter table bouw_objecten add column if not exists materiaal jsonb;

alter table bouw_objecten drop constraint if exists bouw_objecten_materiaal_check;
alter table bouw_objecten add constraint bouw_objecten_materiaal_check check (
  materiaal is null or jsonb_typeof(materiaal) = 'object'
);

notify pgrst, 'reload schema';
