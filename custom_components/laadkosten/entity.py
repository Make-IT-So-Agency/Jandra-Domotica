"""Gedeelde basis voor de entiteiten van deze integratie."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import LaadkostenCoordinator


class LaadkostenEntity(CoordinatorEntity[LaadkostenCoordinator]):
    """Bundelt alle entiteiten onder één apparaat in Home Assistant."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: LaadkostenCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.entry.entry_id)},
            name="Laadkosten rapportage",
            manufacturer="Make IT So",
            model="evcc → rapportage-app",
            configuration_url=coordinator.app_url,
        )
