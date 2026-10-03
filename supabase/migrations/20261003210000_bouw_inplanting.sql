-- Bouw, 3D: waar elk gebouw op het terrein staat, en op welk inplantingsplan.
--
-- Het terrein is het inplantingsplan van het huis, in meter: x naar rechts en
-- y naar beneden, vanaf de linkerbovenhoek van het blad, op schaal 1/N. Een
-- gebouw staat er met het midden van zijn grondplannen op (plaats_x_m,
-- plaats_y_m), gedraaid over plaats_hoek graden (op het plan met de klok
-- mee). Zonder plaats zoekt het 3D-scherm het gebouw zelf op het plan. Zie
-- bouw/LEESMIJ.md, web/lib/bouw/drie/plaatsing.ts en inplanting.ts.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolommen.

alter table bouw_gebouwen add column if not exists plaats_x_m double precision;
alter table bouw_gebouwen add column if not exists plaats_y_m double precision;
alter table bouw_gebouwen add column if not exists plaats_hoek double precision;

-- Alle drie, of geen: een plaats zonder hoek bestaat niet. (Een check met
-- een lege waarde erin slaagt, vandaar de expliciete "is not null".)
alter table bouw_gebouwen drop constraint if exists bouw_gebouwen_plaats_check;
alter table bouw_gebouwen add constraint bouw_gebouwen_plaats_check check (
  (plaats_x_m is null and plaats_y_m is null and plaats_hoek is null)
  or (
    plaats_x_m is not null and plaats_y_m is not null and plaats_hoek is not null
    and abs(plaats_x_m) <= 10000 and abs(plaats_y_m) <= 10000
    and plaats_hoek between -360 and 360
  )
);

-- Het inplantingsplan van het huis, en zijn schaal als iemand die zelf
-- aanpaste. Het plan hoort bij hetzelfde huis: de verwijzing gaat over het
-- plan en zijn huis samen. Verdwijnt het plan, dan valt enkel de keuze weg.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bouw_plannen_id_huis') then
    alter table bouw_plannen add constraint bouw_plannen_id_huis unique (id, huis_id);
  end if;
end;
$$;

alter table bouw_huizen add column if not exists inplanting_plan_id bigint;
alter table bouw_huizen add column if not exists inplanting_schaal integer;

alter table bouw_huizen drop constraint if exists bouw_huizen_inplanting_plan_fkey;
alter table bouw_huizen add constraint bouw_huizen_inplanting_plan_fkey
  foreign key (inplanting_plan_id, id) references bouw_plannen (id, huis_id)
  on delete set null (inplanting_plan_id);

alter table bouw_huizen drop constraint if exists bouw_huizen_inplanting_schaal_check;
alter table bouw_huizen add constraint bouw_huizen_inplanting_schaal_check
  check (inplanting_schaal is null or inplanting_schaal between 10 and 5000);

notify pgrst, 'reload schema';
