"""Sensoren die tonen of de synchronisatie goed loopt."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import LaadkostenCoordinator
from .entity import LaadkostenEntity


@dataclass(frozen=True, kw_only=True)
class LaadkostenSensorDescription(SensorEntityDescription):
    """Beschrijving met de manier waarop de waarde uit de data komt."""

    value_fn: Callable[[dict[str, Any]], Any]


SENSORS: tuple[LaadkostenSensorDescription, ...] = (
    LaadkostenSensorDescription(
        key="last_sync",
        translation_key="last_sync",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda data: data.get("last_sync"),
    ),
    LaadkostenSensorDescription(
        key="sessions_sent",
        translation_key="sessions_sent",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="sessies",
        value_fn=lambda data: data.get("sessions_sent"),
    ),
    LaadkostenSensorDescription(
        key="sessions_complete",
        translation_key="sessions_complete",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="sessies",
        value_fn=lambda data: data.get("sessions_complete"),
    ),
    LaadkostenSensorDescription(
        key="sessions_live",
        translation_key="sessions_live",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="sessies",
        value_fn=lambda data: data.get("sessions_live"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: LaadkostenCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        LaadkostenSensor(coordinator, description) for description in SENSORS
    )


class LaadkostenSensor(LaadkostenEntity, SensorEntity):
    """Toont één statistiek van de laatste synchronisatie."""

    entity_description: LaadkostenSensorDescription

    def __init__(
        self,
        coordinator: LaadkostenCoordinator,
        description: LaadkostenSensorDescription,
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        if not self.coordinator.data:
            return None
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.key != "last_sync" or not self.coordinator.data:
            return None
        data = self.coordinator.data
        return {
            "nieuw_toegevoegd": data.get("inserted"),
            "bijgewerkt": data.get("updated"),
            "sessies_bekend_bij_evcc": data.get("sessions_known_by_evcc"),
            "app_adres": data.get("app_url"),
        }
