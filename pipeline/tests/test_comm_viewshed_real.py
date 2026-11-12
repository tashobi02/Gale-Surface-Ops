"""T03.30 / T03.35: each candidate's real `comm_hab` grid against `gdal_viewshed` (06 §C.1, §C.2).

Skips when the real bundle's arrays or `gdal_viewshed` are absent. The thresholds are the outcomes recorded in
docs/ops/verification-log.md (T03.30: 4 of 5 points and 98.9 % of the grid for the first choice; the mismatch is
the conservative one, a single crest cell that `comm_hab` counts at full height and GDAL interpolates).
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("rasterio")

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("check_viewshed", HERE / "fixtures/check_viewshed.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

available = (checker.SITE / "grid/elevation.f32").exists() and (checker.SITE / "site-manifest.json").exists() and checker.gdal_viewshed_binary()
needs_real = pytest.mark.skipif(not available, reason="real bundle arrays or gdal_viewshed absent")


def _candidate_ids() -> list[str]:
    if not (checker.SITE / "site-manifest.json").exists():
        return []
    return [c["candidate_id"] for c in json.loads((checker.SITE / "site-manifest.json").read_text())["hab_candidates"]]


def test_the_five_points_are_the_centre_and_the_four_quadrant_centres():
    points = checker.five_points({"width": 1200, "height": 1200})
    assert [(row, col) for _, row, col in points] == [(600, 600), (300, 900), (300, 300), (900, 900), (900, 300)]


@needs_real
@pytest.mark.parametrize("candidate_id", _candidate_ids())
def test_candidate_grid_matches_gdal_viewshed(candidate_id, tmp_path):
    report = checker.compare(candidate_id, tmp_path)
    assert len(report["points"]) == 5
    assert sum(point["match"] for point in report["points"]) >= 4
    # `comm_hab` may hide what GDAL sees (a crest cell counts at full height) but never shows what GDAL hides.
    assert not [p for p in report["points"] if p["comm_hab"] == 1 and p["gdal_viewshed"] != 255]
    assert report["agreement_pct"] >= 98.0
    assert report["comm_visible_pct"] <= report["gdal_visible_pct"] + 0.1
