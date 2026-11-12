"""T21.11 (TASK-21; FR-38, NFR-06; map §e): `apps/hab-core/tests/fixtures/storm-excerpt/` is the onset hour of the real
dose series and the matching Earth-link rows, cut by the committed script `make_storm_excerpt.py`. Re-running the script
reproduces the committed files byte for byte; every excerpt row is a row of the source; the cut is derived from the
scenario's `series_start_utc`, never typed.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "apps/hab-core/tests/fixtures/storm-excerpt"
SCENARIO = ROOT / "scenarios/storm-sol4190"


def _script():
    spec = importlib.util.spec_from_file_location("make_storm_excerpt", FIXTURE / "make_storm_excerpt.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def test_rerunning_the_script_reproduces_the_committed_files_byte_for_byte(tmp_path):
    mod = _script()
    mod.write_excerpt(ROOT, tmp_path)
    for name in ("dose_series.json", "earth_link.json", "README.md"):
        assert (tmp_path / name).read_bytes() == (FIXTURE / name).read_bytes(), name


def test_two_runs_agree(tmp_path):
    mod = _script()
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(), b.mkdir()
    mod.write_excerpt(ROOT, a)
    mod.write_excerpt(ROOT, b)
    for name in ("dose_series.json", "earth_link.json", "README.md"):
        assert (a / name).read_bytes() == (b / name).read_bytes()


def test_the_dose_excerpt_is_the_onset_hour_rows_of_the_source_and_holds_the_series_start_and_the_alert():
    source = _read(SCENARIO / "dose_series.json")
    excerpt = _read(FIXTURE / "dose_series.json")
    start = _read(SCENARIO / "scenario.json")["event_library"][0]["series_start_utc"]
    hour = start[:13]
    assert excerpt["samples"] == [s for s in source["samples"] if s[0][:13] == hour]
    assert start in [s[0] for s in excerpt["samples"]]
    assert "2024-05-20T05:50:32Z" in [s[0] for s in excerpt["samples"]]  # the alert sample of 01 §E.1
    for key in ("series_id", "source_id", "unit", "method", "provenance", "background_rate", "quantity"):
        assert excerpt[key] == source[key]


def test_the_earth_link_excerpt_is_the_rows_and_passes_in_the_same_hour():
    source = _read(SCENARIO / "earth_link.json")
    excerpt = _read(FIXTURE / "earth_link.json")
    hour = _read(FIXTURE / "dose_series.json")["samples"][0][0][:13]
    assert excerpt["rows"] == [r for r in source["rows"] if r["t_utc"][:13] == hour]
    assert len(excerpt["rows"]) == 60  # one row a minute for an hour (step_s in the source)
    assert excerpt["step_s"] == source["step_s"] and excerpt["kernels"] == source["kernels"]
    for p in excerpt["passes"]:
        assert p in source["passes"] and p["start_utc"][:13] <= hour <= p["end_utc"][:13]


def test_the_readme_names_the_source_files_and_their_sha256():
    import hashlib

    text = (FIXTURE / "README.md").read_text(encoding="utf-8")
    for name in ("dose_series.json", "earth_link.json"):
        assert hashlib.sha256((SCENARIO / name).read_bytes()).hexdigest() in text
    assert "make_storm_excerpt.py" in text and "Do not edit" in text
