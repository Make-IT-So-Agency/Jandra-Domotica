# Overdracht: "Eerlijk is eerlijk" (module Huishouden)

Dit document beschrijft **wat** de module doet en **waarom**. Het gesprek dat de module bouwt, ziet het prototype niet. De stijl staat in `docs/STIJLGIDS.md` en wordt hier niet herhaald. Schermafbeeldingen waarnaar verwezen wordt, komen uit `schermafbeeldingen.zip` bij de stijlgids, bijvoorbeeld `3-voorstel-licht-laptop.png`.

Alles wat niet vastligt, staat onder **12. Open vragen**, genummerd als **OV1, OV2, …**. Waar die verwijzing in de tekst staat, mag de bouwer niets invullen.

---

## 1. In één alinea

"Eerlijk is eerlijk" helpt Jan en Sandra om alle terugkerende taken van hun gezin eerlijk te verdelen. Het gaat om huishouden, twee peuters, de hond, de verhuur van elk een pand en het bouwproject. Ze stellen samen een lijst van werkstromen op, de "kaarten". Elk geeft daarna apart aan hoe graag hij of zij elke kaart doet en hoeveel tijd en mentale last die vraagt. De module stelt dan een verdeling voor: eerst volgens wat ieder graag doet, daarna in evenwicht met de tijd die elk beschikbaar heeft. Ze sturen die verdeling samen bij en leggen ze vast. Het probleem dat de module oplost, is de onzichtbare, ongelijk verdeelde mentale last en het gevoel dat de verdeling niet eerlijk is. Daarom maakt de module de last zichtbaar. Elke stap moet een **positief gevoel** geven: geen tactiek, geen winnaars en verliezers, geen teksten die conflict suggereren.

---

## 2. Wie het gebruikt

| | Jan | Sandra |
|---|---|---|
| Lijst opstellen (kaarten toevoegen, aanpassen, schrappen, verwijderen) | ja | ja |
| Akkoord geven op de lijst | ja, voor zichzelf | ja, voor zichzelf |
| Eigen inschattingen, claims, biedingen en beschikbare tijd invullen | ja, enkel de eigen | ja, enkel de eigen |
| Het voorstel bijsturen (kaarten verschuiven, uitbesteden) | ja | ja |
| "Dit voelt goed voor mij" aanduiden | ja, voor zichzelf | ja, voor zichzelf |
| Verdeling vastleggen | ja, zodra beiden akkoord zijn | idem |
| Eigen kaart tijdelijk uitlenen of een vaste kaart doorgeven | enkel eigen kaarten | enkel eigen kaarten |
| Nieuwe ronde starten, alles resetten | ja | ja |

In het prototype hebben Jan en Sandra exact dezelfde rechten. Er is geen beheerder binnen de module. In Jandra heeft Sandra nog geen rol die hierbij past (**OV1, OV2**).

**Wat ziet de een van de ander, en wanneer:**

| Wat | Wanneer zichtbaar voor de ander |
|---|---|
| Kaarten en het akkoord op de lijst | Meteen |
| Voortgang bij het invullen ("Jan 7/13") | Meteen, maar enkel het aantal |
| Claims (hoe graag) | **Pas vanaf het voorstel (stap 4)** |
| Fysieke tijd en mentale last | Pas zodra het spel verder is dan stap 2. Dan staat naast je eigen score die van de ander |
| Beschikbare tijd | Pas in de weegschaal, vanaf stap 4 |
| Biedingen | **Pas in het voorstel**, als reden bij de kaart ("60 tegen 40") |
| "Klaar met bieden" | Meteen |
| Verschuivingen in het voorstel, "voelt goed", vastgelegde verdeling, uitleningen | Meteen |

De weegschaal is in stap 2 en 3 bewust verborgen. Anders kun je afleiden wat de ander koos.

**Anderen:** niemand anders gebruikt de module (**OV3**).

**Toestel:** vooral een **tablet**, elk op een eigen toestel en tegelijk. Daarnaast ook gsm.

---

## 3. Voor het menu

| | Voorstel | Vast? |
|---|---|---|
| Module in de linkerbalk | **Huishouden** | ja (gegeven) |
| Kort label (≤ 10 tekens) | `Huishouden` (10) | ja |
| Icoon (één woord) | `huis` | **OV4** |
| Pagina in de module | **Eerlijk is eerlijk** | naam ja |
| Adres van die pagina | `/huishouden/eerlijk` | **OV5** |
| Startpagina van `/huishouden` | "Eerlijk is eerlijk", omdat het de enige pagina is | **OV6** |

**De vijf stappen zijn géén aparte pagina's in het menu.** Het is één pagina met een stappenbalk bovenaan. Dat volgt de regel "hoogstens twee niveaus diep".

**Springen tussen stappen:**
- Je kunt altijd **terug** naar een stap die al bereikt is, om iets na te kijken of aan te passen.
- **Vooruit** gaat enkel via de knop die de volgende stap vrijgeeft. Latere stappen zijn niet klikbaar.
- De pagina opent altijd op de stap waar het gezin nu staat. Dat is gedeeld: als Jan een stap verder zet, staat Sandra ook daar.
- Of de stap in het adres staat, is open (**OV7**).

De stappen:

| # | Naam in de stappenbalk | Ondertitel |
|---|---|---|
| 1 | Stel activiteitenlijst op | Welke stromen |
| 2 | Inschatten en claimen | Tijd, last en wat je graag doet |
| 3 | Bieden | Wat jullie allebei willen |
| 4 | Voorstel | Samen bijsturen |
| 5 | Wie heeft wat | Uitlenen en nieuwe ronde |

---

## 4. Per scherm

### Altijd zichtbaar
- **Paginakop** met de titel en de stappenbalk.
- **Bewaarmelding** onderaan het scherm (zie §11).
- Onderaan elke stap de knop **"Alles resetten"**. Na een tik verschijnt een bevestiging op de pagina zelf (zie §11).
- Vanaf stap 2 een **zijpaneel "Weegschaal"**: rechts op tablet liggend en laptop, boven de inhoud op gsm. Op stap 2 en 3 toont het enkel een uitleg waarom het nog leeg is.

### Stap 1 · Stel activiteitenlijst op
*Waarom:* eerst samen afspreken wat er allemaal te doen is, inclusief wanneer iets "goed genoeg" is. Zo spreken jullie later over hetzelfde. Schermafbeelding `1-lijst-*`.

**Wat je ziet, in volgorde van belang:**
1. Het raster met alle kaarten, in de volgorde van de lijst. Er is **geen groepering per domein**. Per kaart:
   - een klein bovenschrift met domein en frequentie;
   - de titel, met rechts een rond icoon: een dobbelsteen voor "via het spel", J voor vast bij Jan, S voor vast bij Sandra;
   - de omschrijving en, als die bestaat, "Goed genoeg: …";
   - onderaan de icoonknoppen.

   Bij "elk voor zich" en "samen" staat een tekstlabel in plaats van een icoon.
2. Wie al akkoord is: twee labels, "Jan akkoord" of "Jan nog niet akkoord", en hetzelfde voor Sandra.
3. De kaart "+ Kaart toevoegen".
4. Onderaan: "Ik ga akkoord met deze lijst" of "Akkoord intrekken", en "Aan de slag" zodra beiden akkoord zijn.

**Acties:**

