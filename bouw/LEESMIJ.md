# Bouw

Ons bouwproject opvolgen in de webapp: de plannen van de architect met hun
versies, de verdiepingen, en iedereen met wie we te maken hebben. Op de
laptop, de tablet en de gsm, onder **Bouw** in het menu.

Dit is fase 1a. Hierna komt het omzetten van een plan-PDF naar een digitaal
plan (muren, ramen, deuren, ruimtes met hun oppervlakte), zodat we niets van
nul moeten tekenen. Zie [Wat nog komt](#wat-nog-komt).

```
Browser (Jan, Sandra)
   │  aanmelden met Google; enkel de hoofdbeheerder ziet Bouw
   ▼
Vercel: web/app/bouw            schermen en serveracties
   │                 │
   │                 │ ondertekende URL (opladen: 2 uur, bekijken: 2 minuten)
   ▼                 ▼
Supabase             Supabase Storage, privé-bucket "bouw"
bouw_* tabellen      de PDF's zelf; de browser praat er rechtstreeks mee
```

## Wat het doet

- **Overzicht** (`/bouw`): wat er nog moet gebeuren, de stand in tegels, en de
  naam en het adres van het project.
- **Plannen** (`/bouw/plannen`): elk plan met zijn versies. Een PDF met alle
  bladen laad je één keer op en gebruik je per blad als versie. De viewer
  zoomt met het muiswiel, twee vingers of de knoppen, en blijft scherp tot in
  het detail.
- **Verdiepingen** (`/bouw/verdiepingen`): naam, volgorde, vloerpeil en
  hoogtes. De hoogtes dienen later voor het 3D-model.
- **Partijen** (`/bouw/partijen`): architect, aannemers, leveranciers,
  adviseurs, nutsbedrijven, de bank. Telefoon en e-mail zijn links.

## Privacy: de repository is publiek

- De straatnaam, het adres, de plannen en later de foto's en facturen staan
  **enkel in Supabase**: in de tabellen en in de privé-bucket `bouw`. Nooit in
  de code, in testdata, in logboeken of in artefacten van GitHub Actions.
- Een bestand krijgt als pad een UUID (`plannen/<uuid>.pdf`), nooit de
  oorspronkelijke naam: daar kan de straat in staan. Die naam staat enkel in
  `bouw_bestanden.oorspronkelijke_naam`.
- `scripts/sql/` mag voor Bouw enkel aantallen tonen: de uitvoer van de
  workflow SQL uitvoeren is publiek.
- De browser bewaart een geopend plan in de Cache API, om dataverkeer te
  sparen. Op de loginpagina, dus na het afmelden, wordt die cache gewist.

## Hoe opladen werkt

Een functie op Vercel laat maar ongeveer 4,5 MB per aanvraag door, en de
browser krijgt geen Supabase-sleutel. Daarom gaat het bestand rechtstreeks
van de browser naar Storage:

1. **`vraagUploadAan`** (serveractie) kijkt de rechten, het type (PDF), de
   grootte (tot 50 MB) en het label na. Het zet een rij in `bouw_bestanden`
   op `wacht` en geeft een ondertekende upload-URL voor precies dat pad.
2. **De browser** zet het bestand met een PUT op die URL (`lib/bouw/zet-op.ts`),
   met voortgang.
3. **`voegVersieToeActie`** kijkt na of het bestand er staat, hoe groot het is
   en of het met `%PDF-` begint (`lib/bouw/opladen.ts`). Pas dan wordt de rij
   `klaar` en de versie aangemaakt. Is het geen PDF, dan verdwijnt het.

Uploads die drie uur op `wacht` blijven staan, worden opgeruimd bij de
volgende upload. Een bestand dat geen versie meer gebruikt, verdwijnt bij het
verwijderen van die versie of dat plan. Verwijderen gebeurt altijd via de
Storage-API: Supabase blokkeert DELETE op `storage.objects` vanuit SQL.

## Waar wat staat

| Waar | Wat |
| --- | --- |
| `supabase/migrations/20261002100000_bouw.sql` | De tabellen `bouw_*` en de privé-bucket `bouw` |
| `web/app/bouw/` | De schermen en hun serveracties |
| `web/app/bouw/plannen/[id]/viewer.tsx` | De planviewer (pdf.js, enkel in de browser) |
| `web/app/bouw/plannen/[id]/gebaren.ts` | Verschuiven en zoomen met muis, vinger en pen |
| `web/lib/bouw/opslag.ts` | Alles wat in de databank gelezen en geschreven wordt |
| `web/lib/bouw/opslagruimte.ts` | De bestanden in Storage |
| `web/lib/bouw/opladen.ts` | Opladen afronden en opruimen |
| `web/lib/bouw/bestanden.ts`, `beeld.ts`, `invoer.ts`, `taken.ts` | Pure regels en rekenwerk, met tests |
| `web/lib/bouw/pdf.ts`, `zet-op.ts` | Enkel voor de browser |

## Keuzes

**Waarom enkel de hoofdbeheerder.** Bouw toont de plannen en het adres van ons
huis. Een vennootschapsbeheerder of een boekhouder heeft daar niets te
zoeken. Wie hoofdbeheerder wordt, ziet voortaan ook het huis.

**Waarom de legacy-build van pdf.js.** De gewone build vraagt de nieuwste
Chrome of Firefox. Safari, en dus elke browser op een iPad of iPhone, heeft de
legacy-build nodig. De versie staat vast (6.3.289): pdf.js wijzigt zijn API
ook in kleine versies.

**Waarom twee beelden in de viewer.** Een iPad of iPhone weigert een canvas
boven ongeveer 16,7 miljoen pixels. Het blad wordt één keer gerenderd tot
8 miljoen pixels; wie verder inzoomt, krijgt daarbovenop een scherp beeld van
enkel het stuk dat in beeld is.

**Waarom de plannen in de browser bewaard worden.** Supabase draait op het
gratis niveau, met beperkt dataverkeer. Een ondertekende URL is elke keer
anders, dus de gewone HTTP-cache helpt niet. Een bestand verandert nooit (een
nieuwe versie is een nieuw bestand), dus wat bewaard is, veroudert niet.

## Wat je zelf moet doen

1. **Databankmigraties** draaien vóór de code uitgerold wordt: Actions →
   Databankmigraties → Run workflow, met `productie`. Zie
   [docs/UITROL.md](../docs/UITROL.md).
2. **Sandra als hoofdbeheerder** toevoegen bij Gebruikers, anders ziet ze Bouw
   niet.
3. **Na het uitrollen nakijken:**
   - de bucket `bouw` staat in het Supabase-dashboard als *Private*;
   - een kleine PDF opladen lukt;
   - op een iPad en een gsm tonen en zoomen.

   Lukt het opladen niet, dan zit het waarschijnlijk in CORS of in een
   ontbrekende apikey bij Storage. De melding in het scherm zegt welke HTTP-fout
   het was.

## Wat nog komt

- [x] **1a** Plannen opladen en bekijken, verdiepingen, partijen
- [ ] **1b** Van PDF naar plan: schaal, muren, ramen, deuren en ruimtes uit de
      PDF lezen, nakijken en bevestigen, en versies en verdiepingen uitlijnen
- [ ] **1c** AI-hulp op aanvraag bij het omzetten
- [ ] **2** Punten op het plan (stopcontacten, licht, netwerk, sensoren) en de
      wensenlijst voor de elektricien
- [ ] **3** Keuzes met deadline, de planning als tijdlijn, een eigen
      Telegram-bot voor Bouw, en een link voor de architect
- [ ] **4** Geld: posten, offertes, facturen, bouwkrediet, en links voor de
      aannemers
- [ ] **5** Het huis in 3D, met de gekozen materialen
- [ ] **6** De werf: foto's op het plan, werfdagboek, opleveringspunten
- [ ] **7** Woningdossier en nazorg
