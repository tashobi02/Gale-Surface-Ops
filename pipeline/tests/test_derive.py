"""Slope, hillshade, aggregation and hazard flags.

Specs: docs/specs/02 §C.2 L2 (hillshade), L3 (Horn slope, p90/max), L4 (TI gaps), §F.1 Slope row;
docs/specs/05 §C "Flag bits" and §E.6. Every array here is synthetic and built so that the expected
answer follows from construction; no real DEM or TI value is used. Task: T03.04.
"""
import pytest

np = pytest.importorskip("numpy")

from marswalk_pipeline.derive import aggregate_slope, hillshade, horn_slope_deg  # noqa: E402
from marswalk_pipeline.flags import hazard_flags  # noqa: E402

# Tolerance from 02 §C.2 L3 Validation and 02 §F.1 Slope row.
SLOPE_TOL_DEG = 0.05

# Bit values from 05 §C "Flag bits" (bit n = 1 << n). Bits 5-7 are reserved.
NO_DATA = 1 << 0
HARD_HAZARD = 1 << 1
LOW_TI = 1 << 2
TI_UNKNOWN = 1 << 3
LOW_RES_DEM = 1 << 4
RESERVED_BITS = (1 << 5) | (1 << 6) | (1 << 7)

CELL_M = 1.0  # the 1 m DEM grid of 02 §C.2 L3


def _plane(slope_deg: float, axis: str = "x", n: int = 21) -> "np.ndarray":
    """n x n plane rising at slope_deg along `axis` ('x' = columns, 'y' = rows, 'xy' = diagonal)."""
    rise_per_m = float(np.tan(np.deg2rad(slope_deg)))
    rows, cols = np.mgrid[0:n, 0:n].astype(np.float64) * CELL_M
    if axis == "x":
        return rise_per_m * cols
    if axis == "y":
        return rise_per_m * rows
    # Diagonal: the gradient magnitude is rise_per_m, split equally between the two axes.
    return rise_per_m * (rows + cols) / np.sqrt(2.0)


def _interior(a: "np.ndarray") -> "np.ndarray":
    """Drop the outermost ring, where a 3x3 stencil needs an edge policy the spec does not fix."""
    return a[1:-1, 1:-1]


# --- Horn slope -------------------------------------------------------------------------------


@pytest.mark.parametrize("axis", ["x", "y", "xy"])
def test_horn_slope_synthetic_ramp_10_deg_within_0_05(axis):
    """02 §C.2 L3 validation: a known 10 degree plane gives 10.0 +/- 0.05."""
    slope = horn_slope_deg(_plane(10.0, axis), CELL_M)
    assert slope.shape == (21, 21)
    assert np.all(np.abs(_interior(slope) - 10.0) <= SLOPE_TOL_DEG)


@pytest.mark.parametrize("expected_deg", [0.0, 10.0, 30.0])
@pytest.mark.parametrize("axis", ["x", "y", "xy"])
def test_horn_slope_synthetic_planes_0_10_30_deg_within_0_05(expected_deg, axis):
    """02 §F.1 Slope row: synthetic planes of 0, 10 and 30 degrees within +/- 0.05."""
    slope = horn_slope_deg(_plane(expected_deg, axis), CELL_M)
    assert np.all(np.isfinite(_interior(slope)))
    assert np.all(np.abs(_interior(slope) - expected_deg) <= SLOPE_TOL_DEG)


def test_horn_slope_is_independent_of_plane_orientation():
    """The same plane tilted along x, along y and diagonally gives the same slope."""
    results = [_interior(horn_slope_deg(_plane(30.0, a), CELL_M)) for a in ("x", "y", "xy")]
    for other in results[1:]:
        assert np.allclose(results[0], other, atol=SLOPE_TOL_DEG)


def test_horn_slope_output_range_is_0_to_90_degrees():
    steep = _plane(30.0)
    steep[10, 10] += 1000.0  # a synthetic spike far steeper than any plane
    out = horn_slope_deg(steep, CELL_M)
    finite = out[np.isfinite(out)]
    assert finite.size > 0
    assert finite.min() >= 0.0
    assert finite.max() <= 90.0