| Actie | Wat er daarna gebeurt |
|---|---|
| + Kaart toevoegen | Er opent een dialoog "Nieuwe kaart". Met "Bewaren" komt de kaart achteraan in de lijst en wordt **het akkoord van allebei gewist** |
| Potlood (aanpassen) | Een dialoog "Kaart aanpassen". Bewaren wist het akkoord van allebei |
| Doorhaling (schrappen) | De kaart wordt grijs en doorstreept, telt nergens meer mee en blijft zichtbaar. De knop wordt een terugdraaipijl (terugzetten). Wist het akkoord van allebei |
| Rode vuilbak | Op de kaart verschijnt "Zeker?" met **Ja** en **Nee**. Ja verwijdert de kaart definitief en wist het akkoord van allebei. Nee annuleert |
| Ik ga akkoord / Akkoord intrekken | Zet of wist je eigen akkoord |
| Aan de slag | Enkel als beiden akkoord zijn. Het spel gaat naar stap 2, voor allebei. Vanaf dan **ligt de lijst vast**: de knoppen op de kaarten en "+ Kaart toevoegen" verdwijnen, en er staat "De lijst ligt vast met {n} kaarten. Wil je ze nog aanpassen, start dan in de laatste stap een nieuwe ronde." |

**Velden in de dialoog:**

| Veld | Verplicht | Opmerking |
|---|---|---|
| Titel | ja | max. 60 tekens |
| Domein | ja | max. 40 tekens, met suggesties uit de bestaande domeinen |
| Wat hoort erbij | nee | max. 300 tekens |
| Minimumstandaard: wanneer is het goed genoeg? | nee | max. 300 tekens |
| Hoe vaak | ja | Dagelijks, Wekelijks, Maandelijks, Per kwartaal, Jaarlijks of Project. Standaard Wekelijks |
| Hoe wordt deze kaart verdeeld? | ja | zie §5. Standaard "Via het spel" |

**De eerste keer, zonder gegevens:** een gestippeld vak "Nog geen kaarten. Voeg de eerste stroom toe.", met daaronder de kaart "+ Kaart toevoegen". Of de huidige lijst van 17 kaarten mee overgaat, is open (**OV8**).

**Af wanneer:** beiden zijn akkoord en iemand tikt "Aan de slag". Dat geeft stap 2 vrij.

**Tegelijk wijzigen:**
- Een wijziging door de één wist ook het akkoord van de ander. Dat is bewust.
- Als beiden tegelijk dezelfde kaart aanpassen, wint in het prototype de laatste bewaring, zonder waarschuwing (**OV9**).
- Als beiden tegelijk akkoord geven, kon in het prototype één akkoord verloren gaan, omdat de hele spelstatus in één keer overschreven werd. **In de module mag een handeling van de één nooit die van de ander ongedaan maken.** Bewaar het akkoord dus per persoon apart.

**Op gsm:**
- Het kaartenraster staat in twee kolommen.
- De dialoog schuift van onderen op.
- De stappenbalk scrollt horizontaal.

### Stap 2 · Inschatten en claimen
*Waarom:* elk geeft eerlijk en zonder invloed van de ander aan hoe graag hij of zij iets doet, en hoe zwaar het is. Schermafbeelding `2-inschatten-*`.

**Wat je ziet:**
1. Het vak "Mijn beschikbare tijd voor gezin en hobby [__] u per week", met de hint eronder.
2. De voortgang: "Jan x/n" en "Sandra x/n". Zolang de beschikbare tijd ontbreekt, staat er "· tijd?" bij.
3. Per kaart enkel wat van toepassing is:

| Soort kaart | Hoe graag doe je dit? | Fysieke tijd | Mentale last |
|---|---|---|---|
| Via het spel | ja | ja | ja |
| Vast bij Jan of Sandra | nee | ja | ja |
| Elk voor zich met vaste uren (hobbytijd) | nee | nee (vaste uren) | nee |
| Elk voor zich zonder vaste uren | nee | ja | nee |
| Samen | nee | nee | nee |

- **"Hoe graag doe je dit?"** gaat via vier knoppen in een raster van 2×2: Wil ik · Mag · Liever niet · Echt niet.
- **"Fysieke tijd"** is een schaal 1–5: ½ u, 1 u, 2 à 3 u, halve dag, 7 u of meer per week.
- **"Mentale last"** is een schaal 1–5: van nauwelijks tot "zit er constant".
- Eén tik kiest. Een andere tik wijzigt de keuze. Leegmaken kan niet (**OV10**).

**Acties:**
- **Elke tik** wordt bewaard. Snel na elkaar tikken mag geen enkele keuze laten terugspringen, en na het herladen moet alles er nog staan. In het prototype was dat een echte bug.
- **Beschikbare tijd** gaat van 1 tot 80 uur. Leeg of 0 betekent "nog niet ingevuld".
- **Verder naar bieden** verschijnt enkel als beide personen klaar zijn. Wie klaar is, ziet "Klaar! Even wachten op {ander}."

**De eerste keer:** alle kaarten zijn leeg, en de voortgang staat op "0/n · tijd?".

**Af wanneer:** voor **beide** personen is elke actieve kaart volledig ingevuld én is de beschikbare tijd ingevuld. Daarna kan iemand op "Verder naar bieden" tikken, en dat geeft stap 3 vrij.

**Ook later aanpasbaar:** je kunt altijd terug naar stap 2 en iets wijzigen. Er staat dan "Jullie zijn al verder. Pas je hier iets aan, dan past het voorstel zich meteen aan.", en naast je eigen fysieke tijd en mentale last staat die van de ander ("· Sandra: 3"). Of zo'n wijziging de akkoorden van stap 4 wist, is open (**OV11**).

**Tegelijk wijzigen:** elk vult enkel het eigen deel in, dus er is geen botsing. De voortgangslabels van de ander moeten live bijwerken.

**Op gsm:** één of twee kolommen. Het vak "beschikbare tijd" breekt nu onhandig af (zie stijlgids, open vraag 14).

### Stap 3 · Bieden
*Waarom:* als jullie allebei dezelfde kaart willen, toon je met een beperkt budget hoe graag. Dat is eerlijker dan om beurten kiezen, en het voelt niet als tactiek.

**Wat je ziet:**
- **Zijn er geen kaarten die jullie allebei "Wil ik" gaven:** de feestelijke melding "Geen enkele botsing: elke kaart die iemand graag doet, heeft al een thuis." en de knop "Naar het voorstel". Klaar.
- **Anders:**
  1. De uitleg en een budgetvak: "Nog X punten", "Y van 100 verdeeld" en een balk. Bij één kaart staat er de hint "Met één kaart geven jullie allicht allebei alles; dan beslist de weegschaal."
  2. Per botsende kaart een schuifbalk "Hoe graag wil je deze?" van 0 tot 100 in stappen van 5, met het getal ernaast en de geschatte uren en mentale last.
  3. Labels die tonen of Jan en Sandra klaar of bezig zijn, en de knop "Ik ben klaar" of "Toch nog aanpassen".

**Acties:**
- **Schuifbalk:** de som van al je biedingen kan nooit boven 100. De balk stopt vanzelf aan je resterende budget.
- **Ik ben klaar:** vergrendelt je schuifbalken. **Toch nog aanpassen** ontgrendelt ze weer.
- **Naar het voorstel:** verschijnt als beiden klaar zijn, en geeft stap 4 vrij.

