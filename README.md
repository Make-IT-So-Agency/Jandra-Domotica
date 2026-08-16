# Laadkosten

[![CI](https://github.com/janfestjens/Jandra---Domotica/actions/workflows/ci.yml/badge.svg)](https://github.com/janfestjens/Jandra---Domotica/actions/workflows/ci.yml)
[![Validatie](https://github.com/janfestjens/Jandra---Domotica/actions/workflows/validatie.yml/badge.svg)](https://github.com/janfestjens/Jandra---Domotica/actions/workflows/validatie.yml)

Overzicht en rapportage van de laadkosten van thuisladen, per vennootschap.

Home Assistant leest de laadsessies uit evcc en stuurt ze naar een webapp op
Vercel. Daar reken je ze met één klik door aan het geldende maximumtarief en
krijg je per vennootschap een PDF en een Excel om de terugbetaling mee te
staven.

## Wat het doet

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

## Wat je maandelijks moet doen

Openen, kiezen, downloaden. Zie [docs/GEBRUIK.md](docs/GEBRUIK.md) — dat is
één schermpje werk.

## Installeren

De draaiende omgeving staat beschreven in deze repository en wordt toegepast
door GitHub Actions. Je maakt eenmalig de accounts aan, zet de secrets klaar in
de omgeving `productie`, en start twee workflows: **Databankmigraties** en
**Productie uitrollen**.

Stap voor stap in [docs/INSTALLATIE.md](docs/INSTALLATIE.md). Reken op een
uurtje, waarvan het Google-luik voor het inloggen het enige echte klikwerk is.

## Wat waar staat

| Map | Wat het is |
| --- | --- |
| `custom_components/laadkosten/` | De Home Assistant-integratie (installeren via HACS) |
| `web/` | De webapp voor Vercel |
| `supabase/migrations/` | Het databankschema, in volgorde van tijdstempel |
| `infra/vercel-omgeving.json` | Welke omgevingsvariabelen het Vercel-project hoort te hebben |
| `scripts/` | Migraties testen, variabelen gelijkzetten, vragen aan de databank |
| `docs/` | Installatiegids, maandelijkse routine en achtergrond |

## Voor wie later aan de code komt

- Achtergrond en keuzes: [docs/ARCHITECTUUR.md](docs/ARCHITECTUUR.md)
- Uitrollen, en waarom de volgorde uitmaakt: [docs/UITROL.md](docs/UITROL.md)
- Toegang instellen zodat er zo weinig mogelijk handwerk overblijft:
  [docs/AUTONOMIE.md](docs/AUTONOMIE.md)
- Tests draaien:
  ```bash
  python3 -m pytest tests/          # de Home Assistant-integratie
  cd web && npm test                # de webapp
  ```
