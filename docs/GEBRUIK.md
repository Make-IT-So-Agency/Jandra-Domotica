# Het maandelijkse werk

Dit is alles wat er terugkerend te doen valt. Twee minuten, geen technische
kennis nodig.

## Een rapport maken

1. Ga naar je app en log in met Google.
2. Kijk of het beginscherm groen meldt dat alles klaarstaat. Zo niet, staat er
   letterlijk bij wat er nog moet gebeuren en een knop die je erheen brengt.
3. Klik op **Rapporten**.
4. Kies de vennootschap, kies **Maand** of **Kwartaal**, en de juiste periode.
5. Klik **Voorbeeld tonen**. Je ziet meteen elke sessie, het tarief en het
   totaal.
6. Klopt het? Klik **Rapport bewaren**.
7. Het rapport verschijnt onderaan in de lijst, met knoppen **PDF** en
   **Excel**.
8. Herhaal voor de tweede vennootschap.

De PDF is het stuk dat je bij je onkostennota voegt. De Excel is handig als je
boekhouder met de cijfers wil rekenen.

## Eén keer per kwartaal: het tarief bevestigen

Het maximumbedrag per kWh wijzigt elk kwartaal. De app zoekt het elke dag
automatisch op, maar rekent er bewust pas mee nadat jij het gezien hebt.

Zodra er een nieuw bedrag gevonden is, staat er op het beginscherm:
*"Het tarief voor Q3 2026 is automatisch gevonden en wacht op je bevestiging."*

1. Klik op die melding.
2. Je ziet het gevonden bedrag én de zin waaruit het gehaald is.
3. Klopt het? Klik **Bevestigen**. Klaar.
4. Klopt het niet, of is er niets gevonden? Vul het onderaan die pagina zelf
   in en klik **Bewaren en bevestigen**.

Zonder bevestigd tarief maakt de app geen rapport. Dat is opzet: liever een
melding dan een factuur met een verkeerd cijfer.

## Wat de app zelf doet

- **Elk halfuur**: Home Assistant stuurt nieuwe laadsessies door.
- **Elke dag**: de app kijkt of het tarief van het lopende kwartaal al
  gepubliceerd is.
- **Op de eerste van de maand**: de app maakt zelf het rapport van de
  afgelopen maand voor elke vennootschap, en bij de start van een nieuw
  kwartaal ook dat van het afgelopen kwartaal. Je vindt ze gewoon in de lijst
  bij Rapporten.

Ontbreekt er iets — een niet-gekoppelde laadpaal, een onbevestigd tarief — dan
slaat de automatische taak dat rapport over en blijft de melding op het
beginscherm staan tot je het regelt.

## Meldingen die je kan tegenkomen

**"X sessie(s) horen bij een laadpaal die nog nergens aan gekoppeld is"**
Er is een nieuwe laadpaal in evcc bijgekomen, of er is er een hernoemd. Ga naar
**Laadpalen** en koppel hem aan de juiste vennootschap. Die sessies staan tot
zolang op geen enkel rapport.

**"Bij Garage verschilt de meterstand 3,4 kWh van de optelling van de sessies"**
De teller van de laadpaal is meer gestegen dan wat evcc als sessies
geregistreerd heeft. Meestal betekent dat: er is geladen zonder dat evcc
meekeek. Het rapport blijft gewoon bruikbaar; het is een signaal, geen fout.

**"N sessie(s) niet meegeteld"**
Klik erop om te zien waarom. Doorgaans gaat het om een sessie die nog liep op
het moment van synchroniseren, of eentje zonder geregistreerd verbruik.

## Een rapport verwijderen

Kan, met de knop **Verwijderen** in de lijst. Doe dat enkel bij een vergissing:
een bewaard rapport is je bewijsstuk, en de nummering loopt door.

Wat je gerust mag doen: een tarief achteraf corrigeren. Rapporten die al
bewaard zijn, veranderen daar niet door — die bevatten een momentopname van de
cijfers zoals ze waren. Wil je een gecorrigeerd rapport, maak dan een nieuw
rapport voor dezelfde periode.
