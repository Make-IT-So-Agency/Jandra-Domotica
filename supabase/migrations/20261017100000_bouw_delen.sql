-- Bouw, 3D: delen van een vlak met een eigen materiaal. Een stuk gevel in
-- hout, de muren van de badkamer tot 1,20 m in tegels, tegels in een deel van
-- de leefruimte, een groendak op een deel van het platte dak. Per verdieping,
-- in meter in het assenstelsel van het gebouw, zodat een deel een nieuwe
-- versie van het plan overleeft, zoals de punten en de correcties.
--
-- Zie bouw/LEESMIJ.md en web/lib/bouw/drie/delen.ts: daar staat de vorm van
-- een deel, en de code kijkt elk deel na voor het bewaard wordt. Hier enkel
-- een lijst van hoogstens 50.
--
-- Idempotent. Voegt enkel iets toe: de oude code negeert de kolom.

alter table bouw_verdiepingen add column if not exists delen jsonb not null default '[]'::jsonb;

alter table bouw_verdiepingen drop constraint if exists bouw_verdiepingen_delen_check;
alter table bouw_verdiepingen add constraint bouw_verdiepingen_delen_check check (
  jsonb_typeof(delen) = 'array' and jsonb_array_length(delen) <= 50
);

notify pgrst, 'reload schema';
