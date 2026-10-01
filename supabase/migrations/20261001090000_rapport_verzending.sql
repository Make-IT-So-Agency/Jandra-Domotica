-- Houdt bij of een rapport verstuurd is, en naar welk adres.
--
-- Twee redenen. Een rapport mag nooit twee keer bij de boekhouder belanden,
-- ook niet als de geplande taak opnieuw draait of met de hand gestart wordt.
-- En achteraf moet na te gaan zijn wat er precies buiten gegaan is: het
-- rapport is een onkostennota, dus "is dit verstuurd en waarheen" is een vraag
-- die later nog gesteld wordt.
--
-- Het adres wordt apart bewaard en niet uit companies.email gelezen op het
-- moment van de vraag: dat adres kan ondertussen veranderd zijn, en dan zou de
-- app een ander adres tonen dan waar de mail naartoe ging.

alter table reports
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;
