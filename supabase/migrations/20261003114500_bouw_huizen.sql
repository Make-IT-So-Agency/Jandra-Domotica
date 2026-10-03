-- Bouw, meer huizen: elk huis heeft zijn eigen gegevens. Stap 1 van 2.
--
-- Tot nu toe ging Bouw uit van één project. Voortaan hoort alles bij een huis
-- in bouw_huizen: de nieuwbouw, en later bv. het huidige huis. Wat er al is,
-- wordt het eerste huis, "Nieuwbouw".
--
-- Volgens docs/UITROL.md gaat dit in twee stappen. Deze migratie voegt enkel
-- toe, zodat de code die nu draait blijft werken:
--   - een tijdelijke trigger vult een ontbrekend huis_id met het eerste huis;
--   - de oude sleutels in bouw_instellingen blijven staan.
-- Een volgende migratie haalt de trigger en die sleutels weg, zodra de code
-- ze niet meer gebruikt. Pas daarna kan er een tweede huis komen.
--
-- Wat over een huis zelf gaat (naam, projectnaam, adres) staat enkel in deze
-- databank, nooit in de repository: die is publiek.

-- ---------------------------------------------------------------------------
-- De huizen.
-- ---------------------------------------------------------------------------
create table if not exists bouw_huizen (
  id               bigint generated always as identity primary key,
  -- Kort, voor het menu.
  naam             text           not null check (char_length(btrim(naam)) between 1 and 60),
  -- Een bestaand huis heeft geen keuzes, planning en werf.
  soort            text           not null default 'nieuwbouw'
                   check (soort in ('nieuwbouw', 'verbouwing', 'bestaand')),
  -- Voor de titels en de PDF's.
  projectnaam      text,
  adres            text,
  krediet_totaal   numeric(12, 2) check (krediet_totaal is null or krediet_totaal >= 0),
  eigen_inbreng    numeric(12, 2) check (eigen_inbreng is null or eigen_inbreng >= 0),
  volgorde         integer        not null default 0,
  gearchiveerd_op  timestamptz,
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now()
);

create unique index if not exists bouw_huizen_naam on bouw_huizen (lower(btrim(naam)));

alter table bouw_huizen enable row level security;

drop trigger if exists bouw_huizen_set_updated_at on bouw_huizen;
create trigger bouw_huizen_set_updated_at before update on bouw_huizen
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Het eerste huis: wat er al was. De projectnaam, het adres, het krediet en
-- de eigen inbreng komen uit bouw_instellingen. Een bedrag wordt enkel
-- omgezet als het een getal is; een lege waarde wordt null.
-- ---------------------------------------------------------------------------
insert into bouw_huizen (naam, soort, projectnaam, adres, krediet_totaal, eigen_inbreng)
select
  'Nieuwbouw',
  'nieuwbouw',
  (select nullif(btrim(waarde), '') from bouw_instellingen where sleutel = 'projectnaam'),
  (select nullif(btrim(waarde), '') from bouw_instellingen where sleutel = 'adres'),
  (select case when btrim(waarde) ~ '^\d{1,10}(\.\d{1,2})?$' then btrim(waarde)::numeric end
     from bouw_instellingen where sleutel = 'krediet_totaal'),
  (select case when btrim(waarde) ~ '^\d{1,10}(\.\d{1,2})?$' then btrim(waarde)::numeric end
     from bouw_instellingen where sleutel = 'eigen_inbreng')
where not exists (select 1 from bouw_huizen);

-- ---------------------------------------------------------------------------
-- Tijdelijk: een rij zonder huis_id hoort bij het eerste huis. Zo blijft de
-- code die nog geen huis kent werken, tot de volgende migratie dit weghaalt.
-- Een triggerfunctie is niet aan te roepen via de API.
-- ---------------------------------------------------------------------------
create or replace function bouw_huis_invullen() returns trigger
language plpgsql as $$
begin
  if new.huis_id is null then
    new.huis_id := (select min(id) from bouw_huizen);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Het huis op elke tabel die niet via een ouder bij een huis hoort. De rest
-- volgt zijn ouder: verdiepingen via het gebouw, ruimtes en punten via de
-- verdieping, planversies via het plan, opties via de keuze, links via de
-- partij, offertes via de post, beurten via het onderhoud, en zo verder.
-- Documenten, werffoto's en inzendingen hangen enkel aan een bestand, en
-- bestanden aan niets: die krijgen het huis zelf.
--
-- Bewust zonder standaardwaarde: wie een huis vergeet, krijgt een fout, en
-- zet niets stilletjes bij het verkeerde huis. De trigger hierboven is de
-- enige uitzondering, en die is tijdelijk.
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
  eerste bigint := (select min(id) from bouw_huizen);
begin
  foreach target in array array[
    'bouw_gebouwen', 'bouw_partijen', 'bouw_plannen', 'bouw_planning', 'bouw_keuzes',
    'bouw_beslissingen', 'bouw_posten', 'bouw_facturen', 'bouw_kredietopnames', 'bouw_dagboek',
    'bouw_opleverpunten', 'bouw_actiepunten', 'bouw_garanties', 'bouw_onderhoud',
    'bouw_documenten', 'bouw_werffotos', 'bouw_inzendingen', 'bouw_bestanden'
  ]
  loop
    execute format(
      'alter table %I add column if not exists huis_id bigint references bouw_huizen (id) on delete restrict',
      target
    );
    execute format('update %I set huis_id = $1 where huis_id is null', target) using eerste;
    execute format('alter table %I alter column huis_id set not null', target);
    execute format('create index if not exists %I on %I (huis_id)', target || '_huis', target);
    execute format('drop trigger if exists %I on %I', target || '_huis_invullen', target);
    execute format(
      'create trigger %I before insert on %I for each row execute function bouw_huis_invullen()',
      target || '_huis_invullen', target
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uniek per huis in plaats van over alles heen: elk huis heeft zijn Woning,
-- en twee architecten mogen dezelfde bladcode gebruiken. De oude sleutels
-- gaan bij elke run weg, want 20261002202501_bouw_omzetting.sql maakt de
-- index op de bladcode opnieuw aan als alles nog eens draait.
-- ---------------------------------------------------------------------------
alter table bouw_gebouwen drop constraint if exists bouw_gebouwen_naam_key;
create unique index if not exists bouw_gebouwen_huis_naam on bouw_gebouwen (huis_id, naam);

drop index if exists bouw_plannen_bladcode;
create unique index if not exists bouw_plannen_huis_bladcode on bouw_plannen (huis_id, bladcode)
  where bladcode is not null;

notify pgrst, 'reload schema';
