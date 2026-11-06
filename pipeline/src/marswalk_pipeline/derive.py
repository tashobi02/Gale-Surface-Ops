"""Derived rasters: slope and hillshade (docs/specs/02 §C.2 L2–L3). FR-02, FR-07. Hazard flags live in flags.py."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np


def horn_slope_deg(dem: np.ndarray, cell_m: float) -> np.ndarray:
    """Horn-method slope (degrees, 0–90) of a 1 m DEM in metres; NaN in → NaN out (02 §C.2 L3). TASK-03."""
    raise NotImplementedError("TASK-03")


def hillshade(dem: np.ndarray, cell_m: float, azimuth_deg: float = 315, altitude_deg: float = 45) -> np.ndarray:
    """Display hillshade, azimuth 315°, altitude 45° (02 §C.2 L2, Proposed). TASK-03."""
    raise NotImplementedError("TASK-03")


def aggregate_slope(slope_1m: np.ndarray, factor: int) -> tuple[np.ndarray, np.ndarray]:
    """Aggregate 1 m slope to the 5 m grid as (p90, max), degrees (02 §C.2 L3). TASK-03."""
    raise NotImplementedError("TASK-03")
