-- Staan de trappen klaar voor het 3D-model? Per huis het aantal verdiepingen,
-- hoeveel er trapkeuzes en correcties hebben, en hoeveel bevestigde
-- omzettingen al trappen lazen (werkwijze 3). Enkel nummers en aantallen: de uitvoer van "SQL
-- uitvoeren" is publiek, dus geen namen, adressen of vormen.
select
  h.id,
  (select count(*)
     from bouw_verdiepingen v join bouw_gebouwen g on g.id = v.gebouw_id
    where g.huis_id = h.id)                                                   as verdiepingen,
  (select count(*)
     from bouw_verdiepingen v join bouw_gebouwen g on g.id = v.gebouw_id
    where g.huis_id = h.id and jsonb_array_length(v.trappen) > 0)             as met_trapkeuzes,
  (select count(*)
     from bouw_verdiepingen v join bouw_gebouwen g on g.id = v.gebouw_id
    where g.huis_id = h.id and jsonb_array_length(v.correcties) > 0)          as met_correcties,
  (select count(*)
     from bouw_omzettingen o
     join bouw_planversies pv on pv.id = o.planversie_id
     join bouw_plannen p on p.id = pv.plan_id
    where p.huis_id = h.id)                                                   as omzettingen,
  (select count(*)
     from bouw_omzettingen o
     join bouw_planversies pv on pv.id = o.planversie_id
     join bouw_plannen p on p.id = pv.plan_id
    where p.huis_id = h.id and o.werkwijze >= 3)                              as omzettingen_met_trappen
from bouw_huizen h
order by h.id;
