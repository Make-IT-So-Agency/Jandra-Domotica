# Zoveel mogelijk laten doen

Wat je één keer instelt zodat er in een volgende sessie zo weinig mogelijk aan
jou gevraagd moet worden. Ook nuttig wanneer een token vervalt en je even niet
meer weet welke er ook alweer nodig waren.

De opzet: **alle geheimen staan bij GitHub, en het werk gebeurt via de
repository.** Wijzigingen worden gecommit, de workflow past ze toe. Zo staat er
nergens een token op een laptop of in een gesprek, en laat elke wijziging een
spoor na in de geschiedenis van de repository en in de logboeken van Actions.

## 1. Secrets en variabelen in GitHub

Repository → **Settings → Secrets and variables → Actions**. De volledige lijst
met waar je elke waarde vindt, staat in [INSTALLATIE.md](INSTALLATIE.md); dit is
de samenvatting.

**Secrets** — geheim, worden gemaskeerd in de logboeken:

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_URL`, `TOEGELATEN_EMAILS`, `INGEST_API_KEY`,
`CRON_SECRET`

**Variables** — verwijzingen, geen geheimen:

`SUPABASE_PROJECT_REF`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`

Zet ze in een *environment* met de naam exact `productie`, aan te maken onder
**Settings → Environments**. De workflows verwijzen daarnaar, en zo kan je er
later een goedkeuringsstap voor zetten.

## 2. Wat daarmee mogelijk wordt

Zonder dat jij nog iets hoeft in te vullen:

- code wijzigen, committen, en de workflow rolt het uit
- een kolom toevoegen via een nieuwe migratie
- een omgevingsvariabele toevoegen of vervangen
- terugrollen naar een vorige versie
- in de databank kijken via **Actions → SQL uitvoeren** met een bestand uit
  `scripts/sql/` (standaard alleen lezen)
- de logboeken lezen wanneer iets faalt

## 3. Wat handwerk blijft

- **Het OAuth-scherm in de Google Cloud Console.** Er bestaat geen API om
  inloggegevens voor consumenten aan te maken.
- **De HACS-integratie in Home Assistant** installeren en instellen.
- **Het kwartaaltarief bevestigen.** Dat is opzet, geen beperking: zie
  [ARCHITECTUUR.md](ARCHITECTUUR.md).
- **Accounts en projecten aanmaken** bij Supabase en Vercel. Dat gebeurt één
  keer en wordt nooit herhaald, dus het loont niet om er code voor te schrijven.

## 4. Wat je bewust niet moet doen

**Geen vrij SQL-invoerveld in een workflow.** De workflow **SQL uitvoeren**
draait bewust alleen een bestand dat via een pull request in `scripts/sql/`
terechtkwam. Een vrij invoerveld zou geen spoor nalaten van wat er gedraaid
heeft. Blijvende wijzigingen aan het schema horen sowieso in
`supabase/migrations/`.

**Geen secrets in de Claude Code-omgeving zetten** zolang deze opzet volstaat.
Alles wat nodig is, kan via de repository en de workflows.

## Over veiligheid

- Een Vercel-token geeft **volledige toegang tot je Vercel-account**, niet enkel
  tot dit project. Geef het een vervaldatum, bijvoorbeeld 90 dagen.
- `SUPABASE_DB_PASSWORD` geeft volledige toegang tot de databank. Wie
  schrijfrechten op de repository heeft, kan er via een migratie mee doen wat
  hij wil. Hou de lijst met medewerkers kort.
- Vermoed je dat een secret gelekt is? Trek hem in bij de aanbieder, maak een
  nieuwe aan, werk hem bij in GitHub en start de workflow opnieuw. De app zelf
  hoeft daar niets van te merken.
- De sleutels die de app zelf gebruikt — `INGEST_API_KEY`, `AUTH_SECRET`,
  `CRON_SECRET` en de Supabase `service_role` — staan bij GitHub en worden van
  daaruit naar Vercel gezet. Vercel is dus geen tweede bron van waarheid: pas
  ze altijd in GitHub aan, nooit rechtstreeks in het Vercel-scherm, anders
  overschrijft de volgende workflow je wijziging.
