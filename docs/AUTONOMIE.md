# Zoveel mogelijk laten doen

Wat je één keer instelt zodat er in een volgende sessie zo weinig mogelijk aan
jou gevraagd moet worden. Ook nuttig wanneer een token vervalt en je even niet
meer weet welke er ook alweer nodig waren.

## 1. Omgevingsvariabelen in Claude Code

Ga naar [claude.ai/code](https://claude.ai/code) → je omgeving →
**Environment variables**. Die blijven bewaard over sessies heen, dus je hoeft
nooit een sleutel in een gesprek te plakken.

| Variabele | Waar je die vindt |
| --- | --- |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | in `web/.vercel/project.json`, na het koppelen |
| `VERCEL_PROJECT_ID` | idem |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF` | het stukje uit je project-URL: `https://<dit>.supabase.co` |
| `SUPABASE_DB_PASSWORD` | het wachtwoord dat je koos bij het aanmaken van het project |

Die namen zijn niet vrij gekozen: de Vercel-CLI en de Supabase-CLI lezen ze
vanzelf uit. Er valt dus verder niets te configureren.

## 2. Netwerktoegang

De omgeving heeft een netwerkpolicy. Staat die op beperkt, laat dan minstens
toe:

- `vercel.com` en `api.vercel.com`
- `supabase.com` en `*.supabase.co`

Zonder die toegang zijn de tokens wel zichtbaar maar onbruikbaar.

## 3. GitHub Actions-secrets

Repository → Settings → Secrets and variables → Actions. Zet daar dezelfde
drie Vercel-waarden neer: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

Daarmee kan werk in een workflow gezet worden dat ook draait wanneer er geen
sessie openstaat: automatisch uitrollen na een merge, of een geplande taak.

---

## Wat daarmee mogelijk wordt

- uitrollen naar Vercel, en terugrollen naar een vorige versie
- omgevingsvariabelen zetten en wijzigen
- bouwlogs lezen wanneer iets faalt
- migraties op de databank draaien
- data nakijken wanneer een cijfer niet klopt
- de volledige installatie uitvoeren, van leeg project tot draaiende app

## Wat hoe dan ook handwerk blijft

Het OAuth-scherm in de Google Cloud Console. Er bestaat geen API om
inloggegevens voor consumenten aan te maken, dus dat zijn en blijven een paar
minuten klikken in je eigen Google-account. Zie stap 3 van
[INSTALLATIE.md](INSTALLATIE.md); het installatiescript zet de juiste
omleidings-URL voor je klaar.

## Over veiligheid

- Een Vercel-token geeft **volledige toegang tot je Vercel-account**, niet
  enkel tot dit project. Geef het een vervaldatum, bijvoorbeeld 90 dagen.
- Hetzelfde geldt voor het Supabase-token.
- Zet ze in de omgevingsvariabelen, niet in een gesprek: daar blijven ze
  anders in de geschiedenis staan.
- Vermoed je dat een token gelekt is? Trek het in bij de aanbieder en maak een
  nieuw aan. De app zelf hoeft daar niets van te merken; enkel deze
  omgevingsvariabelen en de GitHub-secrets moeten dan bijgewerkt worden.
- De sleutels van de app zelf — `INGEST_API_KEY`, `AUTH_SECRET`, `CRON_SECRET`
  en de Supabase `service_role` — staan enkel bij Vercel. Die horen hier niet
  bij en moeten nergens anders bewaard worden.
