"""Deterministic generator for the fake scenario fixture (T22.02, fixture F8).

Run: python3 apps/hab-core/tests/fixtures/fake-scenario/make_fake_scenario.py [--out <dir>]
Writes scenario.json, scenario.planless.json, dose_series.json, earth_link.json and the two-candidate-site/
folder next to this file (or into <dir>). Standard library only. Running it twice gives identical bytes.

Every number is (a) copied from a cited spec example, (b) a declared synthetic shape parameter
below, (c) computed here from (a) and (b), or (d) a placeholder (0, "", [], null). See README.md.
The demo never loads this scenario; it lives under site_id `mock_site` (map §e fixture value rule).
"""
import argparse
import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
MOCK_SITE = ROOT / "data" / "sites" / "mock_site"
OUT = HERE  # replaced by --out

# ---- Declared synthetic shape parameters (not data) -------------------------------------------
STOP_SPACING_M = 1000          # straight line along +x: start at x=0, stops every 1000 m
N_STOPS = 2
BACKGROUND_UGY_H = 1           # unit background rate; the curve is a shape, not a dose
STEP_FACTOR = 2                # step level = STEP_FACTOR x rad_k_background x background (crosses the trigger)
PHASE_S = 3600                 # background, step and background phases, 1 h each
SAMPLE_STEP_S = 600            # dose sample spacing
EARTH_MESSAGE_OFFSET_S = PHASE_S  # the simulated Earth message is issued at the step onset

# ---- Copied from spec examples -----------------------------------------------------------------
START_UTC = "2024-05-20T00:00:00Z"                 # 05 §F.4 start_utc
SEED = 4190                                        # 05 Scenario / §F.4 seed
SITE_ID = "mock_site"                              # map §e: mock data lives under mock_site
DATA_VERSION = "mock_site-fixture"                 # placeholder version string for the mock site
DISCLAIMER = "Exploratory planning prototype — not validated for operations."  # 05 §F.3


def load_param(pid):
    return json.loads((HERE / "param_sets" / f"{pid}.json").read_text(encoding="utf-8"))


def js_number(x):
    """ECMAScript Number::toString (RFC 8785 section 3.2.2.3): 1.0 -> "1", 1e21 -> "1e+21", -0.0 -> "0".

    Shortest round-trip digits come from repr(float); they are laid out by the ECMAScript rules.
    """
    if isinstance(x, int):
        x = float(x)  # JSON numbers are IEEE 754 doubles (RFC 8785); big ints round like JavaScript
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
    # value = 0.DIGITS x 10^n
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


def canonical(value):
    """RFC 8785 (JCS) canonical JSON: keys sorted by UTF-16 code units, no whitespace, numbers as
    JavaScript prints them, strings as JSON.stringify (05 PlanExport plan_hash)."""
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


