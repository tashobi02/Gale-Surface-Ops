"""Render map tiles per layer in the working projection (docs/specs/02 §E.1; 05 §C Layer.tile_grid). FR-01, FR-02."""
from __future__ import annotations

from pathlib import Path


def render_tiles(raster: Path, layer_id: str, origin_m: tuple[float, float], resolutions_m: list[float], tile_size_px: int, fmt: str, out_dir: Path) -> None:
    """Write tiles/<layer_id>/{z}/{x}/{y}.{fmt} matching the manifest tile grid (TASK-02 spike defines it). TASK-03."""
    raise NotImplementedError("TASK-03")
