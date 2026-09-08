# Installatie

De draaiende omgeving wordt beschreven in deze repository en toegepast door
GitHub Actions. Jij zet één keer de accounts en de secrets klaar; daarna gebeurt
alles via de repository.

Wat er in code staat:

| Bestand | Wat het beschrijft |
| --- | --- |
| `supabase/migrations/*.sql` | De tabellen in de databank, in volgorde van tijdstempel |
| `infra/vercel-omgeving.json` | Welke omgevingsvariabelen het Vercel-project hoort te hebben |
| `.github/workflows/migraties.yml` | De migraties toepassen met de Supabase CLI |
| `.github/workflows/productie-uitrollen.yml` | Vercel-project gelijkzetten en uitrollen |

Wat niet in code staat, omdat het eenmalig is en niet herhaald wordt: het
aanmaken van de accounts zelf, en het Google-luik voor het inloggen.

---

## 1. Supabase

1. Ga naar [supabase.com](https://supabase.com), maak een account en klik
   **New project**. Kies een naam, een databankwachtwoord (bewaar het) en als
   regio **Frankfurt** of **Ireland**.
2. Wacht tot het project klaar is, ongeveer twee minuten.
3. Noteer de **project-ref**: dat is het stukje uit de URL van je project,
   `https://<project-ref>.supabase.co`.
4. Ga naar **Project Settings → API** en noteer:
   - de **Project URL** → wordt `SUPABASE_URL`
   - de **`service_role`** sleutel (klik *Reveal*) → wordt `SUPABASE_SERVICE_ROLE_KEY`
5. Maak een access token: klik rechtsboven op je profiel → **Access Tokens** →
   *Generate new token*. Daarmee kan de Supabase CLI vanuit GitHub migreren.

## 2. Vercel

1. Ga naar [vercel.com](https://vercel.com) en maak een account.
2. Maak een **leeg project** aan: *Add New → Project → Create a new project*
   zonder repository te koppelen.
3. Noteer bij **Settings → General** de **Project ID**. Onder **Settings →
   General** van je account of team vind je de **Team ID** (of je gebruikers-ID
   als je geen team hebt).
4. Maak een token: **Settings → Tokens → Create**, vervaldatum 90 dagen.

> Koppel de repository bewust **niet** aan Vercel. Het uitrollen gebeurt vanuit
> de workflow, zodat er één plek is die bepaalt wat er live staat. Twee systemen
> die allebei deployen leidt tot verrassingen.
>
> **Root Directory** hoef je niet zelf te zetten. Die staat in
> `infra/vercel-omgeving.json` en wordt bij elke uitrol gelijkgezet. Staat hij
> verkeerd, dan bouwt Vercel de repo-root, vindt daar geen app, en publiceert
> een lege uitrol die gewoon slaagt maar overal 404 antwoordt.

## 3. Drie willekeurige sleutels maken

Deze haal je nergens op: je laat je computer drie willekeurige reeksen tekens
genereren. Ze hebben geen betekenis, ze moeten alleen lang en onvoorspelbaar
zijn.

**Op een Mac** — open **Terminal** (Cmd+Space, typ "terminal") en plak:

```bash
for i in 1 2 3; do openssl rand -hex 32; done
```

**Op Windows** — open **PowerShell** (Start, typ "powershell") en plak:

```powershell
1..3 | % {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | % { $_.ToString("x2") }) -join ""
}
```

Niet `Get-Random` gebruiken: die is bedoeld voor dobbelstenen, niet voor
sleutels. Bovenstaande gebruikt de generator van Windows zelf.

Je krijgt drie regels van 64 tekens, ongeveer zo:

```
3f8a1c9e04b7d2650fa38e17cb94d0a25e6f7381bc4029da5187ef3c6b0a94d1
b71e05c8f394a2d6018be7f52a9c3d40817ef6b902c5da3e64f18a70bd259ce3
9c04e7b1a58d3f26074c9eb238a15d60f7382bce019a4d5f68e7c02b91a3d485
```

Bewaar ze met een label erbij:

| Regel | Wordt | Ook nodig voor |
| --- | --- | --- |
| 1e | `AUTH_SECRET` | — |
| 2e | `INGEST_API_KEY` | **ook in Home Assistant, stap 7** |
| 3e | `CRON_SECRET` | — |

Geen terminal bij de hand? Elke wachtwoordgenerator werkt ook, zolang je drie
verschillende reeksen van minstens 40 tekens neemt.

## 4. Alles in GitHub zetten

Maak eerst de omgeving aan. In je repository: **Settings** (tabblad bovenaan) →
**Environments** (linkermenu) → **New environment** → naam exact `productie` →
**Configure environment**.

Op die pagina staan twee blokken: **Environment secrets** en **Environment
variables**. Gebruik díe, en niet de gewone repository-secrets — de workflows
kijken in deze omgeving.

### Environment secrets

Knop *Add environment secret*, één per rij.

| Naam | Wat je invult | Waar je het vindt | Ziet uit als |
| --- | --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | je Supabase access token | supabase.com → profielicoon rechtsboven → Access Tokens | `sbp_a1b2c3...` |
| `SUPABASE_DB_PASSWORD` | het databankwachtwoord dat **jij** koos | uit je eigen notities van stap 1 | wat je zelf koos |
| `SUPABASE_URL` | de Project URL | Supabase → Project Settings → API → *Project URL* | `https://abcdefgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | de service_role sleutel | Supabase → Project Settings → API → onder *Project API keys*, rij `service_role`, klik **Reveal** | lange reeks, begint met `eyJ` of `sb_secret_` |
| `VERCEL_TOKEN` | je Vercel token | vercel.com → Settings → Tokens → Create | `vercel_a1b2c3...` |
| `AUTH_SECRET` | **1e regel** uit stap 3 | je notities | 64 tekens |
| `INGEST_API_KEY` | **2e regel** uit stap 3 | je notities | 64 tekens |
| `CRON_SECRET` | **3e regel** uit stap 3 | je notities | 64 tekens |
| `TOEGELATEN_EMAILS` | je eigen e-mailadres | — | `jan@makeitso.be` |

### Environment variables

Knop *Add environment variable*.

| Naam | Wat je invult | Waar je het vindt | Ziet uit als |
| --- | --- | --- | --- |
| `SUPABASE_PROJECT_REF` | het middenstuk van je Project URL | uit `https://abcdefgh.supabase.co` neem je `abcdefgh` | 20 kleine letters |
| `VERCEL_PROJECT_ID` | de Project ID | Vercel → je project → Settings → General, onderaan | `prj_a1b2c3...` |
| `VERCEL_ORG_ID` | de Team ID | Vercel → Settings van je **account of team**, niet van het project → General | `team_a1b2...`, of je gebruikers-ID |

`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` en `AUTH_URL` laat je nog leeg. Die
kunnen pas in stap 6, want daarvoor moet je eerst het adres van je app kennen.
De workflow slaat ze zolang over en zegt dat in de uitvoer.

> Waarom die drie ID's variabelen zijn en geen secrets: het zijn verwijzingen,
> geen geheimen. Zo blijft in de logboeken zichtbaar naar welk project er
> uitgerold is.

## 5. Voor het eerst toepassen

Twee workflows, in deze volgorde.

1. **Actions → Databankmigraties → Run workflow**. Typ `productie` bij
   bevestiging. De workflow toont eerst met een droogloop wat er zou gebeuren en
   past het daarna toe.
2. **Actions → Productie uitrollen → Run workflow**. Zet **Alleen tonen** eerst
   op *true* om te zien welke variabelen gezet zouden worden; klopt het, draai
   hem dan opnieuw met *false*.

Onderaan de samenvatting van die tweede staat het adres waar je app nu draait.
Noteer het.

## 6. Google-login aanzetten

Dit blijft handwerk: er bestaat geen API om inloggegevens voor consumenten aan
te maken. Reken op een kwartier.

### Een apart project

Maak hiervoor een **nieuw** Google Cloud-project, ook al heb je er al een.

> Waarom: een project heeft één toestemmingsscherm, gedeeld door alle clients
> erin. Hang je Laadkosten aan een bestaand project, dan staat de naam van deze
> app straks boven de toestemmingsvraag van dat andere project.

[console.cloud.google.com](https://console.cloud.google.com) → projectkiezer
bovenaan → **Nieuw project** → naam `Laadkosten` → Maken. Controleer daarna dat
de projectkiezer echt `Laadkosten` toont. Daar loopt het het vaakst mis.

### Toestemmingsscherm

Het onderdeel heet tegenwoordig **Google Auth Platform**. De oude weg via
*API's en services → OAuth-toestemmingsscherm* komt op dezelfde plek uit.

Ga naar **console.cloud.google.com/auth/branding**:

| Veld | Waarde |
| --- | --- |
| App name | `Laadkosten` |
| User support email | jouw adres |
| Developer contact information | jouw adres |

De velden onder *App domain* en *Authorized domains* laat je leeg. Die heb je
alleen nodig om te publiceren, en dat ga je niet doen.

### Wie er mag aanmelden

Ga naar **console.cloud.google.com/auth/audience** en kies:

- **Internal** — beschikbaar als je op Google Workspace zit. Iedereen met een
  account van je organisatie kan aanmelden, en je houdt geen lijst bij.
- **Testing** — laat de status op *Testing* staan en zet de adressen die mogen
  aanmelden bij **Test users**. Nodig zodra iemand van buiten je organisatie
  erin moet.

> Publiceren hoeft niet, en kost meer dan het opbrengt: Google vraagt er een
> homepage en een privacyverklaring op een geregistreerd domein voor. Het levert
> ook niets op, want wie binnen mag beslist de app zelf. `web/auth.ts` weigert
> elk adres dat niet in `TOEGELATEN_EMAILS` staat of als gebruiker is toegevoegd,
> ook met een geldig Google-account. Google laat iemand hooguit tot de voordeur.

Dat je app op *Testing* staat, merkt een gebruiker aan één scherm dat zegt dat
Google de app niet geverifieerd heeft. Doorklikken en klaar.

### De client

Ga naar **console.cloud.google.com/auth/clients** → **Create client**.

| Veld | Waarde |
| --- | --- |
| Application type | `Web application` |
| Name | `Laadkosten webapp` |
| Authorised redirect URIs | `https://JOUW-APP-ADRES/api/auth/callback/google` |

*Authorised JavaScript origins* laat je leeg; deze app gebruikt ze niet.

Het adres is dat uit stap 5, exact overgenomen: met `https://` en zonder schuine
streep erachter. Na *Create* verschijnt een venster met het **Client ID** en het
**Client secret**. Neem allebei over — het geheim vind je later alleen nog terug
via de clientpagina.

### In GitHub zetten

**Settings → Environments → productie → Environment secrets**:

| Naam | Waarde |
| --- | --- |
| `AUTH_GOOGLE_ID` | het Client ID |
| `AUTH_GOOGLE_SECRET` | het Client secret |
| `AUTH_URL` | je app-adres, zonder schuine streep op het einde |

`AUTH_URL` is hier een secret en geen variable. Een adres is geen geheim, maar
zo is het bedraad: zet hem bij de secrets, anders vindt de workflow hem niet.

Draai daarna **Actions → Productie uitrollen → Run workflow** opnieuw.

### Controleren

Ga naar je app-adres en meld je aan. Strandt het, dan zegt de plek waar het
strandt wat eraan scheelt:

| Waar het strandt | Wat eraan scheelt |
| --- | --- |
| Google weigert je voor je terug bent in de app | Je account staat niet bij *Test users*, of je koos *Internal* en meldt je aan met een account van buiten je organisatie |
| `Error 400: redirect_uri_mismatch` | De omleidings-URI van de client komt niet exact overeen met `AUTH_URL` plus `/api/auth/callback/google` |
| Je komt terug in de app en krijgt "geen toegang" | Google was in orde, maar je adres staat niet in `TOEGELATEN_EMAILS` |

## 7. Home Assistant koppelen

> Hiervoor moet de repository **publiek** staan. HACS kan geen privérepository
> uitlezen — het haalt uitsluitend publiek beschikbare informatie op, en meldt
> zich bij GitHub aan met een token zonder scopes. Er is dus geen token dat je
> daarvoor kan invullen. Wil je de repository privé houden, kopieer dan
> `custom_components/laadkosten/` met de hand naar `config/custom_components/`
> van je Home Assistant; dan werkt alles behalve het automatisch bijwerken.

1. Open HACS → drie puntjes rechtsboven → **Custom repositories** → plak de URL
   van deze repository, type **Integration** → *Add*.
2. Zoek **Laadkosten rapportage** en klik **Download**. Herstart Home Assistant.
3. **Instellingen → Apparaten en diensten → Integratie toevoegen → Laadkosten
   rapportage**, en vul in:
   - **Adres van evcc**: bijvoorbeeld `http://homeassistant.local:7070`. Draait
     evcc als add-on, dan meestal `http://a0d7b954-evcc:7070` of het IP-adres
     van je Home Assistant met poort 7070.
   - **Adres van de rapportage-app**: het adres uit stap 5.
   - **API-sleutel**: de `INGEST_API_KEY` uit stap 3.

De integratie test meteen beide verbindingen en zegt het als er iets niet klopt.
Druk daarna één keer op **Nu synchroniseren**.

## 8. De app klaarzetten

Open de app en werk het lijstje op het beginscherm af: je vennootschappen
invullen, de laadpalen eraan koppelen, en het kwartaaltarief bevestigen.

---

## Later iets wijzigen

| Wat | Hoe |
| --- | --- |
| Code aanpassen | Commit naar `main`. **Productie uitrollen** doet de rest. |
| Kolom toevoegen | Nieuw bestand in `supabase/migrations/` met een latere tijdstempel. Nooit een bestaande migratie aanpassen. |
| Omgevingsvariabele erbij | Toevoegen aan `infra/vercel-omgeving.json` én als secret in de omgeving `productie`. |
| Sleutel vervangen | Secret bijwerken en **Productie uitrollen** handmatig starten. |
| Iets nakijken in de databank | **Actions → SQL uitvoeren** met een bestand uit `scripts/sql/`. Standaard alleen lezen. |

Raakt een wijziging zowel de databank als de code, lees dan eerst
[UITROL.md](UITROL.md): de volgorde maakt uit.

## Als er iets misloopt

**"Nog in te stellen bij Settings → Secrets and variables"**
De workflow zegt precies welke naam ontbreekt, en of het een secret of een
variabele moet zijn.

**De migratieworkflow klaagt over een verschil met de databank**
Er is een migratiebestand aangepast dat al gedraaid heeft. Zet de wijziging in
een nieuw bestand met een latere tijdstempel en laat het oude met rust.

**Verbinden met de databank mislukt**
Meestal `SUPABASE_DB_PASSWORD` of `SUPABASE_PROJECT_REF`. Let erop dat die in de
omgeving `productie` staan en niet als gewone repository-secret.

**Inloggen mislukt met "toegang geweigerd"**
Het adres staat niet in `TOEGELATEN_EMAILS` en is ook niet toegevoegd bij
**Gebruikers** in de app. Let op dat het het adres van het Google-account is.

**evcc antwoordt niet**
Probeer het adres eerst in je browser: je hoort de evcc-webinterface te zien.
Werkt `homeassistant.local` niet, gebruik dan het IP-adres.
