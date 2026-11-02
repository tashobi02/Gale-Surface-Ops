"""Slope and derived rasters: docs/specs/02 §C.2 L3 validation, §F.1 Slope row."""
import pytest

import marswalk_pipeline.derive  # noqa: F401  (stubs must import cleanly)


@pytest.mark.skip(reason="TASK-03")
def test_horn_slope_synthetic_ramp_10_deg_within_0_05():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_horn_slope_synthetic_planes_0_10_30_deg_within_0_05():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_nan_edges_produce_nan_not_spikes():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_aggregate_slope_p90_and_max_to_5m_grid():
    ...


@pytest.mark.skip(reason="TASK-03")
def test_hazard_flags_ti_gap_is_ti_unknown_not_zero():
    ...
