-- Bouw, 3D: hoe de trappen van een verdieping gekozen werden. De trap zelf
-- komt uit de omzetting (in bouw_omzettingen.voorstel, naast de muren) of uit
-- een trapgat; hier staat enkel wat iemand in het 3D-scherm koos: omdraaien,
-- een andere vorm, of geen trap. Elk element hoort bij de trap waarvan het
-- midden binnen 75 cm van (x, y) ligt, in meter in het assenstelsel van het
-- gebouw.
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/drie/trappen.ts. Idempotent. Voegt
-- enkel iets toe: de oude code negeert de kolom.

alter table bouw_verdiepingen add column if not exists trappen jsonb not null default '[]'::jsonb;

alter table bouw_verdiepingen drop constraint if exists bouw_verdiepingen_trappen_check;
alter table bouw_verdiepingen add constraint bouw_verdiepingen_trappen_check check (
  jsonb_typeof(trappen) = 'array' and jsonb_array_length(trappen) <= 20
);

notify pgrst, 'reload schema';
