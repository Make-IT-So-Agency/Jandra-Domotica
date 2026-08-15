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
| `web/lib/billing.ts` | Kostenberekening en afronding |
| `web/lib/periods.ts` | Maanden en kwartalen in Belgische tijd |
| `web/lib/creg.ts` | Het tarief van een webpagina plukken |
| `web/lib/reports.ts` | Een rapport samenstellen en bewaren |
| `web/lib/pdf.tsx` / `web/lib/excel.ts` | De documenten renderen |
| `web/app/api/ingest/route.ts` | Waar Home Assistant zijn data aflevert |

## Tests

```bash
python3 -m pytest tests/    # 20 tests op de sessieomzetting
cd web && npm test          # 52 tests op berekening, periodes, tarieven, documenten
```

De documenttests genereren een echte PDF en een echte Excel en lezen die weer
in. Dat is traag genoeg om op te vallen, maar het is het enige dat bewijst dat
de rapporten daadwerkelijk renderen op een serveromgeving zonder browser.
