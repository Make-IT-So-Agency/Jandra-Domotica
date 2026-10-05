-- Bouw, 3D: het perceel van het huis, voor als Digitaal Vlaanderen het adres
-- (nog) niet kent, zoals bij nieuwbouw. De omgeving uit Vlaanderen (zie
-- 20261003220000_bouw_omgeving.sql) zoekt dan het perceel op zijn CaPaKey,
-- zoals op Geopunt: vijf cijfers voor de afdeling, de sectie, het grondnummer,
-- een schuine streep, het bisnummer, de exponent en de macht.
--
-- Het perceelnummer wijst het huis aan: het staat enkel in deze databank,
-- nooit in de repository of in een log, net als het adres.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolom.

alter table bouw_huizen add column if not exists perceel text;

alter table bouw_huizen drop constraint if exists bouw_huizen_perceel_check;
alter table bouw_huizen add constraint bouw_huizen_perceel_check check (
  perceel is null or perceel ~ '^[0-9]{5}[A-Z][0-9]{4}/[0-9]{2}[A-Z_][0-9]{3}$'
);

notify pgrst, 'reload schema';
