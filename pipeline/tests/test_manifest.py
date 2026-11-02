"""Manifest integrity: docs/specs/05 §E.3; 06 TASK-03 done-when; NFR-09."""
import pytest

import marswalk_pipeline.validate_manifest  # noqa: F401  (stubs must import cleanly)


@pytest.mark.skip(reason="TASK-03")
def test_manifest_validates_against_json_schema():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_every_asset_ref_resolves_and_sha256_matches():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_every_source_id_resolves_to_a_data_source():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_all_grids_share_width_height_cell_origin():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_pois_and_default_start_inside_aoi_and_passable():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_crs_proj4_byte_identical_to_pipeline_constant():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_sampled_values_match_source_rasters():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_site_bundle_at_most_250_mb():
    ...
