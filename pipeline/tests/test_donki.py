"""DONKI records to ScenarioEvents: docs/specs/02 §C.5 L8, §D.13; 05 ScenarioEvent (FR-37). TASK-21, T21.03.

Interface these tests define for T21.05 (`marswalk_pipeline/donki.py`):

    U44_WINDOW = ("2024-05-13", "2024-05-24")
        U-44 decision (data lead, 2026-11-07, scenarios/storm-sol4190/README.md): first and last
        UTC calendar day, both days included in full.

    donki_events(records, source_id, window=U44_WINDOW) -> list[dict]
        `records`: {DONKI type: [record, ...]} as the CCMC service returns them (the cache files
        pipeline/cache/donki/<TYPE>.json hold one such list per type). Types: FLR, CME, SEP, IPS,
        WSAEnlilSimulations (CMEAnalysis is the implementer's call and not tested here).
        Returns the records whose OWN time falls in the window as 05 ScenarioEvents:

            {"event_id": str, "t_utc": str, "kind": "DONKI_RECORD", "provenance": "replayed",
             "source_id": source_id,
             "payload": {"donki_type", "donki_id", "summary", ["predicted_mars_arrival_utc"]}}

        - `t_utc` is the record's own time (table below), normalised to `YYYY-MM-DDTHH:MM:SSZ`
          (DONKI writes minutes only, e.g. `2024-05-18T01:36Z`; seconds become `:00`).
        - `event_id` is unique and deterministic (same input, same ids); the same (type, id) given
          twice yields one event.
        - Sorted by (`t_utc`, `event_id`) whatever the order of the input (05: events sorted).
        - `payload.summary` is a non-empty string built from the record; for FLR it contains the
          record's `classType`.
        - `payload.predicted_mars_arrival_utc` is present only for a WSAEnlilSimulations record whose
          `impactList` has an entry with `location == "Mars"` (02 L8): that entry's `arrivalTime`,
          normalised. It is a forecast, kept as given; it may fall after the window.
        - Pure: no network, no clock. ValueError for an unknown type, a record without its time or id
          field, or a window whose start is after its end. A "CMEAnalysis" key is a known type: the
          implementer maps it to events or ignores it, but it never raises.

Decision (data lead, Obidit Islam, 2026-11-07): the pipeline writes `t_utc` = the DONKI record's own
(Earth-side) time; the Hab Core applies the 02 §D.12 delivery rule (T05b.13) when the record reaches the
crew (02 §D.13 timeline). The 05 ScenarioEvent wording ("Mars-side time at which the event exists") needs a
note via a spec-change.

    load_cache(cache_dir) -> dict[str, list[dict]]
        Reads every `<TYPE>.json` (a JSON array of records) in `cache_dir` into {TYPE: records}.

Field names per DONKI type (own time / id), all TODO(verify) against the CCMC DONKI documentation
because no response was fetched for this task; they follow the public DONKI schema as remembered:

    FLR                  beginTime            flrID
    CME                  startTime            activityID
    SEP                  eventTime            sepID
    IPS                  eventTime            activityID
    WSAEnlilSimulations  modelCompletionTime  simulationID   (impactList: [{location, arrivalTime}])

Every record below is SYNTHETIC: invented ids, times and values, written to exercise the rules. They
are not DONKI data. Expected values come from these inputs only. While `marswalk_pipeline.donki` is
absent (before T21.05 merges), a module-level `pytestmark` marks `ImportError` as an expected failure
(`xfail(strict=True)`) so CI stays green on PRs without T21.05; once the module exists, the guard is
inert.
"""
from __future__ import annotations

import copy
import importlib.util
import json
import random
import re
import socket
from pathlib import Path

import pytest

