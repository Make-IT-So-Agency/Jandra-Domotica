"""Communicatie met evcc en met de webapp."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
from aiohttp import ClientError, ClientResponseError, ClientTimeout

from .const import (
    EVCC_SESSIONS_PATH,
    EVCC_STATE_PATH,
    HTTP_TIMEOUT,
    INGEST_PATH,
)
from .session_mapper import extract_meter_readings, extract_sessions

_LOGGER = logging.getLogger(__name__)


class LaadkostenError(Exception):
    """Basisfout met een boodschap die aan de gebruiker getoond mag worden."""


class EvccUnreachable(LaadkostenError):
    """evcc antwoordt niet op het opgegeven adres."""


class AppUnreachable(LaadkostenError):
    """De webapp antwoordt niet op het opgegeven adres."""


class AppUnauthorized(LaadkostenError):
    """De webapp weigert de API-sleutel."""


def normalise_base_url(url: str) -> str:
    """Maak er een bruikbaar basisadres van, ook als de gebruiker slordig plakt."""
    cleaned = (url or "").strip().rstrip("/")
    if not cleaned:
        raise LaadkostenError("leeg adres")
    if not cleaned.startswith(("http://", "https://")):
        cleaned = f"http://{cleaned}"
    return cleaned


class EvccClient:
    """Leest laadsessies uit de eigen database van evcc."""

    def __init__(self, session: aiohttp.ClientSession, base_url: str) -> None:
        self._session = session
        self._base_url = normalise_base_url(base_url)

    @property
    def base_url(self) -> str:
        return self._base_url

    async def _get_json(self, path: str) -> Any:
        url = f"{self._base_url}{path}"
        try:
            async with self._session.get(
                url, timeout=ClientTimeout(total=HTTP_TIMEOUT)
            ) as response:
                response.raise_for_status()
                # evcc zet niet altijd een correcte content-type header.
                return await response.json(content_type=None)
        except ClientResponseError as err:
            raise EvccUnreachable(
                f"evcc gaf statuscode {err.status} op {path}"
            ) from err
        except (ClientError, TimeoutError) as err:
            raise EvccUnreachable(f"evcc niet bereikbaar op {url}: {err}") from err
        except ValueError as err:
            raise EvccUnreachable(f"evcc gaf geen geldige JSON op {path}") from err

    async def async_get_sessions(self) -> list[dict[str, Any]]:
        return extract_sessions(await self._get_json(EVCC_SESSIONS_PATH))

    async def async_get_meter_readings(self) -> list[dict[str, Any]]:
        """Meterstanden zijn extra controle-informatie, geen blokkerende stap."""
        try:
            return extract_meter_readings(await self._get_json(EVCC_STATE_PATH))
        except LaadkostenError as err:
            _LOGGER.debug("Meterstanden konden niet gelezen worden: %s", err)
            return []


class AppClient:
    """Duwt de sessies naar de webapp op Vercel."""

    def __init__(
        self, session: aiohttp.ClientSession, base_url: str, api_key: str
    ) -> None:
        self._session = session
        self._base_url = normalise_base_url(base_url)
        self._api_key = (api_key or "").strip()

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def async_ping(self) -> None:
        """Controleer adres én sleutel voor we de integratie aanmaken."""
        url = f"{self._base_url}{INGEST_PATH}"
        try:
            async with self._session.get(
                url, headers=self._headers, timeout=ClientTimeout(total=HTTP_TIMEOUT)
            ) as response:
                if response.status in (401, 403):
                    raise AppUnauthorized("de webapp weigert deze API-sleutel")
                response.raise_for_status()
        except AppUnauthorized:
            raise
        except ClientResponseError as err:
            raise AppUnreachable(
                f"de webapp gaf statuscode {err.status}; klopt het adres?"
            ) from err
        except (ClientError, TimeoutError) as err:
            raise AppUnreachable(f"webapp niet bereikbaar op {url}: {err}") from err

    async def async_push(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{INGEST_PATH}"
        try:
            async with self._session.post(
                url,
                headers=self._headers,
                json=payload,
                timeout=ClientTimeout(total=HTTP_TIMEOUT),
            ) as response:
                if response.status in (401, 403):
                    raise AppUnauthorized("de webapp weigert deze API-sleutel")
                response.raise_for_status()
                result = await response.json(content_type=None)
        except AppUnauthorized:
            raise
        except ClientResponseError as err:
            raise AppUnreachable(
                f"de webapp gaf statuscode {err.status} bij het versturen"
            ) from err
        except (ClientError, TimeoutError) as err:
            raise AppUnreachable(f"webapp niet bereikbaar op {url}: {err}") from err
        except ValueError as err:
            raise AppUnreachable("de webapp gaf geen geldig antwoord terug") from err

        return result if isinstance(result, dict) else {}
