-- Staan de trappen klaar voor het 3D-model? Per huis het aantal verdiepingen,
-- hoeveel er trapkeuzes en correcties hebben, hoeveel meubels, toestellen en
-- leidingen er zijn, hoeveel bevestigde omzettingen al trappen lazen
-- (werkwijze 3) en het bordes (werkwijze 4), en per verdieping met welke
-- werkwijze haar plan omgezet is.
-- Enkel nummers en aantallen: de uitvoer van "SQL uitvoeren" is publiek, dus
-- geen namen, adressen of vormen.
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
     from bouw_objecten o
     join bouw_verdiepingen v on v.id = o.verdieping_id
     join bouw_gebouwen g on g.id = v.gebouw_id
    where g.huis_id = h.id)                                                   as objecten,
  (select count(*)
     from bouw_leidingen l
     join bouw_verdiepingen v on v.id = l.verdieping_id
     join bouw_gebouwen g on g.id = v.gebouw_id
    where g.huis_id = h.id)                                                   as leidingen,
  (select count(*)
     from bouw_omzettingen o
     join bouw_planversies pv on pv.id = o.planversie_id
     join bouw_plannen p on p.id = pv.plan_id
    where p.huis_id = h.id)                                                   as omzettingen,
  (select count(*)
     from bouw_omzettingen o
     join bouw_planversies pv on pv.id = o.planversie_id
     join bouw_plannen p on p.id = pv.plan_id
    where p.huis_id = h.id and o.werkwijze >= 3)                              as omzettingen_met_trappen,
  (select count(*)
     from bouw_omzettingen o
     join bouw_planversies pv on pv.id = o.planversie_id
     join bouw_plannen p on p.id = pv.plan_id
    where p.huis_id = h.id and o.werkwijze >= 4)                              as omzettingen_met_bordes,
  -- Per verdieping met een bevestigd grondplan: de werkwijze van de nieuwste
  -- bevestigde versie, zoals 3D ze leest. Enkel de nummers.
  (select string_agg(w::text, ',' order by w)
     from (select distinct on (p.verdieping_id) o.werkwijze as w
             from bouw_omzettingen o
             join bouw_planversies pv on pv.id = o.planversie_id
             join bouw_plannen p on p.id = pv.plan_id
            where p.huis_id = h.id and p.soort = 'grondplan' and p.verdieping_id is not null
            order by p.verdieping_id, pv.id desc) laatste)                     as werkwijze_per_verdieping
from bouw_huizen h
order by h.id;
