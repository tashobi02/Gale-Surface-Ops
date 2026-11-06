"""Derived rasters: slope and hillshade (docs/specs/02 §C.2 L2–L3). FR-02, FR-07. Hazard flags live in flags.py."""
from __future__ import annotations

import warnings

import numpy as np


def _horn_gradients(dem: np.ndarray, cell_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Horn gradients (dz/dx east, dz/dy south) in metres per metre, same shape as `dem`.

    Stencil (rows top to bottom, row 0 = north, 02 §C.1):
        a b c
        d e f
        g h i
    dz/dx = ((c + 2f + i) - (a + 2d + g)) / (8 * cell_m)
    dz/dy = ((g + 2h + i) - (a + 2b + c)) / (8 * cell_m)   (positive towards south, i.e. row index)

    The outer ring has no full 3x3 stencil. Its edge policy is not fixed by 02 §C.2 L3, so the
    ring is left NaN (TODO(decision): replicate-edge is the alternative). NaN in any stencil cell
    gives NaN out. The centre cell `e` is not used by Horn, so a NaN centre is masked separately
    by the callers.
    """
    z = np.asarray(dem, dtype=np.float64)
    if z.ndim != 2:
        raise ValueError(f"DEM must be 2-D, got shape {z.shape}")
    gx = np.full(z.shape, np.nan, dtype=np.float64)
    gy = np.full(z.shape, np.nan, dtype=np.float64)
    if z.shape[0] < 3 or z.shape[1] < 3:
        return gx, gy

    a = z[:-2, :-2]
    b = z[:-2, 1:-1]
    c = z[:-2, 2:]
    d = z[1:-1, :-2]
    f = z[1:-1, 2:]
    g = z[2:, :-2]
    h = z[2:, 1:-1]
    i = z[2:, 2:]

    scale = 8.0 * float(cell_m)
    gx[1:-1, 1:-1] = ((c + 2.0 * f + i) - (a + 2.0 * d + g)) / scale
    gy[1:-1, 1:-1] = ((g + 2.0 * h + i) - (a + 2.0 * b + c)) / scale
    return gx, gy


def horn_slope_deg(dem: np.ndarray, cell_m: float) -> np.ndarray:
    """Horn-method slope (degrees, 0–90) of a 1 m DEM in metres; NaN in → NaN out (02 §C.2 L3). TASK-03.

    A NaN centre cell gives NaN. Any NaN in its 3x3 stencil gives NaN. The outer ring is NaN
    (see `_horn_gradients`). Slope = arctan(hypot(dz/dx, dz/dy)).
    """
    z = np.asarray(dem, dtype=np.float64)
    gx, gy = _horn_gradients(z, cell_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    slope[np.isnan(z)] = np.nan
    return slope


def hillshade(dem: np.ndarray, cell_m: float, azimuth_deg: float = 315, altitude_deg: float = 45) -> np.ndarray:
    """Display hillshade, azimuth 315°, altitude 45° (02 §C.2 L2, Proposed). TASK-03.

    Returns illumination in [0, 1] as float64 (Lambertian: cos(zenith)·cos(slope) +
    sin(zenith)·sin(slope)·cos(sun azimuth − downslope bearing)). The output is not scaled to 0–255;
    the tile step decides the display encoding (TODO(decision)). A NaN DEM cell gives NaN, as does
    anything whose Horn stencil touches NaN or the outer ring.
    """
    z = np.asarray(dem, dtype=np.float64)
    gx, gy = _horn_gradients(z, cell_m)

    zenith = np.radians(90.0 - float(altitude_deg))
    sun_az = np.radians(float(azimuth_deg))

    slope = np.arctan(np.hypot(gx, gy))
    # Compass bearing of the downslope direction: east component = -dz/dx, north component = +dz/dy
    # (dz/dy is positive towards south, so the north component of the downslope vector is +dz/dy).
    downslope_bearing = np.arctan2(-gx, gy)

    shade = np.cos(zenith) * np.cos(slope) + np.sin(zenith) * np.sin(slope) * np.cos(sun_az - downslope_bearing)
    shade = np.clip(shade, 0.0, 1.0)
    shade[np.isnan(z)] = np.nan
    return shade


def aggregate_slope(slope_1m: np.ndarray, factor: int) -> tuple[np.ndarray, np.ndarray]:
    """Aggregate 1 m slope to the routing grid as (p90, max), degrees (02 §C.2 L3). TASK-03.

    `factor` is the block edge in 1 m pixels (routing cell size / slope cell size). The caller
    passes the value from `config.GRID_CELL_M`; it is never a literal here.

    T03.09 decision (percentile method): numpy's default linear interpolation
    (`np.nanpercentile(..., 90, method="linear")`) over the block's non-NaN values. A block with
    no non-NaN value gives NaN for both p90 and max. The NaN-ignoring reductions mean a single
    NaN pixel does not poison its block.

    Input height and width must be exact multiples of `factor`; otherwise ValueError is raised
    (TODO(verify): the pipeline's edge crop policy for the 6000 x 6000 window).
    """
    s = np.asarray(slope_1m, dtype=np.float64)
    if s.ndim != 2:
        raise ValueError(f"slope must be 2-D, got shape {s.shape}")
    factor = int(factor)
    if factor < 1:
        raise ValueError(f"factor must be >= 1, got {factor}")
    h, w = s.shape
    if h % factor or w % factor:
        raise ValueError(f"slope shape {s.shape} is not a multiple of factor {factor}")

    blocks = s.reshape(h // factor, factor, w // factor, factor).transpose(0, 2, 1, 3)
    blocks = blocks.reshape(h // factor, w // factor, factor * factor)

    with warnings.catch_warnings():
        # All-NaN blocks are expected (no-data margins) and are reported as NaN, not as warnings.
        warnings.simplefilter("ignore", category=RuntimeWarning)
        p90 = np.nanpercentile(blocks, 90, axis=-1, method="linear")
        mx = np.nanmax(blocks, axis=-1)
    return p90, mx
