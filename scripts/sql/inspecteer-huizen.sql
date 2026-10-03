-- Hangt alles van Bouw aan een huis? Per huis het aantal rijen in de
-- belangrijkste tabellen, en hoeveel rijen er in alles samen geen huis hebben.
-- Enkel nummers en aantallen: de uitvoer van "SQL uitvoeren" is publiek, dus
-- geen namen of adressen.
select
  h.id,
  h.soort,
  h.gearchiveerd_op is not null                                              as gearchiveerd,
  (select count(*) from bouw_gebouwen g where g.huis_id = h.id)              as gebouwen,
  (select count(*) from bouw_partijen p where p.huis_id = h.id)              as partijen,
  (select count(*) from bouw_plannen p where p.huis_id = h.id)               as plannen,
  (select count(*) from bouw_bestanden b where b.huis_id = h.id)             as bestanden,
  (select count(*) from bouw_posten p where p.huis_id = h.id)                as posten,
  (select count(*) from bouw_facturen f where f.huis_id = h.id)              as facturen,
  (select count(*) from bouw_keuzes k where k.huis_id = h.id)                as keuzes,
  (select count(*) from bouw_planning p where p.huis_id = h.id)              as planning,
  (select count(*) from bouw_documenten d where d.huis_id = h.id)            as documenten,
  (select
       (select count(*) from bouw_gebouwen where huis_id is null)
     + (select count(*) from bouw_partijen where huis_id is null)
     + (select count(*) from bouw_plannen where huis_id is null)
     + (select count(*) from bouw_planning where huis_id is null)
     + (select count(*) from bouw_keuzes where huis_id is null)
     + (select count(*) from bouw_beslissingen where huis_id is null)
     + (select count(*) from bouw_posten where huis_id is null)
     + (select count(*) from bouw_facturen where huis_id is null)
     + (select count(*) from bouw_kredietopnames where huis_id is null)
     + (select count(*) from bouw_dagboek where huis_id is null)
     + (select count(*) from bouw_opleverpunten where huis_id is null)
     + (select count(*) from bouw_actiepunten where huis_id is null)
     + (select count(*) from bouw_garanties where huis_id is null)
     + (select count(*) from bouw_onderhoud where huis_id is null)
     + (select count(*) from bouw_documenten where huis_id is null)
     + (select count(*) from bouw_werffotos where huis_id is null)
     + (select count(*) from bouw_inzendingen where huis_id is null)
     + (select count(*) from bouw_bestanden where huis_id is null)
  )                                                                          as zonder_huis_in_alles
from bouw_huizen h
order by h.id;
