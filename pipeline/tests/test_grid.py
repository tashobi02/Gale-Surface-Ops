"""Routing grid encoding: docs/specs/05 §C RoutingGrid and flag bits; 02 §E.1. FR-03, FR-07."""
from __future__ import annotations

from pathlib import Path
import re
import struct

import pytest

from marswalk_pipeline import config

# 05 §C RoutingGrid: width*height <= 4e6.
MAX_GRID_CELLS = 4_000_000


def test_slope_u8_is_degrees_times_4_with_255_nodata() -> None:
    """05 §C RoutingGrid: u8 = degrees * 4 in 0.25 deg steps (0-63.5 deg), NaN -> 255."""
    np = pytest.importorskip("numpy")
    from marswalk_pipeline import grid as grid_mod

    assert config.SLOPE_U8_SCALE == 4
    assert config.U8_NODATA == 255

    # Values from 05 §C RoutingGrid (0, 0.25 step, 63.5 max), 02 §D.3 (5, 10, 15),
    # and 02 §E.2 SAMPLE_RESULT (21.75), plus NaN for no-data.
    slopes_deg = np.array(
        [
            [0.0, 0.25, 5.0, 10.0],
            [15.0, 21.75, 63.5, np.nan],
        ],
        dtype=np.float32,
    )

    encoded = grid_mod.encode_slope_u8(slopes_deg)

    assert isinstance(encoded, np.ndarray)
    assert encoded.dtype == np.uint8
    assert encoded.shape == slopes_deg.shape

    expected = np.array(
        [
            [0, 1, 20, 40],
            [60, 87, 254, config.U8_NODATA],
        ],
        dtype=np.uint8,
    )
    np.testing.assert_array_equal(encoded, expected)


def test_slope_above_63_5_clamps_to_254_reserving_255_for_nodata() -> None:
    """T03.11, data-lead decision 2026-11-06: slopes > 63.5° clamp to 254; only NaN gets 255."""
    np = pytest.importorskip("numpy")
    from marswalk_pipeline import grid as grid_mod

    # 05 RoutingGrid maximum and step; 90° is the 02 §C.2 L3 slope upper bound.
    slopes = np.array([[63.5, 63.5 + 0.25, 90.0, np.nan]], dtype=np.float32)
    encoded = grid_mod.encode_slope_u8(slopes)

    assert encoded.dtype == np.uint8
    assert encoded.shape == slopes.shape
    np.testing.assert_array_equal(encoded, np.array([[254, 254, 254, 255]], dtype=np.uint8))


