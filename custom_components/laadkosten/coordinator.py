"""Haalt periodiek de evcc-sessies op en stuurt ze naar de webapp."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    AppClient,
    AppUnauthorized,
    EvccClient,
    LaadkostenError,
)
from .const import (
    CONF_API_KEY,
    CONF_APP_URL,
    CONF_EVCC_URL,
    CONF_HISTORY_DAYS,
    CONF_SCAN_MINUTES,
    DEFAULT_HISTORY_DAYS,
    DEFAULT_SCAN_MINUTES,
    DOMAIN,
)
from .session_mapper import filter_recent

_LOGGER = logging.getLogger(__name__)


class LaadkostenCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Stuurt laadsessies van evcc naar de rapportage-app."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        options = {**entry.data, **entry.options}
        scan_minutes = int(options.get(CONF_SCAN_MINUTES, DEFAULT_SCAN_MINUTES))
        self._history_days = int(options.get(CONF_HISTORY_DAYS, DEFAULT_HISTORY_DAYS))

        session = async_get_clientsession(hass)
        self._evcc = EvccClient(session, options[CONF_EVCC_URL])
        self._app = AppClient(session, options[CONF_APP_URL], options[CONF_API_KEY])

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=scan_minutes),
        )

    @property
    def app_url(self) -> str:
        return self._app.base_url

    @property
    def evcc_url(self) -> str:
        return self._evcc.base_url

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            sessions = await self._evcc.async_get_sessions()
            selected = filter_recent(sessions, self._history_days)
            meters = await self._evcc.async_get_meter_readings()

            now = datetime.now(timezone.utc)
            payload = {
                "source": "evcc",
                "sent_at": now.isoformat(),
                "installation_id": self.entry.entry_id,
                "sessions": selected,
                "meters": [{**meter, "read_at": now.isoformat()} for meter in meters],
            }
            result = await self._app.async_push(payload)
        except AppUnauthorized as err:
            # Laat Home Assistant zelf om een nieuwe sleutel vragen in plaats van
            # elk half uur stilletjes te blijven falen.
            raise ConfigEntryAuthFailed(str(err)) from err
        except LaadkostenError as err:
            raise UpdateFailed(str(err)) from err

        complete = sum(1 for item in selected if item.get("is_complete"))
        stats = {
            "last_sync": now,
            "sessions_sent": len(selected),
            "sessions_complete": complete,
            "sessions_known_by_evcc": len(sessions),
            "inserted": int(result.get("inserted") or 0),
            "updated": int(result.get("updated") or 0),
            "app_url": self._app.base_url,
        }
        _LOGGER.debug("Synchronisatie afgerond: %s", stats)
        return stats

    async def async_sync_now(self) -> None:
        """Handmatige synchronisatie vanaf de knop in Home Assistant."""
        await self.async_request_refresh()
