#!/usr/bin/env bash
#
# Draait alle migraties in volgorde tegen een lege PostgreSQL, en daarna nog
# eens, om de huisregel te bewaken dat een migratie herhaalbaar is.
#
#   scripts/test-migraties.sh
#
# Zet zijn eigen tijdelijke server op met enkel een unix-socket, dus er is geen
# service-container nodig en er wordt niets aan een echte databank geraakt.

set -euo pipefail

MIGRATIES="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

# De binaries staan op een runner niet standaard in het pad.
for map in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin; do
  [ -d "$map" ] && PATH="$map:$PATH"
done
export PATH

command -v initdb >/dev/null || { echo "PostgreSQL niet gevonden."; exit 1; }

# "relation already exists, skipping" is bij de tweede ronde precies wat we
# willen zien, maar het verdrinkt de rest. Enkel waarschuwingen en erger.
export PGOPTIONS='-c client_min_messages=warning'

WERKMAP="$(mktemp -d)"
GEGEVENS="$WERKMAP/data"
SOCKET="$WERKMAP/socket"
mkdir -p "$SOCKET"

opruimen() {
  pg_ctl -D "$GEGEVENS" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WERKMAP"
}
trap opruimen EXIT

# initdb weigert als root te draaien. Op een runner zijn we dat niet, in een
# container soms wel; dan wijken we uit naar een onbevoorrechte gebruiker.
ALS=""
if [ "$(id -u)" = "0" ]; then
  id -u pgproef >/dev/null 2>&1 || useradd -m pgproef
  chown -R pgproef "$WERKMAP"
  ALS="pgproef"
fi

draai() {
  if [ -n "$ALS" ]; then
    su "$ALS" -c "PATH=$PATH $*"
  else
    eval "$@"
  fi
}

echo "Tijdelijke PostgreSQL opzetten…"
draai "initdb -D '$GEGEVENS' -U postgres --auth=trust" >/dev/null
draai "pg_ctl -D '$GEGEVENS' -o \"-k '$SOCKET' -h ''\" -l '$WERKMAP/log' start" >/dev/null

for poging in $(seq 1 30); do
  if psql -h "$SOCKET" -U postgres -c "select 1" >/dev/null 2>&1; then break; fi
  [ "$poging" = "30" ] && { echo "Server kwam niet op."; cat "$WERKMAP/log"; exit 1; }
  sleep 1
done

psql -h "$SOCKET" -U postgres -c "create database proef" >/dev/null

toepassen() {
  local ronde="$1"
  for bestand in "$MIGRATIES"/*.sql; do
    printf '  %-14s %s … ' "$ronde" "$(basename "$bestand")"
    if psql -h "$SOCKET" -U postgres -d proef -v ON_ERROR_STOP=1 -q -f "$bestand" >/dev/null; then
      echo "in orde"
    else
      echo "MISLUKT"
      exit 1
    fi
  done
}

echo "Migraties toepassen…"
toepassen "eerste keer"

# De huisregel uit de migratiebestanden: twee keer draaien mag nooit iets
# kapotmaken. Dat bewaken we hier in plaats van erop te vertrouwen.
echo "Nog eens, want migraties horen herhaalbaar te zijn…"
toepassen "tweede keer"

echo "Controleren of de verwachte tabellen er staan…"
ontbreekt=0
for tabel in companies loadpoints sessions tariffs meter_readings \
             reports app_settings app_users ingest_log; do
  aanwezig="$(psql -h "$SOCKET" -U postgres -d proef -tAc \
    "select to_regclass('public.$tabel') is not null")"
  if [ "$aanwezig" = "t" ]; then
    echo "  aanwezig: $tabel"
  else
    echo "  ONTBREEKT: $tabel"
    ontbreekt=1
  fi
done

# De controles uit scripts/sql/ draaien mee, als die er zijn.
for controle in "$(dirname "$MIGRATIES")/../scripts/sql"/test-*.sql; do
  [ -f "$controle" ] || continue
  echo "Controle: $(basename "$controle")"
  psql -h "$SOCKET" -U postgres -d proef -v ON_ERROR_STOP=1 -f "$controle"
done

# De upserts in de webapp gebruiken ON CONFLICT. Postgres aanvaardt dat enkel
# met een unieke index op precies die kolommen, en het verschil met een index op
# een expressie is onzichtbaar tot een uitrol. Hier is het schema er net, dus
# hier valt dat te toetsen.
echo "Controleren of elke upsert een bruikbaar conflictdoel heeft…"
HIER="$(cd "$(dirname "$0")" && pwd)"
if command -v node >/dev/null; then
  node "$HIER/controleer-conflictdoelen.mjs" "$SOCKET" proef || ontbreekt=1
else
  echo "  OVERGESLAGEN: node niet gevonden, deze controle draaide niet"
fi

exit $ontbreekt
