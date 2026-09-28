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
- [x] `/start`, `/id` en `/volgende` (eerstvolgende inschrijfmomenten)
- [x] Inschrijfmomenten 2026-2027 vastgelegd (`web/lib/opvang/inschrijfmomenten.ts`)
- [x] Publieke kant van i-Active verkend: login, velden, geen CAPTCHA
- [ ] i-Active na login verkennen: het reservatiescherm en het winkelmandje
- [ ] AM/PM-knoppen en de maandkalender
- [ ] Selecties bewaren in Supabase, status **Definitief**
- [ ] Sandra erbij, gezamenlijke groep
- [ ] Herinneringen zolang niet definitief
- [ ] Reservatieworkflow met droogloop, controle per slot en terugmelding
- [ ] Startsein via `pg_cron`, met een tweede poging als de eerste niet opdaagt

## i-Active

Wat we weten, en waar het vandaan komt. Alles hieronder is publiek; het
scherm na de login is nog niet gezien.

### Login

- Ouders loggen in op
  `https://sint-katelijne-waver.i-active.be/ords/r/iactive01/burgerportaal/login`,
  niet op `i-active.be` zelf. Het is een Oracle APEX-app ("burgerportaal").
- Velden `#P101_USERNAME` (e-mailadres of UserID) en `#P101_PASSWORD`, knop
  `#LOGIN_BUTTON` ("Aanmelden"). itsme loopt via een andere knop, die we niet
  gebruiken.
- Geen CAPTCHA in de pagina of haar scripts, en geen teken van 2FA bij
  e-mail en wachtwoord. Er is wel een cookiemelding, en de site zit achter
  Zenedge (Imperva). Een gewone HTTP-aanvraag kreeg meteen de echte pagina;
  of een browser op een GitHub-server even vlot binnen geraakt, zegt de
  workflow **Opvang - i-Active verkennen**.
- Afgeleid uit de scripts: reserveren gaat via een **winkelmandje** met een
  afrekenpagina. Een slot in het mandje is dus nog geen reservatie; de
  controle na afloop moet naar de echte inschrijvingen kijken.

### Wanneer de inschrijvingen openen

Bron: *Start inschrijvingsperiodes 2026-2027.pdf* op
[huisvanhetkind.skw.be/inschrijven-bko](https://huisvanhetkind.skw.be/inschrijven-bko).

| Ronde | Wanneer | Voor wie |
| --- | --- | --- |
| Eerste | eerste dinsdag, 18:00, twee maanden voor de opvangmaand | inwoners en personeel |
| Eerste | donderdag daarna, 09:00 | niet-inwoners |
| Tweede | voorlaatste dinsdag van de maand ervoor, 18:00 | iedereen, extra plaatsen |

De website zegt "derde dinsdag" voor de tweede ronde, maar de tabel zegt
overal de voorlaatste. De code volgt de tabel, en een test bewaakt dat de
regel er exact mee overeenkomt. Voor de zomervakantie geldt een eigen datum
(27 april 2027). Na juni 2027 rekent de code verder met de regel en zegt ze
"berekend" tot de nieuwe tabel er is.

**Eerstvolgende opening: dinsdag 6 oktober 2026, 18:00**, voor december en
de kerstvakantie.

### Wat je reserveert

- Per kind, per dag, per opvangmoment: **voorschools**, **naschools**,
  **woensdagnamiddag**. Op schoolvrije dagen en in de vakanties per halve dag
  (voormiddag tot 13:00, namiddag vanaf 12:00).
- **Niet** te reserveren: naschoolse opvang van de lagere school, die gebeurt
  op school. Uitzondering: Hagelstein, die gaan naar Robbedoes.
- Wie niet gereserveerd heeft, kan niet terecht.
- Volzet: je kind komt op een **wachtlijst**, en schuift automatisch door als
  er plaats vrijkomt. Dat is dus geen "mislukt", maar ook geen "gelukt": het
  verslag in Telegram moet dat apart melden.

### Annuleren

Tot 06:00 dezelfde ochtend voor voorschoolse opvang, vakanties en
schoolvrije dagen; tot 11:00 voor naschoolse opvang en woensdagnamiddag. Drie
jokers per kind per maand. Te laat of niet geannuleerd: het volledige moment
plus € 5.

## Wat je zelf moet instellen

### Secrets in GitHub

**Settings → Environments → productie → Environment secrets**:

| Naam | Waar je het haalt | Gebruikt door |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram → **@BotFather** → `/mybots` → Opvang_bot → **API Token** | Vercel (wordt er bij het uitrollen naartoe gezet) |
| `TOEGELATEN_TELEGRAM_IDS` | Je eigen id: stuur iets naar **@userinfobot** in Telegram. Later Sandra's id en de id van de groep erbij, met komma's. | Vercel |
| `IACTIVE_EMAIL` | Het e-mailadres waarmee je inlogt op [het burgerportaal](https://sint-katelijne-waver.i-active.be/ords/r/iactive01/burgerportaal/login) | GitHub Actions (verkenning en reservatie) |
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
