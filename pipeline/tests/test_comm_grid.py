"""Hab mast viewshed grid `comm_hab`: docs/specs/02 §C.5 L11, §D.11 (FR-42); 05 RoutingGrid `comm_hab_asset`.

Interface these tests define for TASK T03.29 (`marswalk_pipeline/comm_grid.py`):

    hab_viewshed(elevation, cell_m, origin_m, mast_x_m, mast_y_m, mast_height_m,
                 target_height_m=0.0) -> numpy.ndarray[uint8]

* `elevation`: 2-D float array in metres, shape (height, width), row 0 = north (05 RoutingGrid
  `row_order = north_up`); NaN is DEM no-data.
* `origin_m`: (x, y) of the top-left corner of cell (0, 0), as 05 RoutingGrid `origin_m`.
  Cell (i, j) covers x in [ox + j*cell, ox + (j+1)*cell) and y in (oy - (i+1)*cell, oy - i*cell]
  (05 §F value-at-(x, y) rule: i = floor((oy - y)/cell), j = floor((x - ox)/cell)).
* `mast_height_m`: height of the mast above the ground at the mast cell.
* `target_height_m`: height of the receiving antenna above the ground. Data-lead decision
  2026-11-06 (T03.29): `comm_hab` counts the suit receiver; the pipeline passes `values.antenna_m`
  from `suit-assumed.json`. The function default stays 0.0 for a ground-level target.
* Result: uint8, same shape as `elevation`; 1 = line of sight, 0 = none, 255 = no data
  (05 RoutingGrid `comm_hab_asset`).

The module does not exist until T03.29 lands, so it is imported inside `_viewshed`, never at module
top: each test then fails on its own instead of breaking collection of the other test files.
"""
import json
import math
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

from marswalk_pipeline.config import MARS_RADIUS_M  # noqa: E402

NODATA = 255

# Declared synthetic test parameters (not site data, not measurements).
SYNTH_FLAT_ELEV_M = 0.0  # flat plane elevation
SYNTH_WALL_FACTOR = 2.0  # wall height = factor * mast height, so ground behind it is always shadowed
SYNTH_ORIGIN_M = (-1000.0, 1000.0)  # non-zero, asymmetric grid origin (top-left), to catch ignored origins
SYNTH_FLAT_CELL_M = 20.0  # cell size of the wall and alignment cases; differs from the 5 m routing grid
SYNTH_FLAT_SIZE = 61  # cells per side (odd, mast near the middle)
SYNTH_COARSE_CELL_M = 250.0  # coarse cell for the curvature case so the array stays small
SYNTH_COARSE_SIZE = 121  # cells per side: half-extent must exceed 1.3x the horizon
SYNTH_INSIDE_FRAC = 0.7  # "clearly inside" the horizon
SYNTH_OUTSIDE_FRAC = 1.3  # "clearly outside" the horizon

REPO_ROOT = Path(__file__).resolve().parents[2]
LINK_PARAMS = REPO_ROOT / "scenarios" / "storm-sol4190" / "param_sets" / "link-assumed.json"
SUIT_PARAMS = LINK_PARAMS.with_name("suit-assumed.json")


def _mast_height_m() -> float:
    """Hab mast height from the assumed link param set (02 §C.5 L11), never typed here."""
    return float(json.loads(LINK_PARAMS.read_text())["values"]["hab_mast_m"])


def _viewshed(*args, **kwargs):
    from marswalk_pipeline import comm_grid  # deferred: module is written by T03.29

    return comm_grid.hab_viewshed(*args, **kwargs)


def _cell_centre(i: int, j: int, cell_m: float, origin_m: tuple[float, float]) -> tuple[float, float]:
    """Centre (x, y) of cell (i, j) for a north-up grid with top-left origin."""
    return origin_m[0] + (j + 0.5) * cell_m, origin_m[1] - (i + 0.5) * cell_m


def _flat(size: int) -> "np.ndarray":
    return np.full((size, size), SYNTH_FLAT_ELEV_M, dtype=np.float32)


def test_wall_shadow_begins_exactly_behind_the_wall():
    """02 §D.11 validation: flat plane, one wall; cells before it see the mast, cells behind do not."""
    h = _mast_height_m()
    cell, n, origin = SYNTH_FLAT_CELL_M, SYNTH_FLAT_SIZE, SYNTH_ORIGIN_M
    mast_i = mast_j = n // 2
    wall_j = mast_j + 8  # a full-height one-cell-wide north-south wall east of the mast
    elev = _flat(n)
    elev[:, wall_j] = SYNTH_WALL_FACTOR * h
    mx, my = _cell_centre(mast_i, mast_j, cell, origin)

    out = _viewshed(elev, cell, origin, mx, my, h, target_height_m=0.0)

    assert out.shape == elev.shape
    # Everything strictly west of the wall: no ray can cross the wall column, so all visible.
    assert (out[:, :wall_j] == 1).all()
    # Everything strictly east of the wall is in shadow; the shadow starts at the very next column.
    assert (out[:, wall_j + 1 :] == 0).all()
    # On the mast row, the cell just before and the cell just behind the wall straddle the boundary.
    assert out[mast_i, wall_j - 1] == 1
    assert out[mast_i, wall_j + 1] == 0


