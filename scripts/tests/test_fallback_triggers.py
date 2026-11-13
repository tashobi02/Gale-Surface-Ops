"""Fallback triggers (backend package 29; BD-01, BD-150): each closed or conditional fallback has a test that fails if its trigger becomes true.

A closed fallback (section C of docs/plan/backend/29-fallbacks.md) stays closed only while the fact that closes it holds:
the test reads that fact from the committed files, so a change that makes the trigger true turns it red. The conditional
rows (section B) read the figures that package 24 and the haven benchmark recorded in docs/ops/verification-log.md.
Needs no geo stack and no network. Real-bundle binary checks skip when the data folders are absent (the SSD links).
"""
from __future__ import annotations

import json
import re
import struct
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "data/sites/gale_boxwork"
SCENARIO = ROOT / "scenarios/storm-sol4190"
LOG = (ROOT / "docs/ops/verification-log.md").read_text(encoding="utf-8")

# 02 §D.4 / 01 §E.1: the replayed event is 20 May 2024, MSL sol 4190.
EVENT_DAY = datetime(2024, 5, 20, tzinfo=timezone.utc)
SKIP_MARKERS = re.compile(r"\b(it|test|describe)\.(skip|todo|skipIf|fixme)\b|\bxit\(|\bxdescribe\(")


def _json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _manifest() -> dict:
    return _json(SITE / "site-manifest.json")


def _no_skipped_cases(relative: str) -> str:
    path = ROOT / relative
    assert path.is_file(), f"{relative} is missing"
    text = path.read_text(encoding="utf-8")
    assert not SKIP_MARKERS.search(text), f"{relative} has a skipped or todo case"
    assert re.search(r"\bit(\.each\b|\()", text), f"{relative} has no test case"
    return text


# --- C: closed, trigger provably false ----------------------------------------------------------------------------

def test_t01_06_adr_001_is_accepted_for_gale():
    """T01.06 (BD-11): the site fallback (Jezero) is for a rejected Gale; ADR-001 reads Accepted."""
    text = (ROOT / "docs/decisions/ADR-001-site-selection.md").read_text(encoding="utf-8")
    assert re.search(r"^\| \*\*Status\*\* \| Accepted\b", text, re.MULTILINE)
    assert "Gale" in text
    assert _manifest()["site_id"] == "gale_boxwork"


def test_t03_26_colour_cog_covers_the_aoi_and_the_bundle_has_ortho_tiles():
    coverage = (ROOT / "docs/ops/feasibility/coverage.md").read_text(encoding="utf-8")
    assert re.search(r"Colour HiRISE LRGB COG[^|]*\| \*\*Covered\*\*", coverage)
    manifest = _manifest()
    assert any(a["asset_id"] == "tiles-ortho" and a["format"] == "tiles" for a in manifest["assets"])
    ortho = next(layer for layer in manifest["layers"] if layer["layer_id"] == "ortho")
    assert ortho["kind"] == "raster_tiles" and "usgs-gale-ortho-25cm-v3" in ortho["source_ids"]


def test_t03_27_the_bundle_has_a_ti_grid_with_valid_cells():
    manifest = _manifest()
    asset = next((a for a in manifest["assets"] if a["asset_id"] == "grid-ti"), None)
    assert asset is not None and asset["path"] == "grid/ti_100m.f32" and asset["format"] == "f32"
    assert manifest["grid"]["ti_asset"] == "grid-ti" and manifest["grid"]["ti_cell_m"] == 100
    assert asset["width"] * asset["height"] > 0
    file = SITE / asset["path"]
    if not file.is_file():
        pytest.skip("the TI grid binary is absent (real bundle not on this machine)")
    raw = file.read_bytes()
    count = len(raw) // 4
    assert count == asset["width"] * asset["height"]
    values = struct.unpack(f"<{count}f", raw)
    assert any(v == v and v > 0 for v in values), "no valid (finite, positive) TI cell"


def test_t04_09_the_traverse_vector_is_sourced_from_places():
    manifest = _manifest()
    assert manifest["traverse_asset"] == "vec-traverse"
    assert any(a["asset_id"] == "vec-traverse" for a in manifest["assets"])
    layer = next(layer for layer in manifest["layers"] if layer["layer_id"] == "traverse")
    assert "pds-msl-places-localizations" in layer["source_ids"]
    assert any(s["source_id"] == "pds-msl-places-localizations" for s in manifest["sources"])
    features = _json(SITE / "vectors/traverse.geojson")["features"]
    assert any(f["geometry"]["type"] == "LineString" for f in features), "the traverse has no line"


def test_t21_13_the_dose_series_is_the_archive_and_covers_sol_4190():
    series = _json(SCENARIO / "dose_series.json")
    assert series["method"] == "archive"
    assert series["provenance"] == "replayed"
    times = [_utc(t) for t, _ in series["samples"]]
    assert times == sorted(times)
    assert times[0] <= EVENT_DAY < times[-1]
    assert any(t.date() == EVENT_DAY.date() for t in times), "no sample on the day of sol 4190"


