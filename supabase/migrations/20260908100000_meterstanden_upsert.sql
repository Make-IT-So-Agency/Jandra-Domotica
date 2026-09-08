-- Maakt het wegschrijven van meterstanden weer mogelijk.
--
-- /api/ingest doet een upsert met ON CONFLICT (loadpoint_name, read_at).
-- Postgres verlangt daarvoor een unieke index op precies díe twee kolommen. De
-- bestaande index staat op de expressie lower(loadpoint_name) en telt daarvoor
-- niet mee, ook al dekt hij dezelfde rijen. Gevolg: 42P10, "there is no unique
-- or exclusion constraint matching the ON CONFLICT specification", en dus een
-- statuscode 500 bij élke synchronisatie vanuit Home Assistant.
--
-- Vergelijk met sessions: sessions_external_id_key staat op de kolom zelf, en
-- daar werkt de upsert wel. Dat is het hele verschil.
--
-- De index op lower(loadpoint_name) blijft staan. Die vangt namen die enkel in
-- hoofdletters verschillen, zoals de rest van de app het ook doet, en de nieuwe
-- index hieronder is strikt ruimer: een rij die deze schendt, schendt de oude
-- ook. Aanmaken kan dus niet stuklopen op bestaande gegevens.
create unique index if not exists meter_readings_loadpoint_read_at_key
  on meter_readings (loadpoint_name, read_at);
