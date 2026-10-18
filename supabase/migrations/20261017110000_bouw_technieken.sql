-- Bouw, Technieken: hoe het voorstel voor de elektriciteit rekent, per huis.
-- De aansluiting (één of drie fasen, en de stroom) en of er domotica komt.
-- Leeg: dan kiest de app zelf, uit wat op het plan staat. Het voorstel zelf
-- wordt niet bewaard: het volgt de punten en de toestellen.
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/technieken/voorstel.ts: daar wordt de
-- vorm nagekeken. Hier enkel: een object of leeg.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolom.

alter table bouw_huizen add column if not exists technieken jsonb;

alter table bouw_huizen drop constraint if exists bouw_huizen_technieken_check;
alter table bouw_huizen add constraint bouw_huizen_technieken_check check (
  technieken is null or jsonb_typeof(technieken) = 'object'
);

notify pgrst, 'reload schema';
