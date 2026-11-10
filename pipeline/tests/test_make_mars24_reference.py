"""F6 generator: sunrise/sunset selection inside the local sol (T06.02 / T06.07 repair, 2026-11-10).

`marstime` is not pinned in the pipeline environment (TODO(verify) in docs/tasks/TASK-06), so this test
loads the generator with a small synthetic stand-in for `marstime`: a flat-horizon sun that rises at
LTST 06:00 and sets at LTST 18:00. It checks only the selection logic. It does not check any Mars24
number, and it does not regenerate F6. Tests never touch the network.
"""
from __future__ import annotations

import importlib.util
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

GENERATOR = Path(__file__).resolve().parent / "fixtures" / "make_mars24_reference.py"
SOL_DAYS = 1.027491252  # Earth days per sol; same constant as packages/compute/src/mars24.ts
EPOCH = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)  # J2000 reference for the stub only
LTST_AT_EPOCH_H = 3.0  # arbitrary phase of the stub clock


def _stub_marstime() -> types.ModuleType:
    """Synthetic clock: LTST advances 24 h per sol; elevation = 60 deg * cos(hour angle)."""
    import math

    m = types.ModuleType("marstime")
    m.julian = lambda ms: ms / 86_400_000.0 + 2440587.5
    m.julian_tt = lambda jd: jd
    m.j2000_offset_tt = lambda jd: jd - 2451545.0

    def ltst(lon_w: float, ott: float) -> float:
        return (LTST_AT_EPOCH_H + 24.0 * ott / SOL_DAYS) % 24.0

    m.Local_True_Solar_Time = ltst
    m.solar_elevation = lambda lon_w, lat, ott: 60.0 * math.cos(math.radians(15.0 * (ltst(lon_w, ott) - 12.0)))
    return m


@pytest.fixture(scope="module")
def gen():
    sys.modules["marstime"] = _stub_marstime()
    spec = importlib.util.spec_from_file_location("make_mars24_reference_under_test", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    yield module
    sys.modules.pop("marstime", None)


def _at_ltst(day_offset_sols: int, ltst_h: float) -> datetime:
    """Instant at which the stub clock reads `ltst_h` during stub sol number `day_offset_sols`."""
    sols = (ltst_h - LTST_AT_EPOCH_H) / 24.0 + day_offset_sols
    return EPOCH + timedelta(days=sols * SOL_DAYS)


@pytest.mark.parametrize(
    "ltst_h",
    [0.5, 5.9, 12.0, 17.9, 18.1, 21.0, 23.5],
    ids=["after-midnight", "before-dawn", "noon", "before-sunset", "after-sunset", "evening", "late-evening"],
)
def test_events_are_the_local_sols_own_for_every_probe(gen, ltst_h):
    probe = _at_ltst(10, ltst_h)
    ev = gen.find_sol_sunrise_sunset(probe, -4.7, 222.62)
    rise = datetime.strptime(ev["sunrise_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    sset = datetime.strptime(ev["sunset_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    assert abs((rise - _at_ltst(10, 6.0)).total_seconds()) <= 2
    assert abs((sset - _at_ltst(10, 18.0)).total_seconds()) <= 2
    assert rise < sset


def test_next_local_sol_after_midnight_gives_the_next_events(gen):
    before = gen.find_sol_sunrise_sunset(_at_ltst(10, 23.9), -4.7, 222.62)
    after = gen.find_sol_sunrise_sunset(_at_ltst(11, 0.1), -4.7, 222.62)
    assert before["sunrise_utc"] != after["sunrise_utc"]
    r0 = datetime.strptime(before["sunrise_utc"], "%Y-%m-%dT%H:%M:%SZ")
    r1 = datetime.strptime(after["sunrise_utc"], "%Y-%m-%dT%H:%M:%SZ")
    assert abs((r1 - r0).total_seconds() - SOL_DAYS * 86400.0) <= 2


def test_no_crossing_in_the_sol_is_an_error_not_a_fallback(gen):
    with pytest.raises(ValueError):
        gen.select_sol_events([], datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2026, 1, 2, tzinfo=timezone.utc))
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    # Only a sunrise inside the sol; the sunset belongs to the next sol and must not be borrowed.
    crossings = [(t0 + timedelta(hours=6), "sunrise"), (t0 + timedelta(hours=30), "sunset")]
    with pytest.raises(ValueError):
        gen.select_sol_events(crossings, t0, t0 + timedelta(hours=24.66))
