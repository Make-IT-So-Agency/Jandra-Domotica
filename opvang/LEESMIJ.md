# Opvang

Buitenschoolse opvang in Sint-Katelijne-Waver reserveren zonder er elke maand
zelf achter te moeten zitten. Jan en Sandra duiden in Telegram per dag aan wat
ze nodig hebben, en op het moment dat i-Active de reservaties opent, reserveert
de bot exact dat, en meldt daarna wat gelukt is. Lukte het niet, dan zegt hij
dat ook, dezelfde avond nog.

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
Supabase                              kinderen, rondes, tegels, keuzes, resultaten
        ▲                ▲
        │ elke ochtend   │ om de 4 uur; vanaf 30 uur vooraf een estafette
GitHub Actions           GitHub Actions: Playwright
kalender lezen           wachten, inloggen, om 18:00 inschrijven,
(tegels → Supabase)      elk slot controleren
        │                │
        ▼                ▼
Telegram: keuzemenu      Telegram: per slot ✔ / ⏸ / ❌, en een verslag

Vercel, 's ochtends en 's avonds: na de opening niet ingeschreven? → Telegram
```

## Hoe een maand verloopt

1. **Tien dagen vóór de opening** maakt de webapp de ronde aan (dagelijkse
   taak op Vercel, 10:00). De workflow **Opvang - kalender lezen** (elke
   ochtend) leest de tegels van die maand uit i-Active en zet ze in Supabase.
2. **Meteen daarna** stuurt de bot in Telegram per kind een keuzemenu: per
   week de dagen, per dag een knop per moment (`voor`, `na`, `woe-nm`, in
   vakanties `vm`, `nm`, `dag`, per locatie). Jan en Sandra tikken aan wat
   nodig is. "Alles deze week" vinkt de schooldagen van die week aan, nooit
   vakantiedagen met meerdere locaties.
3. **🔒 Definitief maken**: de bot weigert als er dubbele keuzes in zitten
   (twee locaties voor hetzelfde moment, of een volle dag met een halve), en
   stuurt anders het vaste overzicht van wat hij zal inschrijven. **✏️
   Wijzigen** kan tot 5 minuten vóór de opening.
4. **Herinneringen** 7, 3 en 1 dag vooraf en de ochtend zelf, zolang het niet
   definitief is. Ongeveer 2 uur vooraf nog eens, vanuit de workflow. Is het
   definitief, dan kondigt de bot die ochtend aan wat hij inschrijft, en dat
   hij zich kort vóór 18:00 meldt.
5. **Vanaf 30 uur vooraf** loopt **Opvang - inschrijven** als estafette: een
   run wacht hoogstens 5 uur en start dan zelf de volgende (zie *Waarom een
   estafette* hieronder). De run die 2 uur vooraf vertrekt, logt 6 minuten
   vooraf in, legt 4 minuten vooraf de keuze vast (status `bezig`), meldt
   **🟢 Ingelogd** in Telegram, en wacht tot 18:00:00. Daarna herlaadt hij de
   kalender tot de tegels opengaan, en schrijft per slot in: venster openen,
   enkel het juiste kind aanvinken, **Inschrijven**, en dan de tegel opnieuw
   lezen. Enkel de tegel beslist of het gelukt is. Volzet: toch inschrijven,
   dan staat het kind op de reservelijst (⏸). Een hapering in i-Active kost
   één slot één poging, niet de hele run.
6. **Na afloop** leest hij elke gekozen tegel opnieuw, van nul, en stuurt
   het verslag: ingeschreven, reservelijst, en wat niet lukte en je dus zelf
   moet doen.
7. **Niet definitief om 18:00?** Dan schrijft de bot niets in, en zegt dat.
8. **Te laat gestart?** Tot 24 uur na de opening schrijft een run meteen in
   als hij start, en zegt in Telegram dat hij te laat is. Later dan dat enkel
   met de hand, modus `inhalen`.
9. **Niets gehoord?** De webapp kijkt 's avonds (vanaf 17:00 UTC: 19:00 in de
   zomer, 18:00 in de winter) en de volgende ochtenden of er ingeschreven is.
   Zo niet, dan zegt de bot dat, en wat je kan doen; tot twee dagen na de
   opening, één keer per dag. `/status` zegt het ook, op elk moment.

`/stop` in Telegram laat een lopende inschrijving stoppen vóór het volgende
slot, en houdt een te late run tegen. Een run die crasht, zet de ronde terug
op `definitief`; de volgende run (vanzelf binnen 24 uur na de opening, of met
de hand) doet enkel wat nog niet gebeurd is.

### Commando's

| Commando | Wat |
| --- | --- |
| `/plannen` | het keuzemenu van de volgende inschrijving (opnieuw) tonen |
| `/status` | of de vorige inschrijving gelukt is, wat er nu gekozen is, en of het definitief is |
| `/kinderen` | voor wie de bot reserveert (aan/uit per kind) |
| `/stop` | een lopende inschrijving stoppen |
| `/hier` | de bot praat voortaan in deze chat (de groep) |
| `/volgende`, `/id`, `/help` | |

### Met de hand, in GitHub → Actions

- **Opvang - inschrijven**, modus `proef`: alles behalve de klik op
  Inschrijven. Met `maand` = een maand met open tegels (bv. `2026-11`): een
  proef op één vrije en één volzette tegel.
- Modus `test` met `slot` = `2026-11-16:voor`: schrijft **echt** dat ene slot
  in voor het kind dat ingepland wordt, en controleert het in i-Active.
- Modus `normaal`: zoals de geplande run. Tot 2 uur vóór de opening wacht
  hij en geeft hij door; daarna schrijft hij in, ook tot 24 uur te laat.
- Modus `inhalen`: de laatste definitieve keuze waarvan de opening voorbij is,
  nu nog inschrijven, hoe lang ook geleden. Wat al ingeschreven is, slaat hij
  over; wat volzet is, komt op de reservelijst.
- **Opvang - kalender lezen**: de tegels opnieuw inlezen.

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
- [x] i-Active na login verkend: menu, kalender, venster "Inschrijven"
- [x] Kalender en inschrijfvenster werken in een headless browser op GitHub
- [x] Kalender lezen: tegels, locaties en staat per slot in Supabase
- [x] Keuzemenu per kind en per week, status **Definitief**, Wijzigen
- [x] Herinneringen zolang niet definitief
- [x] Inschrijfworkflow met proef, controle per slot, eindcontrole en verslag
- [x] Startsein: geplande workflow, drie keer als vangnet (bleek niet genoeg, zie hieronder)
- [ ] Sandra erbij, gezamenlijke groep (`/hier`)
- [x] Proef op november: vrije én volzette tegel hebben dezelfde knop "Inschrijven"
- [x] Echte testinschrijving: vr 13/11 naschools, na de klik en bij de eindcontrole als ingeschreven gezien (29/09/2026)
- [ ] Eerste echte ronde: december, dinsdag 6 oktober 2026 om 18:00. **Niet
      ingeschreven**: GitHub startte de drie runs om 21:22, 22:09 en 22:31,
      en die stopten zonder iets te zeggen, want ze keken maar tot 3 uur na
      de opening. Niemand hoorde iets.
- [x] Startsein als estafette, te laat toch inschrijven, en melden als het
      niet gebeurde (7 oktober 2026)
- [ ] Eerste ronde met de estafette: januari, dinsdag 3 november 2026 om 18:00

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

### De kalender: hier gebeurt het reserveren

Menu **Mijn kalender → Kinderopvang**
(`/ords/r/iactive01/burgerportaal/kalender-kinderopvang-nieuw`). Bovenaan
kies je een kind (`#P44_LEERLING`, één optie per kind) en een activiteitgroep
(**Opvang (inschrijvingen)**). Daaronder staat een maandkalender van
FullCalendar, met knoppen `<`, `>` en `Vandaag`.

