"""Projection and raster handling: docs/specs/02 §C.1, §C.4, §F.1 Projection row."""
from __future__ import annotations

import ast
import io
import math
from pathlib import Path
import re
import tokenize

import pytest

from marswalk_pipeline import config

# Illustrative working projection and AOI extent from docs/specs/05 §F.1.
EXAMPLE_WORKING_PROJ = (
    "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 "
    "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)
# Source DEM projection per docs/specs/02 §C.1: Mars equirectangular with standard parallel 0°.
SOURCE_MARS_EQC_PROJ = (
    "+proj=eqc +lat_ts=0 +lat_0=-4.70 +lon_0=137.38 "
    "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)
EXAMPLE_EXTENT_M: tuple[float, float, float, float] = (-3000.0, -3000.0, 3000.0, 3000.0)

# Forbidden Earth CRS / datum patterns in executable pipeline code (02 §C.1 "Never", §C.4.2).
_FORBIDDEN_CRS_RE = re.compile(
    r"epsg\s*:\s*(?:3857|4326)\b"
    r"|\bwgs\s*_?\s*84\b"
    r"|\bfrom_epsg\s*\(\s*(?:3857|4326)\b",
    re.IGNORECASE,
)


def _docstring_ranges(tree: ast.AST) -> set[tuple[int, int, int, int]]:
    """Return (lineno, col_offset, end_lineno, end_col_offset) for every docstring node."""
    ranges: set[tuple[int, int, int, int]] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            if not node.body:
                continue
            first = node.body[0]
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
                and first.value.lineno is not None
                and first.value.col_offset is not None
                and first.value.end_lineno is not None
                and first.value.end_col_offset is not None
            ):
                ranges.add(
                    (
                        first.value.lineno,
                        first.value.col_offset,
                        first.value.end_lineno,
                        first.value.end_col_offset,
                    )
                )
    return ranges


def _is_within_docstring(
    start: tuple[int, int],
    end: tuple[int, int],
    doc_ranges: set[tuple[int, int, int, int]],
) -> bool:
    for d_line, d_col, d_end_line, d_end_col in doc_ranges:
        if start >= (d_line, d_col) and end <= (d_end_line, d_end_col):
            return True
    return False


# TODO(decision): whether CI installs the geo stack or relies on pytest.importorskip
# (shared with T14.01/T14.02; see docs/tasks/TASK-03_preprocessing-pipeline.md Spec question 2).


def test_projection_round_trip_lat_lon_xy_within_1_mm() -> None:
    """Round-trip lat/lon <-> x/y through config.WORKING_PROJ at AOI corners and centre <= 1 mm (02 §F.1)."""
    pyproj = pytest.importorskip("pyproj")

    working_proj = config.WORKING_PROJ
    assert isinstance(working_proj, str) and working_proj.strip()
    assert "<" not in working_proj and ">" not in working_proj
    assert "+proj=eqc" in working_proj
    assert f"+R={config.MARS_RADIUS_M}" in working_proj

    crs_proj = pyproj.CRS.from_proj4(working_proj)
    crs_geo = crs_proj.geodetic_crs
    assert crs_geo is not None

    xy_to_lonlat = pyproj.Transformer.from_crs(crs_proj, crs_geo, always_xy=True)
    lonlat_to_xy = pyproj.Transformer.from_crs(crs_geo, crs_proj, always_xy=True)

    minx, miny, maxx, maxy = EXAMPLE_EXTENT_M
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0
    test_points_xy = [
        (minx, miny),
        (minx, maxy),
        (maxx, miny),
        (maxx, maxy),
        (cx, cy),
    ]

    for x_m, y_m in test_points_xy:
        lon_e, lat = xy_to_lonlat.transform(x_m, y_m)
        x_rt, y_rt = lonlat_to_xy.transform(lon_e, lat)
        err_xy_m = math.hypot(x_rt - x_m, y_rt - y_m)
        assert err_xy_m <= 1e-3, f"x/y -> lat/lon -> x/y error {err_xy_m:.6e} m > 1 mm at ({x_m}, {y_m})"

        lon_rt, lat_rt = xy_to_lonlat.transform(x_rt, y_rt)
        dlat_m = math.radians(lat_rt - lat) * config.MARS_RADIUS_M
        dlon_m = math.radians(lon_rt - lon_e) * config.MARS_RADIUS_M * math.cos(math.radians(lat))
        err_geo_m = math.hypot(dlon_m, dlat_m)
        assert err_geo_m <= 1e-3, f"lat/lon -> x/y -> lat/lon error {err_geo_m:.6e} m > 1 mm at ({lon_e}, {lat})"


def test_row_0_is_north_after_reprojection(tmp_path: Path) -> None:
    """After clip_and_reproject, row 0 of the output raster is the northern edge (02 §C.4.3)."""
    np = pytest.importorskip("numpy")
    rasterio = pytest.importorskip("rasterio")
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds

    from marswalk_pipeline import clip_reproject

    src_extent: tuple[float, float, float, float] = (-100.0, -100.0, 100.0, 100.0)
    dst_extent: tuple[float, float, float, float] = (-50.0, -50.0, 50.0, 50.0)
    resolution_m = float(config.GRID_CELL_M)

    src_width = int((src_extent[2] - src_extent[0]) / resolution_m)
    src_height = int((src_extent[3] - src_extent[1]) / resolution_m)
    src_transform = from_bounds(*src_extent, width=src_width, height=src_height)

    # Synthetic north-up source raster: northern band (covering dst row 0) marked 100.0, southern band 10.0.
    north_val = 100.0
    south_val = 10.0
    src_data = np.full((src_height, src_width), south_val, dtype=np.float32)
    src_data[: src_height // 2, :] = north_val

    src_path = tmp_path / "synthetic_src.tif"
    dst_path = tmp_path / "reprojected_dst.tif"

    with rasterio.open(
        src_path,
        "w",
        driver="GTiff",
        height=src_height,
        width=src_width,
        count=1,
        dtype="float32",
        crs=CRS.from_proj4(SOURCE_MARS_EQC_PROJ),
        transform=src_transform,
        nodata=-32767.0,
    ) as src_ds:
        src_ds.write(src_data, 1)

    clip_reproject.clip_and_reproject(
        src=src_path,
        dst=dst_path,
        proj4=EXAMPLE_WORKING_PROJ,
        extent_m=dst_extent,
        resolution_m=resolution_m,
    )

    assert dst_path.is_file()
    with rasterio.open(dst_path) as dst_ds:
        assert dst_ds.crs == CRS.from_proj4(EXAMPLE_WORKING_PROJ)
        assert (dst_ds.bounds.left, dst_ds.bounds.bottom, dst_ds.bounds.right, dst_ds.bounds.top) == pytest.approx(
            dst_extent
        )
        assert dst_ds.res == pytest.approx((resolution_m, resolution_m))
        # North-up orientation: origin at maxy (north) and negative y pixel size.
        assert dst_ds.transform.f == pytest.approx(dst_extent[3])
        assert dst_ds.transform.e == pytest.approx(-resolution_m)

        out = dst_ds.read(1)
        assert np.allclose(out[0, :], north_val)
        assert np.allclose(out[-1, :], south_val)
        assert np.all(out[0, :] > out[-1, :])


def test_dem_nodata_becomes_nan_before_slope(tmp_path: Path) -> None:
    """DEM no-data pixels are replaced with NaN in-place before slope computation (02 §C.4.4)."""
    np = pytest.importorskip("numpy")
    rasterio = pytest.importorskip("rasterio")
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds

    from marswalk_pipeline import clip_reproject

    # TODO(verify): confirm whether the Gale DEM carries a declared GeoTIFF nodata tag or requires
    # the PDS3 label value from T01.01 (docs/tasks/TASK-03_preprocessing-pipeline.md Spec question 15).
    declared_nodata = -32767.0
    valid_elevation = -4500.0

    extent_m: tuple[float, float, float, float] = (-50.0, -50.0, 50.0, 50.0)
    resolution_m = float(config.GRID_CELL_M)
    width = int((extent_m[2] - extent_m[0]) / resolution_m)
    height = int((extent_m[3] - extent_m[1]) / resolution_m)
    transform = from_bounds(*extent_m, width=width, height=height)

    dem_data = np.full((height, width), valid_elevation, dtype=np.float32)
    dem_data[0, :] = declared_nodata
    dem_data[:, 0] = declared_nodata
    nodata_mask = dem_data == declared_nodata

    dem_path = tmp_path / "synthetic_dem_nodata.tif"
    with rasterio.open(
        dem_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs=CRS.from_proj4(EXAMPLE_WORKING_PROJ),
        transform=transform,
        nodata=declared_nodata,
    ) as ds:
        ds.write(dem_data, 1)

    clip_reproject.nodata_to_nan(dem_path)

    with rasterio.open(dem_path) as ds:
        out = ds.read(1)
        assert np.all(np.isnan(out[nodata_mask]))
        assert not np.any(out == declared_nodata)
        assert np.all(np.isfinite(out[~nodata_mask]))
        assert np.allclose(out[~nodata_mask], valid_elevation)


def test_no_epsg_3857_or_wgs84_in_code_paths() -> None:
    """Scan pipeline/src/ executable tokens for forbidden EPSG:3857 / EPSG:4326 / WGS84 paths (02 §C.1, §C.4.2)."""
    src_root = Path(__file__).resolve().parents[1] / "src"
    py_files = sorted(src_root.rglob("*.py"))
    assert py_files, f"No Python files found under {src_root}"

    violations: list[str] = []
    for py_file in py_files:
        source = py_file.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(py_file))
        doc_ranges = _docstring_ranges(tree)

        kept_tokens: list[str] = []
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.COMMENT:
                continue
            if tok.type == tokenize.STRING and _is_within_docstring(tok.start, tok.end, doc_ranges):
                continue
            kept_tokens.append(tok.string)
            if _FORBIDDEN_CRS_RE.search(tok.string):
                rel = py_file.relative_to(src_root)
                violations.append(f"{rel}:{tok.start[0]}: forbidden CRS reference in {tok.string!r}")

        code_without_docs_or_comments = " ".join(kept_tokens)
        if not violations and _FORBIDDEN_CRS_RE.search(code_without_docs_or_comments):
            rel = py_file.relative_to(src_root)
            match = _FORBIDDEN_CRS_RE.search(code_without_docs_or_comments)
            assert match is not None
            violations.append(f"{rel}: forbidden CRS expression {match.group(0)!r}")

    assert not violations, "Forbidden Earth CRS code paths found:\n" + "\n".join(violations)
