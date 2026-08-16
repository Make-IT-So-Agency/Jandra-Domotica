-- Alle kwartaaltarieven, met de vraag of ze bevestigd zijn.
--
-- Een onbevestigd tarief blokkeert het maken van rapporten voor dat kwartaal;
-- dat is opzet.
select
  region                                          as gewest,
  period_start                                    as vanaf,
  period_end                                      as tot_en_met,
  eur_per_kwh                                     as tarief,
  case when includes_vat then 'inbegrepen' else 'erbij' end as btw,
  vat_rate                                        as btw_voet,
  source                                          as herkomst,
  case when confirmed_at is null then 'nog nakijken' else 'bevestigd' end as status,
  note                                            as gevonden_zin
from tariffs
order by period_start desc;
