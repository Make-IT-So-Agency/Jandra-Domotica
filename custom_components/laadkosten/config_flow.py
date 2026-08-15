"""Klikschermen voor het instellen van de Laadkosten-integratie."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import (
    AppClient,
    AppUnauthorized,
    AppUnreachable,
    EvccClient,
    EvccUnreachable,
    LaadkostenError,
    normalise_base_url,
)
from .const import (
    CONF_API_KEY,
    CONF_APP_URL,
    CONF_EVCC_URL,
    CONF_HISTORY_DAYS,
    CONF_SCAN_MINUTES,
    DEFAULT_EVCC_URL,
    DEFAULT_HISTORY_DAYS,
    DEFAULT_SCAN_MINUTES,
    DOMAIN,
    MAX_SCAN_MINUTES,
    MIN_SCAN_MINUTES,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_EVCC_URL, default=DEFAULT_EVCC_URL): str,
        vol.Required(CONF_APP_URL): str,
        vol.Required(CONF_API_KEY): str,
    }
)


async def _validate(hass, data: Mapping[str, Any]) -> dict[str, str]:
    """Test beide verbindingen. Geeft een dict met foutmeldingen per veld."""
    errors: dict[str, str] = {}
    session = async_get_clientsession(hass)

    try:
        await EvccClient(session, data[CONF_EVCC_URL]).async_get_sessions()
    except EvccUnreachable as err:
        _LOGGER.debug("evcc-controle mislukt: %s", err)
        errors[CONF_EVCC_URL] = "evcc_unreachable"
    except LaadkostenError:
        errors[CONF_EVCC_URL] = "invalid_url"

    try:
        await AppClient(session, data[CONF_APP_URL], data[CONF_API_KEY]).async_ping()
    except AppUnauthorized:
        errors[CONF_API_KEY] = "invalid_auth"
    except AppUnreachable as err:
        _LOGGER.debug("App-controle mislukt: %s", err)
        errors[CONF_APP_URL] = "app_unreachable"
    except LaadkostenError:
        errors[CONF_APP_URL] = "invalid_url"

    return errors


class LaadkostenConfigFlow(ConfigFlow, domain=DOMAIN):
    """Begeleidt het toevoegen van de integratie."""

    VERSION = 1

    def __init__(self) -> None:
        self._reauth_entry: ConfigEntry | None = None

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                cleaned = {
                    CONF_EVCC_URL: normalise_base_url(user_input[CONF_EVCC_URL]),
                    CONF_APP_URL: normalise_base_url(user_input[CONF_APP_URL]),
                    CONF_API_KEY: user_input[CONF_API_KEY].strip(),
                }
            except LaadkostenError:
                errors["base"] = "invalid_url"
            else:
                await self.async_set_unique_id(cleaned[CONF_APP_URL])
                self._abort_if_unique_id_configured()

                errors = await _validate(self.hass, cleaned)
                if not errors:
                    return self.async_create_entry(
                        title="Laadkosten rapportage", data=cleaned
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_SCHEMA, user_input or {}
            ),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        self._reauth_entry = self.hass.config_entries.async_get_entry(
            self.context["entry_id"]
        )
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Vraag enkel een nieuwe sleutel; het adres blijft ongewijzigd."""
        assert self._reauth_entry is not None
        errors: dict[str, str] = {}

        if user_input is not None:
            candidate = {
                **self._reauth_entry.data,
                CONF_API_KEY: user_input[CONF_API_KEY].strip(),
            }
            errors = await _validate(self.hass, candidate)
            if not errors:
                return self.async_update_reload_and_abort(
                    self._reauth_entry, data=candidate
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): str}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry) -> OptionsFlow:
        return LaadkostenOptionsFlow()


class LaadkostenOptionsFlow(OptionsFlow):
    """Laat de synchronisatiefrequentie achteraf aanpassen."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        current = {**self.config_entry.data, **self.config_entry.options}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SCAN_MINUTES,
                    default=current.get(CONF_SCAN_MINUTES, DEFAULT_SCAN_MINUTES),
                ): vol.All(int, vol.Range(min=MIN_SCAN_MINUTES, max=MAX_SCAN_MINUTES)),
                vol.Required(
                    CONF_HISTORY_DAYS,
                    default=current.get(CONF_HISTORY_DAYS, DEFAULT_HISTORY_DAYS),
                ): vol.All(int, vol.Range(min=0, max=3650)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