**Af wanneer:** er zijn geen botsende kaarten, of beiden hebben "Ik ben klaar" getikt.

**Tegelijk wijzigen:** geen botsing, want elk biedt apart.

**Randgeval:** als iemand in stap 2 een claim wijzigt waardoor een kaart niet meer botst, telt het bod op die kaart niet meer mee voor het budget.

### Stap 4 · Voorstel en samen bijsturen
*Waarom:* de module doet een eerlijk eerste voorstel, maar jullie beslissen. Schermafbeelding `3-voorstel-*`.

**Wat je ziet:**
1. De feestelijke melding "{n} kaarten vonden vanzelf een thuis bij iemand die ze graag doet of ze niet erg vindt." Hier tellen de kaarten van regels R1 en R3 in §6 mee.
2. **Twee kolommen**, Jan en Sandra, met de naam en het totaal aantal uren. Per kaart:
   - de titel, "~X u" (met "×1,5" erbij als niemand de kaart graag doet) en "Mentaal Y";
   - de **reden** als label;
   - de knop "Naar {ander}", en bij kaarten die niemand graag doet ook "Uitbesteden".

   Daaronder de vaste kaarten met het label "Vast afgesproken", en hobbytijd met "Eigen tijd, telt mee in je uren".
3. Een sectie "Uitbesteed" (met de knop "Terughalen") en een sectie "Samen", als die niet leeg zijn.
4. Als er iets verschoven is: "{n} kaart(en) samen verschoven" en "Terug naar het voorstel".
5. Onderaan per persoon "voelt zich hier goed bij" of "nog niet", de knop "Dit voelt goed voor mij" of "Toch nog niet", en "Verdeling vastleggen" zodra beiden akkoord zijn.
6. De **weegschaal** in het zijpaneel (zie §6, R9–R11).

**Acties:**

| Actie | Wat er daarna gebeurt |
|---|---|
| Naar {ander} | De kaart verschuift. Ze krijgt een gestippelde rand en het label "Samen verschoven". **Het akkoord van allebei wordt gewist.** Wie een kaart terugzet naar de persoon uit het voorstel, maakt de verschuiving ongedaan |
| Uitbesteden | De kaart gaat naar "Uitbesteed" en telt bij niemand mee. Wist beide akkoorden |
| Terughalen | De kaart gaat terug naar het voorstel. Wist beide akkoorden |
| Terug naar het voorstel | Alle verschuivingen worden gewist. Wist beide akkoorden |
| Dit voelt goed voor mij / Toch nog niet | Zet of wist je eigen akkoord |
| Verdeling vastleggen | Enkel als beiden akkoord zijn. De verdeling wordt vastgelegd, eventuele uitleningen worden gewist en het spel gaat naar stap 5 |

**Af wanneer:** de verdeling is vastgelegd. Dat geeft stap 5 vrij.

**Tegelijk wijzigen:** als beiden tegelijk een kaart verschuiven, of de één verschuift terwijl de ander akkoord geeft, mag geen van beide handelingen verloren gaan. Een verschuiving die na een akkoord binnenkomt, wist dat akkoord nog altijd.

**Op gsm:** de twee kolommen staan onder elkaar, eerst Jan en dan Sandra. De weegschaal staat bovenaan.

### Stap 5 · Wie heeft wat
*Waarom:* het resultaat waarmee jullie leven, plus ruimte voor het echte leven: ziekte, drukte, of een project dat van fase wisselt.

**Wat je ziet:**
- Twee kolommen met de vastgelegde kaarten per persoon, de vaste kaarten en hobbytijd. Per kaart: de uren, de mentale last en "Goed genoeg: …".
- De secties "Uitbesteed" en "Samen" als labels.
- De melding over het ritme (zie §11).
- De knop "Nieuwe ronde starten".

**Acties:** enkel wie de owner is, ziet deze knoppen bij de eigen kaarten.

| Actie | Wat er daarna gebeurt |
|---|---|
| Tijdelijk uitlenen | De kaart krijgt het label "Tijdelijk bij {ander}". Ze blijft in de kolom en in de uren van de owner (**OV12**). De knop wordt "Terugnemen" |
| Doorgeven aan {ander} (alleen bij vaste kaarten) | De kaart wordt vast bij de ander, voor altijd. Bijvoorbeeld het Bouwproject van de ontwerpfase (Sandra) naar de bouwfase (Jan) |
| Nieuwe ronde starten | Zie §5, "Rondes" |

**Tegelijk wijzigen:** uitlenen en doorgeven gebeuren enkel door de owner, dus er zijn geen botsingen.

---

## 5. Gegevens

Alles staat in Supabase en is gedeeld tussen Jan en Sandra, die het live zien. Hieronder staat **wat** er bewaard wordt, niet het tabelontwerp.

### Kaart (werkstroom)

| Veld | Soort | Verplicht | Voorbeeld |
|---|---|---|---|
| titel | tekst, max. 60 | ja | "Maaltijden" |
| domein | tekst, max. 40 | ja | "Huishouden" |
| omschrijving | tekst, max. 300 | nee | "Weekmenu, boodschappen, koken" |
| goed genoeg | tekst, max. 300 | nee | "Zondag staat het weekmenu klaar, boodschappen in huis voor maandag" |
| frequentie | keuze uit Dagelijks, Wekelijks, Maandelijks, Per kwartaal, Jaarlijks, Project | ja | Dagelijks |
| verdeling | keuze uit: via het spel, vast bij Jan, vast bij Sandra, elk voor zich, samen | ja | via het spel |
| vaste uren | uren per week (getal) of leeg | nee | Hobbytijd: 5 |
| geschrapt | ja/nee | ja (standaard nee) | nee |
| volgorde | getal | ja | 5 |

Wat de soorten verdeling betekenen:
- **Via het spel:** iedereen claimt en schat in, en het voorstel beslist.
- **Vast bij Jan of Sandra:** jullie schatten enkel de tijd en de mentale last in, zodat de kaart meetelt.
- **Elk voor zich:** de uren tellen bij **allebei** mee, zonder mentale last en zonder claim (hobbytijd).
- **Samen:** de kaart telt nergens mee en er is niets in te vullen.

De volledige huidige lijst van 17 kaarten staat in bijlage A.

### Inschatting (per persoon, per kaart)

| Veld | Soort | Voorbeeld |
|---|---|---|
| persoon | verwijzing naar gebruiker (Jan/Sandra) | Jan |
| kaart | verwijzing naar kaart | Maaltijden |
| fysieke tijd | score 1–5 (zie R7) | 5 (= 7 u) |
| mentale last | score 1–5 | 4 |

Een inschatting blijft staan over rondes heen.

### Beschikbare tijd (per persoon)

| Veld | Soort | Voorbeeld |
|---|---|---|
| persoon | verwijzing | Jan |
| uren per week | getal van 1 tot 80, of leeg | 34 |

Dit is de tijd voor gezin én hobby samen. Ze blijft staan over rondes heen.

### Ronde
Een ronde is één volledige doorloop van stap 1 tot 5.

| Veld | Soort | Voorbeeld |
|---|---|---|
| fase | keuze uit: lijst, inschatten, bieden, voorstel, vastgelegd | voorstel |
| gestart op | datum | 2026-11-05 (**OV13**: in het prototype niet bewaard) |
| vastgelegd op | datum of leeg | (**OV13**) |

