# Opvang

Buitenschoolse opvang in Sint-Katelijne-Waver reserveren zonder er elke maand
zelf achter te moeten zitten. Jan en Sandra duiden in Telegram per dag aan wat
ze nodig hebben, en op het moment dat i-Active de reservaties opent, reserveert
de bot exact dat, en meldt daarna wat gelukt is.

Alles draait in dezelfde omgeving als de laadkosten: code in deze repository,
de bot in de webapp op Vercel, de gegevens in Supabase, de browser in GitHub
Actions. Geen tweede platform om te onderhouden.

```
Telegram (Jan + Sandra)
        │  webhook
        ▼
Vercel: web/app/api/telegram          toegang, knoppen, selectie
        │
        ▼
Supabase                              selecties, status, resultaten
        │  pg_cron, ~10 min vóór de opening
        ▼
GitHub Actions: Playwright            inloggen, wachten, reserveren
        │                             en daarna elk slot controleren
        ▼
Supabase → Telegram                   "Opvang november verwerkt"
```

## Twee regels die niet onderhandelbaar zijn

- **Enkel wat expliciet aangeduid is.** De bot reserveert exact de AM/PM-slots
  uit de definitieve selectie, en nooit iets anders. Geen AI die raadt wat we
  "waarschijnlijk" nodig hebben, en geen AI tijdens de reservatie zelf.
- **Gelukt is wat i-Active zegt dat gelukt is.** Een knop die geklikt werd, is
  geen reservatie. Elk slot wordt nadien in i-Active zelf gecontroleerd.

## Waar we staan

- [x] Webhook Telegram → Vercel, beveiligd met een geheim
- [x] Enkel toegelaten Telegram-id's, en in een groep ook de groep zelf
- [x] `/start` en `/id`
- [ ] i-Active verkennen: login, schermen, openingsmomenten
- [ ] AM/PM-knoppen en de maandkalender
- [ ] Selecties bewaren in Supabase, status **Definitief**
- [ ] Sandra erbij, gezamenlijke groep
- [ ] Herinneringen zolang niet definitief
- [ ] Reservatieworkflow met droogloop, controle per slot en terugmelding
- [ ] Startsein via `pg_cron`, met een tweede poging als de eerste niet opdaagt

## Wat je zelf moet instellen

### Secrets in GitHub

**Settings → Environments → productie → Environment secrets**:

| Naam | Waar je het haalt | Gebruikt door |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram → **@BotFather** → `/mybots` → Opvang_bot → **API Token** | Vercel (wordt er bij het uitrollen naartoe gezet) |
| `TOEGELATEN_TELEGRAM_IDS` | Je eigen id: stuur iets naar **@userinfobot** in Telegram. Later Sandra's id en de id van de groep erbij, met komma's. | Vercel |
| `IACTIVE_EMAIL` | Het e-mailadres waarmee je in i-Active inlogt | GitHub Actions (de reservatie) |
| `IACTIVE_WACHTWOORD` | Het wachtwoord daarvan | GitHub Actions |

Pas een secret altijd in GitHub aan, nooit rechtstreeks in Vercel: de volgende
uitrol zou je wijziging overschrijven.

Later, voor het startsein, komt er nog één bij: een GitHub-token dat enkel
workflows van deze repository mag starten. Dat staat beschreven zodra het
nodig is.

### De webhook koppelen, na de eerste uitrol

1. Log in op de webapp en open `/api/telegram/setup`. Je krijgt iets terug als
   `"ok": true, "bot": "Opvang_bot", "webhook": ".../api/telegram"`. Mag je
   gerust later nog eens openen; nodig na elk nieuw bot-token.
2. Stuur `/start` naar Opvang_bot. Antwoord: **Opvang_bot is actief**. Staat je
   id nog niet in `TOEGELATEN_TELEGRAM_IDS`, dan antwoordt hij met **Deze bot
   is privé** en je id: ook dat bewijst dat de keten werkt.

De Worker `opvang-bot` in Cloudflare is daarna overbodig. Zodra de webhook op
Vercel staat, mag je hem verwijderen: **Workers & Pages → opvang-bot → Settings
→ Delete**.

## Keuzes

**Waarom de browser in GitHub Actions draait.** Een functie op Vercel mag maar
kort lopen en heeft geen volwaardige browser; een Playwright-script dat
inlogt, wacht tot de opening en daarna controleert, past daar niet in. Een
runner van GitHub Actions is een gewone Linux-machine met Chromium, mag uren
lopen, en bewaart logboeken die ook in een volgende Claude-sessie te lezen
zijn.

**Waarom Supabase het startsein geeft en niet een geplande workflow.** Een
geplande workflow van GitHub kan tot een uur te laat vertrekken, en de cron
van Vercel valt ergens binnen het gevraagde uur. `pg_cron` in Supabase draait
op de minuut en start de workflow via de GitHub-API; een gestarte workflow
vertrekt binnen seconden. De workflow start ruim op voorhand, logt in, en
wacht zelf tot het exacte moment. Meldt hij zich niet op tijd aan in Supabase,
dan volgt een tweede start en een bericht in Telegram.

**Waarom het geheim van de webhook niet apart ingesteld wordt.** Telegram
stuurt bij elke aanroep een geheim mee in een header; zonder die controle kan
iedereen die de URL kent zich als Telegram voordoen. Het geheim wordt afgeleid
van het bot-token (HMAC), zodat er geen tweede secret te beheren is.

**Waarom de webhook altijd 200 antwoordt aan Telegram.** Ook als het
verwerken misloopt. Anders stuurt Telegram dezelfde update eindeloos opnieuw,
en die faalt de tiende keer om dezelfde reden als de eerste. De fout gaat naar
de logs, zonder token.

**Waarom een groep zelf ook toegelaten moet zijn.** Anders kan iemand de bot
in een eigen groep zetten en daar Jan of Sandra laten meeklikken.

**Waarom er geen schermafdrukken als artefact bewaard worden.** De repository
is publiek (HACS vraagt dat), en artefacten van een publieke repository zijn
voor elke GitHub-gebruiker te downloaden. Schermen van i-Active bevatten namen
en gegevens van de kinderen. De workflow bewaart daarom enkel een verslag
zonder persoonsgegevens: welke stap, welk slot, gelukt of niet.
