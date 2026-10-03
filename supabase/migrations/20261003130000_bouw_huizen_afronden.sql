-- Bouw: de huizen afronden. Haalt weg wat enkel nodig was om
-- 20261003114500_bouw_huizen.sql uit te rollen terwijl de vorige versie van de
-- app nog draaide:
--
-- - de trigger die een ontbrekend huis_id met het eerste huis vulde. De code
--   geeft het huis voortaan altijd zelf mee; een vergeten huis faalt nu meteen
--   (not null), in plaats van stil bij het eerste huis te belanden. Dat moet
--   weg zijn vóór er een tweede huis kan bestaan;
-- - de oude sleutels van het project in bouw_instellingen. De projectnaam, het
--   adres, het krediet en de eigen inbreng staan nu bij het huis.
--
-- Herhaalbaar: de CI draait alle migraties twee keer.

do $$
declare
  target text;
begin
  foreach target in array array[
    'bouw_gebouwen', 'bouw_partijen', 'bouw_plannen', 'bouw_planning', 'bouw_keuzes',
    'bouw_beslissingen', 'bouw_posten', 'bouw_facturen', 'bouw_kredietopnames', 'bouw_dagboek',
    'bouw_opleverpunten', 'bouw_actiepunten', 'bouw_garanties', 'bouw_onderhoud',
    'bouw_documenten', 'bouw_werffotos', 'bouw_inzendingen', 'bouw_bestanden'
  ]
  loop
    execute format('drop trigger if exists %I on %I', target || '_huis_invullen', target);
  end loop;
end;
$$;

drop function if exists bouw_huis_invullen();

delete from bouw_instellingen where sleutel in ('projectnaam', 'adres', 'krediet_totaal', 'eigen_inbreng');

notify pgrst, 'reload schema';
