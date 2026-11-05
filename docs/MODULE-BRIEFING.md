# Briefing voor een nieuwe module

Deze tekst geef je mee aan het gesprek waarin een module als prototype
ontworpen werd. Dat gesprek schrijft dan een overdracht waarmee de module in
deze repository gebouwd kan worden. De eerste module waarvoor dit dient is
**Huishouden**.

Plak alles onder de lijn in het prototypegesprek, samen met de code of de
schermen van het prototype.

---

## Je opdracht

Je hebt met mij een prototype gemaakt van een module. Die module wordt nu
gebouwd in een bestaande app, **Jandra**, door een ander gesprek dat het
prototype niet gezien heeft. Schrijf de overdracht die dat gesprek nodig heeft
om de module te bouwen zonder te gokken.

Beschrijf **wat** de module doet en **waarom**, niet hoe het prototype het
technisch deed. De app heeft haar eigen stack en afspraken (hieronder); vertaal
je prototype daarnaar of laat het open, maar schrijf geen code voor een andere
stack voor.

Waar je iets niet weet of waar we niets over beslist hebben: zet het onder
**Open vragen**. Vul het niet zelf in.

## De app waarin de module komt

- **Wat het is**: een webapp voor ons gezin, met per functie een module.
  Nu: **Laadpalen** (laadkosten per vennootschap), **Vastgoed** (onze huizen,
  van plan tot woningdossier) en **Opvang** (enkel een Telegram-bot, nog
  zonder schermen).
- **Stack**: Next.js 15 met de App Router en serveracties, React 19,
  TypeScript, op Vercel. Gegevens in Supabase (Postgres), enkel server-side
  met de service-sleutel; bestanden in een privé-bucket per module in Supabase
  Storage. Aanmelden met Google (NextAuth). Lang werk of werk met een browser
  draait als workflow in GitHub Actions. Tests met Vitest.
- **Opmaak**: eigen CSS met tokens voor licht en donker, zonder
  CSS-framework, in de stijl van `docs/STIJLGIDS.md` (uit het prototype van
  Huishouden): Bricolage Grotesque en Atkinson Hyperlegible, een diep groen
  accent, drie vlakniveaus in plaats van schaduwen. Wijkt het prototype
  daarvan af, beschrijf dan wat anders is (zie **Look en feel**), zodat het
  niet verloren gaat.
- **Taal**: alles in het Nederlands (Vlaams), ook de code: namen van
  bestanden, functies, tabellen en kolommen. Gewone woorden die een gezinslid
  begrijpt, geen jargon.
- **Rollen** die er nu zijn: *hoofdbeheerder* (ziet alles), *beheerder van een
  vennootschap* en *kijker* (allebei enkel de eigen vennootschap van
  Laadpalen). Een nieuwe module is standaard enkel voor de hoofdbeheerder.
- **Telegram**: meldingen en vragen aan het gezin lopen via Telegram, met één
  eigen bot per module.
- **Navigatie**: links staat een smalle balk met een icoon per module; ernaast
  een paneel met de pagina's van de gekozen module, eventueel in secties met
  een kopje. Op de gsm wordt de balk een tabbalk onderaan. Het menu gaat
  maximaal twee niveaus diep (module → pagina); wat daaronder zit, worden tabs
  bovenaan de pagina.
- **Adressen**: elke module heeft één eigen basispad, bv. `/huishouden`, en al
  haar pagina's daaronder.

## Wat de overdracht moet bevatten

Gebruik deze kopjes, in deze volgorde.

### 1. In één alinea
Wat de module doet, voor wie, en welk probleem ze oplost. Wat is er beter dan
vandaag, zonder de module?

### 2. Wie het gebruikt
Welke gezinsleden of anderen. Wie mag wat zien en wat wijzigen? Moet iemand
zonder account erbij (bv. via een persoonlijke link)? Op welk toestel vooral:
laptop, gsm, tablet?

### 3. Voor het menu
- **Naam van de module** (voluit) en een **kort label** voor de modulebalk,
  hoogstens 10 tekens.
