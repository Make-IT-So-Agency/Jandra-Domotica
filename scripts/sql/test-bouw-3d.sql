-- Controle bij de migraties (scripts/test-migraties.sh draait elk test-*.sql
-- bestand hier): de keuzes voor de trappen van een verdieping. Verandert
-- niets: alles gebeurt in een transactie die teruggedraaid wordt.
begin;

do $$
declare
  huis bigint;
  gebouw bigint;
  verdieping bigint;
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
end;
$$;

rollback;