_MISSING = importlib.util.find_spec("marswalk_pipeline.donki") is None
pytestmark = pytest.mark.xfail(
    _MISSING,
    raises=ImportError,
    strict=True,
    reason="tests-first (map §h.3): marswalk_pipeline.donki lands in T21.05",
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIO_SCHEMA = REPO_ROOT / "schemas" / "scenario.schema.json"

# U-44 (scenarios/storm-sol4190/README.md): the decided window. A decision, not a science number.
WINDOW = ("2024-05-13", "2024-05-24")
SOURCE_ID = "synthetic-donki-source"
T_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

# (DONKI type, id field, own-time field)  -- TODO(verify) all of these names.
TYPE_FIELDS = {
    "FLR": ("flrID", "beginTime"),
    "CME": ("activityID", "startTime"),
    "SEP": ("sepID", "eventTime"),
    "IPS": ("activityID", "eventTime"),
    "WSAEnlilSimulations": ("simulationID", "modelCompletionTime"),
}


def _mod():
    from marswalk_pipeline import donki  # deferred: module is written by T21.05

    return donki


def _norm(t: str) -> str:
    """`2024-05-18T01:36Z` -> `2024-05-18T01:36:00Z`; already-full times pass through."""
    return t if t.count(":") == 2 else t.replace("Z", ":00Z")


def _record(donki_type: str, rec_id: str, t: str, **extra) -> dict:
    id_field, time_field = TYPE_FIELDS[donki_type]
    return {id_field: rec_id, time_field: t, **extra}


def _wsa(rec_id: str, t: str, impacts: list[dict] | None) -> dict:
    rec = _record("WSAEnlilSimulations", rec_id, t)
    if impacts is not None:
        rec["impactList"] = impacts
    return rec


def _in_window_records() -> dict:
    """One SYNTHETIC record per type, all inside the window, in no particular time order."""
    return {
        "FLR": [_record("FLR", "SYNTH-FLR-1", "2024-05-20T01:23Z", classType="X0.0")],
        "CME": [_record("CME", "SYNTH-CME-1", "2024-05-14T08:36Z")],
        "SEP": [_record("SEP", "SYNTH-SEP-1", "2024-05-20T02:10Z")],
        "IPS": [_record("IPS", "SYNTH-IPS-1", "2024-05-18T09:00Z")],
        "WSAEnlilSimulations": [
            _wsa("SYNTH-WSA-1", "2024-05-15T12:00Z", [{"location": "Mars", "arrivalTime": "2024-05-18T01:36Z"}])
        ],
    }


# ---------------------------------------------------------------------------------------------


def test_u44_window_is_13_to_24_may_2024():
    assert _mod().U44_WINDOW == WINDOW


@pytest.mark.parametrize("donki_type", sorted(TYPE_FIELDS))
def test_record_in_window_becomes_donki_record_event_with_its_own_time(donki_type):
    """Kind, provenance, source_id, own time and the payload keys (05 ScenarioEvent, 02 L8).

    `t_utc` = record time (Earth-side), per the 2026-11-07 data-lead decision in the module docstring.
    """
    id_field, time_field = TYPE_FIELDS[donki_type]
    records = {donki_type: [_in_window_records()[donki_type][0]]}
    rec = records[donki_type][0]
    events = _mod().donki_events(records, SOURCE_ID)
    assert len(events) == 1
    ev = events[0]
    assert ev["kind"] == "DONKI_RECORD"
    assert ev["provenance"] == "replayed"
    assert ev["source_id"] == SOURCE_ID
    assert ev["t_utc"] == _norm(rec[time_field])  # the record's own time, not a fetch or build time
    assert T_UTC_RE.match(ev["t_utc"])
    assert isinstance(ev["event_id"], str) and ev["event_id"]
    payload = ev["payload"]
    assert payload["donki_type"] == donki_type
    assert payload["donki_id"] == rec[id_field]
    assert isinstance(payload["summary"], str) and payload["summary"].strip()
    extra = set(payload) - {"donki_type", "donki_id", "summary", "predicted_mars_arrival_utc"}
    assert extra == set()  # 05: payload is exactly these keys


def test_flare_summary_contains_the_class_from_the_record():
    rec = _record("FLR", "SYNTH-FLR-2", "2024-05-20T01:23Z", classType="M7.7")  # SYNTHETIC class
    (ev,) = _mod().donki_events({"FLR": [rec]}, SOURCE_ID)
    assert rec["classType"] in ev["payload"]["summary"]


def test_records_outside_the_window_are_dropped_and_the_boundary_days_are_kept_whole():
    mod = _mod()
    inside = ["2024-05-13T00:00Z", "2024-05-18T12:00Z", "2024-05-24T23:59Z"]
    outside = ["2024-05-12T23:59Z", "2024-05-25T00:00Z", "2024-06-01T00:00Z", "2023-05-20T00:00Z"]
    records = {
        "FLR": [_record("FLR", f"SYNTH-IN-{i}", t) for i, t in enumerate(inside)]
        + [_record("FLR", f"SYNTH-OUT-{i}", t) for i, t in enumerate(outside)]
    }
    events = mod.donki_events(records, SOURCE_ID)
    assert [e["payload"]["donki_id"] for e in events] == ["SYNTH-IN-0", "SYNTH-IN-1", "SYNTH-IN-2"]
    # The window is an argument: a narrower one keeps fewer records.
    narrow = mod.donki_events(records, SOURCE_ID, window=("2024-05-18", "2024-05-18"))
    assert [e["payload"]["donki_id"] for e in narrow] == ["SYNTH-IN-1"]


def test_window_is_judged_on_the_record_time_not_on_the_predicted_arrival():
    """A simulation issued inside the window is kept even when its Mars arrival is after the window."""
    rec = _wsa("SYNTH-WSA-LATE", "2024-05-23T12:00Z", [{"location": "Mars", "arrivalTime": "2024-05-27T05:00Z"}])
    (ev,) = _mod().donki_events({"WSAEnlilSimulations": [rec]}, SOURCE_ID)
    assert ev["payload"]["predicted_mars_arrival_utc"] == "2024-05-27T05:00:00Z"
    # And a simulation issued before the window is dropped even if it arrives inside it.
    early = _wsa("SYNTH-WSA-EARLY", "2024-05-10T12:00Z", [{"location": "Mars", "arrivalTime": "2024-05-15T05:00Z"}])
    assert _mod().donki_events({"WSAEnlilSimulations": [early]}, SOURCE_ID) == []


def test_events_are_sorted_by_t_utc_across_types():
    events = _mod().donki_events(_in_window_records(), SOURCE_ID)
    times = [e["t_utc"] for e in events]
    assert times == sorted(times)
    assert len(events) == len(TYPE_FIELDS)


def test_sort_order_does_not_depend_on_input_order_and_ties_break_by_event_id():
    mod = _mod()
    tie = "2024-05-20T01:23Z"
    base = _in_window_records()
    base["FLR"] += [_record("FLR", f"SYNTH-TIE-{c}", tie, classType="C1.0") for c in "ABC"]
    reference = mod.donki_events(base, SOURCE_ID)
    ties = [e for e in reference if e["t_utc"] == _norm(tie)]
    assert [e["event_id"] for e in ties] == sorted(e["event_id"] for e in ties)
    assert len(ties) == 4  # the three added here and SYNTH-FLR-1, which shares the time
    rng = random.Random(0)  # fixed seed: deterministic shuffle
    for _ in range(5):
        shuffled = {k: rng.sample(v, len(v)) for k, v in base.items()}
        shuffled = dict(rng.sample(sorted(shuffled.items()), len(shuffled)))
        assert mod.donki_events(shuffled, SOURCE_ID) == reference


def test_wsa_enlil_mars_impact_yields_predicted_mars_arrival_utc():
    """02 L8: the Mars entry of the impact list gives the predicted arrival; other locations do not."""
    mod = _mod()
    impacts = [
        {"location": "Earth", "arrivalTime": "2024-05-16T00:00Z"},  # SYNTHETIC
        {"location": "Mars", "arrivalTime": "2024-05-18T01:36Z"},
    ]
    (ev,) = mod.donki_events({"WSAEnlilSimulations": [_wsa("SYNTH-WSA-2", "2024-05-15T12:00Z", impacts)]}, SOURCE_ID)
    assert ev["payload"]["predicted_mars_arrival_utc"] == "2024-05-18T01:36:00Z"
    assert ev["t_utc"] == "2024-05-15T12:00:00Z"  # the event itself sits at the record's time

    for no_mars in (
        [{"location": "Earth", "arrivalTime": "2024-05-16T00:00Z"}],
        [],
        None,
    ):
        (ev2,) = mod.donki_events({"WSAEnlilSimulations": [_wsa("SYNTH-WSA-3", "2024-05-15T12:00Z", no_mars)]}, SOURCE_ID)
        assert "predicted_mars_arrival_utc" not in ev2["payload"]  # absent, not null


def test_event_ids_are_unique_deterministic_and_duplicates_collapse():
    mod = _mod()
    records = _in_window_records()
    # Same id string under two types must still give two distinct events.
    records["CME"].append(_record("CME", "SYNTH-SHARED", "2024-05-16T00:00Z"))
    records["IPS"].append(_record("IPS", "SYNTH-SHARED", "2024-05-16T00:00Z"))
    # An exact repeat (overlapping cache queries) collapses to one event.
    records["FLR"].append(copy.deepcopy(records["FLR"][0]))
    first = mod.donki_events(records, SOURCE_ID)
    second = mod.donki_events(copy.deepcopy(records), SOURCE_ID)
    ids = [e["event_id"] for e in first]
    assert len(ids) == len(set(ids))
    assert len(first) == len(TYPE_FIELDS) + 2
    assert first == second


@pytest.mark.parametrize("reverse", [False, True])
def test_conflicting_duplicates_report_type_id_and_differing_fields(reverse):
    first = _record("FLR", "SYNTH-CONFLICT", "2024-05-20T01:23Z", classType="M1.0", note="first")
    second = {**first, "classType": "X1.0", "note": "second"}
    records = [first, second]
    if reverse:
        records.reverse()
    with pytest.raises(ValueError) as exc:
        _mod().donki_events({"FLR": records}, SOURCE_ID)
    for expected in ("FLR", "SYNTH-CONFLICT", "classType", "note"):
        assert expected in str(exc.value)


def test_exact_repeats_collapse_identically_in_reverse_order():
    first = _record("FLR", "SYNTH-REPEAT", "2024-05-20T01:23Z", classType="M1.0")
    second = copy.deepcopy(first)
    forward = _mod().donki_events({"FLR": [first, second]}, SOURCE_ID)
    backward = _mod().donki_events({"FLR": [second, first]}, SOURCE_ID)
    assert len(forward) == 1
    assert forward == backward


def test_donki_events_does_not_modify_its_input_or_touch_the_network(monkeypatch):
    mod = _mod()

    def no_network(*args, **kwargs):
        raise AssertionError("donki_events must not open a socket: the cache is committed (T21.05)")

    monkeypatch.setattr(socket, "socket", no_network)
    records = _in_window_records()
    before = copy.deepcopy(records)
    mod.donki_events(records, SOURCE_ID)
    assert records == before


def test_events_are_plain_json_with_utc_second_resolution_times():
    events = _mod().donki_events(_in_window_records(), SOURCE_ID)
    assert events
    json.dumps(events, allow_nan=False)  # plain JSON, no NaN
    assert all(T_UTC_RE.match(e["t_utc"]) for e in events)


def test_events_validate_against_the_scenario_event_schema():
    """Schema check only (its skip hides nothing else). `_mod()` runs first so this is red before T21.05."""
    events = _mod().donki_events(_in_window_records(), SOURCE_ID)
    assert events
    jsonschema = pytest.importorskip("jsonschema", reason="jsonschema is not in the pipeline conda env (T14.01)")
    schema = json.loads(SCENARIO_SCHEMA.read_text())
    cls = jsonschema.Draft202012Validator
    validator = cls({"$defs": schema["$defs"], "$ref": "#/$defs/ScenarioEvent"}, format_checker=cls.FORMAT_CHECKER)
    for ev in events:
        validator.validate(ev)


def test_cme_analysis_records_are_accepted_whether_mapped_or_ignored():
    """02 L8 lists CMEAnalysis. The implementer may map it to events or ignore it; it must not raise.

    TODO(verify): CMEAnalysis field names (time21_5, associatedCMEID, ...) were not checked against the
    CCMC documentation; the record below is SYNTHETIC and its time field is a guess.
    """
    mod = _mod()
    analysis = {"associatedCMEID": "SYNTH-CME-1", "time21_5": "2024-05-14T10:00Z", "speed": 0.0}  # SYNTHETIC
    records = {**_in_window_records(), "CMEAnalysis": [analysis]}
    with_analysis = mod.donki_events(records, SOURCE_ID)
    without = mod.donki_events(_in_window_records(), SOURCE_ID)
    # Either ignored (same events) or mapped (the other events are all still there, order kept).
    base_ids = [e["event_id"] for e in without]
    kept = [e["event_id"] for e in with_analysis if e["event_id"] in base_ids]
    assert kept == base_ids
    assert [e["t_utc"] for e in with_analysis] == sorted(e["t_utc"] for e in with_analysis)
    assert all(e["kind"] == "DONKI_RECORD" and e["provenance"] == "replayed" for e in with_analysis)


def test_cache_with_a_cme_analysis_file_loads_and_feeds_donki_events(tmp_path: Path):
    mod = _mod()
    (tmp_path / "CMEAnalysis.json").write_text(
        json.dumps([{"associatedCMEID": "SYNTH-CME-1", "time21_5": "2024-05-14T10:00Z"}]), encoding="utf-8"
    )
    (tmp_path / "FLR.json").write_text(json.dumps(_in_window_records()["FLR"]), encoding="utf-8")
    cache = mod.load_cache(tmp_path)
    assert "FLR" in cache
    events = mod.donki_events(cache, SOURCE_ID)  # must not raise on the CMEAnalysis key
    assert [e["payload"]["donki_id"] for e in events if e["payload"]["donki_type"] == "FLR"] == ["SYNTH-FLR-1"]


def test_empty_input_gives_no_events():
    mod = _mod()
    assert mod.donki_events({}, SOURCE_ID) == []
    assert mod.donki_events({"FLR": []}, SOURCE_ID) == []


def test_bad_records_and_bad_windows_are_refused_not_skipped():
    mod = _mod()
    with pytest.raises(ValueError):
        mod.donki_events({"NOT_A_TYPE": [{"id": "x"}]}, SOURCE_ID)
    no_time = {"FLR": [{"flrID": "SYNTH-NO-TIME"}]}
    with pytest.raises(ValueError):
        mod.donki_events(no_time, SOURCE_ID)
    null_time = {"FLR": [_record("FLR", "SYNTH-NULL-TIME", None)]}
    with pytest.raises(ValueError):
        mod.donki_events(null_time, SOURCE_ID)
    no_id = {"FLR": [{"beginTime": "2024-05-20T01:23Z"}]}
    with pytest.raises(ValueError):
        mod.donki_events(no_id, SOURCE_ID)
    with pytest.raises(ValueError):
        mod.donki_events(_in_window_records(), SOURCE_ID, window=("2024-05-24", "2024-05-13"))


def test_special_characters_in_record_text_survive():
    """Unicode and quote characters in ids and the flare class pass through into the JSON unchanged."""
    rec = _record("FLR", "SYNTH-é-火星", "2024-05-20T01:23Z", classType='X·☃"')
    (ev,) = _mod().donki_events({"FLR": [rec]}, SOURCE_ID)
    assert ev["payload"]["donki_id"] == rec["flrID"]
    assert rec["classType"] in ev["payload"]["summary"]  # the non-ASCII class reaches the summary
    written = json.dumps(ev, ensure_ascii=False).encode("utf-8")  # as a UTF-8 file would hold it
    assert rec["flrID"].encode("utf-8") in written  # raw UTF-8 bytes of the id are in the output
    assert json.loads(written.decode("utf-8"))["payload"]["donki_id"] == rec["flrID"]


def test_load_cache_reads_one_json_array_per_type(tmp_path: Path):
    records = _in_window_records()
    for donki_type in ("FLR", "WSAEnlilSimulations"):
        (tmp_path / f"{donki_type}.json").write_text(json.dumps(records[donki_type]), encoding="utf-8")
    (tmp_path / "README.md").write_text("not a table", encoding="utf-8")  # other files are ignored
    cache = _mod().load_cache(tmp_path)
    assert cache == {"FLR": records["FLR"], "WSAEnlilSimulations": records["WSAEnlilSimulations"]}
    # And the loaded cache feeds donki_events directly.
    assert len(_mod().donki_events(cache, SOURCE_ID)) == 2