def test_flag_bits_match_05() -> None:
    """05 §C Flag bits (NO_DATA 0 .. LOW_RES_DEM 4) and C4 mirror check against schema.ts."""
    expected_flag_bits = {
        "NO_DATA": 0,
        "HARD_HAZARD": 1,
        "LOW_TI": 2,
        "TI_UNKNOWN": 3,
        "LOW_RES_DEM": 4,
    }
    assert config.FLAG_BITS == expected_flag_bits

    schema_ts_path = (
        Path(__file__).resolve().parents[2] / "packages" / "protocol" / "src" / "schema.ts"
    )
    schema_text = schema_ts_path.read_text(encoding="utf-8")

    match = re.search(
        r"export\s+const\s+FLAG_BITS\s*=\s*\{([^}]*)\}",
        schema_text,
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None, "FLAG_BITS block not found in packages/protocol/src/schema.ts"

    body = match.group(1)
    ts_flag_bits = {
        name: int(bit)
        for name, bit in re.findall(r"([A-Z0-9_]+)\s*:\s*(\d+)", body)
    }
    assert ts_flag_bits == expected_flag_bits
    assert ts_flag_bits == config.FLAG_BITS


def test_arrays_are_little_endian_row_major_north_up(tmp_path: Path) -> None:
    """02 §E.1 and 05 §C Asset/RoutingGrid: five files, little-endian, row-major, north-up, no-data."""
    np = pytest.importorskip("numpy")
    from marswalk_pipeline import grid as grid_mod

    # Declared synthetic shape: 2 rows (row 0 = north, row 1 = south) x 3 cols (west -> east).
    # Pass big-endian / Fortran-order elevation to verify write_grid enforces little-endian C-order.
    # -3912.4 m and 312.0 tiu come from 02 §E.2 SAMPLE_RESULT; 0.0 is a typed placeholder; NaN is 05 Asset nodata.
    elevation_rows = [
        [-3912.4, 0.0, np.nan],  # row 0 (north)
        [0.0, -3912.4, 0.0],     # row 1 (south)
    ]
    elevation = np.asfortranarray(np.array(elevation_rows, dtype=">f4"))

    # Encoded u8 slopes (0, 1, 20, 40, 60, 255=no-data from 05 §C RoutingGrid).
    slope_p90 = np.array(
        [
            [0, 20, config.U8_NODATA],
            [40, 60, 1],
        ],
        dtype=np.uint8,
    )
    slope_max = np.array(
        [
            [1, 40, config.U8_NODATA],
            [60, 87, 20],
        ],
        dtype=np.uint8,
    )
    flags = np.array(
        [
            [0, 1 << config.FLAG_BITS["HARD_HAZARD"], 1 << config.FLAG_BITS["NO_DATA"]],
            [1 << config.FLAG_BITS["LOW_TI"], 1 << config.FLAG_BITS["TI_UNKNOWN"], 1 << config.FLAG_BITS["LOW_RES_DEM"]],
        ],
        dtype=np.uint8,
    )
    # TI sidecar on its own small grid (1 row x 2 cols), with NaN no-data (05 §C RoutingGrid, Asset).
    ti = np.array([[312.0, np.nan]], dtype=">f4")

    grid_mod.write_grid(
        out_dir=tmp_path,
        elevation=elevation,
        slope_p90=slope_p90,
        slope_max=slope_max,
        flags=flags,
        ti=ti,
    )

    grid_dir = tmp_path / "grid"
    elev_path = grid_dir / "elevation.f32"
    p90_path = grid_dir / "slope_p90.u8"
    max_path = grid_dir / "slope_max.u8"
    flags_path = grid_dir / "flags.u8"
    ti_path = grid_dir / "ti_100m.f32"

    for path in (elev_path, p90_path, max_path, flags_path, ti_path):
        assert path.is_file(), f"Missing expected grid file: {path}"

    height, width = elevation.shape
    ti_height, ti_width = ti.shape
    assert elev_path.stat().st_size == width * height * 4
    assert p90_path.stat().st_size == width * height * 1
    assert max_path.stat().st_size == width * height * 1
    assert flags_path.stat().st_size == width * height * 1
    assert ti_path.stat().st_size == ti_width * ti_height * 4

    # Verify little-endian (<f4) byte representation and row-major north-up ordering (row 0 first).
    elev_bytes = elev_path.read_bytes()
    assert elev_bytes[:4] == struct.pack("<f", -3912.4)
    elev_flat = struct.unpack(f"<{width * height}f", elev_bytes)
    assert elev_flat[0] == pytest.approx(-3912.4, rel=1e-6)
    assert elev_flat[1] == 0.0
    assert np.isnan(elev_flat[2])  # row 0, col 2 f32 no-data = NaN
    assert elev_flat[3] == 0.0     # row 1, col 0 follows row 0, col 2 (row-major, north-up)
    assert elev_flat[4] == pytest.approx(-3912.4, rel=1e-6)
    assert elev_flat[5] == 0.0

    # Verify u8 files are row-major, north-up, with 255 = no-data.
    assert list(p90_path.read_bytes()) == [0, 20, config.U8_NODATA, 40, 60, 1]
    assert list(max_path.read_bytes()) == [1, 40, config.U8_NODATA, 60, 87, 20]
    assert list(flags_path.read_bytes()) == [
        0,
        1 << config.FLAG_BITS["HARD_HAZARD"],
        1 << config.FLAG_BITS["NO_DATA"],
        1 << config.FLAG_BITS["LOW_TI"],
        1 << config.FLAG_BITS["TI_UNKNOWN"],
        1 << config.FLAG_BITS["LOW_RES_DEM"],
    ]

    # Verify TI sidecar is little-endian <f4 with NaN no-data.
    ti_flat = struct.unpack(f"<{ti_width * ti_height}f", ti_path.read_bytes())
    assert ti_flat[0] == pytest.approx(312.0, rel=1e-6)
    assert np.isnan(ti_flat[1])


def test_write_grid_omits_ti_file_when_ti_is_none(tmp_path: Path) -> None:
    """02 §E.1 and 05 §C RoutingGrid: no grid/ti_100m.f32 file is written when TI is absent."""
    np = pytest.importorskip("numpy")
    from marswalk_pipeline import grid as grid_mod

    elevation = np.zeros((2, 2), dtype=np.float32)
    slope_p90 = np.zeros((2, 2), dtype=np.uint8)
    slope_max = np.zeros((2, 2), dtype=np.uint8)
    flags = np.full((2, 2), 1 << config.FLAG_BITS["TI_UNKNOWN"], dtype=np.uint8)

    grid_mod.write_grid(
        out_dir=tmp_path,
        elevation=elevation,
        slope_p90=slope_p90,
        slope_max=slope_max,
        flags=flags,
        ti=None,
    )

    grid_dir = tmp_path / "grid"
    assert (grid_dir / "elevation.f32").is_file()
    assert (grid_dir / "slope_p90.u8").is_file()
    assert (grid_dir / "slope_max.u8").is_file()
    assert (grid_dir / "flags.u8").is_file()
    assert not (grid_dir / "ti_100m.f32").exists()


def test_write_grid_refuses_grid_larger_than_05_limit(tmp_path: Path) -> None:
    """05 §C RoutingGrid: width*height <= 4e6; larger grids raise ValueError without allocating 4e6 cells."""
    np = pytest.importorskip("numpy")
    from marswalk_pipeline import grid as grid_mod

    # 2001 * 2000 = 4,002,000 > 4,000,000 (05 limit); broadcast_to uses 0-stride views (1 element in memory).
    oversized_shape = (2001, 2000)
    assert oversized_shape[0] * oversized_shape[1] > MAX_GRID_CELLS

    elevation = np.broadcast_to(np.float32(0.0), oversized_shape)
    slope_p90 = np.broadcast_to(np.uint8(0), oversized_shape)
    slope_max = np.broadcast_to(np.uint8(0), oversized_shape)
    flags = np.broadcast_to(np.uint8(0), oversized_shape)

    with pytest.raises(ValueError):
        grid_mod.write_grid(
            out_dir=tmp_path,
            elevation=elevation,
            slope_p90=slope_p90,
            slope_max=slope_max,
            flags=flags,
            ti=None,
        )
