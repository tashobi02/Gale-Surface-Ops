"""Build the 5 m routing grid arrays (docs/specs/05 §C RoutingGrid; 02 §E.1). FR-03, FR-07."""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np


def encode_slope_u8(slope_deg: np.ndarray) -> np.ndarray:
    """Degrees → u8 (degrees × 4, 0.25° steps), NaN → 255 (05 §C RoutingGrid). TASK-03."""
    raise NotImplementedError("TASK-03")


def write_grid(out_dir: Path, elevation: np.ndarray, slope_p90: np.ndarray, slope_max: np.ndarray, flags: np.ndarray, ti: np.ndarray | None) -> None:
    """Write grid/*.f32 / *.u8 as raw little-endian, row-major, north-up arrays (02 §E.1). TASK-03."""
    raise NotImplementedError("TASK-03")
