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

extract_live_sessions = session_mapper.extract_live_sessions
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


# --- Sessies die op dit moment lopen ---------------------------------------

NU = datetime(2026, 9, 9, 12, 0, tzinfo=timezone.utc)

LOPEND_LAADPUNT = {
    "title": "Garage",
    "connected": True,
    "charging": True,
    # In wattuur, zoals evcc het in /api/state publiceert.
    "chargedEnergy": 12500,
    "sessionSolarPercentage": 60.0,
    "connectedDuration": 3600,
    "chargeDuration": 1800,
    "vehicleTitle": "Auto Jandra",
}


def _state(*loadpoints):
    return {"result": {"loadpoints": list(loadpoints)}}


def test_lopende_sessie_wordt_een_eigen_rij_per_laadpunt():
    live = extract_live_sessions(_state(LOPEND_LAADPUNT), now=NU)

    assert len(live) == 1
    sessie = live[0]
    assert sessie["external_id"] == "evcc:live:Garage"
    assert sessie["loadpoint"] == "Garage"
    assert sessie["vehicle"] == "Auto Jandra"
    assert sessie["energy_kwh"] == 12.5
    assert sessie["solar_percentage"] == 60.0
    assert sessie["duration_seconds"] == 1800
    assert sessie["finished_at"] is None


def test_lopende_sessie_is_nooit_afgerond():
    # Zou ze dat wel zijn, dan telde ze mee in de totalen en in een rapport,
    # naast de afgeronde sessie die evcc straks met haar eigen id stuurt.
    live = extract_live_sessions(_state(LOPEND_LAADPUNT), now=NU)
    assert live[0]["is_complete"] is False


def test_starttijd_komt_van_hoelang_de_wagen_al_hangt():
    live = extract_live_sessions(_state(LOPEND_LAADPUNT), now=NU)
    # connectedDuration is 3600 s, dus een uur voor NU.
    assert live[0]["started_at"] == datetime(
        2026, 9, 9, 11, 0, tzinfo=timezone.utc
    ).isoformat()


def test_starttijd_valt_terug_op_de_laadduur():
    zonder = {**LOPEND_LAADPUNT}
    del zonder["connectedDuration"]
    live = extract_live_sessions(_state(zonder), now=NU)
    assert live[0]["started_at"] == datetime(
        2026, 9, 9, 11, 30, tzinfo=timezone.utc
    ).isoformat()


def test_losgekoppeld_laadpunt_geeft_geen_lopende_sessie():
    los = {**LOPEND_LAADPUNT, "connected": False}
    assert extract_live_sessions(_state(los), now=NU) == []


def test_wagen_aan_de_kabel_zonder_te_laden_is_geen_sessie():
    wachtend = {
        **LOPEND_LAADPUNT,
        "charging": False,
        "chargedEnergy": 0,
    }
    assert extract_live_sessions(_state(wachtend), now=NU) == []


def test_gepauzeerde_sessie_met_energie_telt_wel_mee():
    pauze = {**LOPEND_LAADPUNT, "charging": False}
    live = extract_live_sessions(_state(pauze), now=NU)
    assert len(live) == 1
    assert live[0]["energy_kwh"] == 12.5


def test_energie_uit_de_status_staat_in_wattuur():
    # Dit ging een keer mis en stond als 9.600 kWh op het scherm: tien volle
    # autobatterijen in één sessie. /api/state publiceert chargedEnergy in Wh.
    live = extract_live_sessions(
        _state({**LOPEND_LAADPUNT, "chargedEnergy": 9600}), now=NU
    )
    assert live[0]["energy_kwh"] == 9.6


def test_de_meterstand_in_hetzelfde_antwoord_blijft_kilowattuur():
    # chargedEnergy staat in Wh maar chargeTotalImport in kWh -- twee eenheden
    # naast elkaar in hetzelfde object. Zou de omrekening ook op de meterstand
    # slaan, dan zakte elke meterstand met een factor duizend.
    laadpunt = {**LOPEND_LAADPUNT, "chargeTotalImport": 9600}
    state = _state(laadpunt)

    assert extract_live_sessions(state, now=NU)[0]["energy_kwh"] == 12.5
    assert extract_meter_readings(state)[0]["reading_kwh"] == 9600


def test_sessie_uit_de_sessielijst_blijft_kilowattuur():
    # De sessielijst gebruikt wél kWh. Die loopt langs normalise_session, en
    # daar mag niets omgerekend worden.
    assert normalise_session(VOLLEDIGE_SESSIE)["energy_kwh"] == 30.0


def test_laadpunt_zonder_naam_krijgt_hetzelfde_label_als_bij_de_meterstanden():
    naamloos = {**LOPEND_LAADPUNT}
    del naamloos["title"]

    live = extract_live_sessions(_state(naamloos), now=NU)
    meters = extract_meter_readings(_state({**naamloos, "chargeTotalImport": 100}))

    # Zou dit uiteenlopen, dan kwam dezelfde laadpaal er twee keer in te staan.
    assert live[0]["loadpoint"] == meters[0]["loadpoint"] == "Laadpunt 1"


def test_zonnefractie_wordt_ook_hier_begrensd():
    raar = {**LOPEND_LAADPUNT, "sessionSolarPercentage": 140}
    assert extract_live_sessions(_state(raar), now=NU)[0]["solar_percentage"] == 100.0


def test_negatieve_energie_wordt_genegeerd():
    raar = {**LOPEND_LAADPUNT, "chargedEnergy": -3}
    live = extract_live_sessions(_state(raar), now=NU)
    # Nog altijd aan het laden, dus wel een sessie -- maar zonder verzonnen getal.
    assert live[0]["energy_kwh"] is None


def test_meerdere_laadpunten_leveren_elk_hun_eigen_rij():
    live = extract_live_sessions(
        _state(
            LOPEND_LAADPUNT,
            {**LOPEND_LAADPUNT, "title": "Oprit", "chargedEnergy": 4},
        ),
        now=NU,
    )

    assert [sessie["external_id"] for sessie in live] == [
        "evcc:live:Garage",
        "evcc:live:Oprit",
    ]


def test_lopende_sessies_bij_onverwacht_antwoord():
    assert extract_live_sessions(None, now=NU) == []
    assert extract_live_sessions({"result": {}}, now=NU) == []
    assert extract_live_sessions(_state("geen woordenboek"), now=NU) == []
