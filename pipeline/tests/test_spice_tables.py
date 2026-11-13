"""SPICE Earth-link table: docs/specs/02 §C.5 L10, §D.12, §F.2; 05 EarthLinkTable (FR-43). TASK-21, T21.03.

Interface these tests define for T21.04 (`marswalk_pipeline/spice_tables.py`). All times are
ISO-8601 UTC strings `YYYY-MM-DDTHH:MM:SSZ`. Rows are 60 s apart (05 EarthLinkTable `step_s` = 60).

Pure functions (no SPICE, no kernels):

    time_grid(start_utc, end_utc, step_s=60) -> list[str]
        Every start + k*step_s <= end, both ends included when on the grid. ValueError if end < start
        or step_s <= 0.

    site_position_km(lat_deg, lon_east_deg) -> (x, y, z)
        Site position in the IAU_MARS body-fixed frame on the sphere of radius
        `config.MARS_RADIUS_M / 1000` km. Planetocentric latitude, EAST-positive longitude
        (02 §C.1): x = R cos(lat) cos(lon), y = R cos(lat) sin(lon), z = R sin(lat).

    derive_passes(times_utc, elevations_deg, min_elev_deg) -> list[dict]
        A pass is a maximal run of consecutive samples with elevation >= min_elev_deg (02 §D.12:
        "elevation at the site >= 10 deg"; the boundary counts). Returns, in time order,
        {"start_utc": first sample of the run, "end_utc": last sample of the run,
         "max_elev_deg": max of the run}. A run that touches either end of the series is kept.
        ValueError if the two sequences differ in length. Empty input gives [].

    is_conjunction_blackout(sep_angle_deg, conjunction_deg) -> bool
        True when sep_angle_deg < conjunction_deg (02 §D.12: "angle < 3 deg"; strict).

    assemble_earth_link_table(rows, link_values, kernels) -> dict
        `rows`: list of 05 EarthLinkTable rows {t_utc, light_time_s, sep_angle_deg, earth_elev_deg,
        orbiters: {mro, maven, tgo}}. ValueError unless the rows are strictly increasing and exactly
        60 s apart. `link_values` is the `values` object of a `link` ParamSet; `relay_min_elev_deg`
        is read from it. Returns {"step_s": 60, "rows": rows, "passes": [...], "kernels": kernels,
        "provenance": "derived"}. `passes` holds one entry per run per orbiter, each
        {"orbiter", "start_utc", "end_utc", "max_elev_deg"}, sorted by (start_utc, orbiter).

SPICE-backed functions (need spiceypy and the kernels; the tests that call them skip when either is
missing). `kernel_dir` is a folder searched recursively for the kernels (02 L10). Each call loads what
it needs and does not rely on kernels left in the pool by an earlier call. Earth geometry takes Mars
as the Mars barycenter (NAIF 4), which is in de440s.bsp (its measured difference from the body centre is in
kernels.lock.json, BD-24). Orbiter geometry uses the Mars body centre (NAIF 499).

    light_time_s(t_utc, kernel_dir) -> float
        One-way Mars-Earth light time at t_utc (02 §D.12).
    sun_earth_mars_angle_deg(t_utc, kernel_dir) -> float
        Angle at Earth between the directions to the Sun and to Mars.
    earth_elevation_deg(t_utc, lat_deg, lon_east_deg, kernel_dir) -> float
        Elevation of Earth above the local horizon of the site (sphere, planetocentric), direction
        taken in IAU_MARS at the observation epoch t_utc.
    build_earth_link_table(start_utc, end_utc, site_lat_deg, site_lon_east_deg, kernel_dir,
                           link_values) -> dict
        The full table (same shape as `assemble_earth_link_table`), `kernels` listing every SPK, LSK
        and PCK used with its SHA-256 and a `source_id`.

Expected values come from the inputs, the link ParamSet file, spiceypy or arithmetic identities; no
science number is typed here. Synthetic placeholders are labelled.

Kernels are never committed: set MARSWALK_SPICE_DIR, or put them under pipeline/work/spice
(git-ignored; docs/ops/data-downloads.md D12-D15). The module does not exist until T21.04 lands, so
it is imported inside `_mod()`, never at module top: each test fails on its own. Every test calls
`_mod()` FIRST, before any skip, so a missing module is a failure even where kernels are absent.

Skips and the gate. Tests that need spiceypy, the kernels or jsonschema skip with a reason when they
are missing, so a plain `pytest` run stays green on a machine without kernels. Set
`MARSWALK_REQUIRE_SPICE=1` to turn a missing spiceypy or missing kernel file into a FAILURE instead of
a skip (use it in the run that signs off T21.04, and in CI once the kernels are cached). jsonschema is
not in the conda env yet (T14.01 adds it): every schema check lives in its own `*_validates_against_schema`
test, so its skip never hides another assertion.

Committed tables. When `scenarios/storm-sol4190/earth_link.json` exists (written by T21.04), the
`committed_*` tests check its order, 60 s step, elevation bounds, kernel manifest, schema and its SHA-256 against
`scenario.json` `tables.earth_link` if that file exists; they skip with a reason while it is absent.

Decided by the data lead (Obidit Islam), 2026-11-07: a pass is a maximal run of samples with
elevation >= minimum, start/end = first/last such sample on the 60 s grid (no interpolated
crossings), a run touching either end of the series is kept, and passes sort by (start_utc, orbiter).
05 EarthLinkTable states it ("Sampled-pass convention", 2026-11-12).

The MRO and MAVEN SPKs are centred on the Mars barycenter (4) and TGO's on Mars (499) (checked with spkgps on
2026-11-12). The independent orbiter checks request positions relative to MARS (499) in IAU_MARS, matching the site
vector's origin and frame, so mar099s (data-downloads D12) is loaded to chain 4 -> 499. For Earth geometry the
code treats Mars as the barycenter (NAIF 4); the difference from the body centre is measured by
`mars_centre_light_time_difference_s` (tested below) and recorded in kernels.lock.json (BD-24).
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PARAM_DIR = REPO_ROOT / "scenarios" / "storm-sol4190" / "param_sets"
EARTH_LINK_SCHEMA = REPO_ROOT / "schemas" / "earth-link.schema.json"
DEFAULT_SPICE_DIR = REPO_ROOT / "pipeline" / "work" / "spice"
SPICE_DIR_ENV = "MARSWALK_SPICE_DIR"

STEP_S = 60  # 05 EarthLinkTable `step_s`
ORBITERS = ("mro", "maven", "tgo")
ISO_FMT = "%Y-%m-%dT%H:%M:%SZ"
T_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
REQUIRE_SPICE_ENV = "MARSWALK_REQUIRE_SPICE"
SCENARIO_DIR = REPO_ROOT / "scenarios" / "storm-sol4190"

# Timestamp for the spiceypy spot check: the scenario day (sol 4190, 20 May 2024), an input.
CHECK_UTC = "2024-05-20T12:00:00Z"
# 02 §D.12 validation: light time within 1 s of an independent spiceypy value.
LIGHT_TIME_TOL_S = 1.0
# Test-chosen tolerance for angles compared against a differently-corrected spiceypy geometry
# (no aberration or light-time correction on the independent side; effect is below 0.01 deg).
ANGLE_TOL_DEG = 0.05

# Synthetic elevation offsets relative to the minimum elevation, one sample per row (SYNTHETIC).
# Runs at or above the threshold: indices 2..6 (boundary sample at offset 0 counts) and 10..10.
SYNTH_OFFSETS = [-5.0, -1.0, 0.0, 1.0, 20.0, 1.0, 0.0, -1.0, -5.0, -2.0, 3.0, -3.0]
SYNTH_PASSES_IDX = [(2, 6), (10, 10)]
# Placeholder row values that no rule here looks at (SYNTHETIC, not science).
SYNTH_FILLER = 0.0
SYNTH_SHA256 = "0" * 64


def _mod():
    from marswalk_pipeline import spice_tables  # deferred: module is written by T21.04

    return spice_tables


def _link_values() -> dict:
    """`values` of the assumed link ParamSet; every threshold in this file is read from here."""
    return json.loads((PARAM_DIR / "link-assumed.json").read_text())["values"]


def _parse(t: str) -> datetime:
    return datetime.strptime(t, ISO_FMT).replace(tzinfo=timezone.utc)


def _fmt(dt: datetime) -> str:
    return dt.strftime(ISO_FMT)


def _times(start: str, n: int) -> list[str]:
    t0 = _parse(start)
    return [_fmt(t0 + timedelta(seconds=STEP_S * i)) for i in range(n)]


def _row(t: str, mro: float = SYNTH_FILLER, maven: float = SYNTH_FILLER, tgo: float = SYNTH_FILLER) -> dict:
    return {
        "t_utc": t,
        "light_time_s": SYNTH_FILLER,
        "sep_angle_deg": SYNTH_FILLER,
        "earth_elev_deg": SYNTH_FILLER,
        "orbiters": {"mro": mro, "maven": maven, "tgo": tgo},
    }


def _kernels() -> list[dict]:
    return [{"file": "naif0012.tls", "sha256": SYNTH_SHA256, "source_id": "synthetic-source"}]


def _synthetic_rows(min_elev: float) -> list[dict]:
    """MRO follows SYNTH_OFFSETS around the threshold; MAVEN and TGO stay far below it."""
    times = _times(CHECK_UTC, len(SYNTH_OFFSETS))
    below = min_elev - 100.0  # clearly under any threshold
    return [_row(t, mro=min_elev + d, maven=below, tgo=below) for t, d in zip(times, SYNTH_OFFSETS)]


def _assert_valid_against_schema(table: dict) -> None:
    """Schema check. Call it LAST in a dedicated `*_validates_against_schema` test, after every
    assertion that does not need jsonschema, and after `_mod()` so the test is red before T21.04."""
    jsonschema = pytest.importorskip("jsonschema", reason="jsonschema is not in the pipeline conda env (T14.01)")
    cls = jsonschema.Draft202012Validator
    cls(json.loads(EARTH_LINK_SCHEMA.read_text()), format_checker=cls.FORMAT_CHECKER).validate(table)


def _assert_time_strings_and_elevation_bounds(table: dict) -> None:
    """No jsonschema needed: ISO-8601 UTC strings and every elevation within [-90, 90] degrees."""
    for r in table["rows"]:
        assert T_UTC_RE.match(r["t_utc"]), r["t_utc"]
        for name, value in [("earth_elev_deg", r["earth_elev_deg"]), *r["orbiters"].items()]:
            assert -90.0 <= value <= 90.0, f"{name}={value} at {r['t_utc']}"
    for p in table["passes"]:
        assert T_UTC_RE.match(p["start_utc"]) and T_UTC_RE.match(p["end_utc"])
        assert _parse(p["start_utc"]) <= _parse(p["end_utc"])
        assert -90.0 <= p["max_elev_deg"] <= 90.0


def _assert_row_step(table: dict) -> None:
    """Independent check of the row step: every gap is exactly step_s = 60 s (05 EarthLinkTable)."""
    assert table["step_s"] == STEP_S
    stamps = [_parse(r["t_utc"]) for r in table["rows"]]
    assert len(stamps) >= 2
    gaps = {(b - a).total_seconds() for a, b in zip(stamps, stamps[1:])}
    assert gaps == {float(STEP_S)}


# ---------------------------------------------------------------------------------------------
# Kernel-free rules
# ---------------------------------------------------------------------------------------------


def test_time_grid_has_rows_exactly_60_s_apart():
    """02 §D.12 / 05: one row per minute. The grid includes both ends and no step is irregular."""
    start, end = "2024-05-18T00:00:00Z", "2024-05-18T03:00:00Z"
    grid = _mod().time_grid(start, end)
    span_s = (_parse(end) - _parse(start)).total_seconds()
    assert len(grid) == int(span_s // STEP_S) + 1
    assert grid[0] == start and grid[-1] == end
    gaps = {(_parse(b) - _parse(a)).total_seconds() for a, b in zip(grid, grid[1:])}
    assert gaps == {float(STEP_S)}


def test_time_grid_stops_at_last_step_not_after_end():
    start = "2024-05-18T00:00:00Z"
    end = _fmt(_parse(start) + timedelta(seconds=STEP_S * 5 + STEP_S // 2))  # not on the grid
    grid = _mod().time_grid(start, end)
    assert grid[-1] == _fmt(_parse(start) + timedelta(seconds=STEP_S * 5))
    assert _parse(grid[-1]) <= _parse(end)


def test_time_grid_rejects_reversed_window_and_bad_step():
    mod = _mod()
    with pytest.raises(ValueError):
        mod.time_grid("2024-05-18T01:00:00Z", "2024-05-18T00:00:00Z")
    with pytest.raises(ValueError):
        mod.time_grid("2024-05-18T00:00:00Z", "2024-05-18T01:00:00Z", step_s=0)


def test_assemble_table_labels_provenance_derived_and_carries_the_kernels():
    min_elev = _link_values()["relay_min_elev_deg"]
    table = _mod().assemble_earth_link_table(_synthetic_rows(min_elev), _link_values(), _kernels())
    assert table["provenance"] == "derived"
    assert table["kernels"] == _kernels()
    assert set(table) == {"step_s", "rows", "passes", "kernels", "provenance"}
    _assert_time_strings_and_elevation_bounds(table)


def test_assembled_table_validates_against_schema():
    """Output of the table assembly validates against schemas/earth-link.schema.json."""
    min_elev = _link_values()["relay_min_elev_deg"]
    table = _mod().assemble_earth_link_table(_synthetic_rows(min_elev), _link_values(), _kernels())  # red before T21.04
    assert table["passes"]  # a table with real passes, so the schema sees a non-empty `passes`
    _assert_valid_against_schema(table)


def test_assemble_table_keeps_rows_at_step_s_60():
    min_elev = _link_values()["relay_min_elev_deg"]
    rows = _synthetic_rows(min_elev)
    table = _mod().assemble_earth_link_table(rows, _link_values(), _kernels())
    _assert_row_step(table)
    assert table["rows"] == rows  # rows are carried through unchanged: no resampling, no rounding


@pytest.mark.parametrize("shift_idx,shift_s", [(3, 1), (3, -1), (5, STEP_S)])
def test_assemble_table_rejects_rows_not_at_exactly_60_s(shift_idx, shift_s):
    """A 61 s gap, a 59 s gap or a doubled gap is refused; the Hab Core binary-searches on step_s."""
    min_elev = _link_values()["relay_min_elev_deg"]
    rows = _synthetic_rows(min_elev)
    for r in rows[shift_idx:]:
        r["t_utc"] = _fmt(_parse(r["t_utc"]) + timedelta(seconds=shift_s))
    with pytest.raises(ValueError):
        _mod().assemble_earth_link_table(rows, _link_values(), _kernels())


def test_assemble_table_rejects_unsorted_or_duplicate_rows():
    min_elev = _link_values()["relay_min_elev_deg"]
    mod = _mod()
    rows = _synthetic_rows(min_elev)
    with pytest.raises(ValueError):
        mod.assemble_earth_link_table(list(reversed(rows)), _link_values(), _kernels())
    with pytest.raises(ValueError):
        mod.assemble_earth_link_table(rows + [copy.deepcopy(rows[-1])], _link_values(), _kernels())


def test_derive_passes_from_synthetic_elevation_series():
    """Pass windows are runs with elevation >= min_elev; the sample at exactly min_elev is inside.

    Pass start/end/edge rules: decided 2026-11-07 (module docstring); 05 EarthLinkTable doc change pending.
    """
    min_elev = _link_values()["relay_min_elev_deg"]
    times = _times(CHECK_UTC, len(SYNTH_OFFSETS))
    elevs = [min_elev + d for d in SYNTH_OFFSETS]
    passes = _mod().derive_passes(times, elevs, min_elev)
    expected = [
        {
            "start_utc": times[a],
            "end_utc": times[b],
            "max_elev_deg": max(elevs[a : b + 1]),
        }
        for a, b in SYNTH_PASSES_IDX
    ]
    assert passes == expected


def test_derive_passes_uses_the_minimum_elevation_it_is_given():
    """Raising the threshold above the boundary samples shrinks the passes; none is hardcoded."""
    min_elev = _link_values()["relay_min_elev_deg"]
    times = _times(CHECK_UTC, len(SYNTH_OFFSETS))
    elevs = [min_elev + d for d in SYNTH_OFFSETS]
    mod = _mod()
    # Threshold half a degree higher: the two offset-0 samples (indices 2 and 6) drop out.
    higher = mod.derive_passes(times, elevs, min_elev + 0.5)
    assert [(p["start_utc"], p["end_utc"]) for p in higher] == [(times[3], times[5]), (times[10], times[10])]
    # Threshold above every sample: no pass. Threshold below every sample: one pass over everything.
    assert mod.derive_passes(times, elevs, max(elevs) + 1.0) == []
    whole = mod.derive_passes(times, elevs, min(elevs) - 1.0)
    assert [(p["start_utc"], p["end_utc"], p["max_elev_deg"]) for p in whole] == [(times[0], times[-1], max(elevs))]


def test_derive_passes_keeps_runs_touching_either_end_of_the_series():
    min_elev = _link_values()["relay_min_elev_deg"]
    times = _times(CHECK_UTC, 4)
    elevs = [min_elev + 1.0, min_elev + 2.0, min_elev - 1.0, min_elev + 3.0]
    passes = _mod().derive_passes(times, elevs, min_elev)
    assert [(p["start_utc"], p["end_utc"]) for p in passes] == [(times[0], times[1]), (times[3], times[3])]


def test_derive_passes_edge_inputs():
    mod = _mod()
    min_elev = _link_values()["relay_min_elev_deg"]
    assert mod.derive_passes([], [], min_elev) == []
    with pytest.raises(ValueError):
        mod.derive_passes(_times(CHECK_UTC, 3), [min_elev, min_elev], min_elev)


def test_assemble_table_passes_use_relay_min_elev_deg_from_link_paramset():
    """The table's passes follow the link ParamSet value; a different value gives different passes."""
    values = _link_values()
    min_elev = values["relay_min_elev_deg"]
    rows = _synthetic_rows(min_elev)
    mod = _mod()
    times = [r["t_utc"] for r in rows]

    table = mod.assemble_earth_link_table(rows, values, _kernels())
    assert [(p["orbiter"], p["start_utc"], p["end_utc"]) for p in table["passes"]] == [
        ("mro", times[a], times[b]) for a, b in SYNTH_PASSES_IDX
    ]
    assert {p["orbiter"] for p in table["passes"]} <= set(ORBITERS)

    stricter = dict(values, relay_min_elev_deg=min_elev + 0.5)
    table2 = mod.assemble_earth_link_table(rows, stricter, _kernels())
    assert [(p["start_utc"], p["end_utc"]) for p in table2["passes"]] == [(times[3], times[5]), (times[10], times[10])]


