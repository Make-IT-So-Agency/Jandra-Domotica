# Afspraken voor Claude in deze repository

Jan schrijft Nederlands. Antwoorden, commits, documentatie en teksten in de app
zijn ook in het Nederlands. Wat elke module doet en waar alles staat, lees je
in `README.md` en in de `LEESMIJ.md` van de module (`bouw/LEESMIJ.md` voor
Bouw).

## De repository is publiek

- **Niets uit ons privéleven in de repository:**
  - geen adres of straatnaam;
  - geen namen van mensen, van de architect, de aannemers of de leveranciers;
  - geen telefoonnummer, e-mailadres of prijs uit een offerte;
  - geen plannen, foto's, renders of facturen.

  Dat geldt voor code, tests, testgegevens, commits, PR's, logs en alles wat
  GitHub Actions toont.
- **Geen echte ligging:** geen Lambert-coördinaten of perceelnummers. Diensten
  voor de ligging test je enkel met een publieke plaats.
- **Een huis heet zijn nummer** in URL's en logs. SQL in GitHub Actions toont
  enkel id's, soorten, aantallen en ja of nee.
- **De bestanden van Jan** (het dossier van de architect, plannen, renders,
  bestelbonnen, schermafdrukken) bekijk je enkel in de scratchpad. Wis ze,
  samen met wat je eruit haalde, zodra het werk klaar is.
- **Vóór elke commit:** `git add -A && scripts/controleer-privacy.sh`.
  - Het script zoekt de woorden uit de omgevingsvariabele `PRIVE_WOORDEN`
    (die woorden staan zelf nooit in de repository), een Telegram-token, een
    sleutel en een modelnaam.
  - Is `PRIVE_WOORDEN` niet ingesteld, commit dan niet en vraag het aan Jan.

## Werkwijze

- **Geen PR zonder dat Jan erom vraagt**, en niet mergen zonder zijn akkoord.
  Mergen gebeurt met squash, met het nummer van de PR in de titel.
- **Commits in het Nederlands**, met de vaste regels die de sessie meegeeft.
  Geen modelnaam in commits, PR's of code.
- **Opvang** (`opvang/`, `web/lib/opvang/` en de workflows `opvang-*`): niets
  aan veranderen, tenzij Jan het vraagt.
- **Nooit prettier draaien** op de repository.
- **Geen opslag bij derden.** Bestanden staan in Supabase Storage, zoals de
  afspraken in `README.md` zeggen.
- **Nakijken vóór een push**, in `web/`:
  - `npx tsc --noEmit -p .`;
  - `npx vitest run`;
  - `npm run build`;
  - bij een migratie ook `bash scripts/test-migraties.sh`.

  Draai `next dev` nooit tegelijk met een build.
- **Uitrollen** volgens `docs/UITROL.md`:
  1. Heeft de nieuwe code een migratie nodig, zet die dan eerst op productie:
     Actions → Databankmigraties, vanaf de branch, met de bevestiging
     `productie`.
  2. Merge daarna de PR.
  3. Volg de uitrol en de fouten in Vercel.
- **Documentatie:** werk bij elke functie `bouw/LEESMIJ.md` bij, ook de
  checklist onderaan.
