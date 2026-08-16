# Vragen aan de databank

Elk bestand hier is een SQL-vraag die je kan draaien via
**Actions → SQL uitvoeren**, met het pad als invoer.

Waarom het via een bestand in de repository gaat en niet als vrije invoer: zo
staat er in de geschiedenis wat er gedraaid heeft en wanneer. Als een cijfer
achteraf niet blijkt te kloppen, valt er iets na te kijken.

De schakelaar **alleen lezen** staat standaard aan en verpakt de inhoud in een
read-only transactie. Zet hem enkel uit voor een bewuste eenmalige ingreep.
Blijvende wijzigingen aan het schema horen in `supabase/migrations/`, niet hier.

| Bestand | Waarvoor |
| --- | --- |
| `inspecteer-koppeling.sql` | Komt er data binnen uit Home Assistant? |
| `inspecteer-sessies.sql` | De laatste sessies, met de reden waarom een sessie niet meetelt |
| `inspecteer-tarieven.sql` | Welke kwartaaltarieven er zijn en of ze bevestigd zijn |
