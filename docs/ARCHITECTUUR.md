# Achtergrond en gemaakte keuzes

Voor wie later iets aan deze code wil veranderen — ook als dat jijzelf bent
over twee jaar.

## Hoe de stukken samenhangen

```
evcc  ──/api/sessions──▶  Home Assistant  ──HTTPS + sleutel──▶  Vercel-app
(sessiedatabank)          (HACS-integratie)                     │
                                                                ▼
                                                          Supabase
                                                          (Postgres)
```

De richting van die middelste pijl is de belangrijkste keuze in dit ontwerp.

### Waarom Home Assistant duwt, en de app niet trekt

Een app op Vercel kan niet zomaar bij een computer thuis achter een router. De
gebruikelijke oplossingen — poorten openzetten, een tunnel, Nabu Casa — vragen
allemaal onderhoud en zetten iets van het thuisnetwerk bloot aan het internet.

Daarom werkt het omgekeerd: Home Assistant maakt zelf een uitgaande verbinding
naar de app en levert de sessies af. Er hoeft niets open te staan, er is geen
tunnel, en een router die van IP-adres wisselt maakt niets uit.

### Waarom de sessies uit evcc komen en niet uit Home Assistant

De recorder van Home Assistant bewaart standaard tien dagen. evcc houdt zijn
eigen sessiedatabank bij, met begin- en eindmeterstand per sessie. Die is
volledig én preciezer, en laat toe om ook met terugwerkende kracht te
rapporteren.

De integratie leest dus `GET /api/sessions` bij evcc rechtstreeks uit, en
gebruikt Home Assistant enkel als de altijd-aan computer die dat periodiek
doorstuurt.

### Waarom Supabase en niet alleen Vercel

Vercel-functies bewaren niets tussen twee bezoeken. Er moet dus een databank
zijn. De app praat met Supabase via de `service_role`-sleutel en enkel
server-side; Row Level Security staat aan zonder policies, zodat de publieke
sleutel niets kan.

## Keuzes rond de cijfers

### Het tarief moet bevestigd worden

De overheid publiceert het maximumbedrag per kWh als **tekst op een webpagina**,
niet als gegevensbron. Er is geen API, en de vorm van die pagina kan wijzigen.

De app haalt het cijfer daarom best-effort op en bewaart het als *onbevestigd*,
samen met de zin waaruit het komt. Pas na één klik op **Bevestigen** wordt
ermee gerekend. Zonder bevestigd tarief weigert de app een rapport te maken.

Dat is bewust één klik meer werk: het alternatief is dat een gewijzigde
webpagina stilzwijgend tot een verkeerd bedrag op een onkostennota leidt.

Werkt de automatische ophaling niet meer? Dan is er niets stuk — je vult het
bedrag zelf in, en eventueel pas je bij **Instellingen** de bron-URL aan.

### Btw is instelbaar, niet vastgelegd

Of het gepubliceerde bedrag btw bevat, staat per tarief opgeslagen
(`includes_vat`) in plaats van vast in de code. Standaard *inclusief*, want het
gaat om een consumentenprijs, maar je kan het per kwartaal omzetten zonder de
code aan te raken. Ook het btw-percentage staat per tarief.

### Afronden gebeurt per regel

Elke sessieregel wordt op de eurocent afgerond, en het totaal is de som van die
afgeronde regels. Zo telt de kolom op het rapport exact op tot het eindtotaal —
wat een boekhouder verwacht van een document waarop terugbetaald wordt.

Het btw-bedrag is altijd het *verschil* tussen inclusief en exclusief, nooit
een eigen afronding. Anders zou "excl + btw = incl" op een regel niet meer
kloppen.

`afrondenCent()` corrigeert eerst de binaire representatiefout: € 1,005 wordt
opgeslagen als 1,00499999999999989 en zou anders op € 1,00 uitkomen in plaats
van € 1,01.

