"""T21.08, T32.32, T31.02 (TASK-21, TASK-31, TASK-32; FR-34, FR-50, FR-52, NFR-06; 02 §E.7; 05 Scenario; BD-10, BD-97, BD-98,
BD-99, BD-143, BD-144): `marswalk_pipeline/scenario_build.py` assembles `scenarios/storm-sol4190/scenario.json` from the
committed plan, tables, stop tasks, DONKI cache, ParamSets and hab candidates. Expected values are computed here from those
files by independent code, never typed.

Groups: the rule functions on synthetic series; the committed scenario against its sources; determinism (two builds, same
bytes, equal to the committed file).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from marswalk_pipeline import donki, scenario_build

ROOT = Path(__file__).resolve().parents[2]
SCENARIO_DIR = ROOT / "scenarios/storm-sol4190"
SCENARIO = SCENARIO_DIR / "scenario.json"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _t(offset_min: int) -> str:
    base = datetime(2024, 5, 20, 0, 0, 0, tzinfo=timezone.utc)
    return (base + timedelta(minutes=offset_min)).strftime("%Y-%m-%dT%H:%M:%SZ")


ALERT = {"rad_k_background": 10, "rad_clear_k": 2, "rad_clear_min": 30}


# --------------------------------------------------------------------------------------------- the rules


def test_series_start_is_the_last_sample_below_the_clear_level_before_the_first_alert_sample():
    # background 1: quiet samples at 1.2 (above the median, below the clear level 2), onset 3 -> 50 -> 80 (alert at the 2nd high above 10)
    rates = [1.2, 0.9, 1.1, 1.3, 3.0, 50.0, 80.0, 70.0]
    samples = [[_t(10 * i), r] for i, r in enumerate(rates)]
    start, rule = scenario_build.series_start_utc(samples, 1.0, ALERT)
    assert start == samples[3][0]  # index 3 is the last sample below 2 x 1.0 before the alert sample (index 6)
    assert "rad_clear_k" in rule and "triggerState" in rule


def test_a_noisy_background_above_the_median_does_not_pull_the_start_back():
    # BD-143: the BD-98 form ("at or below the background") would pick index 1 here; the clear-level form picks index 4
    rates = [0.9, 1.0, 1.1, 1.2, 1.3, 40.0, 60.0]
    samples = [[_t(10 * i), r] for i, r in enumerate(rates)]
    assert scenario_build.series_start_utc(samples, 1.0, ALERT)[0] == samples[4][0]


def test_on_an_exact_background_series_both_forms_agree():
    rates = [1.0, 1.0, 1.0, 40.0, 60.0]
    samples = [[_t(10 * i), r] for i, r in enumerate(rates)]
    assert scenario_build.series_start_utc(samples, 1.0, ALERT)[0] == samples[2][0]


def test_alert_needs_two_consecutive_samples_above_the_trigger():
    rates = [1.0, 1.0, 40.0, 1.0, 1.0, 40.0, 60.0]  # a single high does not trigger; the alert is at index 6
    samples = [[_t(10 * i), r] for i, r in enumerate(rates)]
    assert scenario_build.series_start_utc(samples, 1.0, ALERT)[0] == samples[4][0]


def test_a_series_that_never_triggers_is_refused():
    samples = [[_t(10 * i), 1.0] for i in range(6)]
    with pytest.raises(ValueError, match="alert"):
        scenario_build.series_start_utc(samples, 1.0, ALERT)


def test_a_series_with_no_quiet_sample_before_the_alert_is_refused():
    samples = [[_t(0), 50.0], [_t(10), 60.0]]
    with pytest.raises(ValueError, match="quiet"):
        scenario_build.series_start_utc(samples, 1.0, ALERT)


def test_a_gap_resets_the_two_sample_rule_and_is_never_the_start():
    rates = [1.0, 40.0, None, 60.0, 70.0]
    samples = [[_t(10 * i), r] for i, r in enumerate(rates)]
    assert scenario_build.series_start_utc(samples, 1.0, ALERT)[0] == samples[0][0]  # the alert starts at index 4; index 1 is high, index 0 is the last quiet sample


def test_canonical_json_numbers_follow_rfc_8785():
    assert scenario_build.canonical({"b": 6.0, "a": [1, 2.5, -0.0, 1e21, 1e-7], "c": "é"}) == '{"a":[1,2.5,0,1e+21,1e-7],"b":6,"c":"é"}'


def test_plan_hash_is_checked_and_a_tampered_plan_is_refused():
    plan = _read(SCENARIO_DIR / "plan.json")
    scenario_build.check_plan_hash(plan)
    plan["waypoints"][1]["x_m"] += 1
    with pytest.raises(ValueError, match="plan_hash"):
        scenario_build.check_plan_hash(plan)


# --------------------------------------------------------------------------------------------- the committed scenario


@pytest.fixture(scope="module")
def built() -> dict:
    return scenario_build.build_scenario(ROOT)


def test_scenario_json_exists_and_equals_a_fresh_build_byte_for_byte(built, tmp_path):
    assert SCENARIO.is_file(), "scenarios/storm-sol4190/scenario.json is a build output: run scenario_build"
    out = tmp_path / "scenario.json"
    scenario_build.write_scenario(built, out)
    assert out.read_bytes() == SCENARIO.read_bytes()


def test_two_builds_give_identical_bytes(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    scenario_build.write_scenario(scenario_build.build_scenario(ROOT), a)
    scenario_build.write_scenario(scenario_build.build_scenario(ROOT), b)
    assert a.read_bytes() == b.read_bytes()


def test_the_committed_scenario_validates_against_the_scenario_schema():
    jsonschema = pytest.importorskip("jsonschema")
    schema = _read(ROOT / "schemas/scenario.schema.json")
    cls = jsonschema.Draft202012Validator
    cls(schema, format_checker=cls.FORMAT_CHECKER).validate(_read(SCENARIO))


def test_the_embedded_plan_is_the_committed_plan_json_and_its_hash_verifies():
    scenario = _read(SCENARIO)
    plan = _read(SCENARIO_DIR / "plan.json")
    assert scenario["plan"] == plan
    scenario_build.check_plan_hash(scenario["plan"])
    jsonschema = pytest.importorskip("jsonschema")
    cls = jsonschema.Draft202012Validator
    cls(_read(ROOT / "schemas/plan-export.schema.json"), format_checker=cls.FORMAT_CHECKER).validate(scenario["plan"])


def test_identity_comes_from_the_plan_and_the_05_example():
    scenario = _read(SCENARIO)
    plan = scenario["plan"]
    assert scenario["scenario_id"] == "storm-sol4190"
    assert scenario["site_id"] == plan["site_id"] == "gale_boxwork"
    assert scenario["data_version"] == plan["data_version"]
    assert scenario["seed"] == 4190  # 05 §F.4
    assert scenario["start_utc"] == plan["scenario"]["eva_start_utc"]  # T21.15 rule, written into the plan by build-demo-plan


def test_hab_candidate_is_the_rank_1_candidate_of_hab_candidates_json_bd10():
    candidates = _read(ROOT / "pipeline/sites/gale_boxwork/hab_candidates.json")
    first = min(candidates, key=lambda c: c["rank"])
    scenario = _read(SCENARIO)
    assert scenario["mission_setup"]["hab_candidate_id"] == first["candidate_id"] == "hab-first"
    for key in ("crew_count", "vehicle_available", "vehicle_param_set", "solar_phase", "max_haven_min"):
        assert scenario["mission_setup"][key] == scenario["plan"]["scenario"][key]


def test_crew_and_vehicles_start_at_the_hab_mast_and_use_listed_param_sets():
    candidates = _read(ROOT / "pipeline/sites/gale_boxwork/hab_candidates.json")
    mast = min(candidates, key=lambda c: c["rank"])["hab_mast"]
    scenario = _read(SCENARIO)
    assert [c["crew_id"] for c in scenario["crew"]] == ["EV1", "EV2"]
    assert all(c["start_offset_s"] == 0 for c in scenario["crew"])
    assert {v["vehicle_id"] for v in scenario["vehicles"]} == {"PR1", "UR1"}
    for v in scenario["vehicles"]:
        assert (v["start_x_m"], v["start_y_m"]) == (mast["x_m"], mast["y_m"])
    used = {c["suit_param_set"] for c in scenario["crew"]} | {v["param_set"] for v in scenario["vehicles"]} | {scenario["plan"]["scenario"]["vehicle_param_set"]}
    assert used <= set(scenario["param_sets"])
    kinds = {_read(SCENARIO_DIR / "param_sets" / f"{pid}.json")["kind"] for pid in scenario["param_sets"]}
    assert {"link", "alert", "shielding"} <= kinds
    assert scenario["param_sets"] == sorted(set(scenario["param_sets"]), key=scenario["param_sets"].index)  # unique


def test_series_start_follows_the_rule_computed_here_from_the_series():
    series = _read(SCENARIO_DIR / "dose_series.json")
    alert = _read(SCENARIO_DIR / "param_sets/alert-assumed.json")["values"]
    bg, samples = series["background_rate"], series["samples"]
    trigger, clear = alert["rad_k_background"] * bg, alert["rad_clear_k"] * bg
    first_alert = next(i for i in range(1, len(samples)) if samples[i][1] > trigger and samples[i - 1][1] > trigger)
    want = samples[max(i for i in range(first_alert) if samples[i][1] < clear)][0]
    entry = _read(SCENARIO)["event_library"][0]
    assert entry["series_start_utc"] == want
    assert entry["series_start_utc"] > _read(SCENARIO)["start_utc"]  # BD-97: the press at t0 is after the sim clock starts


def test_the_storm_entry_is_replayed_rad_data_with_its_label_and_source():
    scenario = _read(SCENARIO)
    series = _read(SCENARIO_DIR / "dose_series.json")
    (entry,) = scenario["event_library"]
    assert (entry["event_id"], entry["kind"], entry["dose_series"], entry["provenance"]) == ("storm", "SPACE_WEATHER", "dose_series", "replayed")
    assert entry["source_id"] == series["source_id"] == "rad-sol4190"
    assert entry["label"].startswith("replayed")


def test_donki_records_become_inputs_with_offsets_from_the_series_start_and_events_before_it():
    scenario = _read(SCENARIO)
    entry = scenario["event_library"][0]
    series = _read(SCENARIO_DIR / "dose_series.json")
    records = donki.donki_events(donki.load_cache(ROOT / "pipeline/cache/donki"), "donki-2024-05")
    t0 = datetime.fromisoformat(entry["series_start_utc"].replace("Z", "+00:00"))
    end = series["samples"][-1][0]
    want_inputs = [r for r in records if entry["series_start_utc"] <= r["t_utc"] <= end]
    got = [i for i in entry["inputs"] if i["kind"] == "DONKI_RECORD"]
    assert [i["payload"]["donki_id"] for i in got] == [r["payload"]["donki_id"] for r in want_inputs]
    for i, r in zip(got, want_inputs):
        assert i["t_offset_s"] == (datetime.fromisoformat(r["t_utc"].replace("Z", "+00:00")) - t0).total_seconds()
        assert i["provenance"] == "replayed" and i["source_id"] == "donki-2024-05"
        assert i["payload"] == r["payload"]
    want_events = [r for r in records if scenario["start_utc"] <= r["t_utc"] < entry["series_start_utc"]]
    assert scenario["events"] == want_events
    assert [e["t_utc"] for e in scenario["events"]] == sorted(e["t_utc"] for e in scenario["events"])


def test_every_simulated_input_answers_a_replayed_record_and_takes_its_offset_bd99():
    entry = _read(SCENARIO)["event_library"][0]
    by_id = {i["payload"]["donki_id"]: i for i in entry["inputs"] if i["kind"] == "DONKI_RECORD"}
    by_event = {}
    records = donki.donki_events(donki.load_cache(ROOT / "pipeline/cache/donki"), "donki-2024-05")
    for r in records:
        by_event[r["event_id"]] = r["payload"]["donki_id"]
    simulated = [i for i in entry["inputs"] if i["provenance"] == "simulated"]
    assert simulated, "the Earth forecast is a simulated input"
    for i in simulated:
        answered = by_id[by_event[i["payload"]["answers"]]]
        assert i["t_offset_s"] == answered["t_offset_s"]
        assert "source_id" not in i
    earth = [i for i in simulated if i["kind"] == "EARTH_MESSAGE"]
    assert earth and earth[0]["payload"]["body"] == "SEP event in progress. Recommend shelter."  # 05 §F.4
    assert "sent_earth_utc" not in earth[0]["payload"]  # sent when it fires, so a press at any time is consistent
    assert [i["input_id"] for i in entry["inputs"]] == sorted({i["input_id"] for i in entry["inputs"]}, key=[j["input_id"] for j in entry["inputs"]].index)
    assert [i["t_offset_s"] for i in entry["inputs"]] == sorted(i["t_offset_s"] for i in entry["inputs"])
    assert min(i["t_offset_s"] for i in entry["inputs"]) >= 0


def test_stop_tasks_are_the_authored_file_and_every_stop_is_a_stop_waypoint():
    scenario = _read(SCENARIO)
    assert scenario["stop_tasks"] == _read(SCENARIO_DIR / "stop_tasks.json")
    stops = {w["id"] for w in scenario["plan"]["waypoints"] if w["role"] == "stop"}
    assert {t["stop_id"] for t in scenario["stop_tasks"]} <= stops
    assert len({t["task_id"] for t in scenario["stop_tasks"]}) == len(scenario["stop_tasks"])
    for stop in stops:
        assert 1 <= sum(t["stop_id"] == stop for t in scenario["stop_tasks"]) <= 4


def test_task_library_is_rekeyed_from_stop_tasks_through_the_plan_waypoint_poi_id():
    scenario = _read(SCENARIO)
    poi_of = {w["id"]: w["poi_id"] for w in scenario["plan"]["waypoints"] if w["role"] == "stop"}
    library = scenario["task_library"]
    assert len(library) == len(scenario["stop_tasks"])
    for task, entry in zip(scenario["stop_tasks"], library):
        assert entry["poi_id"] == poi_of[task["stop_id"]]
        assert (entry["crew_id"], entry["kind"], entry["text"]) == (task["crew_id"], task["kind"], task["text"])
    assert len({e["library_task_id"] for e in library}) == len(library)
    poi_ids = {f["properties"]["poi_id"] for f in _read(ROOT / "data/sites/gale_boxwork/vectors/pois.geojson")["features"]}
    assert {e["poi_id"] for e in library} <= poi_ids
    assert all(not any(ch.isdigit() for ch in e["text"]) or e.get("source_id") for e in library)


def test_table_checksums_are_the_sha256_of_the_exact_file_bytes():
    scenario = _read(SCENARIO)
    for name in ("dose_series", "earth_link"):
        entry = scenario["tables"][name]
        assert entry["path"] == f"{name}.json"
        assert hashlib.sha256((SCENARIO_DIR / entry["path"]).read_bytes()).hexdigest() == entry["sha256"]


def test_source_ids_are_the_sorted_union_of_the_inputs_source_ids():
    scenario = _read(SCENARIO)
    ids = {_read(SCENARIO_DIR / "dose_series.json")["source_id"], "donki-2024-05"}
    ids |= {k["source_id"] for k in _read(SCENARIO_DIR / "earth_link.json")["kernels"]}
    for pid in scenario["param_sets"]:
        ids |= set(_read(SCENARIO_DIR / "param_sets" / f"{pid}.json").get("source_ids", []))
    assert scenario["source_ids"] == sorted(ids)


def test_a_missing_input_is_refused_by_name(tmp_path):
    with pytest.raises(FileNotFoundError, match="plan.json"):
        scenario_build.build_scenario(tmp_path)
