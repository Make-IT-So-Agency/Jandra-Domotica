# Huishouden

De werkstromen van ons gezin, eerlijk verdeeld tussen Jan en Sandra. In de
webapp onder **Huishouden**, op `/huishouden`. De eerste pagina is **De
balans**, op `/huishouden/balans`.

De balans komt uit het prototype "Eerlijk is eerlijk". Wat de module doet en
waarom, staat in [OVERDRACHT.md](OVERDRACHT.md). De stijl staat in
[docs/STIJLGIDS.md](../docs/STIJLGIDS.md). Hieronder: wat er al gebouwd is,
waar het staat, en de antwoorden op de open vragen uit de overdracht.

## Wie het ziet

Enkel wie gekoppeld is aan **Jan** of **Sandra**. Dat kiest de hoofdbeheerder
op de pagina **Gebruikers**, in de kolom Huishouden. Die koppeling staat los
van de rol bij Laadpalen. Elke persoon hoort bij hoogstens één gebruiker.

Wie nog geen gebruiker is, voeg je eerst toe met een rol, en koppel je
daarna. Een vaste beheerder (uit `TOEGELATEN_EMAILS`) meldt zich eerst één
keer aan, zodat er een rij is om te koppelen.

## Wat er al werkt

De module komt er stap voor stap bij, in de volgorde van de overdracht (§9).

| Bouwstap | Wat | Stand |
| --- | --- | --- |
| 1 | De gedeelde lijst (stap 1): kaarten toevoegen, aanpassen, schrappen en verwijderen, en het akkoord van allebei | **klaar** |
| 2 | Inschatten en claimen (stap 2), met de beschikbare tijd, en "Alles resetten" | **klaar** |
| 3 | Voorstel en vastleggen (stap 4 en 5), zonder bieden | **klaar** |
| 4 | Bieden (stap 3) | nog niet |
| 5 | Uitlenen, doorgeven, nieuwe ronde en alles resetten | nog niet |

Welke stappen er al zijn, staat in `GEBOUWDE_FASES` in
`web/lib/huishouden/balans.ts`. Je kan nooit naar een stap die er nog niet
is. Zolang bieden (stap 3) er niet is, gaat het na stap 2 meteen naar het
voorstel, en gaan kaarten die jullie allebei met "Wil ik" claimen naar het
evenwicht (R2b). Ligt de lijst vast en wil je ze toch nog aanpassen,
dan brengt **Alles resetten** onderaan elke stap jullie terug naar stap 1
(de kaarten blijven). "Nieuwe ronde starten" komt met bouwstap 5.

## Waar alles staat

| Wat | Waar |
| --- | --- |
| De tabellen | `supabase/migrations/20261106100000_huishouden.sql`: `huishouden_kaarten`, `huishouden_rondes`, `huishouden_akkoorden`, en `app_users.huishouden_persoon`. `20261106120000_huishouden_inschatten.sql`: `huishouden_inschattingen` (tijd en last, over rondes heen), `huishouden_claims` (per ronde) en `huishouden_tijd`. `20261106140000_huishouden_voorstel.sql`: `huishouden_verschuivingen`, `huishouden_verdeling` (de vastgelegde eigenaars) en `voorstel_versie` op de ronde |
| De regels, zonder databank | `web/lib/huishouden/balans.ts`, getest in `web/tests/huishouden-balans.test.ts` |
| Het voorstel en de weegschaal (R1 tot R16) | `web/lib/huishouden/voorstel.ts`, getest in `web/tests/huishouden-voorstel.test.ts`, met het volledige voorbeeld uit de overdracht |
| Lezen en bewaren | `web/lib/huishouden/opslag.ts` |
| De pagina | `web/app/huishouden/balans/`: `page.tsx` leest en rekent het voorstel uit, `balans.tsx` toont de stappen, `stap-lijst.tsx`, `stap-inschatten.tsx`, `stap-voorstel.tsx` en `stap-verdeling.tsx` elk één stap, `weegschaal.tsx` het zijpaneel, `acties.ts` bewaart |
| De opmaak | onderaan `web/app/globals.css`, onder "Huishouden: De balans" |

## Hoe het samenwerkt

- **Live.** Jan en Sandra werken elk op een eigen toestel, tegelijk. De
  pagina haalt om de vijf seconden op wat er nieuw is, en meteen als je
  ernaar terugkeert. Wat je aan het typen bent, blijft staan.
- **Akkoorden per persoon.** Elk akkoord is een eigen rij, dus de een kan nooit
  het akkoord van de ander overschrijven. Een akkoord slaat op de versie van
  de lijst die je zag (`lijst_versie` van de ronde). Elke wijziging aan de
  lijst zet een nieuwe versie, en daarmee telt het akkoord van allebei niet
  meer. Geef je akkoord op een lijst die net gewijzigd werd, dan weigert de
  app en vraagt ze om de lijst na te kijken.
