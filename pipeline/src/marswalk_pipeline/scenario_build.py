"""Assemble `scenarios/storm-sol4190/scenario.json` (T21.08, T32.32, T31.02; FR-34, FR-50, FR-52, NFR-06; 02 §E.7; 05 Scenario).

A build output, never edited by hand. Every value comes from a committed file: the demo plan (`plan.json`, written by
`apps/hab-core/scripts/build-demo-plan.ts`), the two tables, the stop tasks, the ParamSets, the DONKI cache and the hab
candidates. Decisions BD-10 (hab-first), BD-97/BD-98/BD-143 (`series_start_utc`), BD-99 (a simulated input answers a replayed
record), BD-144 (what the file holds). The bytes are fixed: UTF-8, sorted keys, 2-space indent, one final newline.

    $(make -s pipeline-python) -m marswalk_pipeline.scenario_build [--root <repo>] [--out <file>]

Prints the `series_start_utc` rule and its value, the alert sample, the start and the SHA-256 of the written file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from . import donki

SCENARIO_ID = "storm-sol4190"
SCENARIO_DIR = Path("scenarios") / SCENARIO_ID
HAB_CANDIDATES = Path("pipeline/sites/gale_boxwork/hab_candidates.json")
DONKI_CACHE = Path("pipeline/cache/donki")
DONKI_SOURCE_ID = "donki-2024-05"  # 05 §F.4
SCHEMA_VERSION = "1.0.0"
SEED = 4190  # 05 §F.4
TITLE = "Storm at sol 4190"  # 05 §F.4
EVENT_ID = "storm"
EVENT_TITLE = "Solar particle event, 20 May 2024 (sol 4190)"
EVENT_LABEL = "replayed — Curiosity RAD measurements"  # 05 §F.4
EARTH_BODY = "SEP event in progress. Recommend shelter."  # 05 §F.4
VEHICLES = (("PR1", "pressurized_rover", "pr1-assumed"), ("UR1", "utility_rover", "ur1-assumed"))
CREW = ("EV1", "EV2")
SUIT_PARAM_SET = "suit-assumed"
# The order of `param_sets`: 05 §F.4 lists suit, pr1, link, alert, shielding; the utility rover follows the pressurized one.
KIND_ORDER = ("suit", "pressurized_rover", "utility_rover", "link", "alert", "shielding")


# ------------------------------------------------------------------------------------------ RFC 8785 canonical JSON


def js_number(x: float | int) -> str:
    """ECMAScript Number::toString (RFC 8785 section 3.2.2.3): 1.0 -> "1", 1e21 -> "1e+21", -0.0 -> "0"."""
    if isinstance(x, int):
        x = float(x)
    if x != x or x in (float("inf"), float("-inf")):
        raise ValueError("NaN and Infinity cannot be canonicalised")
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    mant, _, exp = repr(abs(x)).partition("e")
    whole, _, frac = mant.partition(".")
    all_digits = whole + frac
    leading_zeros = len(all_digits) - len(all_digits.lstrip("0"))
    digits = all_digits.strip("0")
    n = len(whole) + int(exp or 0) - leading_zeros
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * -n + digits
    else:
        e = n - 1
        out = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + out


def canonical(value: Any) -> str:
    """RFC 8785 (JCS): keys sorted by UTF-16 code units, no whitespace, numbers as JavaScript prints them."""
    if isinstance(value, bool) or value is None:
        return json.dumps(value)
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical(v) for v in value) + "]"
    keys = sorted(value, key=lambda k: k.encode("utf-16-be"))
    return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical(value[k]) for k in keys) + "}"


def check_plan_hash(plan: Mapping[str, Any]) -> None:
    """`plan_hash` = first 12 hex of SHA-256 over canonical `{data_version, scenario, waypoints}` (05 PlanExport)."""
    body = {"data_version": plan["data_version"], "scenario": plan["scenario"], "waypoints": plan["waypoints"]}
    computed = hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()[:12]
    if computed != plan["plan_hash"]:
        raise ValueError(f"plan_hash {plan['plan_hash']} does not verify (computed {computed})")


# ------------------------------------------------------------------------------------------ series start (BD-98, BD-143)


def series_start_utc(samples: Sequence[Sequence[Any]], background_rate: float, alert: Mapping[str, float]) -> tuple[str, str]:
    """The time of the last sample whose rate is below `rad_clear_k x background_rate` before the first alert sample.

    The alert starts at the second of two consecutive samples above `rad_k_background x background_rate` (a gap resets the
    count), the rule of compute `triggerState`; a Vitest check recomputes this with compute itself. Returns the time and the
    rule as text. Raises ValueError when the series never triggers or has no quiet sample before the alert.
    """
    trigger = alert["rad_k_background"] * background_rate
    clear = alert["rad_clear_k"] * background_rate
    highs, first_alert = 0, None
    for i, (_, rate) in enumerate(samples):
        highs = highs + 1 if rate is not None and rate > trigger else 0
        if highs >= 2:
            first_alert = i
            break
    if first_alert is None:
        raise ValueError("the series never raises an alert with the alert ParamSet")
    quiet = [i for i in range(first_alert) if samples[i][1] is not None and samples[i][1] < clear]
    if not quiet:
        raise ValueError("no quiet sample before the first alert sample")
    rule = (
        "series_start_utc = time of the last sample with rate < rad_clear_k x background_rate "
        f"({alert['rad_clear_k']} x {background_rate}) before the first sample whose triggerState is not nominal "
        f"(2 consecutive samples above rad_k_background x background_rate = {trigger}); alert sample {samples[first_alert][0]} (BD-98, BD-143)"
    )
    return samples[quiet[-1]][0], rule


# ------------------------------------------------------------------------------------------ assembly


def _load(root: Path, rel: Path) -> Any:
    path = root / rel
    if not path.is_file():
        raise FileNotFoundError(f"{rel} is missing (a build input of scenario.json)")
    return json.loads(path.read_text(encoding="utf-8"))


def _seconds_between(t0: str, t1: str) -> int:
    parse = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)  # noqa: E731
    return int((parse(t1) - parse(t0)).total_seconds())


def _param_sets(root: Path) -> list[dict]:
    sets = [_load(root, p.relative_to(root)) for p in sorted((root / SCENARIO_DIR / "param_sets").glob("*.json"))]
    if not sets:
        raise FileNotFoundError(f"{SCENARIO_DIR / 'param_sets'} has no ParamSet")
    return sorted(sets, key=lambda s: (KIND_ORDER.index(s["kind"]), s["param_set_id"]))


def build_scenario(root: Path) -> dict:
    """The scenario as a dict. Pure given the files under `root`: no clock, no network."""
    root = Path(root)
    plan = _load(root, SCENARIO_DIR / "plan.json")
    check_plan_hash(plan)
    series = _load(root, SCENARIO_DIR / "dose_series.json")
    earth = _load(root, SCENARIO_DIR / "earth_link.json")
    stop_tasks = _load(root, SCENARIO_DIR / "stop_tasks.json")
    candidates = _load(root, HAB_CANDIDATES)
    params = _param_sets(root)
    by_id = {p["param_set_id"]: p for p in params}
    alert = next(p for p in params if p["kind"] == "alert")["values"]
    missing = [ps for ps in (SUIT_PARAM_SET, plan["scenario"]["vehicle_param_set"], *(v[2] for v in VEHICLES)) if ps not in by_id]
    if missing:
        raise ValueError(f"ParamSet {', '.join(missing)} is not in {SCENARIO_DIR / 'param_sets'}")

    first = min(candidates, key=lambda c: c["rank"])  # BD-10: the rank-1 candidate
    mast = first["hab_mast"]
    mission = plan["scenario"]
    start_utc = mission["eva_start_utc"]
    series_start, _ = series_start_utc(series["samples"], series["background_rate"], alert)
    if not series_start > start_utc:
        raise ValueError(f"series_start_utc {series_start} is not after start_utc {start_utc}: the BD-97 press would precede the clock")
    series_end = series["samples"][-1][0]

    records = donki.donki_events(donki.load_cache(root / DONKI_CACHE), DONKI_SOURCE_ID)
    inputs: list[dict] = []
    for n, record in enumerate((r for r in records if series_start <= r["t_utc"] <= series_end), start=1):
        inputs.append({
            "input_id": f"donki-{n:03d}", "t_offset_s": _seconds_between(series_start, record["t_utc"]), "kind": "DONKI_RECORD",
            "payload": record["payload"], "provenance": record["provenance"], "source_id": record["source_id"],
            "_event_id": record["event_id"],
        })
    if not inputs:
        raise ValueError("no DONKI record falls inside the dose series after series_start_utc, so the Earth message answers nothing (BD-99)")
    answered = inputs[0]
    inputs.append({
        "input_id": "earth-001", "t_offset_s": answered["t_offset_s"], "kind": "EARTH_MESSAGE",
        "payload": {"body": EARTH_BODY, "answers": answered["_event_id"]}, "provenance": "simulated",
    })
    for item in inputs:
        item.pop("_event_id", None)
    # `_event_id` was kept only to pair the answer; time order, DONKI before the Earth message at an equal offset
    inputs.sort(key=lambda i: (i["t_offset_s"], i["kind"] != "DONKI_RECORD", i["input_id"]))

    poi_of = {w["id"]: w["poi_id"] for w in plan["waypoints"] if w["role"] == "stop"}
    counter: dict[str, int] = {}
    library = []
    for task in stop_tasks:
        poi = poi_of[task["stop_id"]]
        counter[poi] = counter.get(poi, 0) + 1
        slug = poi[4:] if poi.startswith("poi-") else poi
        library.append({"library_task_id": f"lt-{slug}-{counter[poi]:02d}", "poi_id": poi, "crew_id": task["crew_id"], "kind": task["kind"], "text": task["text"]})

    tables = {}
    for name in ("dose_series", "earth_link"):
        path = root / SCENARIO_DIR / f"{name}.json"
        tables[name] = {"path": f"{name}.json", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    source_ids = {series["source_id"], DONKI_SOURCE_ID} | {k["source_id"] for k in earth["kernels"]}
    for p in params:
        source_ids |= set(p.get("source_ids", []))

    return {
        "scenario_schema_version": SCHEMA_VERSION,
        "scenario_id": SCENARIO_ID,
        "title": TITLE,
        "site_id": plan["site_id"],
        "data_version": plan["data_version"],
        "seed": SEED,
        "start_utc": start_utc,
        "plan": plan,
        "stop_tasks": stop_tasks,
        "mission_setup": {
            "hab_candidate_id": first["candidate_id"],
            **{k: mission[k] for k in ("crew_count", "vehicle_available", "vehicle_param_set", "solar_phase", "max_haven_min")},
        },
        "crew": [{"crew_id": c, "suit_param_set": SUIT_PARAM_SET, "start_offset_s": 0} for c in CREW],
        "vehicles": [{"vehicle_id": v, "kind": k, "param_set": ps, "start_x_m": mast["x_m"], "start_y_m": mast["y_m"]} for v, k, ps in VEHICLES],
        "param_sets": [p["param_set_id"] for p in params],
        "events": [r for r in records if start_utc <= r["t_utc"] < series_start],
        "event_library": [{
            "event_id": EVENT_ID, "title": EVENT_TITLE, "kind": "SPACE_WEATHER", "dose_series": "dose_series",
            "series_start_utc": series_start, "label": EVENT_LABEL, "source_id": series["source_id"], "provenance": "replayed",
            "inputs": inputs,
        }],
        "task_library": library,
        "tables": tables,
        "source_ids": sorted(source_ids),
    }


def scenario_bytes(scenario: Mapping[str, Any]) -> bytes:
    return (json.dumps(scenario, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")


def write_scenario(scenario: Mapping[str, Any], path: Path) -> str:
    """Write the fixed bytes and return their SHA-256."""
    payload = scenario_bytes(scenario)
    Path(path).write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Assemble scenarios/storm-sol4190/scenario.json (T21.08)")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    scenario = build_scenario(args.root)
    series = _load(args.root, SCENARIO_DIR / "dose_series.json")
    alert = next(p for p in _param_sets(args.root) if p["kind"] == "alert")["values"]
    start, rule = series_start_utc(series["samples"], series["background_rate"], alert)
    out = args.out or args.root / SCENARIO_DIR / "scenario.json"
    digest = write_scenario(scenario, out)
    entry = scenario["event_library"][0]
    print(rule)
    print(f"series_start_utc {start}; start_utc {scenario['start_utc']} (= plan.scenario.eva_start_utc); plan_hash {scenario['plan']['plan_hash']}")
    print(f"hab_candidate_id {scenario['mission_setup']['hab_candidate_id']}; {len(entry['inputs'])} library inputs, {len(scenario['events'])} events, {len(scenario['task_library'])} library tasks")
    print(f"wrote {out} sha256 {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