### Per ronde en per persoon

| Ding | Soort | Voorbeeld |
|---|---|---|
| akkoord met de lijst | ja/nee | Jan: ja, Sandra: nee |
| claim per kaart | keuze uit: wil, mag, liever niet, echt niet | Maaltijden: Jan "wil", Sandra "wil" |
| bod per kaart | getal 0–100 in stappen van 5. Totaal ≤ 100 per persoon. Enkel voor kaarten waar beiden "wil" claimen | Maaltijden: Jan 40, Sandra 60 |
| klaar met bieden | ja/nee | Jan: ja |
| voelt goed bij het voorstel | ja/nee | Jan: ja, Sandra: nee |

### Per ronde en per kaart

| Ding | Soort | Voorbeeld |
|---|---|---|
| verschuiving in het voorstel | keuze uit: Jan, Sandra, uitbesteed | Dagelijkse zorg kinderen → Sandra |
| vastgelegde owner | keuze uit: Jan, Sandra, uitbesteed | Maaltijden → Sandra |
| uitgeleend aan | verwijzing naar persoon of leeg | Poetsen: tijdelijk bij Sandra |

Vaste kaarten krijgen geen vastgelegde owner per ronde, want hun verdeling staat op de kaart zelf.

### Hoe het samenhangt
- Een **kaart** heeft per persoon één **inschatting**.
- Een **ronde** heeft per persoon één **akkoord met de lijst**, één **klaar met bieden** en één **voelt goed**, en per kaart een **claim** en eventueel een **bod**.
- Het **voorstel** zelf wordt niet bewaard. Het wordt telkens berekend uit kaarten, inschattingen, beschikbare tijd, claims, biedingen en verschuivingen.
- Bij **vastleggen** wordt de berekende verdeling als **vastgelegde owner** per kaart bewaard.

### Rondes
- **Nieuwe ronde starten:**
  - Blijft staan: inschattingen, beschikbare tijd, kaarten en de verdeling van vaste kaarten.
  - Wordt gewist: claims, biedingen, "klaar met bieden", akkoorden, verschuivingen, de vastgelegde verdeling en uitleningen.
  - Het spel gaat terug naar stap 1.
- **Alles resetten:** wist ook de inschattingen en de beschikbare tijd. De kaarten blijven.
- **In het prototype bestaat er geen geschiedenis.** Een vorige ronde wordt overschreven (**OV14, OV15**).

---

## 6. Regels en berekeningen

Elke regel heeft een code (R1, R2, …) voor de tests. Getallen zijn nagerekend met de regels uit het prototype.

### Constanten
- Fysieke tijd, van score naar uren per week: **1 → 0,5 · 2 → 1 · 3 → 2,5 · 4 → 4 · 5 → 7**
- Budget voor bieden: **100** punten per persoon, per ronde
- Nipt: een verschil in bod van **10 punten of minder**
- Compensatie: kaarten die niemand graag doet, tellen **1,5 keer** in de uren

### Het voorstel: volgorde van de regels
Elke actieve kaart "via het spel" krijgt een owner volgens de **eerste regel die past**. Vaste, gedeelde en geschrapte kaarten doen niet mee.

| Regel | Als | Dan | Reden (letterlijk) | Nipt? |
|---|---|---|---|---|
| R1 | Eén persoon zegt "wil", de ander niet | Naar wie "wil" zei | "Jan doet dit graag" / "Sandra doet dit graag" | nee |
| R2 | Allebei "wil", biedingen verschillen | Naar het hoogste bod | "Sandra wou dit het liefst (60 tegen 40)" | ja als het verschil ≤ 10 is |
| R2b | Allebei "wil", gelijk bod (ook 0–0) | Naar het evenwicht (R6) | "Jullie willen dit allebei graag, voor het evenwicht" | ja |
| R3 | De één "mag", de ander "liever niet" of "echt niet" | Naar wie "mag" zei | "Mag voor Jan" / "Mag voor Sandra" | nee |
| R4 | Allebei "liever niet" of "echt niet", maar verschillend | Naar wie "liever niet" zei | "Valt Jan minder zwaar, telt 1,5 keer" | ja |
| R5 | Allebei "liever niet", of allebei "echt niet" | Naar het evenwicht (R6) | "Niemand doet dit graag, telt 1,5 keer" | ja |
| R5b | Allebei "mag" | Naar het evenwicht (R6) | "Mag voor allebei, voor het evenwicht" | ja |

**R6, het evenwicht:**
1. Neem alle kaarten die naar het evenwicht gaan, en sorteer ze van zwaar naar licht volgens hun **gewogen uren** (R8).
2. Geef elke kaart om de beurt aan de persoon die er daarna **relatief het minst** draagt: `(uren die je al hebt + uren van deze kaart) ÷ beschikbare tijd`.
3. "Uren die je al hebt" zijn je vaste kaarten, je hobbytijd en de kaarten die je al toegewezen kreeg, allemaal gewogen.
4. Bij gelijke verhouding gaat de kaart naar **Jan** (**OV16**).

**Waarom 1,5 keer (R4/R5):**
- Een kaart die geen van beiden graag doet, weegt voor wie ze krijgt zwaarder dan de uren alleen. De compensatie zorgt dat die persoon elders minder krijgt.
- Dat vervangt de verworpen aanpakken "bieden om te ontlopen" en "ik verdeel, jij kiest". Die voelden als een gok of als tactiek.

### Voorbeeld van een volledig voorstel (testgeval)
Beschikbare tijd: Jan **34 u**, Sandra **30 u**. Biedingen op Maaltijden: Jan **40**, Sandra **60**.

| Kaart | Fys. Jan/Sandra | Ment. Jan/Sandra | Claim Jan/Sandra | → Owner | Uren (gewogen) | Mentaal | Reden |
|---|---|---|---|---|---|---|---|
| Dagelijkse zorg kinderen | 5/5 | 3/4 | mag/mag | **Jan** | 7 | 3,5 | Mag voor allebei, voor het evenwicht (nipt) |
| Organisatie kinderen | 2/2 | 4/5 | echt niet/wil | **Sandra** | 1 | 4,5 | Sandra doet dit graag |
| Hond dagelijks | 5/4 | 1/2 | wil/liever niet | **Jan** | 5,5 | 1,5 | Jan doet dit graag |
| Maaltijden | 5/5 | 4/4 | wil/wil | **Sandra** | 7 | 4 | Sandra wou dit het liefst (60 tegen 40) |
| Poetsen | 3/4 | 1/2 | liever niet/echt niet | **Jan** | 3,25 × 1,5 = 4,875 | 1,5 | Valt Jan minder zwaar, telt 1,5 keer (nipt) |
| Was | 3/3 | 1/1 | liever niet/liever niet | **Sandra** | 2,5 × 1,5 = 3,75 | 1 | Niemand doet dit graag, telt 1,5 keer (nipt) |
| Gezinsfinanciën en papierwerk | 2/2 | 4/3 | wil/mag | **Jan** | 1 | 3,5 | Jan doet dit graag |
| Gezinsagenda en vakanties | 2/1 | 4/4 | mag/wil | **Sandra** | 0,75 | 4 | Sandra doet dit graag |
| Auto's en mobiliteit | 1/1 | 1/2 | mag/liever niet | **Jan** | 0,5 | 1,5 | Mag voor Jan |
| Verhuur pand Jan (vast Jan) | 2/2 | 2/2 | – | Jan | 1 | 2 | – |
| Verhuur pand Sandra (vast Sandra) | 2/2 | 2/2 | – | Sandra | 1 | 2 | – |
| Bouwproject (vast Sandra) | 4/4 | 5/4 | – | Sandra | 4 | 4,5 | – |
| Hobbytijd (elk voor zich, 5 u) | – | – | – | beiden | 5 + 5 | – | – |

