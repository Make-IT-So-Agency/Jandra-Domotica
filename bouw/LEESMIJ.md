# Bouw

Ons bouwproject opvolgen in de webapp: de plannen van de architect met hun
versies, omgezet naar ruimtes per verdieping, de punten voor de elektricien op
dat plan, de keuzes, de planning, het geld, de werf, het woningdossier, en
iedereen met wie we te maken hebben. Op de laptop, de tablet en de gsm: in het
menu links onder **Vastgoed**, met bovenaan het huis, bv. **Nieuwbouw**.

Elk huis heeft zijn eigen adressen onder `/vastgoed/<nummer>`. De adressen
hieronder zijn die van de nieuwbouw, huis 1. Oude links naar `/bouw/...` sturen
door naar het eerste huis.

We tekenen niets van nul: de app leest de PDF van de architect en maakt er
een digitaal plan van. Fase 1a, 1b en 2 tot en met 7 zijn klaar; enkel 1c
(AI-hulp bij het omzetten) is uitgesteld. Zie [Wat nog komt](#wat-nog-komt).

```
Browser (Jan, Sandra)
   │  aanmelden met Google; enkel de hoofdbeheerder ziet Vastgoed
   ▼
Vercel: web/app/vastgoed        schermen en serveracties
   │                 │
   │                 │ ondertekende URL (opladen: 2 uur, bekijken: 2 minuten)
   ▼                 ▼
Supabase             Supabase Storage, privé-bucket "bouw"
bouw_* tabellen      de PDF's zelf; de browser praat er rechtstreeks mee
```

## Wat het doet

- **Huizen** (`/vastgoed`): elk huis met zijn soort. Een huis toevoegen is een
  naam en een soort; zie [Huizen](#huizen).
- **Overzicht** (`/vastgoed/1`): wat er nog moet gebeuren (een keuze waarvan de
  deadline binnen twee weken valt, een factuur die binnen de week vervalt, een
  grondplan dat nog omgezet moet worden, onderhoud dat deze week aan de beurt
  is, een garantie die binnen de maand afloopt), de stand in tegels, wat er
  deze en volgende week gebeurt, en de naam en het adres van het project.
- **Plannen** (`/vastgoed/1/plannen`): elk plan met zijn versies, per gebouw.
  - **Dossier inlezen**: één PDF met alle bladen. De app stelt per blad een
    plan voor en per gebouw de verdiepingen; zie
    [Van PDF naar plan](#van-pdf-naar-plan).
  - De viewer zoomt met het muiswiel, twee vingers of de knoppen, en blijft
    scherp tot in het detail.
  - Op een grondplan: **Omzetten naar ruimtes**.
  - Zolang er grondplannen niet omgezet zijn: **Alle grondplannen omzetten**
    (`/vastgoed/1/plannen/omzetten`), ook vanaf Ruimtes.
- **Ruimtes** (`/vastgoed/1/ruimtes`): per gebouw en verdieping een tekening en een
  lijst met de oppervlakte, de plafondhoogte en het aantal punten. Ook op de
  gsm.
- **Punten** (`/vastgoed/1/punten`): lichtpunten, schakelaars, stopcontacten,
  netwerk, sensoren en zo verder op het plan, en daaruit de **wensenlijst**
  voor de elektricien, als PDF en Excel; zie
  [Punten en de wensenlijst](#punten-en-de-wensenlijst).
- **3D** (`/vastgoed/1/3d`): het huis in 3D, uit de omgezette grondplannen, met de
  materialen uit de keuzes. Rondkijken, een verdieping of het dak weglaten,
  een doorsnede, en rondwandelen; zie [Het huis in 3D](#het-huis-in-3d).
- **Keuzes** (`/vastgoed/1/keuzes`): gevelsteen, dakbedekking, ramen, vloeren,
  keuken... met opties, foto's, onze voorkeur, de meerprijs en een deadline;
  zie [Keuzes en planning](#keuzes-en-planning).
- **Planning** (`/vastgoed/1/planning`): de fasen, taken en mijlpalen als tijdlijn,
  per aannemer.
- **Geld** (`/vastgoed/1/geld`): de posten met hun raming, de offertes naast
  elkaar, meer- en minwerken, de facturen met hun vervaldag, het bouwkrediet,
  een kasplanning per maand en alles als Excel; zie [Geld](#geld).
- **Werf** (`/vastgoed/1/werf`): foto's met de gsm, per dag en per ruimte, het
  werfdagboek, de actiepunten, de opleverpunten per aannemer en de checklist
  vóór alles dichtgaat; zie [De werf](#de-werf).
- **Dossier** (`/vastgoed/1/dossier`): de documenten van het huis (as-built, AREI,
  EPB, postinterventiedossier, handleidingen, garantiebewijzen), de garanties
  met hun einde en het onderhoud dat terugkomt; zie
  [Woningdossier en nazorg](#woningdossier-en-nazorg).
- **Beslissingen** (`/vastgoed/1/beslissingen`): het beslissingslog.
- **Verdiepingen** (`/vastgoed/1/verdiepingen`): per gebouw (de woning, een
  bijgebouw) de verdiepingen met naam, volgorde, vloerpeil en hoogtes. Een
  nieuw gebouw maak je door bij een verdieping een nieuwe naam in te tikken.
- **Partijen** (`/vastgoed/1/partijen`): architect, aannemers, leveranciers,
  adviseurs, nutsbedrijven, de bank. Telefoon en e-mail zijn links.
- **Toegang** (`/vastgoed/1/toegang`): een persoonlijke link voor de architect, de
  aannemers en de leveranciers; zie [Een link voor een partij](#een-link-voor-een-partij).

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

**Alle grondplannen omzetten.** Na een dossier hoef je niet elk grondplan
apart te openen.

- **Welke plannen.** Elk grondplan met een verdieping waarvan de nieuwste
  versie nog niet bevestigd is, dus ook een nieuwe versie.
- **De volgorde.** Per gebouw, eerst het gelijkvloers, dan naar boven en dan
  naar beneden. Elke verdieping wordt zo op een buur gelegd die al
  uitgelijnd is.
- **De stappen.** Dezelfde als bij één plan:
  - de schaal, de ruimtes en de namen die er al waren;
  - het uitlijnen. Lukt dat niet zeker met dezelfde draaiing, dan probeert
    de app de drie andere. Een gedraaide tekening moet je altijd nakijken,
    want een symmetrisch huis past ook na een halve draai.
- **De kaart per plan.** Een kleine schets met de vorige verdieping in het
  blauw, en het oordeel:
  - **✔ klaar**: de schaal en de uitlijning zijn zeker, elke ruimte gaat mee
    en er verdwijnt niets. Zo'n plan staat aangevinkt.
  - **⚠ nakijken**: de reden staat erbij. Aanvinken mag toch, maar een ruimte
    zonder naam of met een afwijkende oppervlakte gaat dan niet mee.
  - **✘ kan hier niet**: geen schaal, geen ruimtes met een naam, of twee
    grondplannen op dezelfde verdieping.
- **Bevestigen.** Plan per plan, met dezelfde actie als het nakijkscherm.
  Vink je een plan af, dan gaan de plannen die erop uitgelijnd werden mee
  uit. De regels staan in `omzetting/reeks.ts`, met tests.

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

**De wensenlijst** (`/vastgoed/1/punten/wensenlijst`): per verdieping en ruimte wat
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
  dak; een trapgat of een vide niet.
- **De trap.** De omzetting leest hem van het plan (`omzetting/trappen.ts`):
  - de treden zijn evenwijdige lijnen op gelijke afstand (60 cm tot 1,60 m
    lang, 17 tot 36 cm uit elkaar, minstens vier); een streepjeslijn telt als
    één lijn, net als een trede die de snedelijn in stukken knipt, en een
    trede achter een muur telt mee. Een lijn twee treden voorbij het einde is
    eerder een maatlijn;
  - één reeks is een rechte trap; twee reeksen naast elkaar zijn een trap die
    halfweg 180° draait, met een bordes aan het einde waar ze samenkomen; twee
    reeksen haaks op elkaar zijn een kwartdraai;
  - het bordes van een trap die 180° draait, ligt waar de architect één lijn
    over beide vluchten tekent: daar houdt het muurtje ertussen op. Beide
    vluchten lopen tot die lijn;
  - het pijltje in een vlucht wijst naar boven.

  Bij het nakijken staat de trap in het oranje op het plan, met een pijl naar
  boven. In 3D (`drie/trappen.ts`) gaat hij van het peil van de verdieping
  tot dat van de verdieping erboven, met treden van gelijke hoogte en het
  bordes halfweg. Boven komt een gat in de vloer met een leuning, behalve waar
  de trap aankomt.
  Zonder trap op het plan komt er een onder een gat in de verdieping erboven
  met de vorm van een trapgat (smal: recht, breed: met een bordes), of in een
  ruimte van het soort Trap. Bij **Trappen** in het 3D-scherm draai je een
  trap om, kies je een andere vorm, of zeg je dat het gat een vide is; dat
  wordt per verdieping bewaard (`bouw_verdiepingen.trappen`). Een grondplan
  dat omgezet werd voor de app trappen las, of voor ze het bordes goed las
  (werkwijze 4), zet je opnieuw om; het 3D-scherm zegt het.
- **Het dak** stel je per gebouw in, in het 3D-scherm: plat, een zadeldak of
  een lessenaarsdak, met de helling en de richting van de nok. Het dakplan van
  de architect leest de app (nog) niet.
- **Materialen.** De gevelsteen kleurt de gevel, de dakbedekking het dak, de
  ramen het schrijnwerk, de wanden de binnenmuren, en een vloer of tegels de
  ruimtes die eraan gekoppeld zijn. Een optie met een foto wordt een textuur.
  Een andere optie uitproberen kan in het 3D-scherm, zonder iets te bewaren.
- **Bekijken.** Het beeld neemt de hele breedte; met **Paneel verbergen**
  krijgt het nog meer plaats, en **Volledig scherm** vult het hele venster
  (Esc sluit). Rondkijken met de muis of twee vingers; zoomen met **+** en
  **−** op het beeld, het muiswiel of de toetsen + en −; **Passend** zet alles
  weer in beeld. Een verdieping, het dak of de punten weglaten; een doorsnede
  op een hoogte; rondwandelen op ooghoogte met W A S D of de knoppen, zonder
  door muren te lopen, en de trap op en af (`drie/wandelen.ts`); een beeld
  downloaden.
- **Het inplantingsplan.** Elk gebouw heeft zijn eigen assenstelsel, dat van
  zijn grondplannen. Waar het op het terrein staat, haalt de app van het
  inplantingsplan (`drie/inplanting.ts`):
  - het plan is het plan van het soort Inplantingsplan (of een ander, bij
    **Inplanting** in het 3D-scherm), telkens de nieuwste versie. Het ligt op
    schaal op de grond; de schaal staat op het blad (`1/200`), en anders
    berekent de app ze uit de gebouwen;
  - op het blad zoekt de app gesloten vormen met ongeveer de oppervlakte van
    het gelijkvloers: één vlak, losse zijden in dezelfde stijl die rondgaan
    (zo is een perceelgrens vaak getekend), of muren en ruimtes die samen de
    omtrek vormen, ook met een deur of poort ertussen;
  - per vorm de hoek uit de richting van de randen (met elke kwartslag erbij),
    het zwaartepunt op het zwaartepunt, en fijn bijsturen. De score is de
    overlap, en vanaf 60% wordt een gebouw geplaatst. Het paneel toont hoeveel,
    bv. "automatisch geplaatst, 97% overeenkomst";
  - bij een rechthoek, die ook omgekeerd past, beslissen de muren die op het
    plan staan, en anders de kleinste draaiing;
  - een bijgebouw dat tegen de woning staat, vindt de app in wat er van de
    vorm overblijft;
  - een gearceerde vorm is meestal een bestaand gebouw, zoals dat van de
    buren: daar komt een gebouw enkel op als het overtuigend past (85%). En
    ligt het eerste gebouw in een grotere gesloten vorm, het perceel, dan
    zoekt de app de andere enkel daarbinnen, niet in het titelblok of bij de
    buren. Een gebouw dat niet op het plan staat, zet je zelf.

  Met **Gebouwen verplaatsen** sleep je een gebouw, draai je het per 1° of
  90° of met een getal, en schuiven de pijltjes het 10 cm (met Shift 1 m).
  **Van boven** kijkt recht op het plan. **Inplanting bewaren** bewaart de
  plaats van elk gebouw, het plan en de schaal (`bouw_gebouwen.plaats_*`,
  `bouw_huizen.inplanting_*`); een gebouw zonder bewaarde plaats zoekt de app
  bij elk bezoek opnieuw. Het zoeken loopt in een webworker, zodat het beeld
  vlot blijft. Zonder inplantingsplan staan de gebouwen naast elkaar.
- **De omgeving uit Vlaanderen.** Met een adres bij Overzicht haalt de server
  bij Digitaal Vlaanderen (gratis, zonder sleutel; `omgeving-diensten.ts`):
  - het adrespunt in Lambert 72 (Geolocation);
  - de percelen en de gebouwen binnen 100 m (de WFS van het GRB): ons perceel
    is dat met het adrespunt erin;
  - de luchtfoto van 200 × 200 m, de nieuwste winteropname, op 2048 pixels
    (ongeveer 10 cm per pixel). De browser bewaart ze een dag; wij nergens.

  In 3D ligt de luchtfoto als grond, met het inplantingsplan erover (het wit
  valt weg). Ons perceel krijgt een lage oranje boord, de percelen van de
  buren een dunne lijn, en de huizen van de buren worden volumes van 6 m met
  een zadeldak langs de lange kant: het GRB kent geen hoogtes. Wat nu op ons
  perceel staat, is verborgen; een vinkje toont het.

  Waar de omgeving ligt, zoekt de app zelf (`drie/omgeving.ts`): ons perceel
  uit het GRB op het perceel van het inplantingsplan, met dezelfde overlap
  als de gebouwen en op de schaal van het plan, met y omgekeerd (Lambert telt
  naar het noorden). Lukt dat niet, dan komt het adrespunt op de woning met
  het noorden naar boven. Met **Omgeving verschuiven en draaien** stuur je
  bij: slepen, draaien rond de woning per 0,1°, 1° of 90°, en de pijltjes.
  **Omgeving bewaren** bewaart waar de linkerbovenhoek van het plan in Lambert
  ligt en de hoek (`bouw_huizen.lambert_*`).
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

## Geld

Alle bedragen zijn **inclusief btw**: dat is wat we betalen.

- **Posten.** Een post is een deel van de bouw dat geld kost: de architect,
  de ruwbouw, de elektriciteit, de aansluitingen. "Begin met de gewone
  posten" zet er 20 klaar, per categorie (werken, studies, vergunning,
  aansluitingen, inrichting). Per post een raming, wie het uitvoert, en de
  taak in de planning.
- **Offertes.** Per post de offertes naast elkaar, met de PDF, tegenover de
  goedkoopste en tegenover de raming. Een verlopen offerte staat in het rood.
  **Kiezen** wijst de andere af, schrijft een regel in het beslissingslog en
  maakt de partij van de offerte die van de post.
- **Meer- en minwerken** komen bij de gekozen offerte. Ze tellen pas mee als
  ze aanvaard zijn.
- **Verwacht** is per post de gekozen offerte met de aanvaarde meer- en
  minwerken; zolang er niets gekozen is, de raming. Wat al gefactureerd is,
  telt altijd.
- **Facturen** (`/vastgoed/1/geld/facturen`), met hun PDF. Zonder vervaldag rekent
  de app 30 dagen na de factuurdatum. Een creditnota is een factuur met een
  vinkje: ze telt af. Een kost die een vennootschap draagt, bv. een laadpaal,
  duid je aan bij **Ten laste van**; de vennootschappen komen uit Laadkosten.
  Betaald is één knop (vandaag), of een datum in het formulier.
- **Het bouwkrediet**: het bedrag en de eigen inbreng (bij Financiering), en
  elke opname, eventueel voor een bepaalde factuur. De app toont wat nog
  beschikbaar is, en wat uit eigen middelen betaald is.
- **De kasplanning** (`/vastgoed/1/geld/kasplanning`) toont per maand wat betaald
  is, wat vervalt en wat volgens de planning nog komt: wat een post nog moet
  factureren, spreidt ze over de maanden van haar taak. Een vervallen factuur
  die nog open staat, telt bij deze maand. Eerst gaat de eigen inbreng op,
  dan het krediet: zo zie je in welke maand je wat moet opnemen, en of het
  krediet volstaat. Een post zonder taak staat apart onderaan.
- **Excel**: de posten (met formules voor de totalen), de offertes, de meer-
  en minwerken, de facturen, de kasplanning en het krediet, met bedragen en
  datums als echte getallen. Ze wordt bij elke download gemaakt.
- **Ingestuurd via een link.** Een aannemer of leverancier stuurt zelf een
  offerte of factuur in (zie [Een link voor een partij](#een-link-voor-een-partij)).
  Ze staat bovenaan Geld tot je ze **inboekt**: kies de post (bij een
  factuur stelt de app de post voor waarvoor je die partij koos) en ze wordt
  een gewone offerte of factuur, met de PDF. Een factuur opent daarna, om ze
  na te kijken. **Negeren** verwijdert ze.

## De werf

Op de gsm, op de werf zelf.

- **Foto's.** Neem of kies er meerdere tegelijk, met eventueel de ruimte en
  een onderschrift. De browser verkleint elke foto tot een JPEG van
  hoogstens 1600 pixels, met een kleine versie van 480 pixels voor de
  overzichten, en laat de EXIF weg (dus ook de plaats). De dag komt uit de
  foto zelf: een foto van dinsdag die je woensdag oplaadt, staat bij
  dinsdag. Per foto kan je de ruimte kiezen of op de tekening van de
  ruimtes prikken waar ze genomen werd.
- **Waarom foto's**: vóór het pleisterwerk en de chape zie je nog waar de
  leidingen zitten. Later wil je dat weten, bv. om een kader op te hangen.
  Filter op een ruimte om alles van die ruimte terug te vinden.
- **Werfdagboek** (`/vastgoed/1/werf/dagboek`): per dag wat er gebeurde, wie er
  was en het weer. De foto's van die dag staan er vanzelf bij.
- **Actiepunten** (`/vastgoed/1/werf/actiepunten`): wat er moet gebeuren, door wie
  en tegen wanneer, bv. uit de werfvergadering. De bot herinnert de dag
  ervoor, op de dag zelf en de dag erna; wat binnen twee dagen moet, staat
  bij "nog te doen".
- **Oplevering** (`/vastgoed/1/werf/oplevering`): wat een aannemer nog moet
  herstellen, met een foto, de ruimte en de ronde (tijdens de werf,
  voorlopige of definitieve oplevering). Een punt gaat van **open** over
  **gemeld** en **hersteld** naar **in orde**. Het is pas in orde als jullie
  het nagekeken hebben, niet als de aannemer zegt dat het hersteld is:
  **Niet in orde** stuurt het terug, met de reden erbij.
  - Per aannemer een **PDF** met zijn punten en per punt een foto, om mee te
    geven. **Alles gemeld** zet zijn open punten op gemeld.
  - Met het recht "oplevering" op zijn link ziet een aannemer zijn eigen
    punten met de foto's, en meldt hij zelf wat hersteld is. De bot meldt
    dat meteen, en "nog te doen" vraagt om het na te kijken.
- **Checklist** (`/vastgoed/1/werf/checklist`): per ruimte wat je nakijkt en
  fotografeert vóór het pleisterwerk en de chape: elke muur met de leidingen,
  dozen en hoogtes, netwerk, versterking voor zware dingen, sanitair op lekken
  getest, ventilatie, de vloer vóór de chape, luchtdichting. De lijst past bij
  de soort ruimte. Elk vinkje wordt meteen bewaard, met wie en wanneer.

## Woningdossier en nazorg

Voor na de oplevering, en voor wie later aan het huis werkt.

- **Documenten** (`/vastgoed/1/dossier`): de PDF's die bij het huis horen, per
  soort: as-built-plannen, de AREI-keuring met het eendraad- en
  situatieschema, de EPB-aangifte, het postinterventiedossier, de vergunning,
  andere attesten, handleidingen en garantiebewijzen. Ze staan in dezelfde
  privé-bucket als de offertes en facturen, onder `documenten/`, tot 20 MB per
  PDF. Wat in elk woningdossier hoort en nog ontbreekt, staat bovenaan. Een
  plan zoals er gebouwd is, zet je best ook bij Plannen als nieuwe versie:
  dan kan je het omzetten en vergelijken met wat gepland was.
- **Garanties** (`/vastgoed/1/dossier/garanties`): waarop, van wie, vanaf wanneer en
  hoe lang, met het garantiebewijs uit de documenten. De app rekent het einde
  uit; wat binnen 90 dagen afloopt, valt op. Een product heeft wettelijk 2 jaar
  garantie; voor de ruwbouw geldt de tienjarige aansprakelijkheid van
  aannemer en architect, vanaf de aanvaarding.
- **Onderhoud** (`/vastgoed/1/dossier/onderhoud`): wat regelmatig moet gebeuren, om
  de hoeveel maanden en door wie. **Begin met het gewone onderhoud** zet tien
  gangbare taken klaar (ventilatiefilters, warmtepomp, rookmelders, dakgoten,
  sifons...); wat je niet hebt, verwijder je. **Vandaag gedaan** noteert een
  beurt met één tik; een beurt van een andere dag kan ook, maar niet in de
  toekomst. Eén beurt per dag: een dubbele tik telt één keer. Elke beurt
  blijft bewaard, en "laatst gedaan" is altijd de laatste: wie een oude beurt
  nog invult, zet de volgende niet terug in de tijd, en een beurt bij het
  verkeerde onderhoud schrap je bij **Wijzigen**. Wat nog nooit gebeurde,
  krijgt een volgende datum na de eerste beurt.

## Huizen

Elk huis heeft zijn eigen plannen, partijen, geld, werf en dossier. Het menu
toont de actieve huizen; bij **Vastgoed → Huizen** (`/vastgoed`) beheer je ze.

- **Toevoegen:** een naam voor het menu (1 tot 60 tekens) en een soort. Het
  adres en de projectnaam vul je in op het overzicht van het huis. Een nieuw
  huis krijgt geen gebouw vooraf: de Woning komt er zodra je een verdieping
  toevoegt of een dossier inleest.
- **Het soort:**
  - een nieuwbouw en een verbouwing hebben alles;
  - een bestaand huis heeft geen keuzes, planning en werf. Die pagina's staan
    niet in zijn menu, hun adres toont uitleg, hun acties weigeren, en de bot
    meldt er niets over;
  - een link voor een partij van een bestaand huis kan geen keuzes, planning
    of oplevering tonen, ook een oudere link niet;
  - het soort kan altijd wijzigen. Wat er al was, blijft bewaard en komt terug
    met het soort.
- **Archiveren:** het huis verdwijnt uit het menu en uit de bot, en zijn links
  werken niet meer. Alles blijft bewaard en te bekijken via Huizen;
  terugzetten maakt het weer actief.
- **Verwijderen** kan enkel met een leeg huis, bv. een huis dat je per
  vergissing toevoegde. Wat er nog aan bestanden is (een upload die nooit
  afgerond werd), gaat eerst weg. Een huis met gegevens archiveer je.

## De bot van Bouw

Een eigen Telegram-bot, los van Opvang_bot: een eigen token, een eigen lijst
toegelaten id's, een eigen webhook (`/api/bouw/telegram`) met een eigen
geheim. Hij meldt; het werk gebeurt in de webapp, en elk bericht heeft een
knop naar het juiste scherm. Hij is niet nodig: zonder bot werkt de rest van
Bouw gewoon.

**Eén bot voor alle huizen.** De ronde en de commando's lopen over de actieve
huizen. Zijn er meer, dan staat de naam van het huis boven elk bericht, ook
bij wat een partij via haar link instuurt. `/week` en `/deadlines` slaan een
bestaand huis over: dat heeft geen planning en geen keuzes.

**Koppelen gebeurt in de app**, bij **Vastgoed → Telegram** (`/vastgoed/telegram`),
met de uitleg erbij. Enkel de bot zelf maak je in Telegram, bij BotFather.

1. Maak bij @BotFather een bot met `/newbot`, met een neutrale naam zonder
   straatnaam, en kopieer het token.
2. Plak het token op de pagina en tik op **Koppelen**. De app:
   - kijkt het token na bij Telegram (`getMe`);
   - weigert het token van de bot van Opvang;
   - zet de webhook naar `AUTH_URL` + `/api/bouw/telegram`, met het eigen
     geheim, en de commando's;
   - bewaart het token versleuteld.
3. Wie de bot `/start` stuurt, of `/start` typt in een groep met de bot, komt
   onder **Wacht op toegang**. **Toelaten** is één tik, en de bot stuurt meteen
   een welkom. In een groep moeten de groep en elke persoon toegelaten zijn.
4. Kies de chat voor de herinneringen met **Herinneringen hierheen** (of
   `/hier` in de groep), en stuur een **testbericht**.

De pagina toont ook wat Telegram over de webhook zegt (komen de berichten
toe, wacht er iets, de laatste fout), met **Opnieuw koppelen** en
**Ontkoppelen**. Een id met de hand toevoegen kan ook.

**Het token** staat in `bouw_instellingen` (`telegram_token`), versleuteld met
AES-256-GCM. De sleutel komt met HKDF uit `AUTH_SECRET`, met het label
`bouw-bot:token`, zodat een dump van de databank alleen het token niet
prijsgeeft. Dat is een bewuste uitzondering op de regel "elk geheim bij
GitHub": zo kunnen jullie koppelen zonder de app te verlaten. Verandert
`AUTH_SECRET`, dan vraagt de pagina het token opnieuw.

**Enkel in productie.** Een preview-uitrol gebruikt dezelfde databank. Daarom
gebruikt de app het token enkel waar `VERCEL_ENV` `production` is (of niet
bestaat, lokaal), en wijst de webhook altijd naar `AUTH_URL`, nooit naar het
adres van een aanvraag. Een preview kan de bot dus niet omleggen.

- **Elke ochtend** (Vercel, 6.30 uur UTC: 8.30 uur in de zomer, 7.30 uur in de
  winter) stuurt hij naar de gekozen chat:
  - een herinnering 14, 7, 3 en 1 dag vóór de deadline van een keuze, op de
    dag zelf, en één keer de dag erna als ze nog open staat;
  - een herinnering 3 dagen vóór de vervaldag van een factuur, op de dag
    zelf, en één keer de dag erna als ze nog niet betaald is;
  - een herinnering de dag vóór de deadline van een actiepunt, op de dag
    zelf, en de dag erna;
  - een herinnering een week vóór een onderhoudsbeurt en op de dag zelf, en
    elke dertig dagen zolang ze te laat is (enkel voor onderhoud dat al eens
    gebeurde);
  - een herinnering twee maanden, een maand en een week vóór een garantie
    afloopt;
  - wat morgen begint, en een mijlpaal van vandaag;
  - op maandag wat er deze en volgende week gebeurt.
- Elke melding vertrekt maar één keer (`bouw_meldingen`), ook als de ronde
  twee keer loopt. Schuift een taak op, dan komt er voor de nieuwe datum een
  nieuwe herinnering. Mislukt het versturen, dan probeert de volgende ronde
  het opnieuw.
- **Commando's:** `/week`, `/deadlines`, `/facturen` (wat nog betaald moet
  worden), `/taken` (wat er in de app nog te doen is), `/hier` (stuur je
  herinneringen naar deze chat) en `/id`. Bij het koppelen krijgt Telegram
  dezelfde lijst, zodat het menu klopt; komt er een commando bij, tik dan op
  Opnieuw koppelen.
- Wie niet toegelaten is, krijgt enkel op `/start` en `/id` een antwoord: dat
  de vraag klaarstaat in de app, en zijn id. De vraag komt in de lijst
  (hoogstens 10, na 30 dagen weg); alle andere berichten: stilte.
- Zolang er geen bot gekoppeld is, doet de dagelijkse ronde niets en meldt ze
  waarom.

## Een link voor een partij

Een partij krijgt geen account maar een persoonlijke link: `/extern/<token>`.

- **Wat ze mag**, vink je per link aan: de plannen bekijken en downloaden,
  een dossier of plan insturen, een offerte insturen, een factuur insturen,
  de eigen opleverpunten zien en melden wat hersteld is, de keuzes lezen, de
  planning lezen, de wensenlijst lezen. Standaard krijgt een architect de
  plannen, insturen, facturen, de keuzes en de planning; een aannemer de
  plannen, offertes, facturen, de oplevering en de planning; een leverancier
  of adviseur de plannen, offertes en facturen.
- **Wat hij nooit ziet:** prijzen, het adres, de opmerkingen in de planning en
  het beslissingslog in vrije tekst. Van de keuzes ziet hij enkel wat gekozen
  is (naam, leverancier, kleur) en wat nog open staat.
- **Insturen.** Een PDF tot 50 MB gaat rechtstreeks naar de privé-opslag,
  zoals bij ons. Ze komt niet meteen bij de plannen, maar bovenaan **Plannen**
  onder "Ingestuurd via een link": **Inlezen** opent ze in het gewone
  dossierformulier, **Negeren** verwijdert ze. De bot van Bouw meldt elke
  inzending. Hoogstens 20 bestanden per link per etmaal.
- **Een offerte of factuur** (PDF tot 20 MB) komt met het bedrag inclusief
  btw, bij een factuur ook het nummer, de factuurdatum en de vervaldag. De
  browser en de server kijken dat na vóór het opladen. Ze komt bovenaan
  **Geld** te staan, om in te boeken. De partij ziet bij wat ze instuurde of
  het ontvangen, ingeboekt of betaald is; niet of een offerte gekozen werd.
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

- De straatnaam, het adres, de plannen, de foto's, de offertes en de
  facturen staan **enkel in Supabase**: in de tabellen en in de privé-bucket
  `bouw`. Nooit in de code, in testdata, in logboeken of in artefacten van
  GitHub Actions.
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
- De wensenlijst en de Excel van het geld worden bij elke download op dat
  moment gemaakt en nergens bewaard. Er staat geen adres op.
- De tests maken hun eigen plannen met een kleine PDF-schrijver
  (`web/tests/fixtures/bouw/`). Een echt plan komt nooit in de repository.
- De omgeving: het adres gaat enkel van de server naar Digitaal Vlaanderen,
  zonder cache. Het antwoord aan de browser bevat geen adres en geen
  perceelnummers. Een fout in het log zegt welke dienst en welke HTTP-status,
  nooit het adres of de coördinaten. De coördinaten van het terrein staan
  enkel in de databank; de telling in `scripts/sql/` zegt enkel of ze er zijn.
  De tests gebruiken verzonnen adressen en coördinaten.

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

Foto's (`fotos/`, verkleind in de browser) en de PDF's van offertes,
facturen en het woningdossier (`documenten/`, tot 20 MB) gaan langs dezelfde
drie stappen.

Bij stap 3 leest de server enkel de eerste bytes van het bestand. Die fetch
krijgt een eigen `signal`: binnen een serveractie bewaart React elke
GET-fetch en geeft het een kopie, en wie van die kopie maar een stuk leest en
dan afbreekt, wacht anders eeuwig op de andere kopie. Bij een
offerte, factuur of document gebeurt stap 2 zodra je de PDF kiest; het formulier wacht
tot het bestand er staat, en de serveractie rondt het af.

Uploads die drie uur op `wacht` blijven staan, worden opgeruimd bij de
volgende upload. Een bestand dat geen versie meer gebruikt, verdwijnt bij het
verwijderen van die versie of dat plan. Verwijderen gebeurt altijd via de
Storage-API: Supabase blokkeert DELETE op `storage.objects` vanuit SQL.

## Waar wat staat

| Waar | Wat |
| --- | --- |
| `supabase/migrations/20261002202500_bouw.sql` | De tabellen `bouw_*` en de privé-bucket `bouw` |
| `supabase/migrations/20261002202501_bouw_omzetting.sql` | Gebouwen, bladcodes, omzettingen en ruimtes |
| `supabase/migrations/20261002202502_bouw_punten.sql` | De punten op het plan |
| `supabase/migrations/20261002202503_bouw_regie.sql` | De planning, de keuzes met opties en voorkeuren, het beslissingslog, en wat de bot al meldde |
| `web/app/vastgoed/[huis]/` | De schermen van een huis en hun serveracties |
| `web/app/vastgoed/page.tsx`, `acties.ts`, `layout.tsx` | De huizen beheren: toevoegen, wijzigen, archiveren, een leeg huis verwijderen; en wie Vastgoed mag zien |
| `web/app/bouw/[[...pad]]/route.ts` | De oude adressen: door naar het eerste huis, of naar `/vastgoed/telegram` |
| `web/components/bouw/` | Wat meer schermen delen: de melding, de bevestigknop, de wenstabel en de tijdlijn |
| `web/lib/bouw/paden.ts` | De adressen van een huis; puur, ook voor het menu in de browser |
| `web/lib/bouw/onderdelen.ts` | Wat elk soort huis heeft, en welke rechten een link er kan krijgen; puur |
| `web/components/bouw/onderdeelpoort.tsx` | Uitleg in plaats van keuzes, planning of werf bij een bestaand huis |
| `web/app/vastgoed/[huis]/plannen/dossier.tsx` | Een dossier inlezen |
| `web/app/vastgoed/[huis]/plannen/[id]/planvlak.tsx`, `planblad.ts` | Een blad tonen, verschuiven en zoomen (pdf.js, enkel in de browser) |
| `web/app/vastgoed/[huis]/plannen/[id]/gebaren.ts` | Muis, vinger en pen: slepen, knijpen, tikken |
| `web/app/vastgoed/[huis]/plannen/[id]/omzetten/` | Het nakijkscherm en het bevestigen |
| `web/app/vastgoed/[huis]/plannen/omzetten/` | Alle grondplannen in één keer omzetten |
| `web/app/vastgoed/[huis]/punten/` | Punten zetten, en de wensenlijst |
| `web/app/api/bouw/wensenlijst/` | De wensenlijst als PDF en als Excel |
| `web/app/vastgoed/[huis]/keuzes/`, `planning/`, `beslissingen/` | Keuzes met opties en foto's, de tijdlijn, het beslissingslog |
| `web/lib/bouw/omzetting/` | Van PDF naar plan: lezen (het enige bestand met pdf.js), schaal, ruimtes, openingen, uitlijnen, dossier |
| `web/lib/bouw/dossier-inlezen.ts`, `dossierregels.ts` | Een dossier wegschrijven, en de regels ervoor |
| `web/lib/bouw/punten.ts` | De catalogus, in welke ruimte een punt ligt, en de wensenlijst |
| `web/lib/bouw/wensenlijst-bestanden.tsx`, `wensenlijst-laden.ts` | De wensenlijst opmaken als PDF en Excel |
| `web/lib/bouw/keuzes.ts`, `planning.ts`, `kalender.ts` | Hoeveelheid, meerprijs, deadlines, de planning en rekenen met dagen; puur, met tests |
| `web/lib/bouw/regie-opslag.ts` | De planning, de keuzes en het log in de databank |
| `web/lib/bouw/verklein.ts` | Een foto verkleinen in de browser |
| `web/app/vastgoed/telegram/` | De bot koppelen, wie hem mag gebruiken, en de uitleg |
| `web/lib/bouw/telegram-koppeling.ts`, `telegramregels.ts`, `geheim.ts` | Het token versleuteld bewaren, de webhook zetten, de aanvragen en wie toegelaten is |
| `web/lib/bouw/telegram.ts`, `bot.ts`, `ronde.ts`, `berichten.ts` | De bot van Bouw: token en geheim, de commando's, de dagelijkse ronde en de teksten |
| `web/app/api/bouw/telegram/`, `web/app/api/cron/bouw/` | De webhook van de bot, en de dagelijkse ronde |
| `supabase/migrations/20261002202504_bouw_links.sql` | De links (enkel de hash van het token) en de inzendingen |
| `supabase/migrations/20261002202505_bouw_daken.sql` | Het dak van elk gebouw, voor het 3D-model |
| `supabase/migrations/20261002202506_bouw_geld.sql` | Posten, offertes, meer- en minwerken, facturen en kredietopnames |
| `supabase/migrations/20261002202507_bouw_inzendingen_geld.sql` | Offertes en facturen insturen via een link: de rechten, en de soort en het bedrag van een inzending |
| `supabase/migrations/20261002202508_bouw_werf.sql` | Het werfdagboek, werffoto's, actiepunten, opleverpunten en de checklist |
| `web/app/vastgoed/[huis]/werf/` | Foto's opladen en bekijken, prikken op de tekening, het dagboek, de actiepunten |
| `web/lib/bouw/werf.ts`, `exif.ts` | De stappen van een opleverpunt, de checklist, foto's per dag, en de datum uit een foto; puur, met tests |
| `web/lib/bouw/werf-opslag.ts`, `werf-laden.ts` | De werf in de databank, en de verdiepingen, foto-URL's en opleverlijst voor de schermen |
| `web/lib/bouw/oplevering-pdf.tsx`, `web/app/api/bouw/oplevering/` | De opleverpunten van een aannemer als PDF |
| `supabase/migrations/20261002202509_bouw_dossier.sql` | Het woningdossier, de garanties, het onderhoud en zijn beurten |
| `web/app/vastgoed/[huis]/dossier/` | Documenten, garanties en onderhoud |
| `web/lib/bouw/nazorg.ts` | Soorten documenten, het einde van een garantie, de volgende onderhoudsbeurt en de herinneringen; puur, met tests |
| `web/lib/bouw/nazorg-opslag.ts` | Het dossier, de garanties, het onderhoud en de beurten in de databank |
| `web/app/vastgoed/[huis]/geld/` | Posten, een post met offertes en meerwerken, facturen en krediet, de kasplanning |
| `web/app/api/bouw/geld/excel/`, `web/app/api/bouw/document/` | Het geld als Excel, en de PDF van een offerte, factuur of dossierdocument openen |
| `web/lib/bouw/geld.ts` | De stand per post, totalen, facturen, krediet en kasplanning; puur, met tests |
| `web/lib/bouw/geld-opslag.ts`, `geld-laden.ts`, `geld-excel.ts` | Het geld in de databank, alles in één keer laden, en de Excel |
| `web/app/vastgoed/[huis]/3d/` | Het 3D-scherm (three.js, enkel in de browser) en de opbouw van de scène |
| `web/lib/bouw/drie/` | Het 3D-model als gewone gegevens: muren, ramen en deuren, vloeren, platen, daken, materialen; puur, met tests |
| `web/lib/bouw/omzetting/muren.ts` | De muren uit een grondplan |
| `web/lib/bouw/omzetting/trappen.ts` | De trappen uit een grondplan: treden, vluchten, bordes en de pijl |
| `web/lib/bouw/drie/trappen.ts`, `wandelen.ts` | De trap in 3D met het gat en de leuning erboven, en de trap op en af wandelen |
| `web/lib/bouw/drie/plaatsing.ts` | Waar elk gebouw op het terrein staat, en een inplanting nakijken |
| `web/lib/bouw/drie/inplanting.ts` | De gebouwen automatisch op het inplantingsplan: vormen, schaal en overlap; puur, met tests |
| `web/app/vastgoed/[huis]/3d/inplantingsplan.ts`, `zoek-inplanting.worker.ts` | Het inplantingsplan lezen en tekenen, en het zoeken in een webworker |
| `supabase/migrations/20261003200000_bouw_trappen.sql` | De keuzes voor de trappen, per verdieping |
| `supabase/migrations/20261003210000_bouw_inplanting.sql` | De plaats van elk gebouw, en het inplantingsplan en zijn schaal per huis |
| `web/lib/bouw/drie/omgeving.ts` | Lambert en het terrein, de antwoorden van het GRB lezen, ons perceel op het plan, de huizen van de buren; puur, met tests |
| `web/lib/bouw/omgeving-diensten.ts`, `web/app/api/bouw/omgeving/` | De diensten van Digitaal Vlaanderen op de server, en de routes voor de omgeving en de luchtfoto |
| `web/app/vastgoed/[huis]/3d/omgeving-scene.ts` | De omgeving in three.js: luchtfoto, perceelgrenzen en buren |
| `supabase/migrations/20261003220000_bouw_omgeving.sql` | Waar het terrein op de kaart ligt, per huis |
| `web/app/vastgoed/[huis]/toegang/` | Links maken en intrekken |
| `web/app/extern/[token]/` | Wat een partij via haar link ziet en instuurt |
| `web/lib/bouw/links.ts`, `linkregels.ts` | Tokens, nakijken, rechten en inzendingen |
| `supabase/migrations/20261003114500_bouw_huizen.sql` | De huizen, en bij welk huis elke rij hoort |
| `supabase/migrations/20261003130000_bouw_huizen_afronden.sql` | Haalt de tijdelijke trigger en de oude sleutels van het project weg |
| `web/lib/bouw/huizen.ts`, `huistoegang.ts` | De huizen lezen en bewaren, en het huis van een actie of API-route nakijken |
| `web/lib/bouw/databank.ts` | Fouten van de databank, en bij welk huis een rij hoort |
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

**Waarom de kasplanning de planning volgt.** Een aannemer factureert
meestal in schijven, volgens de vordering van zijn werk. Wat een post nog
moet factureren, gelijk spreiden over de maanden van zijn taak, is een ruwe
maar eerlijke schatting, en ze schuift mee als de taak opschuift. Echte
facturen vervangen de schatting: wat gefactureerd is, gaat van de rest af.

**Waarom elk huis zijn eigen gegevens heeft.** Naast de nieuwbouw kan later
bv. het huidige huis komen, met zijn eigen partijen, plannen, geld en
onderhoud. Achttien tabellen hebben daarom een kolom `huis_id`; de rest hoort
via zijn ouder bij een huis, zoals een ruimte via haar verdieping en die via
haar gebouw. Elke functie in de opslagmodules krijgt het huis mee:

- een lijst toont enkel dat huis;
- lezen, wijzigen of verwijderen op een id van een ander huis lukt niet;
- een verwijzing naar iets van een ander huis (een partij, een post, een
  ruimte) wordt geweigerd;
- een actie krijgt haar huis via `.bind(null, huis.id)`, en de server leest
  het opnieuw na.

De naam van een gebouw en de bladcode van een plan zijn uniek per huis. Een
link voor een partij geeft enkel het huis van die partij vrij. De bot en zijn
chat gelden voor alle huizen; met meer dan één huis staat de naam erboven.

Elk huis staat op zijn eigen adres, `/vastgoed/<nummer>`: het nummer en niet
de naam, zodat een huisnaam nooit in een URL of een log komt. Het menu toont
de actieve huizen; kies je een ander huis, dan blijf je in hetzelfde
onderdeel, of kom je op zijn overzicht. `/vastgoed` toont alle huizen, en de
bot staat los van de huizen, op `/vastgoed/telegram`.

**Waarom de plannen in de browser bewaard worden.** Supabase draait op het
gratis niveau, met beperkt dataverkeer. Een ondertekende URL is elke keer
anders, dus de gewone HTTP-cache helpt niet. Een bestand verandert nooit (een
nieuwe versie is een nieuw bestand), dus wat bewaard is, veroudert niet.

## Wat je zelf moet doen

1. **Databankmigraties** draaien vóór de code uitgerold wordt: Actions →
   Databankmigraties → Run workflow, vanaf de branch, met `productie`. Zie
   [docs/UITROL.md](../docs/UITROL.md). Voor de eerste uitrol van Bouw deed
   Claude dat, vlak vóór de merge. Het gaat om tien migraties:
   `20261002202500_bouw.sql`, `20261002202501_bouw_omzetting.sql`,
   `20261002202502_bouw_punten.sql`, `20261002202503_bouw_regie.sql`,
   `20261002202504_bouw_links.sql`, `20261002202505_bouw_daken.sql`,
   `20261002202506_bouw_geld.sql`, `20261002202507_bouw_inzendingen_geld.sql`,
   `20261002202508_bouw_werf.sql` en `20261002202509_bouw_dossier.sql`.
   Een nieuwe migratie krijgt een later nummer: de Supabase-CLI weigert er
   een die vóór de laatste toegepaste valt.
2. **Sandra moet hoofdbeheerder zijn** (bij Gebruikers), anders ziet ze
   Vastgoed niet.
3. **Een tweede huis**, bv. het huidige huis: bij **Vastgoed → Huizen**, met
   het soort *Bestaand huis*. Zie [Huizen](#huizen).
4. **De trap in 3D:** het gelijkvloers opnieuw omzetten (of **Alles
   omzetten**), zodat de app de trap van het plan leest. Bij het nakijken
   staat hij in het oranje; kijk na of hij naar boven wijst en of het bordes
   aan de goede kant ligt.
5. **De inplanting:** bij 3D nakijken of de gebouwen op hun plaats op het
   inplantingsplan staan (**Van boven** helpt), zo nodig bijsturen met
   **Gebouwen verplaatsen**, en **Inplanting bewaren**. Staat het
   inplantingsplan nog niet bij Plannen, laad het dan op als soort
   Inplantingsplan.
6. **De omgeving:** het adres invullen bij **Overzicht**, als het er nog niet
   staat. Dan bij 3D nakijken of de luchtfoto en de perceelgrenzen op het
   plan vallen, zo nodig bijsturen met **Omgeving verschuiven en draaien**, en
   **Omgeving bewaren**.
7. **De bot van Bouw** (mag later, of nooit): in de app, bij **Vastgoed →
   Telegram**. De stappen staan daar; zie ook [De bot van Bouw](#de-bot-van-bouw).
   Er hoeft niets bij GitHub of Vercel.
8. **Na het uitrollen nakijken:**
   - de bucket `bouw` staat in het Supabase-dashboard als *Private*;
   - het dossier van de architect inlezen bij Plannen;
   - het gelijkvloers en de verdieping omzetten en nakijken, op een laptop
     of iPad, en het huis bekijken bij 3D (het dak instellen);
   - een paar punten zetten en de wensenlijst als PDF en Excel downloaden;
   - de gewone keuzes en een voorbeeldplanning aanmaken, en een foto bij een
     optie zetten met de gsm;
   - bij Geld de gewone posten aanmaken, het krediet invullen, een offerte
     met PDF toevoegen en kiezen, en een factuur met PDF toevoegen; de PDF
     openen, en de Excel downloaden;
   - bij Toegang een link voor jezelf maken (als architect), hem in een
     privévenster openen, een PDF insturen en die bij Plannen inlezen;
   - een link maken voor een aannemer, er in een privévenster een offerte
     en een factuur mee insturen, en ze bij Geld inboeken;
   - op een gsm de plannen en de ruimtes bekijken;
   - op een gsm een paar foto's nemen bij Werf, en er één op de tekening
     prikken;
   - een opleverpunt met foto maken voor een aannemer, de PDF downloaden,
     en het via zijn link (in een privévenster) hersteld melden;
   - een document met PDF in het dossier zetten en openen, en bij Onderhoud
     met het gewone onderhoud beginnen.

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
- [x] **4** Geld: posten, offertes, meer- en minwerken, facturen met
      herinneringen, bouwkrediet, kasplanning en Excel, en offertes en
      facturen insturen via de link van een aannemer
- [x] **5** Het huis in 3D, met de muren uit de PDF, de gekozen materialen,
      een doorsnede en rondwandelen
- [x] **5b** Het 3D-scherm op de volle breedte met zoomknoppen, en de trap
      van het plan, ook met een bordes, die je op en af wandelt
- [x] **5c** De gebouwen automatisch op het inplantingsplan, het plan op de
      grond, en de gebouwen zelf verplaatsen en draaien
- [x] **5d** De omgeving uit Vlaanderen: de luchtfoto, de perceelgrenzen en
      de huizen van de buren, vanzelf op het plan gelegd
- [x] **6** De werf: foto's per dag en per ruimte, geprikt op de tekening,
      het werfdagboek, actiepunten, opleverpunten per aannemer (met PDF en
      via zijn link), en de checklist per ruimte vóór alles dichtgaat
- [x] **7** Woningdossier en nazorg: de documenten van het huis, de
      garanties met hun einde, en het onderhoud met wat wanneer opnieuw moet,
      met herinneringen van de bot
- [x] **Huizen** Meer huizen onder Vastgoed, elk met zijn eigen gegevens en
      adressen, een soort (nieuwbouw, verbouwing, bestaand huis), archiveren
      en een leeg huis verwijderen, en één bot voor alle huizen