**Welke kinderen.** Er staan twee kinderen in het account. Voorlopig plant
de bot enkel voor het oudste; het jongste komt er pas bij vanaf de
opvangmaand september 2027. Namen en leerling-id's staan niet in deze
publieke repository maar in Supabase, samen met die startmaand, zodat het
jongste kind er vanzelf bijkomt zonder codewijziging.

We reserveren via deze kalender, niet via "Inschrijven via periode": één
tegel is één slot, dus de bot klikt exact wat aangeduid werd en niets anders,
en leest op hetzelfde scherm het resultaat terug.

| Wat | Waar in de HTML |
| --- | --- |
| Een dag | `td[data-date="2026-11-09"]` |
| Locatie | `.kal-loc`, bv. "BKO - Speelhuis": staat vóór de tegels van die locatie, niet erin. In vakanties 3 à 4 locaties per dag |
| Een slot | `a.fc-event` in die cel; tekst "Voorschoolse opvang", "Naschoolse opvang" of "Woensdagmiddag opvang" |
| Vrij | `title="Inschrijven  tot: 09/11/2026 06:00"`, balk `.progress-bar-text` met een percentage |
| Volzet | `title="Inschrijven OP RESERVELIJST tot: …"`, balk `pb_full` met "RESERVE" |
| Gesloten | klasse `calendaralert`, `title="Inschrijven beëindigd op …"`, geen link |
| Nog niet open | klasse `no_click`, geen link, `title="Inschrijven vanaf 06/10/2026 18:00"` |
| Ingeschreven | klasse `ingeschreven`, `title="Ingeschreven"` (gezien in november) |
| Op de reservelijst | icoon `fa-pause-circle` (volgens de legende) |

Een klik op een tegel opent het venster **Inschrijven**: artikel, datum, een
vinkje per kind, "Inschrijven mogelijk van … tot …", een opmerkingsveld en de
knop **Inschrijven**. Geen winkelmandje in deze weg.

Het venster is een APEX-dialoog in een **iframe**, pagina `inschrijven1`
(items `P59_*`):

