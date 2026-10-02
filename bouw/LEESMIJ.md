# Bouw

Ons bouwproject opvolgen in de webapp: de plannen van de architect met hun
versies, omgezet naar ruimtes per verdieping, de punten voor de elektricien op
dat plan, de keuzes en de planning, en iedereen met wie we te maken hebben. Op
de laptop, de tablet en de gsm, onder **Bouw** in het menu.

We tekenen niets van nul: de app leest de PDF van de architect en maakt er
een digitaal plan van. Fase 1a, 1b, 2, 3 en 5 zijn klaar; zie
[Wat nog komt](#wat-nog-komt).

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

- **Overzicht** (`/bouw`): wat er nog moet gebeuren (een keuze waarvan de
  deadline binnen twee weken valt, een grondplan dat nog omgezet moet worden),
  de stand in tegels, wat er deze en volgende week gebeurt, en de naam en het
  adres van het project.
- **Plannen** (`/bouw/plannen`): elk plan met zijn versies, per gebouw.
  - **Dossier inlezen**: één PDF met alle bladen. De app stelt per blad een
    plan voor en per gebouw de verdiepingen; zie
    [Van PDF naar plan](#van-pdf-naar-plan).
  - De viewer zoomt met het muiswiel, twee vingers of de knoppen, en blijft
    scherp tot in het detail.
  - Op een grondplan: **Omzetten naar ruimtes**.
- **Ruimtes** (`/bouw/ruimtes`): per gebouw en verdieping een tekening en een
  lijst met de oppervlakte, de plafondhoogte en het aantal punten. Ook op de
  gsm.
- **Punten** (`/bouw/punten`): lichtpunten, schakelaars, stopcontacten,
  netwerk, sensoren en zo verder op het plan, en daaruit de **wensenlijst**
  voor de elektricien, als PDF en Excel; zie
  [Punten en de wensenlijst](#punten-en-de-wensenlijst).
- **3D** (`/bouw/3d`): het huis in 3D, uit de omgezette grondplannen, met de
  materialen uit de keuzes. Rondkijken, een verdieping of het dak weglaten,
  een doorsnede, en rondwandelen; zie [Het huis in 3D](#het-huis-in-3d).
- **Keuzes** (`/bouw/keuzes`): gevelsteen, dakbedekking, ramen, vloeren,
  keuken... met opties, foto's, onze voorkeur, de meerprijs en een deadline;
  zie [Keuzes en planning](#keuzes-en-planning).
- **Planning** (`/bouw/planning`): de fasen, taken en mijlpalen als tijdlijn,
  per aannemer.
- **Beslissingen** (`/bouw/beslissingen`): het beslissingslog.
- **Verdiepingen** (`/bouw/verdiepingen`): per gebouw (de woning, een
  bijgebouw) de verdiepingen met naam, volgorde, vloerpeil en hoogtes. Een
  nieuw gebouw maak je door bij een verdieping een nieuwe naam in te tikken.
- **Partijen** (`/bouw/partijen`): architect, aannemers, leveranciers,
  adviseurs, nutsbedrijven, de bank. Telefoon en e-mail zijn links.
- **Toegang** (`/bouw/toegang`): een persoonlijke link voor de architect, en
  later de aannemers; zie [Een link voor de architect](#een-link-voor-de-architect).

## Van PDF naar plan

Alles gebeurt in de browser: de PDF verlaat de webapp niet. pdf.js leest de
vlakken, lijnen en teksten van een blad; de rest zijn pure functies in
`web/lib/bouw/omzetting/`, met tests.

**Een dossier inlezen.** De browser leest de teksten van elk blad, nog vóór
het opladen, en stelt per blad een plan voor:

- de bladcode uit het titelblok, bv. `BA_woning_P_N_1`, geeft het gebouw en
  de soort (G gevel, P plan, S snede, I inplanting, D detail, L legende,
  T terreinprofiel);
- de titel is de grootste tekst op het blad;
- uit de grondplannen komen de verdiepingen: het peil uit `NIVO 320`, de
  plafondhoogte uit `PH = 260`, de verdiepingshoogte tot het peil erboven.

Jullie kijken dat na in een tabel en klikken op Inlezen. Een volgend dossier
wordt een nieuwe versie van dezelfde plannen (op bladcode). Wat er al is,
wordt nooit overschreven.

**Een grondplan omzetten.**

- **Ruimtes.** Een tekenpakket als Vectorworks vult elke ruimte met wit, met
  precies de oppervlakte van haar label. Het vlak rond een label dat op de
  juiste schaal die oppervlakte heeft, is de ruimte; de grootste andere tekst
  erin is de naam. Achter een label ligt vaak een klein wit tekstvlak: dat is
  geen ruimte.
- **Schaal.** "1:50" uit het titelblok, nagekeken met de oppervlaktes. Klopt
  het titelblok niet (een plan op een ander formaat afgedrukt), dan volgt de
  schaal uit de oppervlaktes. Zonder beide duid je twee punten aan.
- **Kandidaten.** Witte vlakken zonder label die op een ruimte lijken, zoals
  een trapbordes, voeg je toe met een tik.
- **Deuren en ramen.** Een deur is een kwartcirkel, een raam een label als
  `205 x 275`. Ze worden bewaard voor het 3D-model.

**Nakijken.** Op een laptop of tablet. Groen klopt, oranje is na te kijken.
Je kan hernoemen (de soort volgt de naam), splitsen met een lijn, een
kandidaat toevoegen en een plafondhoogte geven.

**Uitlijnen.** Elk gebouw heeft één assenstelsel in meter. De eerste
bevestigde verdieping legt het vast; al de rest wordt daarop gelegd:

- een nieuwe versie eerst op de namen van de ruimtes, dan op de muren;
- een andere verdieping op de lange, dikke lijnen: de muren.

De vorige ligt er in het blauw over. Bijschuiven, een kwartslag draaien, één
gekend punt aanduiden of een andere mogelijkheid kiezen kan altijd.

**Bevestigen.** De server rekent zelf de meters en oppervlaktes uit. Een
ruimte die op dezelfde plaats blijft, houdt haar id: wat er later aan hangt
(punten, keuzes, foto's), blijft mee.

## Punten en de wensenlijst

**Punten zetten.** Op een laptop of tablet, per verdieping, op het omgezette
grondplan met de ruimtes er licht over. Kies rechts een soort en tik op het
plan: elke tik zet er een bij. Tik op een punt om het te wijzigen: soort,
hoogte, aantal, label, opmerking en status (gewenst, in de offerte, geplaatst,
getest), verplaatsen of verwijderen. Op de gsm staat enkel de lijst.

**De catalogus** staat in `web/lib/bouw/punten.ts`: 31 soorten in acht
groepen (verlichting, bediening, stopcontacten, data en media, sensoren en
veiligheid, klimaat, zonwering, andere). Elke soort heeft een korte code zoals
een elektricien ze leest (`L`, `S`, `2WC`, `UTP`, `PIR`, `RM`) en een gewone
hoogte: een schakelaar op 1,10 m, een stopcontact op 0,30 m, een lichtpunt
aan het plafond. Een soort erbij is één regel code, zonder migratie.

**Waar een punt ligt.** In meter, in het assenstelsel van het gebouw. Een
nieuwe versie van het plan wordt op dezelfde plaats uitgelijnd, dus de punten
blijven liggen. De ruimte volgt uit de veelhoeken: in de ruimte, of tot 35 cm
ernaast, want een schakelaar zit in de muur. Wat daarbuiten ligt, zoals een
buitenstopcontact, staat onder "Buiten of zonder ruimte".

**De wensenlijst** (`/bouw/punten/wensenlijst`): per verdieping en ruimte wat
er moet komen, met de aantallen, de hoogtes en de opmerkingen, en het totaal
per soort. Als PDF en als Excel (een blad per ruimte en een blad met het
totaal), voor de elektricien en de domotica-installateur. Een download is een
momentopname, met de datum erop. Later dient dezelfde lijst om hun offertes
te vergelijken.

## Het huis in 3D

Niets van nul getekend: het 3D-model komt uit de omzetting van de
grondplannen.

- **Muren.** Vectorworks vult een doorgesneden muur met grijs: de buitenmuren
  lichter, de binnenmuren donkerder. Een grijs vlak buiten de ruimtes en
  ertegenaan is een muur (`omzetting/muren.ts`); een grijs meubel ligt in een
  ruimte en valt weg. De muren gaan mee bij het bevestigen en staan in meter
  in `bouw_omzettingen`. Een grondplan dat vóór deze versie omgezet werd, zet
  je opnieuw om.
- **Ramen en deuren** zijn de open plekken in een muur, langs de rand van een
  ruimte (`drie/gaten.ts`). Ligt er buiten achter, dan is het een raam (met
  een borstwering van 90 cm, of tot de vloer als het breder is dan 2,40 m)
  of een buitendeur als er een deurboog bij staat. Ligt er een andere ruimte
  achter, dan is het een deur of een doorgang. Een raamlabel als `205 x 275`
  geeft de hoogte.
- **Hoogtes.** Elke verdieping staat op haar peil, met haar plafondhoogte en
  verdiepingshoogte (bij Verdiepingen). Tussen twee verdiepingen ligt een
  vloerplaat van 25 cm. Wat de verdieping erboven niet bedekt, krijgt een plat
  dak.
- **Het dak** stel je per gebouw in, in het 3D-scherm: plat, een zadeldak of
  een lessenaarsdak, met de helling en de richting van de nok. Het dakplan van
  de architect leest de app (nog) niet.
- **Materialen.** De gevelsteen kleurt de gevel, de dakbedekking het dak, de
  ramen het schrijnwerk, de wanden de binnenmuren, en een vloer of tegels de
  ruimtes die eraan gekoppeld zijn. Een optie met een foto wordt een textuur.
  Een andere optie uitproberen kan in het 3D-scherm, zonder iets te bewaren.
- **Bekijken.** Rondkijken met de muis of twee vingers; een verdieping, het
  dak of de punten weglaten; een doorsnede op een hoogte; rondwandelen op
  ooghoogte met W A S D of de knoppen, zonder door muren te lopen; een beeld
  downloaden.
- **Meer gebouwen** komen naast elkaar te staan, niet op hun echte plaats op
  het perceel: elk grondplan heeft zijn eigen assenstelsel.
- three.js laadt enkel op deze pagina, en enkel in de browser.

## Keuzes en planning

**Een keuze** heeft opties: een product, een kleur, een uitvoering, elk met een
leverancier, een prijs inclusief btw, een link en een foto. De prijs geldt in
totaal, per m², per lopende meter of per stuk.

- **Hoeveel.** Bij een prijs per m² volgt de hoeveelheid uit de ruimtes die je
  aan de keuze koppelt (de vloer van de leefruimte en de keuken). Een andere
  hoeveelheid vul je met de hand in.
- **Meerprijs.** Eén optie kan de basis zijn: wat in de offerte staat. De
  andere tonen hun meerprijs daartegenover, of tegenover de goedkoopste als er
  geen basis is.
- **Voorkeur.** Jan en Sandra duiden elk hun voorkeur aan; die staat bij de
  optie.
- **Beslissen.** "Kies deze" maakt de keuze definitief en schrijft een regel in
  het beslissingslog, met de prijs. Terug open zetten kan, en komt ook in het
  log.
- **Foto's.** De browser verkleint een foto eerst tot een JPEG van hoogstens
  1600 pixels, zonder de EXIF-gegevens (en dus zonder de plaats waar ze
  genomen werd). Ze komt in dezelfde privé-bucket, onder `fotos/`.
- **Om te beginnen** zet "Begin met de gewone keuzes" er 19 klaar, met een
  gewone levertermijn en de ruimtes van de juiste soort gekoppeld.

**De deadline** van een keuze is een vaste datum, of volgt uit de planning:
hang de keuze aan de taak die ze nodig heeft (de ramen aan "Ramen plaatsen"),
dan is de deadline de begindatum van die taak, min de levertermijn en een week
om te bestellen. Schuift de taak op, dan schuift de deadline mee.

**De planning** bestaat uit fasen, taken en mijlpalen, elk met een partij.

- De tijdlijn opent bij vandaag. De namen blijven links staan; de tekening
  scrolt zijwaarts, ook op een gsm. Daaronder staat dezelfde planning als
  lijst.
- Een taak die voorbij is en niet klaar, kleurt rood.
- **Loopt iets uit**, dan schuif je het op met een aantal dagen, samen met
  alles wat later begint.
- Een lege planning kan beginnen met een **voorbeeld** voor een nieuwbouw met
  losse aannemers: van de vergunningsaanvraag tot de voorlopige oplevering, met
  de wachttermijn na de vergunning (die mag je pas vanaf de 36e dag na de
  aanplakking gebruiken).

## De bot van Bouw

Een eigen Telegram-bot, los van Opvang_bot: een eigen token, een eigen lijst
toegelaten id's, een eigen webhook (`/api/bouw/telegram`) met een eigen
geheim. Hij meldt; het werk gebeurt in de webapp, en elk bericht heeft een
knop naar het juiste scherm.

- **Elke ochtend** (Vercel, 6.30 uur UTC: 8.30 uur in de zomer, 7.30 uur in de
  winter) stuurt hij naar de gekozen chat:
  - een herinnering 14, 7, 3 en 1 dag vóór de deadline van een keuze, op de
    dag zelf, en één keer de dag erna als ze nog open staat;
  - wat morgen begint, en een mijlpaal van vandaag;
  - op maandag wat er deze en volgende week gebeurt.
- Elke melding vertrekt maar één keer (`bouw_meldingen`), ook als de ronde
  twee keer loopt. Schuift een taak op, dan komt er voor de nieuwe datum een
  nieuwe herinnering. Mislukt het versturen, dan probeert de volgende ronde
  het opnieuw.
- **Commando's:** `/week`, `/deadlines`, `/taken` (wat er in de app nog te
  doen is), `/hier` (stuur je herinneringen naar deze chat) en `/id`.
- Wie niet op de lijst staat, krijgt enkel op `/start` en `/id` een antwoord:
  zijn id. In een groep moet ook de groep zelf op de lijst staan.

## Een link voor de architect

Een partij krijgt geen account maar een persoonlijke link: `/extern/<token>`.

- **Wat hij mag**, vink je per link aan: de plannen bekijken en downloaden,
  een dossier of plan insturen, de keuzes lezen, de planning lezen, de
  wensenlijst lezen. Een architect krijgt standaard de eerste vier.
- **Wat hij nooit ziet:** prijzen, het adres, de opmerkingen in de planning en
  het beslissingslog in vrije tekst. Van de keuzes ziet hij enkel wat gekozen
  is (naam, leverancier, kleur) en wat nog open staat.
- **Insturen.** Een PDF tot 50 MB gaat rechtstreeks naar de privé-opslag,
  zoals bij ons. Ze komt niet meteen bij de plannen, maar bovenaan **Plannen**
  onder "Ingestuurd via een link": **Inlezen** opent ze in het gewone
  dossierformulier, **Negeren** verwijdert ze. De bot van Bouw meldt elke
  inzending. Hoogstens 20 bestanden per link per etmaal.
- **Veilig.** Het token is 32 willekeurige bytes. De databank bewaart enkel de
  SHA-256 ervan: de link zie je één keer, bij het maken, met een knop om te
  kopiëren of te mailen. Een link vervalt altijd (standaard na een half jaar,
  hoogstens na twee jaar) en is meteen in te trekken. Elke pagina, actie en
  download kijkt het token zelf na. De pagina's vragen zoekmachines om weg te
  blijven en sturen geen Referer mee, zodat het token niet meereist naar
  Storage of een andere site.
- Een verlopen, ingetrokken of fout token geeft dezelfde melding: wie de link
  heeft, hoeft niet te weten welke van de drie.

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
- Een omzetting bewaart enkel de namen, oppervlaktes en hoogtes van de
  ruimtes, de openingen en het bewijs voor de schaal. Geen andere teksten van
  het blad: het titelblok bevat namen en adressen.
- De wensenlijst wordt bij elke download op dat moment gemaakt en nergens
  bewaard. Er staat de projectnaam op, niet het adres.
- De tests maken hun eigen plannen met een kleine PDF-schrijver
  (`web/tests/fixtures/bouw/`). Een echt plan komt nooit in de repository.

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
| `supabase/migrations/20261002200000_bouw_omzetting.sql` | Gebouwen, bladcodes, omzettingen en ruimtes |
| `supabase/migrations/20261002300000_bouw_punten.sql` | De punten op het plan |
| `supabase/migrations/20261002400000_bouw_regie.sql` | De planning, de keuzes met opties en voorkeuren, het beslissingslog, en wat de bot al meldde |
| `web/app/bouw/` | De schermen en hun serveracties |
| `web/app/bouw/plannen/dossier.tsx` | Een dossier inlezen |
| `web/app/bouw/plannen/[id]/planvlak.tsx`, `planblad.ts` | Een blad tonen, verschuiven en zoomen (pdf.js, enkel in de browser) |
| `web/app/bouw/plannen/[id]/gebaren.ts` | Muis, vinger en pen: slepen, knijpen, tikken |
| `web/app/bouw/plannen/[id]/omzetten/` | Het nakijkscherm en het bevestigen |
| `web/app/bouw/punten/` | Punten zetten, en de wensenlijst |
| `web/app/api/bouw/wensenlijst/` | De wensenlijst als PDF en als Excel |
| `web/app/bouw/keuzes/`, `planning/`, `beslissingen/` | Keuzes met opties en foto's, de tijdlijn, het beslissingslog |
| `web/lib/bouw/omzetting/` | Van PDF naar plan: lezen (het enige bestand met pdf.js), schaal, ruimtes, openingen, uitlijnen, dossier |
| `web/lib/bouw/dossier-inlezen.ts`, `dossierregels.ts` | Een dossier wegschrijven, en de regels ervoor |
| `web/lib/bouw/punten.ts` | De catalogus, in welke ruimte een punt ligt, en de wensenlijst |
| `web/lib/bouw/wensenlijst-bestanden.tsx`, `wensenlijst-laden.ts` | De wensenlijst opmaken als PDF en Excel |
| `web/lib/bouw/keuzes.ts`, `planning.ts`, `kalender.ts` | Hoeveelheid, meerprijs, deadlines, de planning en rekenen met dagen; puur, met tests |
| `web/lib/bouw/regie-opslag.ts` | De planning, de keuzes en het log in de databank |
| `web/lib/bouw/verklein.ts` | Een foto verkleinen in de browser |
| `web/lib/bouw/telegram.ts`, `bot.ts`, `ronde.ts`, `berichten.ts` | De bot van Bouw: token en geheim, de commando's, de dagelijkse ronde en de teksten |
| `web/app/api/bouw/telegram/`, `web/app/api/cron/bouw/` | De webhook en de setup van de bot, en de dagelijkse ronde |
| `supabase/migrations/20261002500000_bouw_links.sql` | De links (enkel de hash van het token) en de inzendingen |
| `supabase/migrations/20261002600000_bouw_daken.sql` | Het dak van elk gebouw, voor het 3D-model |
| `web/app/bouw/3d/` | Het 3D-scherm (three.js, enkel in de browser) en de opbouw van de scène |
| `web/lib/bouw/drie/` | Het 3D-model als gewone gegevens: muren, ramen en deuren, vloeren, platen, daken, materialen; puur, met tests |
| `web/lib/bouw/omzetting/muren.ts` | De muren uit een grondplan |
| `web/app/bouw/toegang/` | Links maken en intrekken |
| `web/app/extern/[token]/` | Wat een partij via haar link ziet en instuurt |
| `web/lib/bouw/links.ts`, `linkregels.ts` | Tokens, nakijken, rechten en inzendingen |
| `web/lib/bouw/opslag.ts` | Alles wat in de databank gelezen en geschreven wordt |
| `web/lib/bouw/opslagruimte.ts` | De bestanden in Storage |
| `web/lib/bouw/opladen.ts` | Opladen afronden en opruimen |
| `web/lib/bouw/bestanden.ts`, `beeld.ts`, `invoer.ts`, `taken.ts` | Pure regels en rekenwerk, met tests |
| `web/lib/bouw/pdf.ts`, `zet-op.ts` | Enkel voor de browser |

## Waarom zo

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

**Waarom de ruimtes uit de witte vlakken komen.** Het eerste idee was de muren
op een raster tekenen en de vlakken ertussen vullen. Het echte dossier toonde
dat het niet nodig is: elke ruimte staat er als vlak in, met exact de
oppervlakte van haar label (17 van de 17). Dat is nauwkeuriger dan elk
raster. Een PDF zonder zulke vlakken (een ander pakket, een scan) geeft
enkel de schaal; daar helpt later de AI-hulp.

**Waarom uitlijnen op de dikke lijnen.** De teksten (maten, sectiemarkeringen)
zet een architect per blad op een andere plaats, en de dunne lijnen
(meubels, arcering) verschillen per verdieping. De muren liggen op elkaar.
Een muur bestaat wel uit lagen van 10 tot 17 cm, en een gevel kan twee
vlakken hebben: daarom worden meerdere plaatsen fijn nagekeken, en staan de
andere mogelijkheden erbij.

**Waarom een punt niet weet in welke ruimte het ligt.** Een ruimte kan bij
een nieuwe versie van het plan groter of kleiner worden, of gesplitst. Een
punt dat zijn ruimte zelf bijhoudt, zou dan in de verkeerde staan. Daarom
volgt de ruimte telkens uit de plaats van het punt en de veelhoeken van nu.

**Waarom de catalogus in de code staat.** De lijst groeit met wat we onderweg
tegenkomen, en de code, de wensenlijst en het plan moeten dezelfde codes en
kleuren gebruiken. De databank kijkt enkel de vorm van de soort na.

**Waarom de muren uit de grijze vlakken komen.** Muren tekenen met de hand of
afleiden uit de ruimtes is onnauwkeurig: een buitenmuur is 41 cm, een
binnenmuur 14, en de ramen zitten waar de architect ze tekende. De grijze
vlakken zijn precies die muren, met de openingen erin. Op het echte dossier
kwamen er voor de drie grondplannen 18, 72 en 81 muren uit, en geen enkel
meubel.

**Waarom three.js.** Het is de gewone bibliotheek voor 3D in de browser (MIT),
werkt op een iPad, en heeft wat we nodig hebben: schaduw, doorzichtig glas,
een doorsnede en texturen. De versie staat vast, zoals bij pdf.js.

**Waarom de plannen in de browser bewaard worden.** Supabase draait op het
gratis niveau, met beperkt dataverkeer. Een ondertekende URL is elke keer
anders, dus de gewone HTTP-cache helpt niet. Een bestand verandert nooit (een
nieuwe versie is een nieuw bestand), dus wat bewaard is, veroudert niet.

## Wat je zelf moet doen

1. **Databankmigraties** draaien vóór de code uitgerold wordt: Actions →
   Databankmigraties → Run workflow, met `productie`. Zie
   [docs/UITROL.md](../docs/UITROL.md). Er zijn er zes:
   `20261002100000_bouw.sql`, `20261002200000_bouw_omzetting.sql`,
   `20261002300000_bouw_punten.sql`, `20261002400000_bouw_regie.sql`,
   `20261002500000_bouw_links.sql` en `20261002600000_bouw_daken.sql`.
2. **Sandra als hoofdbeheerder** toevoegen bij Gebruikers, anders ziet ze Bouw
   niet.
3. **De bot van Bouw** (mag later):
   1. Maak bij **@BotFather** een nieuwe bot met `/newbot`, met een neutrale
      naam zonder straatnaam, bv. "Jandra Bouw".
   2. Zet in GitHub (**Settings → Environments → productie**) de secrets
      `BOUW_TELEGRAM_BOT_TOKEN` (het token van BotFather) en
      `BOUW_TOEGELATEN_TELEGRAM_IDS` (je eigen id; stuur `/id` naar de bot
      als je het niet kent).
   3. Rol uit, meld je aan en open `/api/bouw/telegram/setup`. Je krijgt
      `"ok": true` met de naam van de bot en de webhook.
   4. Maak een groep met Jan, Sandra en de bot. Stuur er `/id`: zet het id
      van Sandra en dat van de groep (negatief) erbij in
      `BOUW_TOEGELATEN_TELEGRAM_IDS`, met komma's, en rol opnieuw uit.
   5. Stuur `/hier` in de groep. Vanaf dan komen de herinneringen daar.
4. **Na het uitrollen nakijken:**
   - de bucket `bouw` staat in het Supabase-dashboard als *Private*;
   - het dossier van de architect inlezen bij Plannen;
   - het gelijkvloers en de verdieping omzetten en nakijken, op een laptop
     of iPad, en het huis bekijken bij 3D (het dak instellen);
   - een paar punten zetten en de wensenlijst als PDF en Excel downloaden;
   - de gewone keuzes en een voorbeeldplanning aanmaken, en een foto bij een
     optie zetten met de gsm;
   - bij Toegang een link voor jezelf maken (als architect), hem in een
     privévenster openen, een PDF insturen en die bij Plannen inlezen;
   - op een gsm de plannen en de ruimtes bekijken.

   Lukt het opladen niet, dan zit het waarschijnlijk in CORS of in een
   ontbrekende apikey bij Storage. De melding in het scherm zegt welke HTTP-fout
   het was.

## Wat nog komt

- [x] **1a** Plannen opladen en bekijken, verdiepingen, partijen
- [x] **1b** Van PDF naar plan: het dossier inlezen, de schaal, de ruimtes en
      de deuren en ramen uit de PDF lezen, nakijken en bevestigen, en versies
      en verdiepingen uitlijnen. De muren volgen bij het 3D-model.
- [ ] **1c** AI-hulp op aanvraag bij het omzetten. Uitgesteld: het dossier
      van onze architect geeft alle ruimtes zonder hulp (17 van de 17). Ze
      komt pas als een plan zonder witte ruimtevlakken opduikt, van een ander
      tekenpakket of een scan.
- [x] **2** Punten op het plan (licht, bediening, stopcontacten, netwerk,
      sensoren, klimaat, zonwering) en de wensenlijst voor de elektricien, als
      PDF en Excel
- [x] **3** Keuzes met deadline, de planning als tijdlijn, een eigen
      Telegram-bot voor Bouw, en een link voor de architect
- [ ] **4** Geld: posten, offertes, facturen, bouwkrediet, en links voor de
      aannemers
- [x] **5** Het huis in 3D, met de muren uit de PDF, de gekozen materialen,
      een doorsnede en rondwandelen
- [ ] **6** De werf: foto's op het plan, werfdagboek, opleveringspunten
- [ ] **7** Woningdossier en nazorg