def test_assemble_table_passes_are_per_orbiter_and_sorted():
    """Each orbiter gets its own passes; the list is sorted by (start_utc, orbiter).

    Sort order: decided 2026-11-07 (module docstring); 05 EarthLinkTable doc change pending.
    """
    values = _link_values()
    min_elev = values["relay_min_elev_deg"]
    times = _times(CHECK_UTC, 6)
    above, below = min_elev + 5.0, min_elev - 5.0
    rows = [
        _row(times[0], mro=below, maven=above, tgo=below),
        _row(times[1], mro=above, maven=above, tgo=below),
        _row(times[2], mro=above, maven=below, tgo=below),
        _row(times[3], mro=below, maven=below, tgo=above),
        _row(times[4], mro=below, maven=below, tgo=above),
        _row(times[5], mro=below, maven=below, tgo=below),
    ]
    got = _mod().assemble_earth_link_table(rows, values, _kernels())["passes"]
    assert [(p["orbiter"], p["start_utc"], p["end_utc"]) for p in got] == [
        ("maven", times[0], times[1]),
        ("mro", times[1], times[2]),
        ("tgo", times[3], times[4]),
    ]
    assert all(p["max_elev_deg"] == above for p in got)


@pytest.mark.parametrize("offset", [-0.5, 0.0, 0.5])
def test_conjunction_blackout_uses_conjunction_deg_from_link_paramset(offset):
    """Blackout when the Sun-Earth-Mars angle is < conjunction_deg (strict: equal is not blackout)."""
    threshold = _link_values()["conjunction_deg"]
    # bool(): a numpy.bool_ result is acceptable; `is` would reject it.
    assert bool(_mod().is_conjunction_blackout(threshold + offset, threshold)) == (offset < 0)


