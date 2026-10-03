-- Controle bij de migraties (scripts/test-migraties.sh draait elk test-*.sql
-- bestand hier): elke tabel van Bouw kent zijn huis, en de sleutels gelden
-- per huis. Verandert niets: alles gebeurt in een transactie die teruggedraaid
-- wordt.
begin;

do $$
declare
  ontbreekt text;
  a bigint;
  b bigint;
begin
  -- 1. huis_id staat op elke tabel die niet via een ouder bij een huis hoort,
  --    en is er verplicht.
  select string_agg(tabel, ', ') into ontbreekt
    from unnest(array[
      'bouw_gebouwen', 'bouw_partijen', 'bouw_plannen', 'bouw_planning', 'bouw_keuzes',
      'bouw_beslissingen', 'bouw_posten', 'bouw_facturen', 'bouw_kredietopnames', 'bouw_dagboek',
      'bouw_opleverpunten', 'bouw_actiepunten', 'bouw_garanties', 'bouw_onderhoud',
      'bouw_documenten', 'bouw_werffotos', 'bouw_inzendingen', 'bouw_bestanden'
    ]) as tabel
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tabel and column_name = 'huis_id' and is_nullable = 'NO'
   );
  if ontbreekt is not null then
    raise exception 'huis_id ontbreekt of is niet verplicht in: %', ontbreekt;
  end if;

  -- 2. Twee huizen hebben elk hun Woning, en mogen dezelfde bladcode gebruiken.
  insert into bouw_huizen (naam) values ('Proefhuis A') returning id into a;
  insert into bouw_huizen (naam) values ('Proefhuis B') returning id into b;
  insert into bouw_gebouwen (huis_id, naam) values (a, 'Woning'), (b, 'Woning');
  insert into bouw_plannen (huis_id, titel, soort, bladcode)
    values (a, 'Proefplan', 'grondplan', 'PROEF_1'), (b, 'Proefplan', 'grondplan', 'PROEF_1');

  -- 3. Binnen één huis niet.
  begin
    insert into bouw_gebouwen (huis_id, naam) values (a, 'Woning');
    raise exception 'twee keer Woning in hetzelfde huis werd aanvaard';
  exception when unique_violation then null;
  end;
  begin
    insert into bouw_plannen (huis_id, titel, soort, bladcode) values (a, 'Ander plan', 'grondplan', 'PROEF_1');
    raise exception 'twee keer dezelfde bladcode in hetzelfde huis werd aanvaard';
  exception when unique_violation then null;
  end;

  -- 4. De naam van een huis is uniek, zonder op hoofdletters of spaties te letten.
  begin
    insert into bouw_huizen (naam) values (' proefhuis a ');
    raise exception 'een tweede huis met dezelfde naam werd aanvaard';
  exception when unique_violation then null;
  end;

  -- 5. Een rij zonder huis faalt: de tijdelijke trigger van het uitrollen is weg.
  begin
    insert into bouw_partijen (soort, naam) values ('andere', 'Proefpartij');
    raise exception 'een rij zonder huis werd aanvaard';
  exception when not_null_violation then null;
  end;
  if exists (select 1 from pg_proc where proname = 'bouw_huis_invullen') then
    raise exception 'de tijdelijke functie bouw_huis_invullen bestaat nog';
  end if;

  -- 6. De oude sleutels van het project staan bij het huis, niet meer in de instellingen.
  if exists (select 1 from bouw_instellingen where sleutel in ('projectnaam', 'adres', 'krediet_totaal', 'eigen_inbreng')) then
    raise exception 'een oude sleutel van het project staat nog in bouw_instellingen';
  end if;
end;
$$;

rollback;
