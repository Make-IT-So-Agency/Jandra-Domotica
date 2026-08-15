"""Constanten voor de Laadkosten-integratie."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "laadkosten"

# Configuratiesleutels (komen uit het klikscherm bij het toevoegen van de integratie)
CONF_EVCC_URL = "evcc_url"
CONF_APP_URL = "app_url"
CONF_API_KEY = "api_key"
CONF_SCAN_MINUTES = "scan_minutes"
CONF_HISTORY_DAYS = "history_days"

DEFAULT_EVCC_URL = "http://homeassistant.local:7070"
DEFAULT_SCAN_MINUTES = 30
DEFAULT_HISTORY_DAYS = 0  # 0 = alle sessies die evcc kent

MIN_SCAN_MINUTES = 5
MAX_SCAN_MINUTES = 24 * 60

DEFAULT_SCAN_INTERVAL = timedelta(minutes=DEFAULT_SCAN_MINUTES)

# Endpoints op de webapp
INGEST_PATH = "/api/ingest"

# evcc endpoints
EVCC_SESSIONS_PATH = "/api/sessions"
EVCC_STATE_PATH = "/api/state"

HTTP_TIMEOUT = 30

# Sleutels die we in hass.data bijhouden
DATA_COORDINATOR = "coordinator"
