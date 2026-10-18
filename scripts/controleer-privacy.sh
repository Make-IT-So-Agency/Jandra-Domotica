#!/usr/bin/env bash
#
# Kijkt de gestagede wijzigingen na vóór een commit. De repository is publiek,
# dus er mag niets in staan van:
#
#   - de woorden uit PRIVE_WOORDEN, een omgevingsvariabele van de
#     cloudomgeving, met komma's gescheiden (zoals een stuk van ons adres).
#     Die woorden staan zelf nooit in de repository;
#   - een Telegram-bottoken of een sleutel die op een JWT lijkt;
#   - de naam van een AI-model.
#
#   git add -A && scripts/controleer-privacy.sh
#
# Toont enkel aantallen, nooit de regels zelf.

set -euo pipefail

if [ -z "${PRIVE_WOORDEN:-}" ]; then
  echo "PRIVE_WOORDEN is niet ingesteld. Niet committen: vraag het aan Jan." >&2
  exit 1
fi

# De komma's worden een keuze in de regex; spaties rond een woord en lege
# stukken vallen weg.
woorden=$(printf '%s' "$PRIVE_WOORDEN" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | paste -sd '|' - || true)
if [ -z "$woorden" ]; then
  echo "PRIVE_WOORDEN is leeg. Niet committen: vraag het aan Jan." >&2
  exit 1
fi

wijziging=$(git diff --cached)
if [ -z "$wijziging" ]; then
  echo "Er is niets gestaged."
  exit 0
fi

fout=0
controleer() {
  local naam=$1 patroon=$2 opties=(-c -E)
  [ "${3:-}" = "hoofdletters" ] && opties+=(-i)
  local aantal
  aantal=$(printf '%s\n' "$wijziging" | grep "${opties[@]}" -- "$patroon" || true)
  if [ "$aantal" != 0 ]; then
    echo "$naam: $aantal regel(s) in de gestagede wijzigingen." >&2
    fout=1
  fi
}

controleer "Privéwoorden" "$woorden" hoofdletters
controleer "Telegram-token" '[0-9]{8,10}:[A-Za-z0-9_-]{35}'
# In twee stukken, zodat dit script zichzelf niet vindt.
controleer "Sleutel" 'ey''J[A-Za-z0-9_-]{10,}'
controleer "Modelnaam" 'claude-(opus|sonnet|haiku|fable|mythos)|(opus|sonnet|haiku|fable|mythos) [0-9]' hoofdletters

if [ "$fout" = 0 ]; then
  echo "In orde: niets privé in de gestagede wijzigingen."
fi
exit "$fout"
