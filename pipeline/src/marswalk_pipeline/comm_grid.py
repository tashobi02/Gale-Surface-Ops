"""Hab mast viewshed grid `comm_hab` (docs/specs/02 §C.5 L11, §D.11; FR-42). TASK-03, T03.29.

Static, pipeline-only. Binary line of sight from the hab mast to every cell of the routing grid,
with the curvature drop d² / (2R), R = `config.MARS_RADIUS_M`. The Hab Core and the browser only
read the output (`grid/comm_hab.u8`, 05 RoutingGrid `comm_hab_asset`).

Geometry. Heights are taken relative to the mast's ground cell. The sphere is handled in the
mast's tangent plane: a point at ground distance s from the mast sits s² / (2R) below that plane.
The mast top is at height H; the target top is at height (target ground + target_height_m), also
dropped by its own d² / (2R). A target is visible when no intermediate sample of the ray rises above
the straight sight line between the two tops. This reproduces the horizon sqrt(2RH) for a ground
target and sqrt(2RH) + sqrt(2R·h_target) for a two-antenna link. (02 §D.11 writes the correction as
"terrain height + curvature drop". The sign used here is the one that makes the drop lower the
ground, which is what the horizon test asserts; see the report for the wording question.)

Sampling. Each ray takes SAMPLES_PER_CELL samples per cell along its major axis, so every row or
column it crosses gets at least one sample. Samples are computed for all targets at once, one step
index at a time, so a 1200 x 1200 grid runs in numpy without a Python loop per cell.

Numpy only (plus the pipeline's own `config`).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from marswalk_pipeline import config

# 05 RoutingGrid comm_hab_asset: 1 = line of sight, 0 = none, 255 = no data.
VISIBLE = 1
HIDDEN = 0
NODATA = config.U8_NODATA

# Repo-relative parameter sets (data-lead decision 2026-11-06, T03.29). Values are read from
# these files and never typed here.
_REPO_ROOT = Path(__file__).resolve().parents[3]
LINK_PARAMS_REL = Path("scenarios") / "storm-sol4190" / "param_sets" / "link-assumed.json"
SUIT_PARAMS_REL = Path("scenarios") / "storm-sol4190" / "param_sets" / "suit-assumed.json"

# Samples per cell along a ray's major axis. With 2, the step is at most half a cell, so a
# ray cannot skip a row or column it crosses along the major axis.
SAMPLES_PER_CELL = 2


def read_comm_heights(repo_root: Path | None = None) -> tuple[float, float]:
    """Return (hab mast height m, suit antenna height m) from the assumed param sets (02 §C.5 L11).

    `values.hab_mast_m` from link-assumed.json and `values.antenna_m` from suit-assumed.json.
    """
    root = _REPO_ROOT if repo_root is None else Path(repo_root)
    link = json.loads((root / LINK_PARAMS_REL).read_text(encoding="utf-8"))
    suit = json.loads((root / SUIT_PARAMS_REL).read_text(encoding="utf-8"))
    return float(link["values"]["hab_mast_m"]), float(suit["values"]["antenna_m"])


def hab_viewshed(
    elevation,
    cell_m,
    origin_m,
    mast_x_m,
    mast_y_m,
    mast_height_m,
    target_height_m=0.0,
) -> np.ndarray:
    """Binary line-of-sight grid from a mast, uint8, same shape as `elevation`.

    elevation: 2-D metres, row 0 = north; NaN is DEM no-data.
    origin_m: (x, y) of the top-left corner of cell (0, 0). Cell (i, j) covers
        x in [ox + j*cell, ox + (j+1)*cell) and y in (oy - (i+1)*cell, oy - i*cell].
    mast_x_m, mast_y_m: mast position in working-projection metres.
    mast_height_m: mast height above the ground at the mast cell.
    target_height_m: receiver height above ground. 0.0 for a ground-level target.

    Returns 1 = line of sight, 0 = no line of sight, 255 = no data (NaN target cell).
    A NaN cell on the ray does not block it (TODO(decision): NaN could instead count as blocking).
    """
    z = np.asarray(elevation, dtype=np.float64)
    if z.ndim != 2:
        raise ValueError(f"elevation must be a 2-D array, got shape {z.shape}")
    cell = float(cell_m)
    if cell <= 0:
        raise ValueError(f"cell_m must be > 0, got {cell_m}")
    height, width = z.shape
    ox, oy = float(origin_m[0]), float(origin_m[1])
    mx, my = float(mast_x_m), float(mast_y_m)
    mast_h = float(mast_height_m)
    tgt_h = float(target_height_m)
    radius = float(config.MARS_RADIUS_M)

    mast_i = math.floor((oy - my) / cell)
    mast_j = math.floor((mx - ox) / cell)
    if not (0 <= mast_i < height and 0 <= mast_j < width):
        raise ValueError("mast lies outside the grid")
    mast_z = z[mast_i, mast_j]
    if np.isnan(mast_z):
        raise ValueError("mast cell is DEM no-data")

    out = np.full(z.shape, NODATA, dtype=np.uint8)
    tgt_i, tgt_j = np.nonzero(~np.isnan(z))
    if tgt_i.size == 0:
        return out

    # Target cell centres, metres, and their geometry relative to the mast point.
    tx = ox + (tgt_j + 0.5) * cell
    ty = oy - (tgt_i + 0.5) * cell
    dx = tx - mx
    dy = ty - my
    dist = np.hypot(dx, dy)
    # Target top, relative to the mast ground, on the curved surface.
    top = (z[tgt_i, tgt_j] - mast_z) + tgt_h - dist * dist / (2.0 * radius)

    # Steps per ray, counted in cells from the mast cell along the major axis.
    steps = SAMPLES_PER_CELL * np.maximum(np.abs(tgt_i - mast_i), np.abs(tgt_j - mast_j))
    order = np.argsort(steps, kind="stable")
    steps_s = steps[order]
    dx_s = dx[order]
    dy_s = dy[order]
    dist_s = dist[order]
    top_s = top[order]
    tgt_i_s = tgt_i[order]
    tgt_j_s = tgt_j[order]
    blocked_s = np.zeros(steps_s.shape, dtype=bool)

    max_steps = int(steps_s[-1]) if steps_s.size else 0
    for k in range(1, max_steps):
        # Targets with more than k steps: a suffix of the ascending `steps_s`.
        start = int(np.searchsorted(steps_s, k, side="right"))
        sl = slice(start, None)
        f = k / steps_s[sl]
        x = mx + f * dx_s[sl]
        y = my + f * dy_s[sl]
        cols = np.clip(np.floor((x - ox) / cell).astype(np.intp), 0, width - 1)
        rows = np.clip(np.floor((oy - y) / cell).astype(np.intp), 0, height - 1)
        ground = z[rows, cols]
        valid = ~np.isnan(ground)
        ground = np.where(valid, ground, mast_z)
        s = f * dist_s[sl]
        sight = mast_h + (top_s[sl] - mast_h) * f
        ground_rel = (ground - mast_z) - s * s / (2.0 * radius)
        # Samples inside the mast cell or the target's own cell are endpoints, not obstructions.
        at_mast = (rows == mast_i) & (cols == mast_j)
        at_target = (rows == tgt_i_s[sl]) & (cols == tgt_j_s[sl])
        blocked_s[sl] |= valid & ~at_mast & ~at_target & (ground_rel > sight)

    blocked = np.empty(steps_s.shape, dtype=bool)
    blocked[order] = blocked_s
    out[tgt_i, tgt_j] = np.where(blocked, HIDDEN, VISIBLE).astype(np.uint8)
    return out


def build_comm_hab(
    elevation,
    cell_m,
    origin_m,
    mast_x_m,
    mast_y_m,
    repo_root: Path | None = None,
) -> np.ndarray:
    """Pipeline entry: mast height from link-assumed, suit antenna height from suit-assumed."""
    mast_h, antenna_h = read_comm_heights(repo_root)
    return hab_viewshed(
        elevation,
        cell_m,
        origin_m,
        mast_x_m,
        mast_y_m,
        mast_h,
        target_height_m=antenna_h,
    )


def write_comm_hab(out_dir: Path, visibility: np.ndarray) -> None:
    """Write grid/comm_hab.u8: raw row-major, north-up uint8 (02 §L11, 05 RoutingGrid)."""
    vis = np.asarray(visibility)
    if vis.ndim != 2:
        raise ValueError(f"visibility must be a 2-D array, got shape {vis.shape}")
    if vis.dtype != np.uint8:
        raise ValueError(f"visibility must be uint8, got {vis.dtype}")
    grid_dir = Path(out_dir) / "grid"
    grid_dir.mkdir(parents=True, exist_ok=True)
    (grid_dir / "comm_hab.u8").write_bytes(np.ascontiguousarray(vis).tobytes())
