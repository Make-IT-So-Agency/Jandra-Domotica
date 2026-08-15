#!/usr/bin/env bash
#
# Zet de laadkosten-app op: databank, sleutels, hosting en uitrol.
#
# Draai dit vanuit de hoofdmap van de repository:
#
#   bash scripts/installeer.sh
#
# Het script mag je gerust opnieuw draaien. Bestaande instellingen worden
# bijgewerkt in plaats van gedupliceerd.

set -euo pipefail

# ---------------------------------------------------------------------------
# Opmaak
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  VET=$'\033[1m'; GROEN=$'\033[32m'; GEEL=$'\033[33m'; ROOD=$'\033[31m'; UIT=$'\033[0m'
else
  VET=""; GROEN=""; GEEL=""; ROOD=""; UIT=""
fi

stap()      { printf '\n%s▸ %s%s\n' "$VET" "$1" "$UIT"; }
goed()      { printf '%s  ✓ %s%s\n' "$GROEN" "$1" "$UIT"; }
letop()     { printf '%s  ! %s%s\n' "$GEEL" "$1" "$UIT"; }
mislukt()   { printf '%s  ✗ %s%s\n' "$ROOD" "$1" "$UIT" >&2; exit 1; }
vraag()     { printf '\n  %s\n' "$1"; }

# Leest een antwoord in, ook als het script via een pijp gestart is.
lees() {
  local __naam=$1 __prompt=$2 __stil=${3:-nee} __waarde=""
  if [ "$__stil" = "stil" ]; then
    read -r -s -p "  $__prompt" __waarde < /dev/tty
    echo
  else
    read -r -p "  $__prompt" __waarde < /dev/tty
  fi
  printf -v "$__naam" '%s' "$__waarde"
}

bevestig() {
  local antwoord
  read -r -p "  $1 [j/N] " antwoord < /dev/tty
  [[ "$antwoord" =~ ^([jJ]|[yY])$ ]]
}

# ---------------------------------------------------------------------------
# Controles vooraf
# ---------------------------------------------------------------------------
cat <<'INTRO'

  Installatie van de laadkosten-app
  =================================

  Dit script regelt:
    - de drie geheime sleutels
    - de tabellen in je Supabase-databank
    - het Vercel-project, met alle omgevingsvariabelen
    - de eerste uitrol

  Wat het NIET kan: het Google-luik voor het inloggen. Daarvoor moet je zelf
  even in de Google Cloud Console klikken. Het script zegt op het einde precies
  wat je daar moet doen, met de juiste adressen erbij.

  Je hebt nodig: een Supabase-project en een Vercel-account. Het script opent
  daarvoor je browser om aan te melden.

INTRO

bevestig "Beginnen?" || { echo "  Afgebroken."; exit 0; }

stap "Omgeving controleren"

[ -f "web/package.json" ] || mislukt "Draai dit vanuit de hoofdmap van de repository."
command -v node >/dev/null 2>&1 || mislukt "Node.js is niet geïnstalleerd. Zie https://nodejs.org"
command -v npx  >/dev/null 2>&1 || mislukt "npx ontbreekt; die hoort bij Node.js."

NODE_VERSIE=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_VERSIE" -ge 20 ] || mislukt "Node.js 20 of nieuwer is nodig; je hebt versie $NODE_VERSIE."
goed "Node.js $(node -p 'process.versions.node')"

# ---------------------------------------------------------------------------
# 1. Sleutels
# ---------------------------------------------------------------------------
stap "Geheime sleutels aanmaken"