Hoe het evenwicht hier verloopt:
- **Vóór het evenwicht:** Jan heeft 17,875 u, Sandra 18,75 u.
- **Dagelijkse zorg (7 u):** voor Jan wordt dat (17,875 + 7) ÷ 34 = 0,73, voor Sandra (18,75 + 7) ÷ 30 = 0,86. De kaart gaat naar **Jan**.
- **Was (3,75 u):** voor Jan wordt dat (24,875 + 3,75) ÷ 34 = 0,84, voor Sandra (18,75 + 3,75) ÷ 30 = 0,75. De kaart gaat naar **Sandra**.

**Uitkomst:**

| | Uren | Getoond | Mentale last | Beschikbaar | Overschrijding? |
|---|---|---|---|---|---|
| Jan | 24,875 | "~25 u" | 13,5 | 34 u | nee |
| Sandra | 22,5 | "~22,5 u" | 20 | 30 u | nee |

De melding zegt "**5** kaarten vonden vanzelf een thuis…": dat zijn de kaarten van R1 en R3. Maaltijden telt niet mee, want die ging via een bod.

### Uren en mentale last
| Regel | Invoer | Uitkomst |
|---|---|---|
| R7 Uren van een kaart = gemiddelde van de omgezette scores van wie heeft ingevuld | Jan 3 (2,5 u), Sandra 5 (7 u) | 4,75 u |
| R7b Enkel één persoon vulde in | Jan 3, Sandra leeg | 2,5 u |
| R7c Niemand vulde in | – | 0 u |
| R7d Kaart met vaste uren | Hobbytijd, 5 | 5 u. Er wordt niets ingeschat |
| R8 Gewogen uren = uren × 1,5 als **beide** claims "liever niet" of "echt niet" zijn | Poetsen 3,25 u | 4,875 u |
| R8b Anders gelijk aan de uren | Maaltijden 7 u | 7 u |
| R9 Mentale last van een kaart = gemiddelde van de ingevulde scores (nooit in uren) | Jan 4, Sandra 5 | 4,5 |
| R10 Totaal per persoon: gewogen uren en mentale last van alle eigen kaarten (vast en vastgelegd of voorgesteld) | zie voorbeeld | Jan 24,875 u / 13,5 |
| R10b "Elk voor zich" telt de uren bij allebei, zonder mentale last | Hobbytijd 5 u | +5 bij Jan én bij Sandra |
| R10c "Samen", uitbesteed en geschrapt tellen nergens mee | Een geschrapte kaart met score 5/5 | 0 |
| R10d Uitgeleend blijft meetellen bij de owner | Poetsen uitgeleend aan Sandra | blijft bij Jan (**OV12**) |
| R11 Weergave van uren: afgerond op een half uur, met komma | 24,875 / 3,25 / 0,75 | "~25 u" / "~3,5 u" / "~1 u" |
| R11b Weergave van mentale last: zelfde afronding | 13,5 / 3,25 | "13,5" / "3,5" |

### Beschikbare tijd en overschrijding
| Regel | Invoer | Uitkomst |
|---|---|---|
| R12 Beschikbare tijd = tijd voor gezin én hobby. Hobbytijd telt dus mee in de uren (R10b) | Jan 34 u, hobby 5 u | ruimte voor ±29 u andere kaarten |
| R13 Overschrijding = totaal **strikt groter** dan de beschikbare tijd | 34,5 u bij 34 u | ja: getal en balk worden amber, "meer dan 34 u" |
| R13b Gelijk aan de beschikbare tijd | 34 u bij 34 u | geen overschrijding, "van 34 u" |
| R13c Beschikbare tijd niet ingevuld | – | geen balk, de tekst "beschikbaar?". Kan in de praktijk niet in stap 4, want stap 2 vraagt de tijd |
| R13d De balk vult tot maximaal 100% van de beschikbare tijd | 40 u bij 34 u | volle balk, amber |

### Akkoorden
| Regel | Invoer | Uitkomst |
|---|---|---|
| R14 Elke wijziging aan de lijst (toevoegen, aanpassen, schrappen, terugzetten, verwijderen) door wie dan ook | Sandra past "Was" aan | akkoord van Jan **en** Sandra gewist |
| R15 Elke verschuiving, uitbesteding, terughaling of "Terug naar het voorstel" | Jan schuift "Poetsen" naar Sandra | "voelt goed" van allebei gewist |
| R16 Een kaart terugzetten naar de persoon uit het voorstel | Poetsen terug naar Jan | de verschuiving verdwijnt (geen dubbele markering) |
| R17 Een inschatting of claim wijzigen na stap 2 | Sandra wijzigt een claim in stap 4 | het voorstel rekent opnieuw, maar het akkoord wordt in het prototype **niet** gewist (**OV11**) |

### Bieden
| Regel | Invoer | Uitkomst |
|---|---|---|
| R18 Totaal per persoon ≤ 100 | Jan heeft 70 geboden en schuift een andere kaart naar 50 | die kaart stopt op 30 |
| R19 Nipt bij een verschil ≤ 10 | 45 tegen 55 | naar Sandra, nipt |
| R19b | 40 tegen 55 | naar Sandra, niet nipt |
| R20 Gelijk bod | 50 tegen 50, of 0 tegen 0 | evenwicht (R6) |
| R21 Een bod op een kaart die niet meer botst | claim gewijzigd naar "mag" | telt niet mee in het budget en niet in het voorstel |
| R22 Geen botsende kaarten | – | stap 3 is meteen af |

### Randgevallen
| Geval | Gedrag in het prototype |
|---|---|
| Nul uur (alle scores leeg of een kaart van 0 u) | Telt als 0. In het evenwicht kan zo'n kaart naar wie dan ook. Bij gelijke verhouding gaat ze naar Jan |
| Geschrapte kaart | Verdwijnt uit stap 2–5 en uit alle totalen. Inschattingen en claims blijven bewaard en komen terug bij "terugzetten" |
| Verwijderde kaart | Weg, met alles wat eraan hing |
| Kaart die tijdens een ronde verandert | Kan niet na stap 1: de lijst ligt vast. Uitzondering: "Doorgeven" in stap 5 wijzigt de verdeling van een vaste kaart |
| Inschattingen wijzigen na het vastleggen | De uren en de mentale last in stap 5 rekenen mee met de nieuwe inschattingen. De vastgelegde owners veranderen niet |
| Maar één persoon vult in | Stap 2 raakt niet af, dus er is geen voorstel. Een herinnering bestaat nog niet (**OV17**) |
| Beschikbare tijd ontbreekt bij het evenwicht | Rekent alsof die 1 u is. Dat kan in de praktijk niet in stap 4 (**OV18**) |

---