# Expected values are JavaScript's own output (String(x)), checked with Node when this was written.
_JS_NUMBERS = [
    (0.1, "0.1"), (1.0, "1"), (-0.0, "0"), (0, "0"), (1e21, "1e+21"), (1e-7, "1e-7"),
    (123456789012345680000.0, "123456789012345680000"), (1.5e-7, "1.5e-7"), (0.000001, "0.000001"),
    (5e-324, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"), (-2.5, "-2.5"),
    (100, "100"), (1e20, "100000000000000000000"), (123.456, "123.456"), (20 / 3, "6.666666666666667"),
    (2**53 + 2, "9007199254740994"), (0.1 + 0.2, "0.30000000000000004"),
]


def self_check():
    for x, want in _JS_NUMBERS:
        got = js_number(x)
        assert got == want, f"js_number({x!r}) = {got!r}, JavaScript prints {want!r}"
    # Keys sort by UTF-16 code units: U+FF5E (BMP) sorts after U+1F600 (surrogates D83D DE00).
    assert canonical({"b": [1.0, True, None], "a": "x", "～": 2, "\U0001F600": 3}) == \
        '{"a":"x","b":[1,true,null],"\U0001F600":3,"～":2}'


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def write(name, obj):
    text = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_bytes(name, payload):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def series_start_utc(samples, background, trigger_factor):
    """BD-98: the time of the last sample whose rate is at or below the background before the first sample whose
    trigger state is not nominal. The trigger rule is that of 05 ParamSet kind `alert`: an alert starts at the
    second of two consecutive samples above trigger_factor x background (compute `triggerState`)."""
    highs = 0
    first_alert = None
    for i, (_, rate) in enumerate(samples):
        highs = highs + 1 if rate is not None and rate > trigger_factor * background else 0
        if highs >= 2:
            first_alert = i
            break
    assert first_alert is not None, "the synthetic step never triggers the alert"
    last = max(i for i in range(first_alert) if samples[i][1] is not None and samples[i][1] <= background)
    return samples[last][0]


# ---- Declared synthetic shape of the two-candidate site (not data) -------------------------------------
# The second mast mirrors the first across x = 0, and its comm grid is the first grid's 0/1 mask mirrored
# left to right (no-data cells stay where they are). Neither is a computed viewshed.
SECOND_CANDIDATE_ID = "hab-alternative"
FIRST_CANDIDATE_ID = "hab-first"


def mirror_comm(comm, width):
    out = bytearray(len(comm))
    for i in range(0, len(comm), width):
        row = comm[i:i + width]
        for col, value in enumerate(row):
            out[i + col] = value if value == 255 else row[width - 1 - col]
    return bytes(out)


def two_candidate_site():
    """data/sites/mock_site's manifest and grid files with two HabCandidates (05 HabCandidate; rank-1 mirrors the Site)."""
    manifest = json.loads((MOCK_SITE / "site-manifest.json").read_text(encoding="utf-8"))
    # data_version stays the mock site's: the manifest schema wants a dated version, which the fake scenario's "mock_site-fixture" is not.
    grid = manifest["grid"]
    proj = manifest["crs"]["proj4"]
    num = lambda key: float(re.search(r"\+" + key + r"=(-?[\d.]+)", proj).group(1))
    radius_m = num("R")
    lat_0, lon_0, lat_ts = num("lat_0"), num("lon_0"), num("lat_ts")

    def inverse(x_m, y_m):  # spherical inverse equirectangular, as compute inverseEqc (02 §C.1)
        lat = lat_0 + math.degrees(y_m / radius_m)
        lon_e = lon_0 + math.degrees(x_m / (radius_m * math.cos(math.radians(lat_ts))))
        return lat, lon_e

    first_mast = dict(grid["hab_mast"])
    second_mast = {**first_mast, "x_m": -first_mast["x_m"]}
    width = grid["width"]
    comm = (MOCK_SITE / "grid" / "comm_hab.u8").read_bytes()
    second_file = f"grid/comm_{SECOND_CANDIDATE_ID}.u8"
    second_bytes = mirror_comm(comm, width)
    second_sha = write_bytes(f"two-candidate-site/{second_file}", second_bytes)
    for asset in manifest["assets"]:
        if asset["path"].startswith("grid/"):
            write_bytes(f"two-candidate-site/{asset['path']}", (MOCK_SITE / asset["path"]).read_bytes())
    manifest["assets"].append({
        "asset_id": f"grid-comm-{SECOND_CANDIDATE_ID}", "path": second_file, "format": "u8", "sha256": second_sha,
        "bytes": len(second_bytes), "width": width, "height": grid["height"], "nodata": 255, "byte_order": "little"})
    manifest["assets"].sort(key=lambda a: a["asset_id"])

    def candidate(cid, label, rank, mast, asset_id):
        lat, lon_e = inverse(mast["x_m"], mast["y_m"])
        return {"candidate_id": cid, "label": label, "rank": rank, "hab_mast": mast, "lat": lat, "lon_e": lon_e,
                "comm_hab_asset": asset_id,
                "default_start": {"x_m": mast["x_m"], "y_m": mast["y_m"], "label": "Habitat / rover"},
                "note": "fixture - not a real source", "provenance": "assumed", "source_ids": []}

    manifest["hab_candidates"] = [
        candidate(FIRST_CANDIDATE_ID, "First choice", 1, first_mast, grid["comm_hab_asset"]),
        candidate(SECOND_CANDIDATE_ID, "Alternative", 2, second_mast, f"grid-comm-{SECOND_CANDIDATE_ID}"),
    ]
    manifest["name"] = "Two-candidate fixture site (synthetic, from the mock site F4)"
    write("two-candidate-site/site-manifest.json", manifest)


def main():
    global OUT
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=HERE, help="folder to write into (default: next to this file)")
    OUT = parser.parse_args().out.resolve()
    self_check()
    suit = load_param("suit-assumed")["values"]
    alert = load_param("alert-assumed")["values"]
    t0 = datetime.strptime(START_UTC, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

    # Dose series: background, step, background (05 DoseSeries; a synthetic shape).
    step = STEP_FACTOR * alert["rad_k_background"] * BACKGROUND_UGY_H
    samples, total_s = [], 3 * PHASE_S
    for s in range(0, total_s + 1, SAMPLE_STEP_S):
        rate = step if PHASE_S <= s < 2 * PHASE_S else BACKGROUND_UGY_H
        samples.append([iso(t0 + timedelta(seconds=s)), rate])
    # Integral of the piecewise-constant series (each sample holds until the next).
    integral = sum(r * SAMPLE_STEP_S / 3600 for (_, r) in samples[:-1])
    dose_sha = write("dose_series.json", {
        "series_id": "fake-step",
        "quantity": "surface absorbed dose rate",
        "unit": "uGy/h",
        "samples": samples,
        "background_rate": BACKGROUND_UGY_H,
        "method": "template_scaled",
        "provenance": "replayed",
        "source_id": "fixture-synthetic",
        "integral_check": {"expected_ugy": integral, "computed_ugy": integral},
    })

    # Earth link: one constant row of placeholders (05 EarthLinkTable; step_s 60 per its rule).
    earth_sha = write("earth_link.json", {
        "step_s": 60,
        "rows": [{"t_utc": START_UTC, "light_time_s": 0, "sep_angle_deg": 0, "earth_elev_deg": 0,
                  "orbiters": {"mro": 0, "maven": 0, "tgo": 0}}],
        "passes": [],
        "kernels": [],
        "provenance": "derived",
    })

    # Plan: start + N_STOPS on a straight line; walk time from the suit's flat speed.
    waypoints = [{"id": "wp-0", "role": "start", "x_m": 0, "y_m": 0}]
    waypoints += [{"id": f"wp-{i}", "role": "stop", "x_m": i * STOP_SPACING_M, "y_m": 0} for i in range(1, N_STOPS + 1)]
    legs = []
    # One leg per consecutive pair, plus the return leg because `loop` is true (05 PlanResult).
    for a, b in list(zip(waypoints, waypoints[1:])) + [(waypoints[-1], waypoints[0])]:
        dist = abs(b["x_m"] - a["x_m"])
        legs.append({"from": a["id"], "to": b["id"], "status": "OK", "distance_m": dist,
                     "walk_time_min": dist / 1000 / suit["flat_speed_kmh"] * 60,
                     "climb_m": 0, "descent_m": 0, "max_slope_deg": 0,
                     "geometry": [[a["x_m"], a["y_m"]], [b["x_m"], b["y_m"]]]})
    # 05 §F.3 scenario (6.0 and 5.0 are written as 6 and 5; the hash is the same either way, as
    # RFC 8785 prints 6.0 as 6) + 05 §F.4 plan.scenario v2 fields; eva_start = scenario start.
    mission = {
        "eva_start_utc": START_UTC, "max_eva_duration_h": 6, "dwell_min_per_stop": 20,
        "hard_slope_limit_deg": 15, "caution_slope_deg": 10, "walkback_limit_km": 5,
        "suited_flat_speed_kmh": suit["flat_speed_kmh"], "solar_phase": "max", "loop": True,
        "max_haven_min": 30, "crew_count": 2, "vehicle_available": True, "vehicle_param_set": "pr1-assumed",
    }
    # Totals (05 PlanResult) computed from the legs. Walkback on a loop: at each waypoint the shorter
    # way back to the start along the route, min(cumulative, total - cumulative); max over waypoints.
    total_m = sum(l["distance_m"] for l in legs)
    walk_min = sum(l["walk_time_min"] for l in legs)
    dwell_min = mission["dwell_min_per_stop"] * N_STOPS
    cum, walkback_m = 0, 0
    for l in legs[:-1]:
        cum += l["distance_m"]
        walkback_m = max(walkback_m, min(cum, total_m - cum))
    totals = {"distance_m": total_m, "walk_time_min": walk_min, "dwell_time_min": dwell_min,
              "eva_total_min": walk_min + dwell_min,
              "eva_margin_min": mission["max_eva_duration_h"] * 60 - (walk_min + dwell_min),
              "climb_m": 0, "descent_m": 0, "max_slope_deg": 0, "max_walkback_km": walkback_m / 1000}
    plan_hash = hashlib.sha256(
        canonical({"data_version": DATA_VERSION, "scenario": mission, "waypoints": waypoints}).encode()
    ).hexdigest()[:12]
    plan = {
        "export_schema_version": "1.0.0", "app_version": "0.1.0",  # 05 §F.3
        "site_id": SITE_ID, "data_version": DATA_VERSION, "plan_hash": plan_hash,
        "scenario": mission, "waypoints": waypoints,
        "result": {"status": "OK", "legs": legs, "totals": totals, "stops_timeline": [], "warnings": []},
        "provenance_summary": [], "disclaimer": DISCLAIMER,
    }

    # Live-session shape (05 Scenario, 2026-11-10): the setup values are those of plan.scenario (05 §F.4), and the
    # library has one event over the synthetic step series (BD-98 gives its series start).
    mission_setup = {
        "hab_candidate_id": FIRST_CANDIDATE_ID, "crew_count": mission["crew_count"],
        "vehicle_available": mission["vehicle_available"], "vehicle_param_set": mission["vehicle_param_set"],
        "solar_phase": mission["solar_phase"], "max_haven_min": mission["max_haven_min"],
    }
    event_library = [{
        "event_id": "storm", "title": "Fixture solar particle event (synthetic)", "kind": "SPACE_WEATHER",
        "dose_series": "dose_series",
        "series_start_utc": series_start_utc(samples, BACKGROUND_UGY_H, alert["rad_k_background"]),
        "label": "fixture - synthetic step series, not RAD data",
        "source_id": "fixture-synthetic", "provenance": "replayed",
    }]
    # Suggested tasks for the POI of the mock site (data/sites/mock_site/vectors/pois.geojson); text as the stop tasks above.
    poi_id = json.loads((MOCK_SITE / "vectors" / "pois.geojson").read_text(encoding="utf-8"))["features"][0]["properties"]["poi_id"]
    task_library = [
        {"library_task_id": "lt-boxwork-01", "poi_id": poi_id, "crew_id": "EV1", "kind": "image", "text": "Image the ridge crest"},
        {"library_task_id": "lt-boxwork-02", "poi_id": poi_id, "crew_id": None, "kind": "other", "text": "Fixture task"},
    ]
    crew = [{"crew_id": "EV1", "suit_param_set": "suit-assumed", "start_offset_s": 0},
            {"crew_id": "EV2", "suit_param_set": "suit-assumed", "start_offset_s": 0}]
    vehicles = [{"vehicle_id": "PR1", "kind": "pressurized_rover", "param_set": "pr1-assumed", "start_x_m": 0, "start_y_m": 0}]
    param_sets = ["suit-assumed", "pr1-assumed", "link-assumed", "alert-assumed", "shielding-assumed"]
    tables = {"dose_series": {"path": "dose_series.json", "sha256": dose_sha},
              "earth_link": {"path": "earth_link.json", "sha256": earth_sha}}
    head = {
        "scenario_schema_version": "1.0.0",  # 05 §F.4
        "site_id": SITE_ID, "data_version": DATA_VERSION, "seed": SEED, "start_utc": START_UTC,
    }
    tail = {"mission_setup": mission_setup, "crew": crew, "vehicles": vehicles, "param_sets": param_sets,
            "event_library": event_library, "task_library": task_library, "tables": tables,
            "source_ids": ["fixture-synthetic"]}

    write("scenario.json", {
        "scenario_schema_version": head["scenario_schema_version"],
        "scenario_id": "fake-straight-line",
        "title": "Fake scenario: straight line, stepped dose (test fixture, not data)",
        **{k: head[k] for k in ("site_id", "data_version", "seed", "start_utc")},
        "plan": plan,
        "stop_tasks": [
            {"task_id": "t-s1-01", "stop_id": "wp-1", "crew_id": "EV1", "kind": "image", "text": "Image the ridge crest"},
            {"task_id": "t-s2-01", "stop_id": "wp-2", "crew_id": None, "kind": "other", "text": "Fixture task"},
        ],
        **tail,
        "events": [{"event_id": "e1", "t_utc": iso(t0 + timedelta(seconds=EARTH_MESSAGE_OFFSET_S)),
                    "kind": "EARTH_MESSAGE", "provenance": "simulated",
                    "payload": {"sent_earth_utc": iso(t0 + timedelta(seconds=EARTH_MESSAGE_OFFSET_S)),
                                "body": "SEP event in progress. Recommend shelter."}}],  # 05 §F.4 e2 body
    })
    # The plan-less variant: the live session before any plan is published (no plan, stop tasks or fixed events).
    write("scenario.planless.json", {
        "scenario_schema_version": head["scenario_schema_version"],
        "scenario_id": "fake-planless",
        "title": "Fake scenario, plan-less: live session before PUBLISH_PLAN (test fixture, not data)",
        **{k: head[k] for k in ("site_id", "data_version", "seed", "start_utc")},
        **tail,
    })
    two_candidate_site()


if __name__ == "__main__":
    main()
