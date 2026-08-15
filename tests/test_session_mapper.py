"""Tests voor de omzetting van evcc-sessies."""

from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import pytest

# Rechtstreeks inladen: het package zelf importeert Home Assistant, en dat hoeft
# niet geïnstalleerd te zijn om deze pure logica te testen.
_MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "laadkosten"
    / "session_mapper.py"
)
_spec = importlib.util.spec_from_file_location("session_mapper", _MODULE_PATH)
session_mapper = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(session_mapper)

extract_meter_readings = session_mapper.extract_meter_readings
extract_sessions = session_mapper.extract_sessions
filter_recent = session_mapper.filter_recent
normalise_session = session_mapper.normalise_session

VOLLEDIGE_SESSIE = {
    "id": 42,
    "created": "2026-01-15T08:30:00Z",
    "finished": "2026-01-15T11:00:00Z",
    "loadpoint": "Garage",
    "vehicle": "Auto Jandra",
    "meterStart": 1000.5,
    "meterStop": 1030.5,
    "chargedEnergy": 30.0,
    "chargeDuration": 9000000000000,
    "solarPercentage": 42.5,
    "odometer": 41234,
    "price": 7.5,
    "pricePerKWh": 0.25,
}


def test_volledige_sessie_wordt_correct_omgezet():
    result = normalise_session(VOLLEDIGE_SESSIE)

    assert result is not None
    assert result["external_id"] == "evcc:42"
    assert result["loadpoint"] == "Garage"
    assert result["vehicle"] == "Auto Jandra"
    assert result["energy_kwh"] == 30.0
    assert result["meter_start_kwh"] == 1000.5
    assert result["meter_stop_kwh"] == 1030.5
    assert result["solar_percentage"] == 42.5
    assert result["is_complete"] is True


def test_duur_in_nanoseconden_wordt_seconden():
    result = normalise_session(VOLLEDIGE_SESSIE)
    assert result["duration_seconds"] == 9000.0


def test_duur_in_seconden_blijft_seconden():
    result = normalise_session({**VOLLEDIGE_SESSIE, "chargeDuration": 9000})
    assert result["duration_seconds"] == 9000.0


def test_duur_valt_terug_op_de_tijdstippen():
    raw = {key: value for key, value in VOLLEDIGE_SESSIE.items() if key != "chargeDuration"}
    result = normalise_session(raw)
    assert result["duration_seconds"] == 9000.0


def test_pascalcase_van_oudere_evcc_versies():
    result = normalise_session(
        {
            "ID": 7,
            "Created": "2026-02-01T10:00:00Z",
            "Finished": "2026-02-01T12:00:00Z",
            "Loadpoint": "Oprit",
            "ChargedEnergy": 12.0,
        }
    )
    assert result is not None
    assert result["external_id"] == "evcc:7"
    assert result["loadpoint"] == "Oprit"
    assert result["energy_kwh"] == 12.0


def test_energie_wordt_afgeleid_uit_de_meterstanden():
    raw = {key: value for key, value in VOLLEDIGE_SESSIE.items() if key != "chargedEnergy"}
    result = normalise_session(raw)
    assert result["energy_kwh"] == pytest.approx(30.0)


def test_lopende_sessie_is_niet_volledig():
    raw = {**VOLLEDIGE_SESSIE, "finished": "0001-01-01T00:00:00Z"}
    result = normalise_session(raw)
    assert result["finished_at"] is None
    assert result["is_complete"] is False


def test_negatieve_energie_wordt_geweigerd():
    """Een teruggezette teller mag geen creditnota veroorzaken."""
    result = normalise_session({**VOLLEDIGE_SESSIE, "chargedEnergy": -5})
    assert result["energy_kwh"] is None
    assert result["is_complete"] is False


def test_sessie_zonder_id_wordt_overgeslagen():
    assert normalise_session({"created": "2026-01-15T08:30:00Z"}) is None


def test_sessie_zonder_tijdstip_wordt_overgeslagen():
    assert normalise_session({"id": 3, "chargedEnergy": 10}) is None


def test_zonnefractie_wordt_begrensd():
    assert normalise_session({**VOLLEDIGE_SESSIE, "solarPercentage": 140})[
        "solar_percentage"
    ] == 100.0
    assert normalise_session({**VOLLEDIGE_SESSIE, "solarPercentage": -3})[
        "solar_percentage"
    ] == 0.0


def test_tijdstippen_worden_naar_utc_gebracht():
    result = normalise_session(
        {**VOLLEDIGE_SESSIE, "created": "2026-01-15T09:30:00+01:00"}
    )
    assert result["started_at"] == "2026-01-15T08:30:00+00:00"


@pytest.mark.parametrize(
    "payload",
    [
        {"result": [VOLLEDIGE_SESSIE]},
        [VOLLEDIGE_SESSIE],
        {"sessions": [VOLLEDIGE_SESSIE]},
    ],
)
def test_beide_antwoordvormen_van_evcc(payload):
    assert len(extract_sessions(payload)) == 1


def test_onbruikbare_sessies_blokkeren_de_rest_niet():
    sessies = extract_sessions([VOLLEDIGE_SESSIE, {"onzin": True}, "geen dict"])
    assert len(sessies) == 1


def test_filter_recent_houdt_alles_bij_nul():
    sessies = extract_sessions([VOLLEDIGE_SESSIE])
    assert len(filter_recent(sessies, 0)) == 1


def test_filter_recent_laat_oude_sessies_vallen():
    sessies = extract_sessions([VOLLEDIGE_SESSIE])
    nu = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert filter_recent(sessies, 30, now=nu) == []
    assert len(filter_recent(sessies, 365, now=nu)) == 1


def test_meterstanden_uit_de_evcc_status():
    state = {
        "result": {
            "loadpoints": [
                {"title": "Garage", "chargeTotalImport": 1234.5},
                {"title": "Oprit"},
            ]
        }
    }
    readings = extract_meter_readings(state)
    assert readings == [{"loadpoint": "Garage", "reading_kwh": 1234.5}]


def test_meterstanden_bij_onverwacht_antwoord():
    assert extract_meter_readings(None) == []
    assert extract_meter_readings({"result": {}}) == []
