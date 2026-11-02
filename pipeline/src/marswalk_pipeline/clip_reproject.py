"""Clip source rasters to the AOI and reproject to the local Mars eqc (docs/specs/02 §C.1, §C.4).

FR-01–FR-03. Never route Mars coordinates through EPSG:3857 / WGS84 (02 §C.1 "Never").
"""
from __future__ import annotations

from pathlib import Path


def clip_and_reproject(src: Path, dst: Path, proj4: str, extent_m: tuple[float, float, float, float], resolution_m: float) -> None:
    """Window-read `src`, reproject to `proj4`, clip to `extent_m` [minx, miny, maxx, maxy] (m).

    Output raster at `resolution_m` (m/px), row 0 = north (02 §C.4.3). TASK-03.
    """
    raise NotImplementedError("TASK-03")


def nodata_to_nan(path: Path) -> None:
    """Replace the DEM no-data value (from the PDS3 label) with NaN before slope (02 §C.4.4). TASK-03."""
    raise NotImplementedError("TASK-03")
