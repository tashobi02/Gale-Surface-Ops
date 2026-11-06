"""Hazard-flag bitfield of the routing grid (docs/specs/05 §C "Flag bits"; 02 §C.2 L4). FR-07, FR-10, FR-16."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np


def hazard_flags(
    elevation: np.ndarray,
    ti: np.ndarray | None,
    ti_threshold_tiu: float | None,
    hard_hazard_mask: np.ndarray | None = None,
    low_res_dem_mask: np.ndarray | None = None,
) -> np.ndarray:
    """u8 flag bitfield per 05 §C: NO_DATA, LOW_TI, TI_UNKNOWN; HARD_HAZARD and LOW_RES_DEM from the input masks.

    All arrays share the routing grid's shape. The masks are rasterised from the C5 GeoJSON inputs
    (`hazards.geojson`, `low_res_dem.geojson`; pipeline/sites/README.md). TI threshold is Unresolved (U-03);
    flags are interpretive. TASK-03 (T03.10).
    """
    raise NotImplementedError("TASK-03")