## 7. Automatisch en meldingen

**Het prototype doet niets vanzelf en stuurt geen meldingen.** Het ritme ("elk kwartaal opnieuw bekijken") staat er enkel als tekst. Alles hieronder is een vraag (**OV19–OV24**). De voorbeeldteksten zijn voorstellen in de toon van de module:

| # | Mogelijke melding (Telegram, bot "Huishouden") | Naar | Voorbeeldtekst |
|---|---|---|---|
| OV19 | De ander heeft iets aan de lijst gewijzigd, of de lijst is klaar voor akkoord | de ander | "Sandra heeft de lijst aangevuld. Kijk je even mee en geef je akkoord?" |
| OV20 | De ander is klaar met inschatten of bieden | de ander | "Jan is klaar met inschatten. Jij bent aan zet wanneer het je past." |
| OV21 | Het voorstel staat klaar | allebei | "Jullie voorstel staat klaar: 5 kaarten vonden vanzelf een thuis." |
| OV22 | De verdeling is vastgelegd | allebei | "Jullie verdeling staat vast. Fijne weken!" |
| OV23 | Herinnering voor een nieuwe ronde na een kwartaal | allebei | "Drie maanden verder. Tijd om samen even naar de verdeling te kijken?" |
| OV24 | Een kaart is uitgeleend of doorgegeven | de ander | "Jan leent je tijdelijk ‘Poetsen’. Dank je!" |

Antwoorden of invullen via de bot: **OV25**.

---

## 8. Koppelingen

In het prototype raakt de module **aan niets anders**. Mogelijke raakpunten, elk als vraag:
- **Agenda:** hobbytijd als vaste blokken, of de kwartaalherinnering als afspraak (**OV26**).
- **Opvang:** de kaarten "Dagelijkse zorg kinderen" en "Organisatie kinderen" (**OV27**).
- **Vastgoed:** de kaarten "Verhuur pand Jan", "Verhuur pand Sandra" en "Bouwproject" (**OV28**).

---

## 9. Wat eerst

Elke stap is op zich bruikbaar. Elke volgende stap bouwt verder op de vorige.

1. **De gedeelde activiteitenlijst (stap 1).** Kaarten toevoegen, aanpassen, schrappen en verwijderen, met "goed genoeg", de soort verdeling en het akkoord van allebei. Live gedeeld. *Al bruikbaar:* Jan en Sandra hebben samen één afgesproken lijst van alles wat er te doen is, met wie vaste kaarten heeft.
2. **Inschatten en claimen (stap 2)** plus de beschikbare tijd. Blind voor de ander, met de voortgang, en zonder verloren tikken. *Bruikbaar:* je ziet waar de zin en de last zitten.
3. **Voorstel en vastleggen (stap 4 en 5, zonder bieden).** Bij een botsing tussen twee keer "wil" telt nog regel R2b (evenwicht). Met de weegschaal, verschuiven, uitbesteden, "voelt goed", vastleggen en "Wie heeft wat". *Bruikbaar:* een echte verdeling.
4. **Bieden (stap 3).** Het budget, de schuifbalken, "Ik ben klaar" en de regels R2 en R18–R22.
5. **Het leven na de verdeling:** uitlenen, doorgeven, nieuwe ronde starten en alles resetten.
6. **Meldingen en koppelingen**, voor zover OV19–OV28 met ja beantwoord zijn.

---

## 10. Bewust niet

- **Geen takenlijst of afvinken per keer.** De module verdeelt wie owner is, maar volgt niet op of iets gedaan werd.
- **Geen controle of score per persoon** ("Jan deed dit 3 keer niet"). Owner zijn gaat over vertrouwen.
- **Geen winnaars en verliezers.** Er is geen ranglijst, en de uitkomst van een bod wordt niet benoemd als "gewonnen" of "verloren".
- **Geen bieden om iets te ontlopen** en geen **"ik verdeel, jij kiest"**. Allebei zijn verworpen, omdat ze voelden als een gok of als tactiek.
- **Niet om beurten kiezen (draften).** Verworpen.
- **Geen aparte score "zin" van 1 tot 5.** Die is vervangen door de vier claimkeuzes.
- **Mentale last wordt nooit in uren uitgedrukt.**
- **Geen groepering per domein** in de lijsten.
- **Geen zes aparte bouwkaarten.** Het bouwproject is één vaste kaart die wordt doorgegeven.
- **Geen pop-ups van de browser.** Elke bevestiging gebeurt op de pagina zelf.
- **Geen automatische herverdeling.** Een nieuwe ronde start altijd iemand zelf.
- **Een overschrijding is nooit rood**, enkel amber. Rood is voorbehouden aan verwijderen.

---

## 11. Teksten (letterlijk)

`{ander}` is de naam van de andere persoon. `{n}` is een getal.

### Algemeen
- Paginatitel: **Werkstromen**. Bovenschrift: **Jandra · Eerlijk is eerlijk** (**OV29**)
- Stappenbalk: zie §3.
- Bewaarmeldingen: "Bewaren…" · "Nog niet bewaard…" · "Bewaard" · "Kaart bewaard" · "Kaart verwijderd" · "Doorgegeven aan {ander}" · "Nieuwe ronde gestart. Bekijk eerst samen de lijst." · "Alles gereset." · "Even druk, je keuzes blijven staan. Opnieuw bewaren over {n} s…" · "Bewaren lukte niet. Probeer het opnieuw."
- Laden: in het prototype staat "Het deck wordt geladen.", met het verworpen woord "deck". Of het "De lijst wordt geladen." wordt, is open (**OV30**).
- Alles resetten:
  - Knop: "Alles resetten"
  - Bevestiging, titel: "**Alles resetten?**"
  - Bevestiging, tekst: "Dit wist voor jullie allebei de inschattingen, claims, biedingen, beschikbare tijd en verdeling. Jullie starten opnieuw bij stap 1. De kaarten blijven staan. Dit kan niet ongedaan gemaakt worden."
  - Knoppen: "Ja, alles resetten" · "Annuleren"

### Weegschaal
- Titel: "Weegschaal"
- In stap 2 en 3: "De weegschaal verschijnt in het voorstel. Zo vul je alles in zonder te zien wat de ander koos."
- Rij 1: "Mentale last" · "Jan {x}" · "Sandra {y}"
- Rij 2: "Uren per week, met hobbytijd" · "~{x} u" · "van {c} u" / "meer dan {c} u" / "beschikbaar?"
- Voetnoot: "Kaarten die niemand graag doet, tellen 1,5 keer. Je beschikbare tijd pas je aan in stap 2."

### Kaart
- Bovenschrift: "{DOMEIN} · {FREQUENTIE}"
- Regel onder de omschrijving: "**Goed genoeg:** {tekst}"
- Tooltips: "Via het spel" · "Vast bij Jan" · "Vast bij Sandra" · "Aanpassen" · "Schrappen" · "Terugzetten" · "Verwijderen"
- Labels: "Elk voor zich · 5 u elk" · "Samen, telt niet mee"
- Verwijderen: "**Zeker?**" · "Ja" · "Nee"

