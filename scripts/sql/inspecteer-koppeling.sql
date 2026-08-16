-- Staat de koppeling met Home Assistant goed, en komt er data binnen?
select
  (select count(*) from sessions)                                    as sessies_totaal,
  (select count(*) from sessions where is_complete)                  as sessies_afgerond,
  (select max(finished_at) from sessions)                            as laatste_sessie,
  (select max(received_at) from ingest_log where error is null)      as laatste_synchronisatie,
  (select count(*) from ingest_log where error is not null)          as mislukte_synchronisaties,
  (select count(*) from loadpoints)                                  as laadpalen,
  (select count(*) from loadpoints where company_id is null)         as laadpalen_niet_gekoppeld,
  (select count(*) from companies)                                   as vennootschappen,
  (select count(*) from reports)                                     as bewaarde_rapporten;