### Periodes lopen op Belgische tijd

Sessies staan in UTC, maar "juli" loopt van 1 juli 00:00 Belgische tijd tot
1 augustus 00:00 Belgische tijd. In de winter scheelt dat een uur met UTC, in
de zomer twee. `lokaleDatumNaarUtc()` in `web/lib/periods.ts` rekent dat om,
met een tweede passage voor de dagen waarop het uur verzet wordt.

Zonder die correctie zou een sessie van 30 juni om 23:30 in het juli-rapport
belanden.

### Bewaarde rapporten zijn momentopnames

Een rapport bewaart de volledige berekening als JSON (`reports.snapshot`), niet
alleen een verwijzing naar de sessies. Corrigeer je nadien een tarief, dan
verandert een rapport dat je al afgeleverd hebt niet mee. De PDF en de Excel
worden telkens opnieuw uit die momentopname gerenderd, dus ze zijn ook jaren
later nog identiek.

### Sessies zijn idempotent

`sessions.external_id` (`evcc:<id>`) is uniek. Dezelfde sessie meermaals
binnensturen werkt ze bij in plaats van te dupliceren. Daarom mag de integratie
gerust telkens álles opnieuw sturen, en kan je zonder zorgen op **Nu
synchroniseren** drukken.

Een sessie die nog loopt komt binnen met `is_complete = false` en wordt wel
getoond maar niet doorgerekend. Zodra ze afgerond is, wordt dezelfde rij
bijgewerkt.

## Keuzes rond toegang

### De rol wordt bij elke paginaweergave opgezocht

Het zou goedkoper zijn om de rol in het aanmeldkoekje te stoppen, maar dan
werkt het intrekken van iemands toegang pas nadat die persoon zich opnieuw
aanmeldt. Nu kost het één databankvraag per pagina en is een wijziging meteen
van kracht.

### De middleware weet enkel óf je aangemeld bent

`middleware.ts` draait op de edge-omgeving en mag niet aan de databank. Daarom
is de aanmeldconfiguratie gesplitst: `auth.config.ts` bevat het edge-veilige
deel, `auth.ts` voegt daar de databankcontrole aan toe voor de Node-omgeving.
De middleware stuurt enkel niet-aangemelde bezoekers naar het inlogscherm; het
échte rechtenwerk gebeurt op elke pagina en in elke serveractie apart.

Dat betekent ook: elke serveractie doet zijn eigen controle. Een verborgen knop
is geen beveiliging.

### TOEGELATEN_EMAILS is de noodingang

Adressen in die omgevingsvariabele zijn altijd hoofdbeheerder, wat er ook in
`app_users` staat. Ze kunnen via de app niet gedegradeerd of verwijderd worden.
Zo kan een fout in de app of een verkeerde klik je nooit buitensluiten uit je
eigen installatie, en geraakt de eerste gebruiker binnen bij een lege databank.

### Filteren gebeurt in de databankvraag

Wie geen hoofdbeheerder is, krijgt een `.in("company_id", ...)` mee in de vraag
zelf, niet pas bij het tonen. Zo kan er geen rij van een andere vennootschap
door een vergeten controle op het scherm belanden. De download-URL's van PDF en
Excel controleren dat afzonderlijk, en geven 404 in plaats van 403 bij een
rapport van iemand anders — zo valt er via die URL niet uit te vissen welke
rapporten er bestaan.

### Rapporten maken blijft bij de hoofdbeheerder

Het rapport is de onkostennota van de begunstigde. Dat een vennootschap haar
eigen claim tegen die persoon zou opmaken, klopt niet. Inkijken en downloaden
mag wel; zie `magRapportenMaken()` in `web/lib/rollen.ts`.

## Wat opzettelijk niet gebeurt

- **Geen automatische e-mail.** De rapporten staan in de app; er is geen
  mailserver in de lus die stilletjes kan falen.