def test_conjunction_blackout_follows_the_threshold_argument():
    mod = _mod()
    threshold = _link_values()["conjunction_deg"]
    between = threshold * 1.5  # (SYNTHETIC) above the file's threshold, below twice it
    assert not bool(mod.is_conjunction_blackout(between, threshold))
    assert bool(mod.is_conjunction_blackout(between, threshold * 2))
    assert bool(mod.is_conjunction_blackout(0.0, threshold))


def test_site_longitude_is_east_positive_not_west():
    """A site at 137.4 deg E has y > 0 in IAU_MARS (east-positive); it is not treated as west."""
    lat_deg, lon_east_deg = -4.8, 137.4  # test input: Gale-like site, given as degrees EAST
    radius_km = _mod_radius_km()
    x, y, z = _mod().site_position_km(lat_deg, lon_east_deg)
    lat, lon = math.radians(lat_deg), math.radians(lon_east_deg)
    assert (x, y, z) == pytest.approx(
        (
            radius_km * math.cos(lat) * math.cos(lon),
            radius_km * math.cos(lat) * math.sin(lon),
            radius_km * math.sin(lat),
        ),
        rel=1e-12,
    )
    assert y > 0 and x < 0  # 137.4 deg E lies in the second quadrant
    # If the longitude were read as west, the same site would be at 360 - 137.4 deg E: other side.
    xw, yw, _ = _mod().site_position_km(lat_deg, (360.0 - lon_east_deg) % 360.0)
    assert yw < 0 < y and xw == pytest.approx(x, rel=1e-12)
    assert math.sqrt(x * x + y * y + z * z) == pytest.approx(radius_km, rel=1e-12)


