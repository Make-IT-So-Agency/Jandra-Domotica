# Installatie

Eenmalig werk. Reken op een uurtje. Je hebt vier dingen nodig, in deze
volgorde:

1. **Supabase** — de databank waar de sessies in bewaard worden (gratis)
2. **Vercel** — waar de app draait (gratis)
3. **Google** — om te kunnen inloggen (gratis)
4. **Home Assistant** — de integratie die de sessies doorstuurt

Onderweg maak je een paar geheime sleutels aan. Plak die telkens meteen in een
kladblokbestand; je hebt ze verderop opnieuw nodig.

---

## Vooraf: drie sleutels aanmaken

Open een terminal en voer deze drie commando's uit. Bewaar de uitvoer.

```bash
openssl rand -base64 32   # dit wordt AUTH_SECRET
openssl rand -hex 32      # dit wordt INGEST_API_KEY
openssl rand -hex 32      # dit wordt CRON_SECRET
```

Geen terminal bij de hand? Elke wachtwoordgenerator die 40+ willekeurige tekens
geeft, volstaat. Gebruik voor elk van de drie een *ander* resultaat.

---

## 1. Supabase: de databank

1. Ga naar [supabase.com](https://supabase.com) en maak een account.
2. Klik **New project**. Geef het een naam (bijvoorbeeld `laadkosten`), kies een
   wachtwoord voor de databank en als regio **Frankfurt** of **Ireland**.
3. Wacht tot het project klaar is (ongeveer twee minuten).
4. Klik links op **SQL Editor** en dan op **New query**.
5. Open het bestand `web/supabase/schema.sql` uit deze repository, kopieer de
   **volledige** inhoud, plak die in het venster en klik **Run**.
   Onderaan hoort *Success. No rows returned* te verschijnen.

   > Had je de databank al opgezet vóór het gebruikersbeheer bestond? Dan volstaat
   > het om daarnaast ook `web/supabase/migratie-01-gebruikers.sql` te draaien.
   > Allebei draaien kan geen kwaad: de scripts zijn herhaalbaar.
6. Klik links op het tandwiel (**Project Settings**) en dan op **API**. Noteer:
   - **Project URL** → dit wordt `SUPABASE_URL`
   - onder *Project API keys* de sleutel **`service_role`** (klik op *Reveal*)
     → dit wordt `SUPABASE_SERVICE_ROLE_KEY`

> De `service_role`-sleutel geeft volledige toegang tot je databank. Die hoort
> enkel bij Vercel terecht te komen, nergens anders.

---

## 2. Vercel: de app online zetten

1. Ga naar [vercel.com](https://vercel.com) en meld je aan met GitHub.
2. Klik **Add New… → Project** en kies deze repository.
3. Bij **Root Directory** klik je op **Edit** en kies je de map **`web`**.
   Dit is belangrijk: de app staat niet in de hoofdmap.
4. Klap **Environment Variables** open en voeg deze toe. Zet ze telkens aan
   voor *Production*, *Preview* én *Development*.

   | Naam | Waarde |
   | --- | --- |
   | `SUPABASE_URL` | de Project URL uit stap 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | de `service_role`-sleutel uit stap 1 |
   | `AUTH_SECRET` | je eerste gegenereerde sleutel |
   | `INGEST_API_KEY` | je tweede gegenereerde sleutel |
   | `CRON_SECRET` | je derde gegenereerde sleutel |
   | `TOEGELATEN_EMAILS` | jouw e-mailadres, bv. `jan@makeitso.be` |

   > `TOEGELATEN_EMAILS` is je noodingang. Wie hierin staat is **altijd**
   > hoofdbeheerder en kan via de app nooit buitengesloten worden. Alle andere
   > gebruikers voeg je later toe in de app zelf, bij **Gebruikers**. Zet hier
   > dus enkel je eigen adres in; meerdere adressen mogen, met komma's ertussen.

   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` en `AUTH_URL` vul je in stap 3 aan.

5. Klik **Deploy**. Na een minuut of twee krijg je een adres zoals
   `laadkosten-abc123.vercel.app`.
6. Wil je een eigen adres? Ga naar **Settings → Domains** en voeg bijvoorbeeld
   `laadkosten.jouwdomein.be` toe. Volg de instructies voor de DNS-instelling.

Noteer het uiteindelijke adres van je app. Verderop noemen we dat
**het app-adres**.

---

## 3. Google: inloggen mogelijk maken

1. Ga naar [console.cloud.google.com](https://console.cloud.google.com).
2. Maak bovenaan een nieuw project aan, bijvoorbeeld `Laadkosten`.
3. Ga in het menu naar **API's en services → OAuth-toestemmingsscherm**.
   - Kies **Extern** en klik **Maken**.
   - Vul een app-naam in, je eigen e-mailadres als ondersteuningsmail en
     nogmaals je adres bij de contactgegevens. De rest mag leeg.
   - Klik door tot het einde en dan **Terug naar dashboard**.
   - Staat de app op *Testen*? Voeg jezelf dan toe bij **Testgebruikers**.
4. Ga naar **API's en services → Inloggegevens**.
   - Klik **Inloggegevens maken → OAuth-client-ID**.
   - Type: **Webtoepassing**.
   - Bij **Geautoriseerde omleidings-URI's** voeg je toe:
     `https://JOUW-APP-ADRES/api/auth/callback/google`
     (dus bijvoorbeeld
     `https://laadkosten.jouwdomein.be/api/auth/callback/google`)
   - Klik **Maken**. Je krijgt een **client-ID** en een **clientgeheim**.
5. Terug in Vercel, bij **Settings → Environment Variables**, voeg toe:

   | Naam | Waarde |
   | --- | --- |
   | `AUTH_GOOGLE_ID` | het client-ID |
   | `AUTH_GOOGLE_SECRET` | het clientgeheim |
   | `AUTH_URL` | je app-adres, bv. `https://laadkosten.jouwdomein.be` |

6. Ga naar **Deployments**, klik rechts bij de bovenste op de drie puntjes en
   kies **Redeploy**. Zonder die stap kent de app de nieuwe waarden nog niet.

Ga nu naar je app-adres. Je hoort te kunnen inloggen met Google.

---

## 4. Home Assistant: de sessies doorsturen

### 4a. De integratie installeren via HACS

1. Open HACS in Home Assistant.
2. Klik rechtsboven op de drie puntjes → **Custom repositories**.
3. Plak de URL van deze repository, kies als type **Integration**, klik
   **Add**.
4. Zoek in HACS naar **Laadkosten rapportage** en klik **Download**.
5. Herstart Home Assistant.

### 4b. De integratie instellen

1. Ga naar **Instellingen → Apparaten en diensten → Integratie toevoegen**.
2. Zoek **Laadkosten rapportage**.
3. Vul in:
   - **Adres van evcc**: bijvoorbeeld `http://homeassistant.local:7070`.
     Draait evcc als add-on, dan is dat meestal
     `http://a0d7b954-evcc:7070` of het IP-adres van je Home Assistant met
     poort 7070.
   - **Adres van de rapportage-app**: je app-adres uit stap 2.
   - **API-sleutel**: de `INGEST_API_KEY` die je bij Vercel hebt gezet.
4. Klik **Verzenden**. De integratie test meteen beide verbindingen en zegt
   het als er iets niet klopt.

Je krijgt een apparaat met drie sensoren en een knop **Nu synchroniseren**.
Druk daar één keer op: alle sessies die evcc kent, worden meteen doorgestuurd.
Daarna gebeurt dat vanzelf, elk halfuur.

---

## 5. De app klaarzetten

Ga naar je app en werk het lijstje op het beginscherm af:

1. **Instellingen** — vul in aan wie terugbetaald moet worden (jouw naam,
   adres, rekeningnummer). Die gegevens komen op elk rapport.
2. **Vennootschappen** — voeg je twee vennootschappen toe, met btw-nummer en
   adres.
3. **Laadpalen** — je laadpalen staan er al, want die zijn met de eerste
   synchronisatie mee binnengekomen. Kies per laadpaal de juiste vennootschap
   en klik **Koppelingen bewaren**.
4. **Tarieven** — klik bij het huidige kwartaal op **Automatisch zoeken**,
   kijk het gevonden bedrag na en klik **Bevestigen**. Vindt de app niets? Vul
   het dan zelf in onderaan die pagina.
5. **Gebruikers** — optioneel: geef de andere vennootschap toegang. Zie
   [docs/GEBRUIK.md](GEBRUIK.md#iemand-toegang-geven) voor wat elke rol mag.

Zodra het beginscherm meldt dat alles klaarstaat, kan je je eerste rapport
maken.

---

## Als er iets misloopt

**"evcc antwoordt niet op dit adres"**
Controleer of evcc draait en op welke poort. Probeer het adres eerst in je
browser: je hoort de evcc-webinterface te zien. Werkt `homeassistant.local`
niet, gebruik dan het IP-adres.

**"De app weigert deze API-sleutel"**
De `INGEST_API_KEY` bij Vercel verschilt van wat je in Home Assistant hebt
ingevuld. Let op onzichtbare spaties bij het plakken. Heb je de waarde bij
Vercel aangepast? Dan moet je opnieuw implementeren voor die actief wordt.

**Inloggen mislukt met "toegang geweigerd"**
Het adres staat niet in `TOEGELATEN_EMAILS` én is ook niet toegevoegd bij
**Gebruikers** in de app. Let op dat iemand zich aanmeldt met precies het adres
dat je hebt ingevuld: het Google-account moet hetzelfde adres hebben.
Hoofdletters maken niet uit, spaties wel.

**Je hebt jezelf per ongeluk gedegradeerd**
Dat kan niet als je adres in `TOEGELATEN_EMAILS` staat: dat blijft altijd
hoofdbeheerder, wat er ook in de databank staat. Is dat toch gebeurd bij een
ander adres, zet dat adres dan tijdelijk bij `TOEGELATEN_EMAILS` en implementeer
opnieuw.

**De app toont "De databank is niet bereikbaar"**
`SUPABASE_URL` of `SUPABASE_SERVICE_ROLE_KEY` klopt niet, of het SQL-script uit
stap 1 is nooit uitgevoerd.

**Er komen geen sessies binnen**
Kijk bij **Instellingen** in de app onder *Laatste synchronisaties*. Staat daar
niets, druk dan in Home Assistant op **Nu synchroniseren** en kijk opnieuw.
