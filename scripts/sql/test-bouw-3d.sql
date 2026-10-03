-- Controle bij de migraties (scripts/test-migraties.sh draait elk test-*.sql
-- bestand hier): de keuzes voor de trappen van een verdieping, de inplanting
-- van de gebouwen op het terrein, en waar het terrein op de kaart ligt.
-- Verandert niets: alles gebeurt in een transactie die teruggedraaid wordt.
-- De coördinaten hieronder zijn verzonnen.
begin;

do $$
declare
  huis bigint;
  ander bigint;
  gebouw bigint;
  verdieping bigint;
  plan bigint;
begin
  insert into bouw_huizen (naam) values ('Proefhuis 3D') returning id into huis;
  insert into bouw_gebouwen (huis_id, naam) values (huis, 'Woning') returning id into gebouw;
  insert into bouw_verdiepingen (gebouw_id, naam, volgorde) values (gebouw, 'Gelijkvloers', 0) returning id into verdieping;

  -- 1. Een nieuwe verdieping heeft nog geen keuzes.
  if (select trappen from bouw_verdiepingen where id = verdieping) <> '[]'::jsonb then
    raise exception 'een nieuwe verdieping heeft al trapkeuzes';
  end if;

  -- 2. Een lijst van keuzes mag.
  update bouw_verdiepingen set trappen = '[{"x": 2.5, "y": 3.1, "omgekeerd": true}]'::jsonb where id = verdieping;

  -- 3. Iets anders dan een lijst niet.
  begin
    update bouw_verdiepingen set trappen = '{"x": 1}'::jsonb where id = verdieping;
    raise exception 'trapkeuzes die geen lijst zijn, werden aanvaard';
  exception when check_violation then
    null;
  end;

  -- 4. Een plaats op het terrein: alle drie samen, of geen.
  update bouw_gebouwen set plaats_x_m = 12.5, plaats_y_m = 30.25, plaats_hoek = -12.5 where id = gebouw;
  begin
    update bouw_gebouwen set plaats_hoek = null where id = gebouw;
    raise exception 'een plaats zonder hoek werd aanvaard';
  exception when check_violation then
    null;
  end;
  begin
    update bouw_gebouwen set plaats_hoek = 400 where id = gebouw;
    raise exception 'een hoek van 400 graden werd aanvaard';
  exception when check_violation then
    null;
  end;
  begin
    update bouw_gebouwen set plaats_x_m = 'NaN' where id = gebouw;
    raise exception 'een plaats die geen getal is, werd aanvaard';
  exception when check_violation then
    null;
  end;
  update bouw_gebouwen set plaats_x_m = null, plaats_y_m = null, plaats_hoek = null where id = gebouw;

  -- 5. Het inplantingsplan hoort bij hetzelfde huis, en valt weg met het plan.
  insert into bouw_plannen (huis_id, titel, soort) values (huis, 'Inplantingsplan', 'inplanting') returning id into plan;
  update bouw_huizen set inplanting_plan_id = plan, inplanting_schaal = 200 where id = huis;
  insert into bouw_huizen (naam) values ('Ander proefhuis 3D') returning id into ander;
  begin
    update bouw_huizen set inplanting_plan_id = plan where id = ander;
    raise exception 'het inplantingsplan van een ander huis werd aanvaard';
  exception when foreign_key_violation then
    null;
  end;
  begin
    update bouw_huizen set inplanting_schaal = 5 where id = huis;
    raise exception 'schaal 1/5 werd aanvaard';
  exception when check_violation then
    null;
  end;
  delete from bouw_plannen where id = plan;
  if (select inplanting_plan_id from bouw_huizen where id = huis) is not null then
    raise exception 'het inplantingsplan bleef staan nadat het plan verwijderd werd';
  end if;
  if (select inplanting_schaal from bouw_huizen where id = huis) is distinct from 200 then
    raise exception 'de schaal verdween mee met het plan';
  end if;

  -- 6. Waar het terrein op de kaart ligt: alle drie samen, binnen België.
  update bouw_huizen set lambert_x = 150000.5, lambert_y = 180000.25, lambert_hoek = 12.5 where id = huis;
  begin
    update bouw_huizen set lambert_hoek = null where id = huis;
    raise exception 'een georeferentie zonder hoek werd aanvaard';
  exception when check_violation then
    null;
  end;
  begin
    update bouw_huizen set lambert_x = 900000 where id = huis;
    raise exception 'een punt buiten België werd aanvaard';
  exception when check_violation then
    null;
  end;
  update bouw_huizen set lambert_x = null, lambert_y = null, lambert_hoek = null where id = huis;
end;
$$;

rollback;