| Wat | Selector |
| --- | --- |
| Vinkje van het kind | `#P59_LEERLING_CSV_0` (één per kind, `_0`, `_1`, …) |
| Opmerking | `#P59_OPMERKING` |
| Inschrijven | knop met tekst "Inschrijven" (nu `#B171236999143809159`) |
| Sluiten zonder inschrijven | knop "close" (nu `#B171233816848809132`) |

De knop-id's zijn door APEX gegenereerd en kunnen bij een update van i-Active
veranderen; het script zoekt daarom op de tekst van de knop.

**Wat de kalender nodig heeft om tegels te tonen** (uitgezocht met de
verkenning, want in een nieuwe sessie is hij anders leeg):

- Activiteitgroep **Opvang (inschrijvingen)** gekozen (`P44_TRAN_GROEP=TIJD`).
- De locatiefilter **leeg** laten: leeg betekent alle locaties. Meer dan één
  locatie tegelijk aanvinken geeft een lege kalender.
- Het juiste kind in `#P44_LEERLING`.
- Een maand die al gegevens heeft: in september 2026 bleven september en
  oktober leeg, november gaf 44 tegels.

**Volzet betekent: toch inschrijven, op de reservelijst.** Dat is de keuze
van Jan en Sandra. Het verslag in Telegram meldt zo'n slot apart, want het is
geen gewone reservatie:

```
Ma 09/11 - naschools  RESERVELIJST (volzet, schuift door als er plaats vrijkomt)
```

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
- Volzet: je kind komt op de **reservelijst**, en schuift automatisch door
  als er plaats vrijkomt, tot de dag ervoor. Dat is geen "mislukt", maar ook
  geen "gelukt": het verslag in Telegram meldt het apart.

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

De workflows gebruiken verder `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`AUTH_URL` en `CRON_SECRET`, die er al staan voor de webapp.

### Sandra en de groep

1. Maak in Telegram een groep met Jan, Sandra en **Opvang_bot**.
2. Stuur in de groep `/id`: de bot antwoordt met jouw id en die van de groep
   (een negatief getal). Sandra stuurt ook `/id` voor het hare.
3. Zet beide erbij in `TOEGELATEN_TELEGRAM_IDS`, met komma's, en start
   **Productie uitrollen** opnieuw.
4. Stuur in de groep `/hier`. Vanaf dan komen menu's en verslagen daar.
5. `/kinderen`: zet het kind aan dat ingepland moet worden.

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

**Waarom een estafette, en geen geplande run op het uur zelf.** Een geplande
workflow van GitHub vertrekt niet op tijd. Eerst rekenden we op hoogstens een
uur te laat, met runs om 16:07, 17:07 en 17:37 (zomertijd). In oktober 2026
bleek het elke dag 3 tot 7 uur: de eerste run van de dag, gepland om 14:07
UTC, vertrok op 2, 3, 4, 5 en 6 oktober om 19:05, 17:51, 18:03, 21:25 en 19:22
UTC, en de kalender van 04:23 UTC tussen 09:57 en 11:41. Zo werd december niet
ingeschreven.

Daarom bepaalt de planning enkel nog wanneer een run *ergens* in de 30 uur
vóór een opening binnenvalt, en zorgt de run zelf voor het juiste moment
(`src/startsein.ts`):

- De workflow start om de vier uur. Is er binnen 30 uur geen opening, dan
  stopt de run na enkele seconden, nog vóór npm en Playwright.
- Is er wel een, dan wacht de run hoogstens 5 uur en start dan met
  `gh workflow run` een nieuwe run van zichzelf. Een job mag bij GitHub niet
  langer dan 6 uur duren, en een run die zo gestart wordt, vertrekt meteen:
  het `GITHUB_TOKEN` mag dat (`workflow_dispatch` is de uitzondering op de
  regel dat het geen nieuwe runs start), met `actions: write`.
- De run die 2 uur of minder vóór de opening vertrekt, schrijft in.
- Een geplande run die binnenvalt terwijl de estafette loopt, wacht in de rij
  (`concurrency`). Er loopt nooit meer dan één run, en wie aan de beurt komt,
  beslist opnieuw.
- Loopt er iets mis vóór het inschrijven begint (npm, Playwright, de
  estafette), dan zegt de workflow dat in Telegram, met de link naar de run.

Toch te laat (GitHub laat alle runs vallen, of een run crasht)? Tot 24 uur na
de opening schrijft de eerste run die start meteen in. En omdat de planning
van Vercel wél op tijd is, kijkt de webapp 's avonds en 's ochtends of er
ingeschreven is, en zegt het in Telegram als dat niet zo is. Zo blijft het
niet meer stil als het niet gebeurde.

`pg_cron` of een eigen token voor Vercel zou op de minuut starten, maar vraagt
een GitHub-token met schrijfrechten buiten GitHub. De estafette heeft dat niet
nodig. Let op: GitHub zet geplande workflows van een publieke repository stil
na 60 dagen zonder commits; dan krijg je een mail.

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