def _mod_radius_km() -> float:
    from marswalk_pipeline.config import MARS_RADIUS_M  # 02 §C.1, Confirmed

    return MARS_RADIUS_M / 1000.0


def test_site_position_matches_spiceypy_latrec_east_longitude():
    """Same vector as spiceypy.latrec, whose longitude is east-positive."""
    mod = _mod()
    spiceypy = _require_spiceypy()
    lat_deg, lon_east_deg = -4.8, 137.4
    expected = spiceypy.latrec(_mod_radius_km(), math.radians(lon_east_deg), math.radians(lat_deg))
    assert mod.site_position_km(lat_deg, lon_east_deg) == pytest.approx(tuple(expected), rel=1e-9)


# ---------------------------------------------------------------------------------------------
# Kernel-backed rules (skip when spiceypy or the kernel files are absent; never committed)
# ---------------------------------------------------------------------------------------------


def _find(kernel_dir: Path, pattern: str) -> list[Path]:
    return sorted(p for p in kernel_dir.rglob(pattern) if p.is_file())


KERNEL_PATTERNS = {
    "lsk": ("*.tls",),
    "pck": ("*.tpc",),
    "planets": ("de*.bsp",),
    "mro": ("mro*.bsp",),
    "maven": ("maven*.bsp",),
    "tgo": ("em16_tgo*.bsp", "*tgo*.bsp"),
}


