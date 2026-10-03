# Jandra-Domotica

[![CI](https://github.com/Make-IT-So-Agency/Jandra-Domotica/actions/workflows/ci.yml/badge.svg)](https://github.com/Make-IT-So-Agency/Jandra-Domotica/actions/workflows/ci.yml)
[![Validatie](https://github.com/Make-IT-So-Agency/Jandra-Domotica/actions/workflows/validatie.yml/badge.svg)](https://github.com/Make-IT-So-Agency/Jandra-Domotica/actions/workflows/validatie.yml)

Automatisering voor ons gezin. Alles draait in één omgeving: de code in deze
repository, één webapp op Vercel, één databank in Supabase, en GitHub Actions
voor wat lang loopt of een browser nodig heeft. Elke functie is een module
met haar eigen stukje in elk van die lagen en haar eigen tests.

## Modules

| Module | Wat het doet | Waar het draait | Map |
| --- | --- | --- | --- |
| **Laadkosten** | Laadsessies uit evcc doorrekenen en per vennootschap rapporteren | Home Assistant, Vercel, Supabase | `custom_components/laadkosten/`, `web/`, `supabase/` |
| **Opvang** | Buitenschoolse opvang aanduiden in Telegram en automatisch reserveren in i-Active | Vercel, Supabase, GitHub Actions | [`opvang/`](opvang/LEESMIJ.md), `web/lib/opvang/` |
| **Bouw** | Ons vastgoed, per huis: de plannen van de architect met hun versies, omgezet naar ruimtes per verdieping, de punten voor de elektricien met hun wensenlijst, de keuzes en de planning, het huis in 3D, het geld, de werf, het woningdossier met garanties en onderhoud, een eigen Telegram-bot voor alle huizen, en een persoonlijke link voor de architect en de aannemers | Vercel, Supabase met Storage | [`bouw/`](bouw/LEESMIJ.md), `web/lib/bouw/`, `web/app/vastgoed/` |

### Afspraken voor een nieuwe module

- **Eén `LEESMIJ.md` per module** in een eigen map in de root, die zegt wat
  het doet, waar elk stuk staat en wat er nog met de hand moet.
- **Geen nieuw platform** zonder goede reden. Schermen en webhooks horen in
  `web/`, onder `web/lib/<module>/` en `web/app/...`. Gegevens horen in
  Supabase, via een migratie in `supabase/migrations/`, met de naam van de
  module voor de tabel. Wat lang loopt of een browser nodig heeft, wordt een
  workflow in GitHub Actions.
- **Geen sleutels in de code of in de repository.** Elk geheim staat bij
  GitHub, in de omgeving `productie`, en wordt van daaruit naar Vercel gezet
  (zie `infra/vercel-omgeving.json`). Eén uitzondering: het token van de bot
  van Bouw vul je in de app in, zodat je hem kan koppelen zonder de app te
  verlaten. Het staat versleuteld in de databank, met een sleutel uit
  `AUTH_SECRET` (zie [`bouw/LEESMIJ.md`](bouw/LEESMIJ.md)).
- **Bestanden in een privé-bucket per module** in Supabase Storage, met een
  UUID als pad en nooit de oorspronkelijke naam. De browser laadt ze op en
  bekijkt ze via een ondertekende URL, rechtstreeks bij Storage: een functie
  op Vercel laat maar ongeveer 4,5 MB per aanvraag door.
- **Telegram voor meldingen en vragen aan het gezin, met één bot per module**
  die meldingen stuurt. Zo lopen de berichten van de modules nooit door
  elkaar. Opvang_bot is de eerste. Geef een bot een neutrale naam: een
  botnaam is in Telegram voor iedereen te vinden.

De CI-badge hierboven dekt alle modules. De mappen `custom_components/` en
`hacs.json` blijven in de root staan: HACS verwacht ze daar.

## Laadkosten

Overzicht en rapportage van de laadkosten van thuisladen, per vennootschap.

Home Assistant leest de laadsessies uit evcc en stuurt ze naar een webapp op
Vercel. Daar reken je ze met één klik door aan het geldende maximumtarief en
krijg je per vennootschap een PDF en een Excel om de terugbetaling mee te
staven.

### Wat het doet

- **Alle sessies uit evcc**, ook die van vóór de installatie: evcc houdt zijn
  eigen sessiedatabank bij, en die wordt volledig ingelezen.
- **Toewijzing per laadpaal.** Elke laadpaal hangt aan één vennootschap; alles
  wat erop geladen wordt, komt op het rapport van die vennootschap.
- **Kwartaaltarief.** Het maximumbedrag per kWh voor terugbetaling van
  thuisladen wijzigt elk kwartaal. De app zoekt het zelf op, maar rekent er pas
  mee nadat jij het bevestigd hebt.
- **Btw apart**, en **meterstanden** als controlegetal naast de optelling van
  de sessies.
- **Maand of kwartaal**, op afroep of automatisch bij het einde van de periode.
- **Toegang per vennootschap.** Elke vennootschap kan haar eigen mensen en
  boekhouder uitnodigen, en ziet daarbij enkel haar eigen cijfers. Jij houdt
  het overzicht over alles.

### Wat je maandelijks moet doen

Openen, kiezen, downloaden. Zie [docs/GEBRUIK.md](docs/GEBRUIK.md) — dat is
één schermpje werk.

### Installeren

De draaiende omgeving staat beschreven in deze repository en wordt toegepast
door GitHub Actions. Je maakt eenmalig de accounts aan, zet de secrets klaar in
de omgeving `productie`, en start twee workflows: **Databankmigraties** en
**Productie uitrollen**.

Stap voor stap in [docs/INSTALLATIE.md](docs/INSTALLATIE.md). Reken op een
uurtje, waarvan het Google-luik voor het inloggen het enige echte klikwerk is.

### Wat waar staat

| Map | Wat het is |
| --- | --- |
| `custom_components/laadkosten/` | De Home Assistant-integratie (installeren via HACS) |
| `web/` | De webapp voor Vercel |
| `supabase/migrations/` | Het databankschema, in volgorde van tijdstempel |
| `infra/vercel-omgeving.json` | Welke omgevingsvariabelen het Vercel-project hoort te hebben |
| `scripts/` | Migraties testen, variabelen gelijkzetten, vragen aan de databank |
| `docs/` | Installatiegids, maandelijkse routine en achtergrond |

### Voor wie later aan de code komt

- Achtergrond en keuzes: [docs/ARCHITECTUUR.md](docs/ARCHITECTUUR.md)
- Uitrollen, en waarom de volgorde uitmaakt: [docs/UITROL.md](docs/UITROL.md)
- Toegang instellen zodat er zo weinig mogelijk handwerk overblijft:
  [docs/AUTONOMIE.md](docs/AUTONOMIE.md)
- Tests draaien:
  ```bash
  python3 -m pytest tests/          # de Home Assistant-integratie
  cd web && npm test                # de webapp
  ```