- **Rondes.** De eerste ronde zet de migratie klaar. De ronde met het hoogste
  nummer is de huidige.
- **Blind in stap 2.** De pagina krijgt van de server enkel je eigen keuzes en
  de voortgang van allebei ("Sandra 5/12"). De scores van de ander komen pas
  mee als jullie verder zijn dan stap 2; de claims van de ander nooit, die
  verschijnen pas in het voorstel als reden bij een kaart.
- **Het voorstel wordt niet bewaard.** Het wordt telkens uitgerekend uit de
  kaarten, inschattingen, claims, beschikbare tijd en verschuivingen. Pas
  bij "Verdeling vastleggen" komen de eigenaars van de kaarten via het spel
  in `huishouden_verdeling`. In stap 5 rekenen de uren en de mentale last mee
  met de inschattingen van nu, maar de eigenaars veranderen niet meer.
- **"Dit voelt goed voor mij"** slaat, net als het akkoord met de lijst, op de
  versie van het voorstel die je zag (`voorstel_versie`). Een verschuiving,
  of een gewijzigde claim, inschatting of beschikbare tijd terwijl jullie in
  het voorstel zitten, zet een nieuwe versie en wist zo "voelt goed" van
  allebei (R15, OV11).
- **Geen tik verloren.** Elke tik in stap 2 wordt apart bewaard, in de
  volgorde waarin je tikte, en tijd en last apart, zodat ze elkaar niet
  overschrijven. Tot de server een tik bevestigt, toont de kaart je laatste
  keuze. Mislukt het bewaren, dan springt de kaart terug naar wat er echt
  bewaard is en zegt de melding onderaan dat het niet lukte.

## Antwoorden op de open vragen

Uit de overdracht, §12, beantwoord door Jan op 5 en 6 november 2026.

| Vraag | Antwoord |
| --- | --- |
| OV1 Sandra krijgt dezelfde rechten als Jan | Ja, via de koppeling bij Gebruikers, los van haar rol |
| OV2 Enkel Jan mag alles resetten | Nee, allebei |
| OV3 Iemand anders kijkt mee | Nee |
| OV4 Icoon | Mand (het huisje is van Vastgoed) |
| OV5 Adres | `/huishouden/balans`, want de pagina heet De balans (OV29) |
| OV6 `/huishouden` opent De balans | Ja |
| OV7 Stap in het adres | Nee |
| OV8 De 17 kaarten als startlijst | **Nee, de lijst start leeg** |
| OV9 Tegelijk dezelfde kaart aanpassen | De laatste bewaring wint |
| OV10 Een claim of score leegmaken | Nee |
| OV11 Gewijzigde inschatting of claim na stap 2 wist "voelt goed" | Ja, van allebei |
| OV12 Uitgeleende kaart in de weegschaal | Blijft bij de owner |
| OV13 Datums voor een ronde | Ja |
| OV14 / OV15 Geschiedenis | Ja, enkel de vastgelegde verdeling |
| OV16 Gelijke stand in het evenwicht | Afwisselen |
| OV17 Iemand vult lang niet in | Niets |
| OV18 Voorstel pas met beide beschikbare tijden | Ja |
| OV19–OV25 Telegram | **Nee, geen meldingen en geen bot** |
| OV26–OV28 Koppelingen | Nee |
| OV29 Paginatitel | **De balans** |
| OV30 Laadtekst | "De lijst wordt geladen.", zonder animatie |

## Wat afwijkt van de overdracht

- **Vaste uren in de dialoog.** De overdracht kent kaarten "elk voor zich met
  vaste uren", zoals hobbytijd, maar de dialoog had daar geen veld voor. Kies
  je "Elk voor zich", dan verschijnt het veld "Vaste uren per week, voor elk".
- **Akkoord op een lege lijst** kan niet: de knop staat uit tot er een kaart is.
- **Kaarten zonder iets om in te vullen** (samen, of elk voor zich met vaste
  uren) staan niet in stap 2.
- **Op de gsm** staan de kaarten in stap 2 onder elkaar in plaats van in twee
  kolommen: vijf bolletjes passen niet in een halve gsm-breedte.
- **Een gelijke stand in het evenwicht** gaat om beurten naar Jan en
  Sandra, te beginnen bij Jan (OV16), binnen één berekening van het voorstel.
- **Uitbesteden** kan enkel bij kaarten die niemand graag doet (die ×1,5
  tellen), zoals in de overdracht.
- **Stap 5** toont de verdeling, de uren, de mentale last en "goed genoeg".
  Uitlenen, doorgeven en "Nieuwe ronde starten" komen met bouwstap 5; tot
  dan brengt Alles resetten jullie terug naar stap 1.
- **Mentale last 2 tot 4** hebben geen omschrijving: de overdracht geeft er
  enkel voor 1 (nauwelijks) en 5 (zit er constant).
