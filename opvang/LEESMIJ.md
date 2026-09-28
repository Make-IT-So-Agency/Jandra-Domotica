# Opvang

Buitenschoolse opvang in Sint-Katelijne-Waver reserveren zonder er elke maand
zelf achter te moeten zitten. Jan en Sandra duiden in Telegram per dag aan wat
ze nodig hebben, en op het moment dat i-Active de reservaties opent, reserveert
de bot exact dat, en meldt daarna wat gelukt is.

```
Telegram (Jan + Sandra)
        │
        ▼
Cloudflare Worker "opvang-bot"      ← opvang/worker/
  webhook, toegang, selectie, planning
        │
        ▼
Reservatie in i-Active              ← nog te bouwen
(browserautomatisering)
        │
        ▼
Controle per slot → Telegram
```

## Twee regels die niet onderhandelbaar zijn

- **Enkel wat expliciet aangeduid is.** De bot reserveert exact de AM/PM-slots
  uit de definitieve selectie, en nooit iets anders. Geen AI die raadt wat we
  "waarschijnlijk" nodig hebben.
- **Gelukt is wat i-Active zegt dat gelukt is.** Een knop die geklikt werd, is
  geen reservatie. Elk slot wordt nadien in i-Active zelf gecontroleerd.

## Waar we staan

- [x] Webhook Telegram → Worker, beveiligd met een geheim
- [x] Enkel toegelaten Telegram-id's, en in een groep ook de groep zelf
- [x] `/start` en `/id`
- [ ] AM/PM-knoppen en de maandkalender
- [ ] Selecties bewaren, status **Definitief**
- [ ] Sandra erbij, gezamenlijke groep
- [ ] Herinneringen zolang niet definitief
- [ ] i-Active: analyse, reservatie, controle, terugmelding

## Wat je nu zelf moet doen

### 1. Een eerste keer uitrollen

Kies één van de twee. Daarna gaat het vanzelf bij elke merge naar `main`.

**Via GitHub (aangeraden, zoals de rest van de repository).** Zet in
**Settings → Environments → productie**:

| Naam | Soort | Waar je het vindt |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare → rechtsboven je profiel → **API Tokens → Create Token → Edit Cloudflare Workers** (sjabloon). Geef het een vervaldatum. |
| `CLOUDFLARE_ACCOUNT_ID` | variable | Cloudflare → **Workers & Pages**, rechts in de kolom *Account ID* |

Start dan **Actions → Opvang-bot uitrollen → Run workflow**.

**Of met de hand**, zonder GitHub: in Cloudflare → **Workers & Pages →
opvang-bot → Edit code** plak je de inhoud van de bundel die
`cd opvang/worker && npm ci && npm run bouwcontrole` in `dist/` zet.

Het Telegram-token blijft in beide gevallen enkel in Cloudflare staan. Een
deploy raakt de secrets niet aan.

### 2. De webhook koppelen

Open in je browser:

```
https://opvang-bot.jan-festjens.workers.dev/setup
```

Je krijgt iets terug als `"ok": true, "bot": "Opvang_bot", "webhook":
".../telegram"`. Mag je gerust later nog eens openen: het resultaat is telkens
hetzelfde. Nodig na elk nieuw bot-token.

### 3. Jezelf toegang geven

1. Stuur `/start` naar Opvang_bot. Omdat er nog niemand toegelaten is,
   antwoordt hij met **Deze bot is privé** en je Telegram-id. Dat bewijst
   meteen dat de hele keten werkt.
2. Cloudflare → **opvang-bot → Settings → Variables and Secrets → Add** →
   type **Secret**, naam `TOEGELATEN_TELEGRAM_IDS`, waarde je id.
3. Stuur opnieuw `/start`. Nu: **Opvang_bot is actief**.

Later komen daar Sandra's id en de id van de gezamenlijke groep bij,
gescheiden door komma's. Beide geven `/id` wanneer ze het de bot vragen.

## Keuzes

**Waarom het geheim van de webhook niet apart ingesteld wordt.** Telegram
stuurt bij elke aanroep een geheim mee in een header; zonder die controle kan
iedereen die de URL kent zich als Telegram voordoen. Het geheim wordt afgeleid
van het bot-token (HMAC), zodat er geen tweede secret te beheren is. Een nieuw
token geeft vanzelf een nieuw geheim, zodra je `/setup` opnieuw opent.

**Waarom de Worker altijd 200 antwoordt aan Telegram.** Ook als het
verwerken misloopt. Anders stuurt Telegram dezelfde update eindeloos opnieuw,
en die faalt de tiende keer om dezelfde reden als de eerste. De fout gaat naar
de logs van de Worker, zonder token.

**Waarom een groep zelf ook toegelaten moet zijn.** Anders kan iemand de bot
in een eigen groep zetten en daar Jan of Sandra laten meeklikken.

## Nog te beslissen

- **Waar de browserautomatisering draait.** Een Worker kan zelf geen
  Playwright draaien. Opties: Cloudflare Browser Rendering (in dezelfde
  omgeving, maar met tijdslimieten), een GitHub Actions-workflow die de Worker
  op het juiste moment start (een geplande workflow kan tot een uur te laat
  vertrekken, een gestarte vertrekt binnen seconden), of de Home
  Assistant-machine thuis. Dat hangt af van wat de i-Active-analyse oplevert:
  CAPTCHA, hoe snel de slots vol zitten, hoe lang een sessie geldig blijft.
- **D1 of Supabase voor de selecties.** Zie de README onder *Modules*.
