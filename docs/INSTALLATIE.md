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
| `.github/workflows/productie-uitrollen.yml` | Omgevingsvariabelen gelijkzetten en uitrollen |

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
3. Ga in dat project naar **Settings → General** en zet **Root Directory** op
   `web`.
4. Noteer op diezelfde pagina de **Project ID**. Onder **Settings → General**
   van je account of team vind je de **Team ID** (of je gebruikers-ID als je
   geen team hebt).
5. Maak een token: **Settings → Tokens → Create**, vervaldatum 90 dagen.

> Koppel de repository bewust **niet** aan Vercel. Het uitrollen gebeurt vanuit
> de workflow, zodat er één plek is die bepaalt wat er live staat. Twee systemen
> die allebei deployen leidt tot verrassingen.

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
te maken.

1. Ga naar [console.cloud.google.com](https://console.cloud.google.com) en maak
   een project aan.
2. **API's en services → OAuth-toestemmingsscherm** → Extern → vul een app-naam
   in en je eigen e-mailadres. Staat de app op *Testen*? Voeg jezelf toe bij
   **Testgebruikers**.
3. **API's en services → Inloggegevens → Inloggegevens maken →
   OAuth-client-ID → Webtoepassing**.
4. Bij **Geautoriseerde omleidings-URI's** plak je exact:

   ```
   https://JOUW-APP-ADRES/api/auth/callback/google
   ```

5. Zet de drie ontbrekende secrets in GitHub:

   | Naam | Waarde |
   | --- | --- |
   | `AUTH_GOOGLE_ID` | het client-ID |
   | `AUTH_GOOGLE_SECRET` | het clientgeheim |
   | `AUTH_URL` | je app-adres, zonder schuine streep op het einde |

6. Draai **Productie uitrollen** opnieuw.

Ga naar je app-adres. Je hoort te kunnen inloggen met Google.

## 7. Home Assistant koppelen

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
