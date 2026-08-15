"""Vertaalt ruwe evcc-sessies naar het formaat dat de webapp verwacht.

Dit bestand importeert bewust niets van Home Assistant, zodat de logica
los getest kan worden (zie tests/test_session_mapper.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

# evcc schrijft een "lege" tijd weg als het jaar 1 in plaats van null.
_EMPTY_YEAR = 1

# Go serialiseert time.Duration als nanoseconden. Een laadsessie van een uur is
# 3.6e12 ns maar slechts 3600 s, dus alles boven deze grens is zeker ns.
_NANOSECOND_THRESHOLD = 1_000_000_000


def _first(raw: dict[str, Any], *names: str) -> Any:
    """Geef de eerste sleutel terug die bestaat en niet None is.

    evcc heeft doorheen zijn versies zowel camelCase, PascalCase als ID-stijl
    gebruikt, dus we vergelijken hoofdletterongevoelig.
    """
    lowered = {str(key).lower(): value for key, value in raw.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value is not None:
            return value
    return None


def _to_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    # NaN en oneindig zijn nooit een geldige meterstand of hoeveelheid energie.
    if result != result or result in (float("inf"), float("-inf")):
        return None
    return result


def _to_datetime(value: Any) -> datetime | None:
    """Parseer een RFC3339-tijdstip zoals evcc dat teruggeeft."""
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        # Python < 3.11 slikt de "Z"-suffix niet in fromisoformat.
        if text.endswith(("Z", "z")):
            text = f"{text[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    if parsed.year <= _EMPTY_YEAR:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _duration_seconds(value: Any) -> float | None:
    seconds = _to_float(value)
    if seconds is None or seconds < 0:
        return None
    if seconds >= _NANOSECOND_THRESHOLD:
        return seconds / 1_000_000_000
    return seconds


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalise_session(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Zet één evcc-sessie om. Geeft None terug als de sessie onbruikbaar is."""
    if not isinstance(raw, dict):
        return None

    session_id = _first(raw, "id")
    if session_id is None:
        return None

    started_at = _to_datetime(_first(raw, "created", "start", "startTime"))
    finished_at = _to_datetime(_first(raw, "finished", "stop", "stopTime"))
    if started_at is None and finished_at is None:
        # Zonder enige tijdsaanduiding kunnen we de sessie nooit in een
        # rapportperiode plaatsen.
        return None

    meter_start = _to_float(_first(raw, "meterStart"))
    meter_stop = _to_float(_first(raw, "meterStop"))

    energy = _to_float(_first(raw, "chargedEnergy", "energy"))
    if energy is None and meter_start is not None and meter_stop is not None:
        energy = meter_stop - meter_start
    if energy is not None and energy < 0:
        # Een negatieve hoeveelheid duidt op een metertelller die teruggezet is;
        # doorrekenen zou een creditnota opleveren die niemand verwacht.
        energy = None

    duration = _duration_seconds(_first(raw, "chargeDuration", "duration"))
    if duration is None and started_at and finished_at:
        duration = max((finished_at - started_at).total_seconds(), 0.0)

    solar = _to_float(_first(raw, "solarPercentage"))
    if solar is not None:
        solar = min(max(solar, 0.0), 100.0)

    return {
        "external_id": f"evcc:{session_id}",
        "loadpoint": _clean_text(_first(raw, "loadpoint")),
        "vehicle": _clean_text(_first(raw, "vehicle")),
        "started_at": started_at.isoformat() if started_at else None,
        "finished_at": finished_at.isoformat() if finished_at else None,
        "energy_kwh": energy,
        "meter_start_kwh": meter_start,
        "meter_stop_kwh": meter_stop,
        "duration_seconds": duration,
        "solar_percentage": solar,
        "odometer_km": _to_float(_first(raw, "odometer")),
        "evcc_price_eur": _to_float(_first(raw, "price")),
        "evcc_price_per_kwh": _to_float(_first(raw, "pricePerKWh")),
        # Een sessie zonder eindtijd loopt nog; die tonen we wel maar rekenen
        # we niet door in een rapport.
        "is_complete": finished_at is not None and energy is not None,
    }


def extract_sessions(payload: Any) -> list[dict[str, Any]]:
    """Haal de sessielijst uit een evcc-antwoord.

    Nieuwe evcc-versies verpakken alles in {"result": [...]}, oudere geven
    meteen een lijst terug.
    """
    if isinstance(payload, dict):
        for key in ("result", "sessions", "data"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
        else:
            return []
    if not isinstance(payload, list):
        return []

    sessions: list[dict[str, Any]] = []
    for item in payload:
        mapped = normalise_session(item)
        if mapped is not None:
            sessions.append(mapped)
    return sessions


def filter_recent(
    sessions: Iterable[dict[str, Any]],
    history_days: int,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Beperk tot sessies van de laatste N dagen. 0 betekent: alles."""
    items = list(sessions)
    if history_days <= 0:
        return items

    reference = now or datetime.now(timezone.utc)
    cutoff = reference - timedelta(days=history_days)
    recent: list[dict[str, Any]] = []
    for session in items:
        stamp = _to_datetime(session.get("finished_at") or session.get("started_at"))
        if stamp is None or stamp >= cutoff:
            recent.append(session)
    return recent


def extract_meter_readings(state: Any) -> list[dict[str, Any]]:
    """Lees de huidige meterstand per laadpunt uit /api/state.

    Die standen dienen als controlegetal naast de optelling van de sessies.
    """
    if isinstance(state, dict) and isinstance(state.get("result"), dict):
        state = state["result"]
    if not isinstance(state, dict):
        return []

    loadpoints = state.get("loadpoints")
    if not isinstance(loadpoints, list):
        return []

    readings: list[dict[str, Any]] = []
    for index, loadpoint in enumerate(loadpoints):
        if not isinstance(loadpoint, dict):
            continue
        title = _clean_text(_first(loadpoint, "title")) or f"Laadpunt {index + 1}"
        total = _to_float(_first(loadpoint, "chargeTotalImport", "meterEnergy"))
        if total is None:
            continue
        readings.append({"loadpoint": title, "reading_kwh": total})
    return readings