def test_horn_slope_uses_weighted_diagonal_neighbours():
    """T03.09 / 02 §C.2 L3: a non-planar stencil distinguishes Horn from central differences."""
    # Declared synthetic 3x3 stencil: only the NE corner is raised by 8 cell widths.
    # Horn's two derivatives at the centre are +rise/(8*cell), -rise/(8*cell).
    # Central differences would ignore the corners and incorrectly return zero slope.
    dem = np.zeros((3, 3), dtype=np.float64)
    rise = 8.0 * CELL_M
    dem[0, 2] = rise
    gradient = rise / (8.0 * CELL_M)
    expected = np.rad2deg(np.arctan(np.hypot(gradient, gradient)))

    slope = horn_slope_deg(dem, CELL_M)

    assert slope.shape == dem.shape
    assert abs(slope[1, 1] - expected) <= SLOPE_TOL_DEG


# --- NaN handling -----------------------------------------------------------------------------


def test_nan_edges_produce_nan_not_spikes():
    """02 §F.1 Slope row: a NaN hole yields NaN around it, never a spike, and leaves the rest intact."""
    dem = _plane(10.0)
    r, c = 10, 10
    dem[r, c] = np.nan
    slope = horn_slope_deg(dem, CELL_M)

    # The cell itself and every cell whose 3x3 window contains it are NaN.
    assert np.all(np.isnan(slope[r - 1 : r + 2, c - 1 : c + 2]))

    # No spikes: every finite value in the interior is still the plane's slope.
    interior = _interior(slope)
    finite = interior[np.isfinite(interior)]
    assert np.all(np.abs(finite - 10.0) <= SLOPE_TOL_DEG)

    # Cells whose window does not reach the hole are unaffected (not blanked wholesale).
    mask = np.ones(slope.shape, dtype=bool)
    mask[r - 1 : r + 2, c - 1 : c + 2] = False
    mask[0, :] = mask[-1, :] = mask[:, 0] = mask[:, -1] = False
    assert np.all(np.isfinite(slope[mask]))


def test_nan_border_columns_leave_valid_interior_untouched():
    """A NaN border (no-data margin) gives NaN next to it and a correct slope away from it."""
    dem = _plane(10.0)
    dem[:, :3] = np.nan
    slope = horn_slope_deg(dem, CELL_M)

    # Column 3 is the first valid column; its window includes NaN column 2 -> NaN.
    assert np.all(np.isnan(slope[:, :4]))
    # Columns 4.. have a clean 3x3 window (rows 1..-2 to stay off the top/bottom edge policy).
    clean = slope[1:-1, 4:-1]
    assert np.all(np.isfinite(clean))
    assert np.all(np.abs(clean - 10.0) <= SLOPE_TOL_DEG)


def test_all_nan_dem_gives_all_nan_slope():
    slope = horn_slope_deg(np.full((7, 7), np.nan), CELL_M)
    assert slope.shape == (7, 7)
    assert np.all(np.isnan(slope))


# --- Aggregation to the routing grid ----------------------------------------------------------
# The percentile method is TODO(decision) for T03.09, so these blocks are built such that every
# common percentile definition gives the same p90.

FACTOR = 5  # 1 m slope grid -> 5 m routing grid (02 §C.2 L3)


def test_aggregate_slope_p90_and_max_to_5m_grid():
    """Uniform blocks: p90 and max both equal the block's value."""
    slope = np.empty((2 * FACTOR, 2 * FACTOR), dtype=np.float64)
    slope[:FACTOR, :FACTOR] = 3.0
    slope[:FACTOR, FACTOR:] = 7.0
    slope[FACTOR:, :FACTOR] = 11.0
    slope[FACTOR:, FACTOR:] = 19.0

    p90, mx = aggregate_slope(slope, FACTOR)

    expected = np.array([[3.0, 7.0], [11.0, 19.0]])
    assert p90.shape == (2, 2)
    assert mx.shape == (2, 2)
    assert np.allclose(p90, expected)
    assert np.allclose(mx, expected)


