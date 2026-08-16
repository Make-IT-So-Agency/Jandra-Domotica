-- De laatste laadsessies, met de vennootschap waar ze aan hangen.
--
-- Handig bij de vraag waarom een sessie niet op een rapport staat: de kolom
-- reden zegt het meteen.
select
  s.started_at,
  s.loadpoint_name                                as laadpaal,
  coalesce(c.name, '— niet gekoppeld —')          as vennootschap,
  s.energy_kwh                                    as kwh,
  s.is_complete                                   as afgerond,
  case
    when not s.is_complete            then 'sessie loopt nog'
    when s.energy_kwh is null         then 'geen verbruik geregistreerd'
    when s.energy_kwh <= 0            then 'verbruik is nul of negatief'
    when l.id is null                 then 'laadpaal staat niet in de app'
    when l.company_id is null         then 'laadpaal hangt aan geen vennootschap'
    when t.id is null                 then 'geen tarief voor dat kwartaal'
    when t.confirmed_at is null       then 'tarief nog niet bevestigd'
    else 'telt mee'
  end                                             as reden
from sessions s
left join loadpoints l on lower(l.name) = lower(s.loadpoint_name)
left join companies  c on c.id = l.company_id
left join tariffs    t on t.region = coalesce(l.region, 'vlaanderen')
                      and coalesce(s.finished_at, s.started_at)::date
                          between t.period_start and t.period_end
order by s.started_at desc
limit 50;
