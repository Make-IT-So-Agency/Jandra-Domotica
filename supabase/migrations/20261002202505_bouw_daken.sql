-- Bouw, fase 5: het dak van elk gebouw, voor het 3D-model. Het dakplan van
-- de architect leest de app (nog) niet: in het 3D-scherm kies je het type,
-- de helling, de richting van de nok en het overstek.
--
-- Zie bouw/LEESMIJ.md. Idempotent. De types horen bij DAKTYPES in
-- web/lib/bouw/drie/dak.ts.

alter table bouw_gebouwen add column if not exists dak_type     text         not null default 'plat';
alter table bouw_gebouwen add column if not exists dak_helling  numeric(4, 1) not null default 35;
alter table bouw_gebouwen add column if not exists dak_nok      text         not null default 'x';
alter table bouw_gebouwen add column if not exists dak_overstek numeric(3, 2) not null default 0.3;

alter table bouw_gebouwen drop constraint if exists bouw_gebouwen_dak_check;
alter table bouw_gebouwen add constraint bouw_gebouwen_dak_check check (
  dak_type in ('plat', 'zadel', 'lessenaar')
  and dak_helling between 5 and 60
  and dak_nok in ('x', 'y')
  and dak_overstek between 0 and 1.5
);