def _kernel_files_by_role(kernel_dir: Path) -> dict[str, list[Path]]:
    return {
        role: sorted({f for pattern in patterns for f in _find(kernel_dir, pattern)})
        for role, patterns in KERNEL_PATTERNS.items()
    }


def _assert_kernel_manifest(table: dict, kernel_dir: Path, require_files: bool = False) -> None:
    """All six kernel roles, all discovered files, and verifiable provenance even without SPICE."""
    listed = {Path(k["file"]).name for k in table["kernels"]}
    for role, patterns in KERNEL_PATTERNS.items():
        assert any(Path(name).match(pattern) for name in listed for pattern in patterns), (
            f"kernel manifest is missing the {role} kernel"
        )
    expected = {f.name for files in _kernel_files_by_role(kernel_dir).values() for f in files}
    assert expected <= listed, f"kernel manifest is missing {sorted(expected - listed)}"
    for k in table["kernels"]:
        assert re.fullmatch(r"[0-9a-f]{64}", k["sha256"]), k["file"]
        assert isinstance(k["source_id"], str) and k["source_id"].strip(), k["file"]
        files = _find(kernel_dir, k["file"])
        if require_files:
            assert files, f"listed kernel {k['file']} is not in the kernel folder"
        for f in files:
            assert hashlib.sha256(f.read_bytes()).hexdigest() == k["sha256"], k["file"]


def _skip_or_fail(reason: str) -> None:
    """Skip, unless MARSWALK_REQUIRE_SPICE=1, in which case a missing prerequisite is a failure."""
    if os.environ.get(REQUIRE_SPICE_ENV) == "1":
        pytest.fail(f"{reason} ({REQUIRE_SPICE_ENV}=1 makes this a failure)", pytrace=False)
    pytest.skip(reason)


def _require_spiceypy():
    try:
        import spiceypy
    except ImportError:
        _skip_or_fail("spiceypy is not installed in this interpreter (environment.yml lists it; run make setup-pipeline)")
    return spiceypy


