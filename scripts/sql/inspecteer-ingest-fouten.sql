-- De laatste mislukte synchronisaties, met de melding die de app zelf opsloeg.
--
-- Geeft Home Assistant "de webapp gaf statuscode 500 bij het versturen", dan
-- staat hier waarom: /api/ingest schrijft de fout in ingest_log vóór het de 500
-- teruggeeft. Home Assistant ziet enkel de statuscode, deze tabel de oorzaak.
select
  received_at    as wanneer,
  installation_id as installatie,
  session_count  as aangeboden_sessies,
  error          as foutmelding
from ingest_log
where error is not null
order by received_at desc
limit 20;
