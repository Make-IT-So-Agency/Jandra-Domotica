-- Bouw, 3D: maatwerk. Een meubel of toestel bij Inrichten krijgt een
-- indeling, zoals de schrijnwerker of de keukenbouwer het tekent: de fronten,
-- een open vak en een nis van een kast; de kookplaat, de spoelbak, de
-- spatwand, het werkblad, een overstek en wangen bij de keuken; een oven of
-- de koelkast in een kolomkast; en het materiaal van het blad.
--
-- De vorm kijkt de webapp na, zie web/lib/bouw/drie/maatwerk.ts; hier enkel:
-- een object of leeg.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolom.

alter table bouw_objecten add column if not exists indeling jsonb;

alter table bouw_objecten drop constraint if exists bouw_objecten_indeling_check;
alter table bouw_objecten add constraint bouw_objecten_indeling_check check (
  indeling is null or jsonb_typeof(indeling) = 'object'
);

notify pgrst, 'reload schema';
