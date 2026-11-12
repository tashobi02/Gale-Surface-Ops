"""T04.08 / BD-16: automated checks on the packaged traverse of the real site bundle.

They replace the hand check of the traverse against rover tracks in the ortho. They do not
measure that offset (the layer record's `limitations` says so); they check what can be checked
from the packaged files alone.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pytest

from marswalk_pipeline import config
from marswalk_pipeline.vectors import package_traverse

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "data/sites/gale_boxwork"
LAYERS = ROOT / "pipeline/sites/gale_boxwork/layers"
# U-04 (data lead): the traverse is clipped to aoi.extent_m plus this margin so the line reaches the edge.
TRAVERSE_MARGIN_M = 100.0

needs_bundle = pytest.mark.skipif(not (SITE / "vectors/traverse.geojson").exists(), reason="no packaged real traverse")


def _extent() -> list[float]:
    return json.loads((ROOT / "pipeline/sites/gale_boxwork/site.json").read_text())["aoi"]["extent_m"]


def _points() -> list[dict]:
    collection = json.loads((SITE / "vectors/traverse.geojson").read_text())
    return [f for f in collection["features"] if f["geometry"]["type"] == "Point"]


@needs_bundle
def test_bd16_every_traverse_point_lies_inside_the_aoi_plus_the_u04_margin():
    minx, miny, maxx, maxy = _extent()
    points = _points()
    assert points
    for feature in points:
        x, y = feature["geometry"]["coordinates"][:2]
        assert minx - TRAVERSE_MARGIN_M <= x <= maxx + TRAVERSE_MARGIN_M, feature["properties"]
        assert miny - TRAVERSE_MARGIN_M <= y <= maxy + TRAVERSE_MARGIN_M, feature["properties"]


@needs_bundle
def test_bd16_sols_never_decrease_along_the_traverse():
    sols = [feature["properties"]["sol"] for feature in _points()]
    assert sols == sorted(sols)


@needs_bundle
def test_bd16_each_poi_is_within_its_uncertainty_plus_one_cell_of_the_traverse_point_of_its_sol():
    pois = json.loads((SITE / "vectors/pois.geojson").read_text())["features"]
    by_sol: dict[int, list[tuple[float, float]]] = {}
    for feature in _points():
        by_sol.setdefault(feature["properties"]["sol"], []).append(tuple(feature["geometry"]["coordinates"][:2]))
    assert pois
    for poi in pois:
        properties = poi["properties"]
        # The sol of the PLACES row the position was read from, as the record's `position_source` states it
        # ("frame ROVER, sol 4618": the last row before the image sol when the image sol has none).
        match = re.search(r"frame ROVER, sol (\d+)", properties["position_source"])
        assert match, f"{properties['poi_id']}: position_source names no PLACES sol"
        sol = int(match.group(1))
        assert sol in by_sol, f"{properties['poi_id']}: no traverse point for sol {sol}"
        x, y = poi["geometry"]["coordinates"][:2]
        nearest = min(math.hypot(x - px, y - py) for px, py in by_sol[sol])
        assert nearest <= properties["position_uncertainty_m"] + config.GRID_CELL_M, (properties["poi_id"], nearest)


def test_bd16_traverse_layer_states_the_places_accuracy_and_that_the_offset_was_not_measured():
    record = json.loads((LAYERS / "traverse.json").read_text())
    text = record["limitations"]
    assert "0.5 m" in text and "PLACES" in text
    assert "not measured" in text
    assert "pds-msl-places-sis-1-3" in record["source_ids"]


def test_bd16_the_checks_reject_a_point_outside_the_aoi(tmp_path):
    """The extent check is a real check: a source fix far outside the extent is not packaged."""
    source = tmp_path / "far.csv"
    source.write_text("frame,site,drive,planetocentric_latitude,longitude,elevation,sol\nROVER,1,2,10.0,10.0,-4000,4000\n")
    out = tmp_path / "traverse.geojson"
    package_traverse(source, config.WORKING_PROJ, out, aoi_extent_m=_extent(), margin_m=TRAVERSE_MARGIN_M)
    assert not [f for f in json.loads(out.read_text())["features"] if f["geometry"]["type"] == "Point"]
