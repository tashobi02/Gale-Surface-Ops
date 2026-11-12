"""F5 (T03.21, BD-54): the real-grid cell fixture is seeded, reproducible and equals the bundle arrays."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("make_real_grid_cells", HERE / "fixtures/make_real_grid_cells.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

FIXTURE = HERE / "fixtures/real-grid-cells.json"
needs_bundle = pytest.mark.skipif(not (generator.SITE / "grid/elevation.f32").exists() or not FIXTURE.exists(),
                                  reason="real bundle arrays or the F5 fixture absent")


def test_cells_are_chosen_by_the_seeded_rule_and_only_from_valid_cells():
    valid = np.ones((20, 30), dtype=bool)
    valid[:, :10] = False
    first = generator.choose_cells(valid, seed=4190)
    assert first == generator.choose_cells(valid, seed=4190)
    assert first != generator.choose_cells(valid, seed=4191)
    assert len(set(first)) == generator.COUNT == len(first)
    assert all(valid[row, col] for row, col in first)
    assert first == sorted(first)


def test_too_few_valid_cells_is_refused():
    with pytest.raises(ValueError, match="valid cells"):
        generator.choose_cells(np.zeros((3, 3), dtype=bool))


def test_the_seed_is_the_scenario_seed_of_the_05_example():
    assert generator.SEED == 4190


@needs_bundle
def test_fixture_cells_equal_the_bundle_arrays_at_the_05_e1_addresses():
    fixture = json.loads(FIXTURE.read_text())
    grid = fixture["grid"]
    elevation = np.fromfile(generator.SITE / "grid/elevation.f32", dtype="<f4").reshape(grid["height"], grid["width"])
    slope = np.fromfile(generator.SITE / "grid/slope_p90.u8", dtype=np.uint8).reshape(grid["height"], grid["width"])
    assert len(fixture["cells"]) == generator.COUNT
    for cell in fixture["cells"]:
        row, col = cell["row"], cell["col"]
        assert cell["x_m"] == grid["origin_m"][0] + (col + 0.5) * grid["cell_m"]
        assert cell["y_m"] == grid["origin_m"][1] - (row + 0.5) * grid["cell_m"]
        assert cell["elevation_m"] == float(elevation[row, col])
        assert cell["slope_p90_u8"] == int(slope[row, col]) != 255
        assert cell["slope_p90_deg"] == cell["slope_p90_u8"] / 4


@needs_bundle
def test_regenerating_reproduces_the_fixture_byte_for_byte():
    text = json.dumps(generator.build(), indent=2, sort_keys=True, allow_nan=False) + "\n"
    assert text == FIXTURE.read_text()


@needs_bundle
def test_fixture_data_version_is_the_bundles():
    manifest = json.loads((generator.SITE / "site-manifest.json").read_text())
    assert json.loads(FIXTURE.read_text())["data_version"] == manifest["data_version"]
