"""Build the 5 m routing grid arrays (docs/specs/05 §C RoutingGrid; 02 §E.1). FR-03, FR-07."""
from __future__ import annotations

from pathlib import Path

import numpy as np

from marswalk_pipeline import config

# 05 §C RoutingGrid: width*height <= 4e6
MAX_GRID_CELLS = 4_000_000


def encode_slope_u8(slope_deg: np.ndarray) -> np.ndarray:
    """Degrees → u8 (degrees × 4, 0.25° steps), NaN → 255 (05 §C RoutingGrid). TASK-03.

    Slopes > 63.5° clamp to 254 per data-lead decision 2026-11-06; 255 is reserved for no-data.
    """
    arr = np.asarray(slope_deg)
    out = np.full(arr.shape, config.U8_NODATA, dtype=np.uint8)

    if np.issubdtype(arr.dtype, np.floating):
        valid = ~np.isnan(arr)
    else:
        valid = np.ones(arr.shape, dtype=bool)

    if np.any(valid):
        # Round to nearest 0.25° step: degrees × 4
        scaled = arr[valid] * config.SLOPE_U8_SCALE
        rounded = np.rint(scaled)
        clamped = np.clip(rounded, 0.0, 254.0).astype(np.uint8)
        out[valid] = clamped

    return out


def write_grid(
    out_dir: Path,
    elevation: np.ndarray,
    slope_p90: np.ndarray,
    slope_max: np.ndarray,
    flags: np.ndarray,
    ti: np.ndarray | None,
) -> None:
    """Write grid/*.f32 / *.u8 as raw little-endian, row-major, north-up arrays (02 §E.1). TASK-03."""
    if elevation.ndim != 2:
        raise ValueError(
            f"elevation must be a 2D array, got {elevation.ndim}D (shape {elevation.shape})"
        )

    height, width = elevation.shape
    if height * width > MAX_GRID_CELLS:
        raise ValueError(
            f"Grid dimensions {width}x{height} ({width * height} cells) "
            f"exceed 05 RoutingGrid limit of {MAX_GRID_CELLS} cells"
        )

    if slope_p90.shape != (height, width):
        raise ValueError(
            f"slope_p90 shape {slope_p90.shape} does not match elevation shape {elevation.shape}"
        )
    if slope_max.shape != (height, width):
        raise ValueError(
            f"slope_max shape {slope_max.shape} does not match elevation shape {elevation.shape}"
        )
    if flags.shape != (height, width):
        raise ValueError(
            f"flags shape {flags.shape} does not match elevation shape {elevation.shape}"
        )

    if ti is not None:
        if ti.ndim != 2:
            raise ValueError(f"ti must be a 2D array, got {ti.ndim}D (shape {ti.shape})")
        ti_height, ti_width = ti.shape
        if ti_height * ti_width > MAX_GRID_CELLS:
            raise ValueError(
                f"TI grid dimensions {ti_width}x{ti_height} ({ti_width * ti_height} cells) "
                f"exceed limit of {MAX_GRID_CELLS} cells"
            )

    grid_dir = Path(out_dir) / "grid"
    grid_dir.mkdir(parents=True, exist_ok=True)

    # Elevation: f32, little-endian, row-major (north-up)
    (grid_dir / "elevation.f32").write_bytes(
        np.ascontiguousarray(elevation, dtype="<f4").tobytes()
    )

    # Slope p90: u8, row-major
    (grid_dir / "slope_p90.u8").write_bytes(
        np.ascontiguousarray(slope_p90, dtype=np.uint8).tobytes()
    )

    # Slope max: u8, row-major
    (grid_dir / "slope_max.u8").write_bytes(
        np.ascontiguousarray(slope_max, dtype=np.uint8).tobytes()
    )

    # Flags: u8, row-major
    (grid_dir / "flags.u8").write_bytes(
        np.ascontiguousarray(flags, dtype=np.uint8).tobytes()
    )

    # TI sidecar: f32, little-endian, row-major on its own grid (omitted when None)
    if ti is not None:
        (grid_dir / "ti_100m.f32").write_bytes(
            np.ascontiguousarray(ti, dtype="<f4").tobytes()
        )