### Dialoog voor een kaart
- Titels: "Nieuwe kaart" · "Kaart aanpassen"
- Velden: "Titel" · "Domein" · "Wat hoort erbij" · "Minimumstandaard: wanneer is het goed genoeg?" (placeholder: "Bv. elke zondag weekmenu klaar, boodschappen in huis voor maandag") · "Hoe vaak" · "Hoe wordt deze kaart verdeeld?"
- Keuzes bij de verdeling: "Via het spel: inschatten en claimen" · "Vast bij Jan" · "Vast bij Sandra" · "Elk voor zich (zoals hobbytijd)" · "Samen, telt niet mee in de weegschaal"
- Hulptekst: "Vaste kaarten schat je enkel in op tijd en mentale last, zodat ze meetellen in de weegschaal. Kaarten voor elk tellen bij jullie allebei mee; kaarten voor samen tellen niet mee."
- Knoppen: "Bewaren" · "Annuleren"

### Stap 1
- Titel: "Stap 1 · Welke stromen horen bij ons huishouden?"
- Uitleg: "Vul samen de lijst aan tot alles erop staat wat jullie gezin draaiende houdt. Leg per kaart vast wanneer het **goed genoeg** is. Elke wijziging zet het akkoord van jullie allebei terug."
- Labels: "Jan akkoord" / "Jan nog niet akkoord" · "Sandra akkoord" / "Sandra nog niet akkoord"
- Vastgelegd: "De lijst ligt vast met {n} kaarten. Wil je ze nog aanpassen, start dan in de laatste stap een nieuwe ronde."
- Leeg: "Nog geen kaarten. Voeg de eerste stroom toe."
- Knoppen: "+ Kaart toevoegen" · "Ik ga akkoord met deze lijst" / "Akkoord intrekken" · "Aan de slag"

### Stap 2
- Titel: "Stap 2 · Inschatten en claimen"
- Uitleg: "Per kaart: **hoe graag doe je het**, hoeveel **fysieke tijd** vraagt het (1 = ½ u · 2 = 1 u · 3 = 2 à 3 u · 4 = halve dag · 5 = 7 u of meer per week) en hoeveel **mentale last** geeft het (1 = nauwelijks, 5 = zit er constant). Er zijn geen foute antwoorden: hoe eerlijker, hoe beter het voorstel. Je ziet de keuzes van de ander pas in het voorstel."
- Vak: "**Mijn beschikbare tijd** voor gezin en hobby [__] u per week"
- Hint bij het vak: "Een ruwe schatting volstaat. Je past het aan als het leven verandert."
- Voortgang: "Jan {x}/{n}" · "Sandra {x}/{n}", met " · tijd?" erbij als de beschikbare tijd ontbreekt
- Per kaart: "Hoe graag doe je dit?" (keuzes "Wil ik" · "Mag" · "Liever niet" · "Echt niet") · "Fysieke tijd" · "Mentale last". Later met " · {ander}: {score}" erbij
- Wachten: "Klaar! Even wachten op {ander}."
- Later aangepast: "Jullie zijn al verder. Pas je hier iets aan, dan past het voorstel zich meteen aan."
- Knop: "Verder naar bieden"

### Stap 3
- Titel: "Stap 3 · Wat jullie allebei graag doen"
- Zonder botsing: "Bieden is alleen nodig voor kaarten die jullie allebei willen." · "Geen enkele botsing: elke kaart die iemand graag doet, heeft al een thuis." · "Naar het voorstel"
- Met botsing: "Jullie willen deze {kaart / n kaarten} allebei graag, dat is goed nieuws. Verdeel je 100 punten naar hoe graag je elke kaart wilt; wie het liefst wil, krijgt de kaart. Nipte verschillen kunnen jullie in het voorstel nog samen bijsturen."
- Budget: "Nog {x} punten" · "{y} van 100 verdeeld"
- Hint bij één kaart: "Met één kaart geven jullie allicht allebei alles; dan beslist de weegschaal."
- Schuifbalk: "Hoe graag wil je deze?"
- Status: "Jan klaar" / "Jan bezig" · "Sandra klaar" / "Sandra bezig"
- Knoppen: "Ik ben klaar" / "Toch nog aanpassen" · "Naar het voorstel"
- Wachten: "Even wachten op {ander}."

### Stap 4
- Titel: "Stap 4 · Voorstel en samen bijsturen"
- Uitleg: "Eerst gaat elke kaart naar wie ze graag doet, dan naar wie ze het liefst wou, en de rest zo dat de weegschaal in evenwicht komt. Kaarten die niemand graag doet, tellen 1,5 keer. Verschuif samen tot het voor jullie allebei goed voelt."
- Feestelijke melding: "{n} kaarten vonden vanzelf een thuis bij iemand die ze graag doet of ze niet erg vindt."
- Redenen: zie §6 (R1–R5b). Na een verschuiving: "Samen verschoven"
- Vaste kaarten: "Vast afgesproken" · "Eigen tijd, telt mee in je uren"
- Secties: "Uitbesteed" · "Samen", met de hint "Doen jullie samen, telt niet mee in de weegschaal."
- Knoppen: "Naar {ander}" · "Uitbesteden" · "Terughalen" · "Terug naar het voorstel" · "Dit voelt goed voor mij" / "Toch nog niet" · "Verdeling vastleggen"
- Status: "{n} kaart(en) samen verschoven" · "Jan voelt zich hier goed bij" / "Jan nog niet"
- Wachten: "Het voorstel verschijnt zodra jullie allebei klaar zijn met bieden."

### Stap 5
- Titel: "Stap 5 · Wie heeft wat"
- Uitleg: "Owner zijn betekent de hele cyclus: opmerken, plannen en doen, tot het goed genoeg is. Geef elkaar een paar weken om erin te groeien zonder bij te sturen. Lukt het even niet, door ziekte of een drukke periode, leen een kaart dan tijdelijk uit."
- Labels: "Vast" · "Eigen tijd" · "Tijdelijk bij {ander}" · "Goed genoeg: {tekst}"
- Knoppen: "Tijdelijk uitlenen" / "Terugnemen" · "Doorgeven aan {ander}" · "Nieuwe ronde starten"
- Ritme: "Elk kwartaal opnieuw bekijken, of bij een grote wissel zoals de start van de bouw, de verhuis of Finn naar school."
- Hint bij een nieuwe ronde: "Jullie inschattingen en beschikbare tijd blijven staan; claims en biedingen beginnen opnieuw."

---

## 12. Open vragen

Antwoord met ja/nee of een korte keuze.

**Gebruikers en menu**
- **OV1** Krijgt Sandra een rol waarmee ze in deze module exact hetzelfde mag als Jan? *(ja/nee)*
- **OV2** Mag enkel Jan als beheerder "Alles resetten"? *(ja/nee)*
- **OV3** Moet er ooit iemand anders meekijken (bv. een coach of grootouder), ook al is het enkel lezen? *(ja/nee)*
- **OV4** Icoon voor Huishouden: "huis"? *(ja / ander woord)*
- **OV5** Adres van de pagina: `/huishouden/eerlijk`? *(ja / ander adres)*
- **OV6** Opent `/huishouden` meteen "Eerlijk is eerlijk"? *(ja / een overzichtspagina van Huishouden)*
- **OV7** Moet de bekeken stap in het adres staan, zodat je een link naar een stap kunt delen? *(ja/nee)*