def test_aggregate_slope_single_steep_pixel_is_in_max_but_not_p90():
    """One steep pixel in 25: max reports it; p90 does not (02 §C.2 L3: p90 reduces single-pixel spikes).

    With 25 values and 24 equal ones, every standard percentile definition at 90 % lands in the
    equal group, so the expected p90 does not depend on the method.
    """
    base, spike = 4.0, 60.0  # synthetic degrees
    slope = np.full((FACTOR, FACTOR), base)
    slope[2, 3] = spike

    p90, mx = aggregate_slope(slope, FACTOR)

    assert p90.shape == (1, 1)
    assert mx.shape == (1, 1)
    assert mx[0, 0] == pytest.approx(spike)
    assert p90[0, 0] == pytest.approx(base)


def test_aggregate_slope_blocks_are_independent():
    """A spike in one block does not leak into its neighbours."""
    slope = np.full((2 * FACTOR, 2 * FACTOR), 2.0)
    slope[1, 1] = 50.0  # inside block (0, 0) only

    p90, mx = aggregate_slope(slope, FACTOR)

    assert mx[0, 0] == pytest.approx(50.0)
    assert np.allclose([mx[0, 1], mx[1, 0], mx[1, 1]], 2.0)
    assert np.allclose(p90, 2.0)


# --- Hillshade --------------------------------------------------------------------------------


def test_hillshade_shape_and_default_azimuth_altitude():
    """02 §C.2 L2: azimuth 315, altitude 45 (Proposed). Shape only; no brightness values asserted."""
    dem = _plane(10.0)
    default = hillshade(dem, CELL_M)
    explicit = hillshade(dem, CELL_M, azimuth_deg=315, altitude_deg=45)
    assert default.shape == dem.shape
    assert explicit.shape == dem.shape
    assert np.array_equal(default, explicit, equal_nan=True)


def test_hillshade_propagates_nan():
    dem = _plane(10.0)
    dem[10, 10] = np.nan
    shade = hillshade(dem, CELL_M, azimuth_deg=315, altitude_deg=45)
    assert shade.shape == dem.shape
    assert np.isnan(shade[10, 10])
    # Far from the hole (and the edge) the output is defined.
    assert np.all(np.isfinite(shade[3:7, 3:7]))


def test_hillshade_all_nan_dem_gives_all_nan():
    shade = hillshade(np.full((6, 6), np.nan), CELL_M, azimuth_deg=315, altitude_deg=45)
    assert shade.shape == (6, 6)
    assert np.all(np.isnan(shade))


# --- Hazard flags -----------------------------------------------------------------------------
# Thresholds and TI values below are synthetic test inputs, not site values: U-03 decided
# 2026-11-10 that there is no defensible TI threshold for the AOI, so `threshold=None` is the
# production case (docs/ops/ti-threshold.md).

SYNTHETIC_TI_THRESHOLD = 200.0


def _flat(shape=(4, 4), value=0.0) -> "np.ndarray":
    return np.full(shape, value, dtype=np.float32)


def test_hazard_flags_dtype_and_shape():
    elevation = _flat()
    flags = hazard_flags(elevation, _flat(value=300.0), None)
    assert flags.dtype == np.uint8
    assert flags.shape == elevation.shape


def test_hazard_flags_no_data_where_elevation_is_nan():
    elevation = _flat()
    elevation[1, 2] = np.nan
    elevation[3, 0] = np.nan
    flags = hazard_flags(elevation, _flat(value=300.0), None)

    no_data = (flags & NO_DATA) != 0
    expected = np.zeros(elevation.shape, dtype=bool)
    expected[1, 2] = expected[3, 0] = True
    assert np.array_equal(no_data, expected)


