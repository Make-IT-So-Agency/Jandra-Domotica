-- Bouw, keuzes: hoe een optie er in 3D uitziet, naast haar kleur en foto: het
-- patroon (baksteen, pannen, leien, zink, planken, parket, tegels, beton of
-- crepi; leeg is egaal) en voor baksteen en tegels de kleur van de voeg. Zo
-- toont 3D een optie die in 3D uitgeprobeerd en bewaard werd, zoals ze
-- uitgeprobeerd werd. Zie web/lib/bouw/drie/stalen.ts.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolommen.

alter table bouw_opties add column if not exists patroon text;
alter table bouw_opties add column if not exists voegkleur text;

alter table bouw_opties drop constraint if exists bouw_opties_patroon_check;
alter table bouw_opties add constraint bouw_opties_patroon_check check (
  patroon is null or patroon in ('baksteen', 'pannen', 'leien', 'zink', 'planken', 'parket', 'tegels', 'beton', 'crepi')
);

alter table bouw_opties drop constraint if exists bouw_opties_voegkleur_check;
alter table bouw_opties add constraint bouw_opties_voegkleur_check check (voegkleur is null or voegkleur ~ '^#[0-9a-f]{6}$');

notify pgrst, 'reload schema';