**Lijst en invullen**
- **OV8** Gaan de 17 huidige kaarten (bijlage A) mee als startlijst? *(ja/nee)*
- **OV9** Als jullie tegelijk dezelfde kaart aanpassen: mag de laatste bewaring winnen? *(ja / waarschuwen)*
- **OV10** Moet je een gekozen claim of score weer leeg kunnen maken? *(ja/nee)*
- **OV11** Moet een gewijzigde inschatting of claim na stap 2 de "voelt goed" van allebei wissen? *(ja/nee)*

**Verdeling en rondes**
- **OV12** Telt een uitgeleende kaart in de weegschaal bij wie ze tijdelijk heeft, in plaats van bij de owner? *(ja/nee)*
- **OV13** Moeten het begin en het vastleggen van een ronde een datum krijgen? *(ja/nee)*
- **OV14** Moet een vorige ronde bewaard blijven als geschiedenis, om terug te kijken? *(ja/nee)*
- **OV15** Zo ja: alleen de vastgelegde verdeling, of ook de claims en biedingen? *(verdeling / alles)*
- **OV16** Bij een gelijke stand in het evenwicht gaat de kaart naar Jan. Liever afwisselen? *(Jan / afwisselen)*
- **OV17** Moet er iets gebeuren als één persoon lang niet invult? *(ja/nee; zie OV20)*
- **OV18** Mag het voorstel pas berekend worden als beide beschikbare tijden ingevuld zijn? *(ja/nee)*

**Meldingen (Telegram, bot Huishouden)**
- **OV19** Melding aan de ander als de lijst gewijzigd is of klaar is voor akkoord? *(ja/nee)*
- **OV20** Melding aan de ander als iemand klaar is met inschatten of bieden? *(ja/nee)*
- **OV21** Melding aan allebei als het voorstel klaarstaat? *(ja/nee)*
- **OV22** Melding aan allebei als de verdeling is vastgelegd? *(ja/nee)*
- **OV23** Automatische herinnering voor een nieuwe ronde na een kwartaal? *(ja/nee; zo ja: na 13 weken?)*
- **OV24** Melding aan de ander bij uitlenen of doorgeven? *(ja/nee)*
- **OV25** Moet je via de bot iets kunnen doen, bv. "akkoord" of "klaar"? *(ja/nee)*

**Koppelingen en teksten**
- **OV26** Koppeling met de agenda (hobbyblokken, kwartaalherinnering)? *(ja/nee)*
- **OV27** Koppeling met Opvang voor de kaarten over de kinderen? *(ja/nee)*
- **OV28** Koppeling met Vastgoed voor de verhuur- en bouwkaarten? *(ja/nee)*
- **OV29** Blijft de paginatitel "Werkstromen", of wordt het "Eerlijk is eerlijk"? *(Werkstromen / Eerlijk is eerlijk)*
- **OV30** Laadtekst "De lijst wordt geladen.", zonder animatie? *(ja / andere tekst of een laadanimatie)*

---

## 13. Uit het prototype: niet meebouwen

- **Wisselen tussen personen** ("Ik ben Jan / Sandra"), en de tekst "Kies bovenaan wie je bent." De login bepaalt wie je bent.
- **De voorbeeldmodus:** latere stappen bekijken met de gele balk "Voorbeeld", de knoppen "Toon met onze echte keuzes", "Toon met voorbeeldkeuzes" en "Terug naar waar we zijn", en de verzonnen keuzes. Latere stappen zijn in de module niet klikbaar.
- **Testgegevens:** de verzonnen inschattingen, claims en biedingen in het prototype en in de schermafbeeldingen.
- **Teksten die met de testomgeving te maken hebben:** "Niet verbonden: open de pagina ingelogd op claude.ai.", "Open de pagina ingelogd op claude.ai om te spelen.", en foutcodes tussen haakjes in de bewaarmeldingen.
- **Technische noodoplossingen** in de browser: een reservekopie in localStorage en tikken bundelen per 1,5 seconde. Wat ervan overblijft, is enkel de eis: geen enkele tik mag verloren gaan of terugspringen.
- **Verworpen ontwerpen, die nergens meer mogen opduiken:**
  - de zin-score van 1 tot 5;
  - om beurten draften;
  - de stap "Restkaarten" met afwisselen, compenseren of uitbesteden als aparte keuze;
  - "ik verdeel, jij kiest";
  - bieden om te ontlopen;
  - zes aparte bouwkaarten;
  - "Dagelijkse zorg kinderen" verplicht als gedeelde kaart;
  - groepering per domein;
  - de stapnaam "Deck".
- **Het tweede prototype "Claimen en bieden"** is volledig opgegaan in dit prototype.

---

## Bijlage A: de huidige kaarten

| # | Titel | Domein | Frequentie | Verdeling | Omschrijving |
|---|---|---|---|---|---|
| 1 | Dagelijkse zorg kinderen | Kinderen | Dagelijks | via het spel | Brengen en halen, eten, bad en slapen, kleren en luiers |
| 2 | Organisatie kinderen | Kinderen | Wekelijks | via het spel | Kinderopvang en later schoolkeuze, dokter en Kind en Gezin, vaccinaties, babysit en grootouders |
| 3 | Hond dagelijks | Hond | Dagelijks | via het spel | Wandelingen, eten, uitdaging voor de herder |
| 4 | Training en zorg hond | Hond | Maandelijks | via het spel | Training, dierenarts, opvang tijdens vakantie |
| 5 | Maaltijden | Huishouden | Dagelijks | via het spel | Weekmenu, boodschappen, koken |
| 6 | Poetsen | Huishouden | Wekelijks | via het spel | Wekelijkse poets, opruimen |
| 7 | Was | Huishouden | Wekelijks | via het spel | Wassen, drogen, plooien, wegleggen |
| 8 | Eigen woning | Woning en verhuur | Maandelijks | via het spel | Onderhoud, herstellingen, tuin |
| 9 | Verhuur pand Jan | Woning en verhuur | Maandelijks | vast bij Jan | Huurders, contracten, onderhoud, inning, aangifte |
| 10 | Verhuur pand Sandra | Woning en verhuur | Maandelijks | vast bij Sandra | Huurders, contracten, onderhoud, inning, aangifte |
| 11 | Bouwproject | Bouwproject | Project | vast bij Sandra (ontwerpfase), daarna doorgeven aan Jan (bouwfase) | Ontwerp, financiering, vergunning, aannemers, werf en technieken, huidige woning en verhuis |
| 12 | Gezinsfinanciën en papierwerk | Administratie en planning | Maandelijks | via het spel | Budget, facturen, belastingen, verzekeringen |
| 13 | Auto's en mobiliteit | Administratie en planning | Per kwartaal | via het spel | Onderhoud, keuring, banden |
| 14 | Gezinsagenda en vakanties | Administratie en planning | Wekelijks | via het spel | Weekplanning, weekends, vakanties boeken |
| 15 | Familie en sociaal | Administratie en planning | Maandelijks | via het spel | Verjaardagen, cadeaus, contact met (schoon)familie |
| 16 | Tijd samen | Wij | Wekelijks | via het spel | Avonden samen plannen, opvang regelen |
| 17 | Hobbytijd | Wij | Wekelijks | elk voor zich, vaste uren 5 | Elk 4 tot 6 uur per week in 1 tot 3 blokken, gerekend als 5 uur. De ander vangt kinderen en hond op. |

Geen enkele kaart heeft al een "goed genoeg" ingevuld.
