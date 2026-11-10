"""Hazard-flag bitfield of the routing grid (docs/specs/05 §C "Flag bits"; 02 §C.2 L4). FR-07, FR-10, FR-16."""
from __future__ import annotations

import json
from typing import TYPE_CHECKING

import numpy as np

from .config import FLAG_BITS

if TYPE_CHECKING:
    from os import PathLike


def rasterize_mask(
    geojson_path: str | PathLike[str],
    width: int,
    height: int,
    cell_m: float,
    origin_m: tuple[float, float],
) -> np.ndarray:
    """Rasterize C5 polygons in working metres onto a north-up routing grid."""
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    with open(geojson_path, encoding="utf-8") as source:
        collection = json.load(source)
    geometries = [feature["geometry"] for feature in collection["features"] if feature["geometry"] is not None]
    if not geometries:
        return np.zeros((height, width), dtype=bool)
    return rasterize(
        geometries,
        out_shape=(height, width),
        transform=from_origin(*origin_m, cell_m, cell_m),
        dtype="uint8",
    ).astype(bool)


def hazard_flags(
    elevation: np.ndarray,
    ti: np.ndarray | None,
    ti_threshold_tiu: float | None,
    hard_hazard_mask: np.ndarray | None = None,
    low_res_dem_mask: np.ndarray | None = None,
) -> np.ndarray:
    """u8 flag bitfield per 05 §C: NO_DATA, LOW_TI, TI_UNKNOWN; HARD_HAZARD and LOW_RES_DEM from the input masks.

    All arrays share the routing grid's shape. The masks are rasterised from the C5 GeoJSON inputs
    (`hazards.geojson`, `low_res_dem.geojson`; pipeline/sites/README.md). `ti_threshold_tiu` is None when
    `ti_threshold.json` is absent, and then no LOW_TI bit is set: U-03 is decided (2026-11-10) and there is no
    defensible TI "loose fines" threshold for the AOI (docs/ops/ti-threshold.md). Flags are interpretive.
    TASK-03 (T03.10).
    """
    flags = np.zeros(elevation.shape, dtype=np.uint8)

    def set_flag(mask: np.ndarray, name: str) -> None:
        flags[mask] |= 1 << FLAG_BITS[name]

    set_flag(np.isnan(elevation), "NO_DATA")
    if ti is None:
        flags |= 1 << FLAG_BITS["TI_UNKNOWN"]
    else:
        unknown = np.isnan(ti)
        set_flag(unknown, "TI_UNKNOWN")
        if ti_threshold_tiu is not None:
            set_flag(~unknown & (ti < ti_threshold_tiu), "LOW_TI")
    if hard_hazard_mask is not None:
        set_flag(np.asarray(hard_hazard_mask, dtype=bool), "HARD_HAZARD")
    if low_res_dem_mask is not None:
        set_flag(np.asarray(low_res_dem_mask, dtype=bool), "LOW_RES_DEM")
    return flags