def _kernel_dir(need_orbiters: bool = False) -> Path:
    """Kernel folder for the kernel-backed tests; skip (or fail under MARSWALK_REQUIRE_SPICE=1) if absent."""
    _require_spiceypy()
    kernel_dir = Path(os.environ.get(SPICE_DIR_ENV) or DEFAULT_SPICE_DIR)
    files_by_role = _kernel_files_by_role(kernel_dir)
    missing = [
        role for role, files in files_by_role.items()
        if (need_orbiters or role not in ORBITERS) and not files
    ]
    if missing:
        _skip_or_fail(
            f"SPICE kernels not found under {kernel_dir} (missing {', '.join(missing)}); "
            f"set {SPICE_DIR_ENV} or download D12-D15 into pipeline/work/spice (docs/ops/data-downloads.md); "
            "kernels are never committed"
        )
    return kernel_dir


def _site_lat_lon_east() -> tuple[float, float]:
    """The project site (lat_0, lon_0 east) read from the working projection string, not typed."""
    from marswalk_pipeline.config import WORKING_PROJ

    lat = float(re.search(r"\+lat_0=(-?[\d.]+)", WORKING_PROJ).group(1))
    lon = float(re.search(r"\+lon_0=(-?[\d.]+)", WORKING_PROJ).group(1))
    return lat, lon


class _IndependentSpice:
    """spiceypy used directly, with a different correction setup from the implementation."""

    # NAIF ids of the orbiters (MRO -74, MAVEN -202, TGO -143): identifiers, not science values.
    NAIF_ID = {"mro": "-74", "maven": "-202", "tgo": "-143"}

    def __init__(self, kernel_dir: Path, with_orbiters: bool = False):
        import spiceypy

        self.sp = spiceypy
        self.kernel_dir = kernel_dir
        self.with_orbiters = with_orbiters

    def __enter__(self):
        self.sp.kclear()
        if self.with_orbiters:
            for f in sorted((self.kernel_dir / "generic").glob("mar*.bsp")):
                self.sp.furnsh(str(f.resolve()))  # resolved: CSPICE refuses paths over 255 characters, which a linked worktree exceeds
        for role, files in _kernel_files_by_role(self.kernel_dir).items():
            if self.with_orbiters or role not in ORBITERS:
                # Load every matching file: orbiter SPKs may split the scenario window.
                for f in files:
                    self.sp.furnsh(str(f.resolve()))  # resolved: CSPICE refuses paths over 255 characters, which a linked worktree exceeds
        return self

    def orbiter_elev_deg(self, orbiter: str, t_utc: str, lat_deg: float, lon_east_deg: float) -> float:
        """Orbiter elevation at the site, same up-vector method as `earth_elev_deg`."""
        et = self.et(t_utc)
        try:
            fixed, _ = self.sp.spkpos(self.NAIF_ID[orbiter], et, "IAU_MARS", "NONE", "MARS")
        except self.sp.SpiceyError as exc:
            pytest.fail(
                f"spiceypy cannot place {orbiter} relative to MARS (499) in IAU_MARS at {t_utc}: {exc}. "
                "Check the orbiter SPK coverage and the LSK/PCK for 02 L10.",
                pytrace=False,
            )
        lat, lon = math.radians(lat_deg), math.radians(lon_east_deg)
        up = (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))
        site = [_mod_radius_km() * c for c in up]
        to_orbiter = [e - s for e, s in zip(fixed, site)]
        norm = math.sqrt(sum(c * c for c in to_orbiter))
        return math.degrees(math.asin(sum(u * c for u, c in zip(up, to_orbiter)) / norm))

    def __exit__(self, *exc):
        self.sp.kclear()

    def et(self, t_utc: str) -> float:
        return self.sp.str2et(t_utc.replace("T", " ").replace("Z", " UTC"))

    def light_time_s(self, t_utc: str) -> float:
        _, lt = self.sp.spkpos("EARTH", self.et(t_utc), "J2000", "LT", "MARS BARYCENTER")
        return float(lt)

    def sep_angle_deg(self, t_utc: str) -> float:
        et = self.et(t_utc)
        sun, _ = self.sp.spkpos("SUN", et, "J2000", "NONE", "EARTH")
        mars, _ = self.sp.spkpos("MARS BARYCENTER", et, "J2000", "NONE", "EARTH")
        return math.degrees(self.sp.vsep(sun, mars))

    def earth_elev_deg(self, t_utc: str, lat_deg: float, lon_east_deg: float) -> float:
        et = self.et(t_utc)
        earth, _ = self.sp.spkpos("EARTH", et, "J2000", "NONE", "MARS BARYCENTER")
        earth_fixed = self.sp.mxv(self.sp.pxform("J2000", "IAU_MARS", et), earth)
        lat, lon = math.radians(lat_deg), math.radians(lon_east_deg)
        up = (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))
        site = [_mod_radius_km() * c for c in up]
        to_earth = [e - s for e, s in zip(earth_fixed, site)]
        norm = math.sqrt(sum(c * c for c in to_earth))
        return math.degrees(math.asin(sum(u * c for u, c in zip(up, to_earth)) / norm))


def _prepare(need_orbiters: bool = False):
    """(module, kernel dir) with an empty kernel pool. `_mod()` comes first so the test is red before
    T21.04 even where kernels are absent; then the skip (or failure under MARSWALK_REQUIRE_SPICE=1)."""
    mod = _mod()
    kernel_dir = _kernel_dir(need_orbiters)
    _require_spiceypy().kclear()  # the module must load its own kernels
    return mod, kernel_dir