- **Icoon**: een voorstel in één woord (bv. mand, kalender, mensen).
- **Pagina's**, in volgorde, met per pagina: de naam in het menu, het adres
  onder het basispad, en de sectie waaronder ze komt (of geen). Duid de
  startpagina van de module aan.
- **Tabs** binnen een pagina, als die er zijn.
- Hoort er iets in het algemene **Beheer** (bv. instellingen van de module)?

### 4. Per pagina
Voor elke pagina:
- Wat je er ziet, in volgorde van belangrijkheid.
- Wat je er kan doen: elke knop of actie, en wat er daarna gebeurt.
- Hoe ze eruitziet zonder gegevens (de eerste keer), en wat er misgaan kan.
- Wat er anders is op de gsm.
- Een schermafbeelding of de prototypecode van die pagina, als bijlage.

### 5. Look en feel
Wat het prototype mooi maakt, zo precies dat iemand het kan nabouwen zonder
het prototype te zien:
- **Stack**: welke bibliotheken voor opmaak, onderdelen, iconen en animaties
  het prototype gebruikt, met hun versie, als het er gebruikt.
- **Verschil met de stijlgids**: wat het prototype anders doet dan
  `docs/STIJLGIDS.md`. Is alles hetzelfde, zeg dat dan in één zin en sla de
  rest van dit kopje over.
- **Tokens**: alle kleuren voor licht en donker (achtergrond, vlakken, tekst,
  gedempte tekst, lijnen, accent, goed, let op, fout), lettertypes met
  gewichten en groottes, afstanden, hoeken en schaduwen. Plak de
  configuratie of de CSS-variabelen letterlijk, als die er zijn.
- **Onderdelen**: elk terugkerend onderdeel (knop, kaart, veld, lijst,
  tabel, tabs, badge, melding, dialoog, lege toestand) met zijn varianten.
- **Beweging**: welke overgangen en animaties, en waar.
- **Schermafbeeldingen** van de schermen die de stijl het best tonen, in
  licht en donker, op laptop en gsm.

### 6. Gegevens
De dingen die bewaard worden, als lijst: per ding de velden met hun soort
(tekst, getal, bedrag, datum, ja/nee, keuze uit …, bestand, verwijzing naar
…), wat verplicht is, en hoe de dingen aan elkaar hangen. Geef bij elk ding
een realistisch voorbeeld met echte waarden.

Wat moet er gebeuren met gegevens die er al zijn (in een Excel, een andere
app, op papier)? Moet dat eenmalig ingelezen worden?

### 7. Regels en berekeningen
Elke regel die de module toepast (bv. hoe iets verdeeld, berekend, herhaald
of verlopen wordt). Schrijf elke regel als een voorbeeld met invoer en
verwachte uitkomst: daar worden de tests van gemaakt. Denk aan de randgevallen:
nul, leeg, een maandeinde, een schrikkeljaar, iets dat geannuleerd wordt.

### 8. Automatisch en meldingen
Wat gebeurt er vanzelf, en wanneer (elke dag om …, bij het einde van de
maand, als iets verloopt)? Welke meldingen gaan naar wie, via Telegram of
mail, met een voorbeeld van de tekst? Moet je via de bot ook iets kunnen
antwoorden of invoeren?

### 9. Koppelingen
Met welke andere diensten praat de module (een API, een website, Home
Assistant, een bank, een agenda)? Is er een officiële API, of moet er iets
van een webpagina gelezen worden? Welke sleutels of accounts zijn er nodig?

Raakt de module aan Laadpalen, Vastgoed of Opvang? Zo ja, waar precies.

### 10. Wat eerst
Deel de module op in stappen die elk op zich bruikbaar zijn. Stap 1 is het
kleinste stuk dat we al echt gebruiken. Zeg per stap wat erin zit.

### 11. Bewust niet
Wat de module niet doet, ook als het voor de hand ligt.

### 12. Open vragen
Alles waar nog geen beslissing over is, als vraag die ik met ja/nee of een
korte keuze kan beantwoorden.

### 13. Uit het prototype
Wat er in het prototype zit dat niet in de overdracht hoort (testgegevens,
nepknoppen, iets wat we verworpen hebben), zodat het niet per ongeluk
meegebouwd wordt.
