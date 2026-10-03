-- Bouw, 3D: waar het terrein op de kaart ligt, voor de omgeving uit Vlaanderen
-- (de luchtfoto, de percelen en de huizen van de buren).
--
-- Het terrein is het inplantingsplan in meter, met y naar beneden (zie
-- 20261003210000_bouw_inplanting.sql). De oorsprong ervan ligt in Lambert 72
-- (EPSG:31370) op (lambert_x, lambert_y), en het terrein is over
-- lambert_hoek graden gedraaid. Zie web/lib/bouw/drie/omgeving.ts.
--
-- Die coördinaten wijzen het huis aan: ze staan enkel in deze databank, nooit
-- in de repository of in een log, net als het adres.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolommen.

alter table bouw_huizen add column if not exists lambert_x double precision;
alter table bouw_huizen add column if not exists lambert_y double precision;
alter table bouw_huizen add column if not exists lambert_hoek double precision;

-- Alle drie, of geen; binnen België (ruim), en een hoek tussen -360 en 360.
alter table bouw_huizen drop constraint if exists bouw_huizen_lambert_check;
alter table bouw_huizen add constraint bouw_huizen_lambert_check check (
  (lambert_x is null and lambert_y is null and lambert_hoek is null)
  or (
    lambert_x is not null and lambert_y is not null and lambert_hoek is not null
    and lambert_x between 0 and 400000 and lambert_y between 0 and 400000
    and lambert_hoek between -360 and 360
  )
);

notify pgrst, 'reload schema';