def test_light_time_matches_independent_spiceypy_within_1_s():
    """02 §D.12 validation: light time for the scenario date within 1 s of a spiceypy spot check."""
    mod, kernel_dir = _prepare()
    got = mod.light_time_s(CHECK_UTC, kernel_dir)
    with _IndependentSpice(kernel_dir) as ref:
        expected = ref.light_time_s(CHECK_UTC)
    assert abs(got - expected) <= LIGHT_TIME_TOL_S


def test_sun_earth_mars_angle_matches_independent_spiceypy():
    mod, kernel_dir = _prepare()
    got = mod.sun_earth_mars_angle_deg(CHECK_UTC, kernel_dir)
    with _IndependentSpice(kernel_dir) as ref:
        expected = ref.sep_angle_deg(CHECK_UTC)
    assert got == pytest.approx(expected, abs=ANGLE_TOL_DEG)


def test_earth_elevation_matches_independent_spiceypy_with_east_positive_longitude():
    """Earth elevation at the site, east-positive; a west-read longitude would give another elevation."""
    mod, kernel_dir = _prepare()
    lat, lon_east = _site_lat_lon_east()
    got = mod.earth_elevation_deg(CHECK_UTC, lat, lon_east, kernel_dir)
    with _IndependentSpice(kernel_dir) as ref:
        expected = ref.earth_elev_deg(CHECK_UTC, lat, lon_east)
        wrong = ref.earth_elev_deg(CHECK_UTC, lat, (360.0 - lon_east) % 360.0)
    assert got == pytest.approx(expected, abs=ANGLE_TOL_DEG)
    assert abs(got - wrong) > ANGLE_TOL_DEG  # the check can tell east from west at this epoch


def test_mars_centre_light_time_difference_rejects_a_bad_window_before_any_kernel_is_read():
    """BD-24: the measured difference needs an ordered window and a positive step; checked first, so no kernel is needed."""
    mod = _mod()
    nowhere = Path("/nonexistent-kernel-folder")
    later = _fmt(_parse(CHECK_UTC) + timedelta(hours=1))
    with pytest.raises(ValueError):
        mod.mars_centre_light_time_difference_s(later, CHECK_UTC, nowhere)
    for step in (0, -60):
        with pytest.raises(ValueError):
            mod.mars_centre_light_time_difference_s(CHECK_UTC, later, nowhere, step_s=step)
    with pytest.raises(ValueError):
        mod.mars_centre_light_time_difference_s("2024-05-20 12:00", later, nowhere)


def test_barycentre_versus_body_centre_light_time_difference_matches_independent_spiceypy():
    """BD-24: the largest |light time to the Mars barycentre - light time to the Mars body centre| over a window, in seconds,
    equals what spiceypy gives for the same epochs, and is far inside the 1 s of FR-43 (02 §D.12)."""
    mod, kernel_dir = _prepare()
    step = 3600
    end = _fmt(_parse(CHECK_UTC) + timedelta(hours=6))
    got = mod.mars_centre_light_time_difference_s(CHECK_UTC, end, kernel_dir, step_s=step)
    with _IndependentSpice(kernel_dir) as ref:
        for f in sorted(kernel_dir.rglob("mar099s.bsp")):
            ref.sp.furnsh(str(f.resolve()))
        expected = max(
            abs(ref.sp.spkpos("EARTH", ref.et(t), "J2000", "LT", "MARS BARYCENTER")[1]
                - ref.sp.spkpos("EARTH", ref.et(t), "J2000", "LT", "MARS")[1])
            for t in _mod().time_grid(CHECK_UTC, end, step)
        )
    assert got > 0.0  # a real, non-zero offset (about 0.2 m of range)
    assert got == pytest.approx(expected, rel=1e-6, abs=1e-13)
    assert 0.0 <= got < LIGHT_TIME_TOL_S


def test_kernel_lock_records_the_measured_barycentre_difference_and_the_predicted_tgo_span():
    """BD-24: kernels.lock.json holds the measured light-time difference (inside FR-43's 1 s) and says TGO's early span is predicted."""
    lock = json.loads((REPO_ROOT / "pipeline" / "spice" / "kernels.lock.json").read_text(encoding="utf-8"))
    diff = lock["mars_centre_light_time_difference"]
    assert isinstance(diff["max_s"], float) and 0.0 < diff["max_s"] < LIGHT_TIME_TOL_S
    assert diff["step_s"] == STEP_S
    assert diff["window_utc"] == f"{lock['window_utc']['start']} to {lock['window_utc']['stop']}"
    assert "treated as predicted" in lock["orbiter_summary"]["tgo"]["data_kind"]
    tgo_early = next(k for k in lock["kernels"] if k["file"].startswith("em16_tgo_fsp_335"))
    assert "treated as predicted" in tgo_early["notes"]


N_BUILT_ROWS = 4  # rows built from the real kernels in the end-to-end tests