def test_cells_beyond_the_curvature_horizon_are_not_visible():
    """02 §D.11: horizon distance sqrt(2*R*h) for the mast height; flat terrain, curvature only."""
    h = _mast_height_m()
    horizon_m = math.sqrt(2.0 * MARS_RADIUS_M * h)
    cell, n, origin = SYNTH_COARSE_CELL_M, SYNTH_COARSE_SIZE, SYNTH_ORIGIN_M
    assert SYNTH_OUTSIDE_FRAC * horizon_m < (n // 2) * cell, "synthetic grid too small for the horizon"
    mast_i = mast_j = n // 2
    k_in = int(SYNTH_INSIDE_FRAC * horizon_m // cell)  # cells from the mast, clearly inside
    k_out = int(math.ceil(SYNTH_OUTSIDE_FRAC * horizon_m / cell))  # clearly outside
    mx, my = _cell_centre(mast_i, mast_j, cell, origin)

    out = _viewshed(_flat(n), cell, origin, mx, my, h, target_height_m=0.0)

    # East and north of the mast, both axes: inside the horizon is visible, outside is not.
    east = out[mast_i, mast_j + 1 :]
    north = out[: mast_i, mast_j][::-1]
    for ray in (east, north):
        assert (ray[:k_in] == 1).all()  # first k_in cells from the mast
        assert (ray[k_out - 1 :] == 0).all()  # from k_out cells away to the grid edge


def test_output_grid_has_routing_grid_origin_cell_size_and_row_order():
    """Output aligns with the routing grid: same shape, uint8, north-up rows, origin and cell size honoured."""
    h = _mast_height_m()
    cell, n, origin = SYNTH_FLAT_CELL_M, SYNTH_FLAT_SIZE, SYNTH_ORIGIN_M
    mast_i, mast_j = n - 10, n // 3  # mast in the south-west part, not on a symmetry axis
    wall_i = mast_i - 8  # a full-width east-west wall NORTH of the mast
    elev = _flat(n)
    elev[wall_i, :] = SYNTH_WALL_FACTOR * h
    mx, my = _cell_centre(mast_i, mast_j, cell, origin)

    out = _viewshed(elev, cell, origin, mx, my, h, target_height_m=0.0)

    assert out.dtype == np.uint8
    assert out.shape == elev.shape
    # Row 0 = north: the shadow is on the low-index side of the wall, the lit side has the mast.
    assert (out[:wall_i, :] == 0).all()
    assert (out[wall_i + 1 :, :] == 1).all()
    # Cell size and origin: the boundary row sits exactly where (origin_y - y)/cell puts the wall.
    assert out[wall_i - 1, mast_j] == 0
    assert out[wall_i + 1, mast_j] == 1


def test_suit_receiver_extends_visibility_beyond_the_mast_only_horizon():
    """T03.29, decision 2026-11-06: the configured suit antenna extends the flat-ground horizon."""
    h = _mast_height_m()
    target_h = float(json.loads(SUIT_PARAMS.read_text())["values"]["antenna_m"])
    mast_horizon = math.sqrt(2.0 * MARS_RADIUS_M * h)
    joint_horizon = mast_horizon + math.sqrt(2.0 * MARS_RADIUS_M * target_h)
    cell, n, origin = SYNTH_COARSE_CELL_M, SYNTH_COARSE_SIZE, SYNTH_ORIGIN_M
    mast_i = mast_j = n // 2
    # Synthetic sample halfway between the two analytic horizons, rounded to a cell centre.
    offset = round((mast_horizon + joint_horizon) / (2.0 * cell))
    assert mast_horizon < offset * cell < joint_horizon
    assert mast_j + offset < n
    mx, my = _cell_centre(mast_i, mast_j, cell, origin)
    elev = _flat(n)

    ground = _viewshed(elev, cell, origin, mx, my, h)  # default target_height_m = 0.0
    suit = _viewshed(elev, cell, origin, mx, my, h, target_height_m=target_h)

    assert ground[mast_i, mast_j + offset] == 0
    assert suit[mast_i, mast_j + offset] == 1


def test_nan_elevation_cells_are_no_data_255():
    """05 RoutingGrid `comm_hab_asset`: DEM no-data (NaN) becomes 255; every other cell is 0 or 1."""
    h = _mast_height_m()
    cell, n, origin = SYNTH_FLAT_CELL_M, SYNTH_FLAT_SIZE, SYNTH_ORIGIN_M
    mast_i = mast_j = n // 2
    elev = _flat(n)
    elev[5, 7] = np.nan
    elev[mast_i - 6 : mast_i - 3, mast_j + 4 : mast_j + 9] = np.nan  # a small patch near the mast
    mx, my = _cell_centre(mast_i, mast_j, cell, origin)

    out = _viewshed(elev, cell, origin, mx, my, h, target_height_m=0.0)

    nan_mask = np.isnan(elev)
    assert out.dtype == np.uint8
    assert (out[nan_mask] == NODATA).all()
    assert np.isin(out[~nan_mask], (0, 1)).all()