def test_t21_14_the_earth_link_has_kernels_that_cover_the_window():
    link = _json(SCENARIO / "earth_link.json")
    assert link["kernels"], "earth_link.json lists no kernels"
    lock = _json(ROOT / "pipeline/spice/kernels.lock.json")
    names = {k["file"] for k in lock["kernels"]}
    assert {k["file"] for k in link["kernels"]} <= names
    start, stop = _utc(lock["window_utc"]["start"]), _utc(lock["window_utc"]["stop"])
    assert start <= EVENT_DAY < stop
    assert set(lock["load_order"]) <= names
    for orbiter in ("mro", "maven", "tgo"):
        assert lock["orbiter_summary"][orbiter]["window_covered"] is True, orbiter
    planets = next(k for k in lock["kernels"] if k["file"] == "de440s.bsp")
    assert all(body["covers_window"] for body in planets["coverage"])


def test_t22_15_consumables_model_o2_only():
    """T22.15: the consumables fallback is 'O2 only'; that is already the primary model (no water, food or battery state)."""
    source = (ROOT / "packages/compute/src/consumables.ts").read_text(encoding="utf-8")
    assert "stepO2" in source and "o2RemainingS" in source
    assert not re.search(r"\b(water|food|co2|battery)\w*", source, re.IGNORECASE)
    crew = re.search(r"export interface Crew \{.*?\n\}", (ROOT / "packages/protocol/src/runtime.ts").read_text(encoding="utf-8"), re.DOTALL)
    assert crew is not None and "o2_frac" in crew.group(0)
    assert not re.search(r"\b(water|food|co2|battery)\w*\s*[?]?:", crew.group(0), re.IGNORECASE)


def test_t23_09_the_exact_rendezvous_cases_are_active():
    """T23.09: the rendezvous fallback (vehicle drives to the nearest passable cell) is cut 6; the exact cases must exist and run."""
    text = _no_skipped_cases("apps/hab-core/tests/summonReal.test.ts")
    assert "dispatch on the ridge" in text and "logs the compute rendezvous" in text
    assert "two crew" in text and "rendezvousPair" in text
    _no_skipped_cases("packages/compute/tests/rendezvous.test.ts")


def _cut_list() -> str:
    spec = (ROOT / "docs/specs/06_High_Level_Implementation_Plan.md").read_text(encoding="utf-8")
    start = spec.index("### D.4 Cut list")
    return spec[start:spec.index("### D.5", start)]


def test_t26_08_cut_5_is_not_called_and_the_link_tests_are_active():
    cuts = _cut_list()
    assert "the team decided not to cut scope" in cuts and "contingency only" in cuts
    assert re.search(r"^5\. Dynamic relay viewshed", cuts, re.MULTILINE)
    status = (ROOT / "docs/tasks/status.md").read_text(encoding="utf-8")
    assert not re.search(r"cut 5 (is |was )?called", status, re.IGNORECASE)
    _no_skipped_cases("apps/hab-core/tests/links.test.ts")
    _no_skipped_cases("packages/compute/tests/linkGraph.test.ts")


def test_t29_07_cut_2_is_not_called_and_the_rover_tests_are_active():
    cuts = _cut_list()
    assert "the team decided not to cut scope" in cuts
    assert re.search(r"^2\. Rover tasking down to RELAY only", cuts, re.MULTILINE)
    runtime = (ROOT / "packages/protocol/src/runtime.ts").read_text(encoding="utf-8")
    kinds = re.search(r'export type RoverTaskKind = ([^;]+);', runtime)
    assert kinds is not None
    assert set(re.findall(r'"(\w+)"', kinds.group(1))) == {"SCOUT", "CARRY", "RELAY", "RETURN"}, "rover tasking was cut down"
    _no_skipped_cases("apps/hab-core/tests/rover.test.ts")


# --- B: conditional, run the fallback only if the trigger fails ---------------------------------------------------

def _number(text: str) -> float:
    return float(text.replace(",", ""))


def test_t05_31_real_grid_routing_p95_is_within_two_seconds():
    """Trigger: the package 24 / T05.28 pair timing p95 > 2 s. The recorded figure must stay within NFR-02."""
    match = re.search(r"T05\.28 \(FR-03, FR-07, NFR-02\)\.[^\n]*?p50 ([\d,]+), p95 ([\d,]+), max ([\d,]+) ms", LOG)
    assert match, "the T05.28 real-grid pair timing is not in the verification log"
    assert _number(match.group(2)) <= 2000
    assert "so T05.31 does not run" in LOG


def test_t05b_21_the_haven_benchmark_is_go():
    """Trigger: the haven field on the real grid is not GO (> 2,000 ms)."""
    match = re.search(r"Worst real run (\d+) ms against ([\d,]+) ms: \*\*GO\*\*", LOG)
    assert match, "the haven benchmark verdict is not in the verification log"
    assert _number(match.group(1)) <= _number(match.group(2)) == 2000
    assert "T05b.21 does not run" in LOG


def test_t06_11_the_mars24_and_sun_tests_run_with_none_skipped():
    """Trigger: the sun or Mars24 tests are skipped or red. They exist, have cases and carry no skip marker."""
    _no_skipped_cases("packages/compute/tests/mars24.test.ts")
    _no_skipped_cases("packages/compute/tests/sun.test.ts")
    reference = ROOT / "apps/web/tests/fixtures/mars24-reference.json"
    assert reference.is_file()