def _build_real_table(mod, kernel_dir: Path, n_rows: int = N_BUILT_ROWS) -> tuple[dict, tuple[float, float]]:
    end = _fmt(_parse(CHECK_UTC) + timedelta(seconds=STEP_S * (n_rows - 1)))
    lat, lon_east = _site_lat_lon_east()
    return mod.build_earth_link_table(CHECK_UTC, end, lat, lon_east, kernel_dir, _link_values()), (lat, lon_east)


def test_built_table_has_60_s_rows_and_elevations_within_bounds():
    """Row step and bounds of a table built from the real kernels (needs all orbiter SPKs)."""
    mod, kernel_dir = _prepare(need_orbiters=True)
    table, _ = _build_real_table(mod, kernel_dir)
    _assert_row_step(table)
    assert [r["t_utc"] for r in table["rows"]] == _times(CHECK_UTC, N_BUILT_ROWS)
    assert table["provenance"] == "derived"
    _assert_time_strings_and_elevation_bounds(table)  # every elevation within [-90, 90] degrees


def test_built_table_rows_match_independent_spiceypy_including_orbiter_elevations():
    """Light time, Earth elevation and each orbiter's elevation per row vs. spiceypy called directly."""
    mod, kernel_dir = _prepare(need_orbiters=True)
    table, (lat, lon_east) = _build_real_table(mod, kernel_dir)
    with _IndependentSpice(kernel_dir, with_orbiters=True) as ref:
        for r in table["rows"]:
            t = r["t_utc"]
            assert abs(r["light_time_s"] - ref.light_time_s(t)) <= LIGHT_TIME_TOL_S
            assert r["sep_angle_deg"] == pytest.approx(ref.sep_angle_deg(t), abs=ANGLE_TOL_DEG)
            assert r["earth_elev_deg"] == pytest.approx(ref.earth_elev_deg(t, lat, lon_east), abs=ANGLE_TOL_DEG)
            for orbiter in ORBITERS:
                assert r["orbiters"][orbiter] == pytest.approx(
                    ref.orbiter_elev_deg(orbiter, t, lat, lon_east), abs=ANGLE_TOL_DEG
                ), f"{orbiter} at {t}"


def test_built_table_kernels_are_listed_with_matching_sha256():
    mod, kernel_dir = _prepare(need_orbiters=True)
    table, _ = _build_real_table(mod, kernel_dir)
    _assert_kernel_manifest(table, kernel_dir, require_files=True)


def test_built_table_validates_against_schema():
    mod, kernel_dir = _prepare(need_orbiters=True)
    table, _ = _build_real_table(mod, kernel_dir)
    _assert_valid_against_schema(table)


def test_built_table_is_deterministic():
    """NFR-06 spirit: building the same window twice gives the same table."""
    mod, kernel_dir = _prepare(need_orbiters=True)
    start = CHECK_UTC
    end = _fmt(_parse(start) + timedelta(seconds=STEP_S * 2))
    lat, lon_east = _site_lat_lon_east()
    first = mod.build_earth_link_table(start, end, lat, lon_east, kernel_dir, _link_values())
    second = mod.build_earth_link_table(start, end, lat, lon_east, kernel_dir, _link_values())
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


# ---------------------------------------------------------------------------------------------
# Committed table (scenarios/storm-sol4190/earth_link.json), once T21.04 has written it
# ---------------------------------------------------------------------------------------------


def _committed_table() -> dict:
    path = SCENARIO_DIR / "earth_link.json"
    if not path.is_file():
        pytest.skip(f"{path.relative_to(REPO_ROOT)} does not exist yet (written by T21.04)")
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_earth_link_has_strict_time_order_60_s_step_and_bounds():
    table = _committed_table()
    assert table["rows"], "an empty table"
    stamps = [_parse(r["t_utc"]) for r in table["rows"]]
    assert all(a < b for a, b in zip(stamps, stamps[1:]))  # strictly increasing
    _assert_row_step(table)
    _assert_time_strings_and_elevation_bounds(table)
    assert table["provenance"] == "derived"


def test_committed_earth_link_passes_follow_the_link_paramset():
    """Recomputing the passes from the committed rows with relay_min_elev_deg reproduces them."""
    table = _committed_table()
    mod = _mod()
    again = mod.assemble_earth_link_table(table["rows"], _link_values(), table["kernels"])
    assert table["passes"] == again["passes"]


def test_committed_earth_link_validates_against_schema():
    table = _committed_table()
    _assert_valid_against_schema(table)


def test_committed_earth_link_kernels_are_listed_with_matching_sha256():
    table = _committed_table()
    kernel_dir = Path(os.environ.get(SPICE_DIR_ENV) or DEFAULT_SPICE_DIR)
    _assert_kernel_manifest(table, kernel_dir)


def test_committed_earth_link_sha256_matches_scenario_json():
    path = SCENARIO_DIR / "earth_link.json"
    scenario = SCENARIO_DIR / "scenario.json"
    if not path.is_file():
        pytest.skip(f"{path.relative_to(REPO_ROOT)} does not exist yet (written by T21.04)")
    if not scenario.is_file():
        pytest.skip(f"{scenario.relative_to(REPO_ROOT)} does not exist yet (assembled by T21.08)")
    entry = json.loads(scenario.read_text(encoding="utf-8"))["tables"]["earth_link"]
    target = (scenario.parent / entry["path"]).resolve()
    assert target == path.resolve()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]