maak_sleutel() {
  # Hex of base64, allebei ruim voldoende willekeurig.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

AUTH_SECRET=$(maak_sleutel)
INGEST_API_KEY=$(maak_sleutel)
CRON_SECRET=$(maak_sleutel)
goed "Drie sleutels aangemaakt (AUTH_SECRET, INGEST_API_KEY, CRON_SECRET)"

# ---------------------------------------------------------------------------
# 2. Supabase
# ---------------------------------------------------------------------------
stap "Supabase"

cat <<'UITLEG'
  Open https://supabase.com/dashboard en maak een project aan als je er nog
  geen hebt (New project, regio Frankfurt of Ireland).

  Daarna heb ik drie dingen nodig, allemaal te vinden onder
  Project Settings:
    - de Project URL            (onder API)
    - de service_role sleutel   (onder API, klik op Reveal)
    - het databankwachtwoord    (dat je bij het aanmaken koos)
UITLEG

lees SUPABASE_URL "Project URL (https://xxxx.supabase.co): "
[[ "$SUPABASE_URL" =~ ^https://[a-z0-9-]+\.supabase\.co/?$ ]] \
  || mislukt "Dat ziet er niet uit als een Supabase Project URL."
SUPABASE_URL="${SUPABASE_URL%/}"

# De projectverwijzing zit in de hostnaam en hebben we nodig voor de databank.
PROJECT_REF=$(printf '%s' "$SUPABASE_URL" | sed -E 's#https://([a-z0-9-]+)\.supabase\.co#\1#')
goed "Project: $PROJECT_REF"

lees SUPABASE_SERVICE_ROLE_KEY "service_role sleutel: " stil
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || mislukt "Zonder die sleutel kan de app niets."
case "$SUPABASE_SERVICE_ROLE_KEY" in
  eyJ*|sb_*) : ;;
  *) letop "Deze sleutel heeft een ongewone vorm. Kijk na of je de service_role sleutel hebt en niet de anon-sleutel." ;;
esac
goed "Sleutel ontvangen"

lees DB_WACHTWOORD "Databankwachtwoord: " stil
[ -n "$DB_WACHTWOORD" ] || mislukt "Zonder wachtwoord kan ik de tabellen niet aanmaken."

# Tekens met een betekenis in een URL moeten gecodeerd worden, anders breekt de
# connectiestring op een wachtwoord met bijvoorbeeld een @ of een #.
DB_WACHTWOORD_GECODEERD=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DB_WACHTWOORD")

stap "Tabellen aanmaken"

# De pooler is van overal bereikbaar, ook vanachter een verbinding zonder IPv6.
DB_URL="postgresql://postgres.${PROJECT_REF}:${DB_WACHTWOORD_GECODEERD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

if node scripts/voer-sql-uit.mjs "$DB_URL" \
     web/supabase/schema.sql web/supabase/migratie-01-gebruikers.sql; then
  goed "Alle tabellen staan klaar"
else
  letop "Het uitvoeren van het schema is niet gelukt."
  cat <<'HANDMATIG'
    Geen ramp: je kan het ook met de hand doen. Open in Supabase de SQL Editor,
    plak de volledige inhoud van web/supabase/schema.sql en klik Run. Doe daarna
    hetzelfde met web/supabase/migratie-01-gebruikers.sql.
HANDMATIG
  bevestig "Verdergaan met de rest van de installatie?" || exit 1
fi

# ---------------------------------------------------------------------------
# 3. Wie mag binnen
# ---------------------------------------------------------------------------
stap "Hoofdbeheerder"

vraag "Welk e-mailadres wordt hoofdbeheerder? Dit is je noodingang: dit adres"
printf '  %s\n' "blijft altijd volledige toegang houden. Meerdere mag, met komma's ertussen."
lees TOEGELATEN_EMAILS "E-mailadres: "
[[ "$TOEGELATEN_EMAILS" == *@* ]] || mislukt "Dat lijkt geen e-mailadres."
goed "Hoofdbeheerder: $TOEGELATEN_EMAILS"

# ---------------------------------------------------------------------------
# 4. Vercel
# ---------------------------------------------------------------------------
stap "Vercel"

cd web

if [ ! -f ".vercel/project.json" ]; then
  echo "  Je browser opent zo om je bij Vercel aan te melden."
  echo "  Kies of maak een project. Als er naar de hoofdmap gevraagd wordt: die is al goed."
  npx -y vercel@latest link || mislukt "Koppelen met Vercel is niet gelukt."
fi
goed "Gekoppeld aan een Vercel-project"

zet_variabele() {
  local naam=$1 waarde=$2 omgeving
  for omgeving in production preview development; do
    # Eerst weghalen: env add weigert een naam die al bestaat.
    npx -y vercel@latest env rm "$naam" "$omgeving" --yes >/dev/null 2>&1 || true
    printf '%s' "$waarde" | npx -y vercel@latest env add "$naam" "$omgeving" >/dev/null 2>&1 \
      || mislukt "Kon $naam niet instellen voor $omgeving."
  done
  goed "$naam ingesteld"
}

stap "Omgevingsvariabelen instellen"
zet_variabele SUPABASE_URL               "$SUPABASE_URL"
zet_variabele SUPABASE_SERVICE_ROLE_KEY  "$SUPABASE_SERVICE_ROLE_KEY"
zet_variabele AUTH_SECRET                "$AUTH_SECRET"
zet_variabele INGEST_API_KEY             "$INGEST_API_KEY"
zet_variabele CRON_SECRET                "$CRON_SECRET"
zet_variabele TOEGELATEN_EMAILS          "$TOEGELATEN_EMAILS"

# Google vullen we straks aan; zonder deze variabelen faalt de build niet, maar
# inloggen werkt pas als ze een echte waarde hebben.
zet_variabele AUTH_GOOGLE_ID     "nog-in-te-vullen"
zet_variabele AUTH_GOOGLE_SECRET "nog-in-te-vullen"

stap "Eerste uitrol"
echo "  Dit duurt een minuut of twee."
npx -y vercel@latest --prod --yes || mislukt "De uitrol is niet gelukt."

APP_URL=$(npx -y vercel@latest inspect --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.alias?.[0]?`https://${j.alias[0]}`:"")}catch{console.log("")}})' \
  || true)