def test_hazard_flags_ti_gap_is_ti_unknown_not_zero():
    """02 §C.2 L4 / 05 §E.6: a TI gap is TI_UNKNOWN, never read as zero (and so never LOW_TI)."""
    elevation = _flat()
    ti = _flat(value=300.0)
    ti[2, 2] = np.nan

    flags = hazard_flags(elevation, ti, SYNTHETIC_TI_THRESHOLD)

    unknown = (flags & TI_UNKNOWN) != 0
    expected = np.zeros(elevation.shape, dtype=bool)
    expected[2, 2] = True
    assert np.array_equal(unknown, expected)
    # A NaN must not be treated as a low value: the gap cell is not LOW_TI.
    assert (flags[2, 2] & LOW_TI) == 0


def test_hazard_flags_missing_ti_layer_marks_every_cell_ti_unknown():
    """05 §E.6: no TI asset -> dependent flags become TI_UNKNOWN, with or without a threshold."""
    elevation = _flat()
    for threshold in (None, SYNTHETIC_TI_THRESHOLD):
        flags = hazard_flags(elevation, None, threshold)
        assert np.all((flags & TI_UNKNOWN) != 0)
        assert np.all((flags & LOW_TI) == 0)


def test_hazard_flags_low_ti_only_when_threshold_is_passed():
    elevation = _flat()
    ti = _flat(value=300.0)
    ti[0, 0] = 100.0  # below the synthetic threshold
    ti[0, 1] = 100.0

    with_threshold = hazard_flags(elevation, ti, SYNTHETIC_TI_THRESHOLD)
    low = (with_threshold & LOW_TI) != 0
    expected = np.zeros(elevation.shape, dtype=bool)
    expected[0, 0] = expected[0, 1] = True
    assert np.array_equal(low, expected)
    assert np.all((with_threshold & TI_UNKNOWN) == 0)

    # U-03 decided 2026-11-10: no threshold; `threshold=None` is the production case.
    without_threshold = hazard_flags(elevation, ti, None)
    assert np.all((without_threshold & LOW_TI) == 0)
    assert np.all((without_threshold & TI_UNKNOWN) == 0)


def test_hazard_flags_low_ti_means_strictly_below_threshold():
    """05 flag bits: LOW_TI = TI below threshold, so a value equal to it is not flagged."""
    ti = _flat(shape=(1, 3))
    ti[0] = [SYNTHETIC_TI_THRESHOLD - 1.0, SYNTHETIC_TI_THRESHOLD, SYNTHETIC_TI_THRESHOLD + 1.0]
    flags = hazard_flags(_flat(shape=(1, 3)), ti, SYNTHETIC_TI_THRESHOLD)
    assert list((flags[0] & LOW_TI) != 0) == [True, False, False]


def test_hazard_flags_hard_hazard_and_low_res_dem_come_from_input_masks():
    elevation = _flat()
    ti = _flat(value=300.0)
    hard = np.zeros(elevation.shape, dtype=bool)
    low_res = np.zeros(elevation.shape, dtype=bool)
    hard[0, 3] = True
    low_res[3, 3] = True
    low_res[0, 3] = True  # one cell in both masks

    flags = hazard_flags(elevation, ti, None, hard_hazard_mask=hard, low_res_dem_mask=low_res)

    assert np.array_equal((flags & HARD_HAZARD) != 0, hard)
    assert np.array_equal((flags & LOW_RES_DEM) != 0, low_res)


def test_hazard_flags_masks_default_to_none_set():
    flags = hazard_flags(_flat(), _flat(value=300.0), SYNTHETIC_TI_THRESHOLD)
    assert np.all((flags & (HARD_HAZARD | LOW_RES_DEM)) == 0)
    assert np.all(flags == 0)


def test_hazard_flags_reserved_bits_5_to_7_stay_zero():
    elevation = _flat()
    elevation[0, 0] = np.nan
    ti = _flat(value=100.0)
    ti[1, 1] = np.nan
    everywhere = np.ones(elevation.shape, dtype=bool)

    flags = hazard_flags(
        elevation, ti, SYNTHETIC_TI_THRESHOLD, hard_hazard_mask=everywhere, low_res_dem_mask=everywhere
    )

    assert np.all((flags & RESERVED_BITS) == 0)
