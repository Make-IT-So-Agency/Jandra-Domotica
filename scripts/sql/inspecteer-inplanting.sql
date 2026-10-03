-- Staat de inplanting klaar? Per huis het aantal gebouwen, hoeveel er een
-- bewaarde plaats hebben, hoeveel inplantingsplannen er zijn, en of er een
-- plan en een schaal gekozen zijn. Enkel nummers en aantallen: de uitvoer van
-- "SQL uitvoeren" is publiek, dus geen namen, adressen of plaatsen.
select
  h.id,
  (select count(*) from bouw_gebouwen g where g.huis_id = h.id)                            as gebouwen,
  (select count(*) from bouw_gebouwen g where g.huis_id = h.id and g.plaats_x_m is not null) as met_plaats,
  (select count(*) from bouw_plannen p where p.huis_id = h.id and p.soort = 'inplanting')   as inplantingsplannen,
  h.inplanting_plan_id is not null                                                          as plan_gekozen,
  h.inplanting_schaal is not null                                                           as schaal_gekozen
from bouw_huizen h
order by h.id;