if [ -z "$APP_URL" ]; then
  vraag "Ik kon het adres van je app niet automatisch uitlezen."
  lees APP_URL "Adres van de app (https://...): "
fi
APP_URL="${APP_URL%/}"
zet_variabele AUTH_URL "$APP_URL"

cd ..

# ---------------------------------------------------------------------------
# Klaar
# ---------------------------------------------------------------------------
cat <<KLAAR

${GROEN}${VET}  De app staat online: ${APP_URL}${UIT}

${VET}  Nog twee dingen die enkel jij kan doen${UIT}

  ${VET}1. Google-login aanzetten${UIT}

     a. Ga naar https://console.cloud.google.com en maak een project aan.
     b. API's en services → OAuth-toestemmingsscherm → Extern → vul je naam en
        e-mailadres in. Staat de app op "Testen"? Voeg jezelf toe bij
        Testgebruikers.
     c. API's en services → Inloggegevens → Inloggegevens maken →
        OAuth-client-ID → Webtoepassing.
     d. Bij "Geautoriseerde omleidings-URI's" plak je exact dit:

        ${VET}${APP_URL}/api/auth/callback/google${UIT}

     e. Je krijgt een client-ID en een clientgeheim. Vul die hier in met:

        cd web
        npx vercel env rm AUTH_GOOGLE_ID production --yes
        npx vercel env add AUTH_GOOGLE_ID production
        npx vercel env rm AUTH_GOOGLE_SECRET production --yes
        npx vercel env add AUTH_GOOGLE_SECRET production
        npx vercel --prod

  ${VET}2. Home Assistant koppelen${UIT}

     Installeer de integratie via HACS (zie docs/INSTALLATIE.md, stap 4) en vul
     bij het instellen in:

       Adres van de rapportage-app : ${VET}${APP_URL}${UIT}
       API-sleutel                 : ${VET}${INGEST_API_KEY}${UIT}

  ${GEEL}Bewaar die API-sleutel nu ergens veilig: hij staat verder nergens
  leesbaar, ook niet in Vercel.${UIT}

KLAAR
