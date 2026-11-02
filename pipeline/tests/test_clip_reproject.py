"""Projection and raster handling: docs/specs/02 §C.1, §C.4, §F.1 Projection row."""
import pytest

import marswalk_pipeline.clip_reproject  # noqa: F401  (stubs must import cleanly)


@pytest.mark.skip(reason="TASK-03")
def test_projection_round_trip_lat_lon_xy_within_1_mm():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_row_0_is_north_after_reprojection():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_dem_nodata_becomes_nan_before_slope():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_scale_bar_vs_dem_measured_feature_within_2_percent():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_no_epsg_3857_or_wgs84_in_code_paths():
    ...
