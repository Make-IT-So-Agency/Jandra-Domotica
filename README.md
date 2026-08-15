# Laadkosten

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

## Wat je maandelijks moet doen

Openen, kiezen, downloaden. Zie [docs/GEBRUIK.md](docs/GEBRUIK.md) — dat is
één schermpje werk.

## Installeren

Eenmalig werk, verdeeld over vier plekken (Supabase, Vercel, Google, Home
Assistant). Volg [docs/INSTALLATIE.md](docs/INSTALLATIE.md) van boven naar
beneden; elke stap staat er klik voor klik in.

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
