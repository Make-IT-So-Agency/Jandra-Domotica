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

Eenmalig werk. Het snelst gaat het met het installatiescript:

```bash
bash scripts/installeer.sh
```

Dat regelt de sleutels, de databank, de hosting en de uitrol. Enkel het
Google-luik voor het inloggen blijft klikwerk in je eigen account; het script
zegt op het einde precies wat je waar moet invullen.

Liever stap voor stap, of loopt er iets mis? Zie
[docs/INSTALLATIE.md](docs/INSTALLATIE.md).

## Wat waar staat

| Map | Wat het is |
| --- | --- |
| `custom_components/laadkosten/` | De Home Assistant-integratie (installeren via HACS) |
| `web/` | De webapp voor Vercel |
| `web/supabase/schema.sql` | De databanktabellen, één keer uit te voeren |
| `docs/` | Installatiegids, maandelijkse routine en achtergrond |

## Voor wie later aan de code komt

- Achtergrond en keuzes: [docs/ARCHITECTUUR.md](docs/ARCHITECTUUR.md)
- Tests draaien:
  ```bash
  python3 -m pytest tests/          # de Home Assistant-integratie
  cd web && npm test                # de webapp
  ```