- **Geen toewijzing per auto.** Toewijzing gebeurt per laadpaal, zoals gekozen.
  Het voertuig komt wél op het rapport, als informatie. Wil je later per auto
  toewijzen, dan is `sessions.vehicle` het aanknopingspunt.
- **Geen splitsing zon versus net.** `solar_percentage` komt binnen en staat in
  de databank, maar wordt niet in de berekening gebruikt.
- **Geen doorrekening tussen de twee vennootschappen.** Elk rapport staat op
  zich, met jou als begunstigde.

## Waar wat staat

| Bestand | Waarvoor |
| --- | --- |
| `custom_components/laadkosten/session_mapper.py` | evcc-sessies omzetten; los te testen, geen HA-afhankelijkheid |
| `custom_components/laadkosten/api.py` | Praten met evcc en met de app |
| `web/lib/rollen.ts` | Wie wat mag; puur, zonder databank, volledig getest |
| `web/lib/toegang.ts` | De aangemelde gebruiker met zijn actuele rol |
| `web/lib/gebruikers.ts` | Gebruikers lezen en schrijven in de databank |
| `web/lib/billing.ts` | Kostenberekening en afronding |
| `web/lib/periods.ts` | Maanden en kwartalen in Belgische tijd |
| `web/lib/creg.ts` | Het tarief van een webpagina plukken |
| `web/lib/reports.ts` | Een rapport samenstellen en bewaren |
| `web/lib/pdf.tsx` / `web/lib/excel.ts` | De documenten renderen |
| `web/app/api/ingest/route.ts` | Waar Home Assistant zijn data aflevert |

## De pijplijn

`.github/workflows/ci.yml` draait bij elke push en elke pull request:

| Taak | Wat het bewaakt |
| --- | --- |
| Home Assistant-integratie | de tests op de sessieomzetting, en of elk JSON-bestand nog leesbaar is |
| Webapp | typecontrole, alle tests, en of de app nog te bouwen is |
| Databankschema | het schema tegen een echte Postgres, twee keer na elkaar |
| Geen sleutels in de code | geen `.env`-bestanden, geen vastgelegde tokens |

Die derde taak verdient toelichting: het schema wordt twee keer uitgevoerd. De
installatiegids belooft dat je de scripts gerust mag herhalen, en dit bewaakt
dat die belofte klopt.

`validatie.yml` draait `hassfest` en de HACS-actie, ook wekelijks op maandag.
Die regels wijzigen buiten ons om; zo merk je een probleem vóór je het nodig
hebt in plaats van erna.

Dependabot stelt maandelijks één gebundeld voorstel voor de npm-pakketten en
één voor de GitHub-acties. De CI draait mee op elk voorstel, dus een update die
iets breekt, kleurt rood voor je hem samenvoegt.

## Het installatiescript

`scripts/installeer.sh` doet de installatie op wat handwerk in de Google Cloud
Console na. Het is bewust herhaalbaar: omgevingsvariabelen worden eerst
verwijderd en dan opnieuw gezet, en de SQL-scripts zijn idempotent.

`scripts/voer-sql-uit.mjs` voert de SQL uit tegen Supabase. Het haalt de
Postgres-bibliotheek bij de eerste keer zelf op naar een tijdelijke map, zodat
er niets vooraf geïnstalleerd hoeft te zijn en de afhankelijkheden van de app
ongemoeid blijven. Voor een databank op je eigen machine wordt de versleuteling
overgeslagen, voor Supabase niet.

## Tests

```bash
python3 -m pytest tests/    # 20 tests op de sessieomzetting
cd web && npm test          # 76 tests op berekening, periodes, tarieven,
                            # documenten en toegangsrechten
```

De documenttests genereren een echte PDF en een echte Excel en lezen die weer
in. Dat is traag genoeg om op te vallen, maar het is het enige dat bewijst dat
de rapporten daadwerkelijk renderen op een serveromgeving zonder browser.
