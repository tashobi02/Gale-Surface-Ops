"""RAD dose series: docs/specs/02 §C.5 L9, §D.13, §F.2; 05 DoseSeries, §E.7 (FR-37, FR-38). TASK-21, T21.03.

Interface these tests define for T21.07 (`marswalk_pipeline/rad.py`). Times are ISO-8601 UTC strings
`YYYY-MM-DDTHH:MM:SSZ`; they are kept exactly as given.

    step_hold_integral_ugy(samples, window=None) -> float
        `samples`: [[t_utc, rate_ugy_per_h or None], ...], sorted. The integral is a STEP-HOLD sum,
        the same reading as the Hab Core (05 §E.7: "step-hold between samples (no interpolation across
        null gaps)"): each sample's rate holds until the next sample,
            sum over i of rate_i * (t_{i+1} - t_i in hours),   rate_i = None counts as 0 (no data),
        and the last sample adds nothing (nothing after it is known). Result in uGy.
        Endpoint convention (BD-25): left-closed [t_i, t_{i+1}), the same as compute `rateAt`; "the last
        sample adds nothing" is the integral's rule, and the boundary tests at the end of this file and
        `packages/compute/tests/rateAtBoundary.test.ts` feed both languages the same instants.
        `window=(t0_utc, t1_utc)` clips every interval to [t0, t1]; time before the first sample or
        after the last adds nothing. No background is subtracted (the U-45 archive comparison uses
        gross integrals, as recorded in docs/ops/rad-series.md).

    build_dose_series(samples, *, series_id, source_id, background_rate_ugy_per_h, expected_ugy,
                      input_unit, integral_window=None) -> dict
        `samples`: iterable of (t_utc, rate) in any order; rate is a number in `input_unit` or None /
        NaN for a gap. `input_unit` is KEYWORD-ONLY with NO default, so a unit is never assumed:
        omitting it is a TypeError. "uGy/day" (the Zenodo E-detector file, data-downloads D8: "dose
        rate in uGy per day"; converted by dividing by 24 hours per day, a unit identity) or "uGy/h"
        (kept). Anything else: ValueError. `background_rate_ugy_per_h` is already in uGy/h.
        The input `samples` object and its items are not modified.
        Returns a 05 DoseSeries:
            series_id, quantity "surface absorbed dose rate", unit "uGy/h", samples [[t_utc, rate]]
            sorted strictly increasing in time with gaps as None (JSON null; not interpolated, not
            zero, none dropped or added), background_rate, method "archive", provenance "replayed",
            source_id, integral_check {expected_ugy, computed_ugy}.
        `expected_ugy` is the independent reference passed in (never computed from the samples);
        `computed_ugy` = step_hold_integral_ugy(output samples, integral_window).
        ValueError: no samples, a repeated timestamp, an unsupported unit. TypeError or ValueError: a
        non-numeric rate, a missing `expected_ugy`.

    write_dose_series(series, path) -> str
        Writes the series as UTF-8 JSON (no NaN) and returns the SHA-256 (lowercase hex) of the exact
        bytes written, which is what scenario.json `tables.dose_series.sha256` holds (scenario README,
        "Hashes written from Python"). Same input, same bytes.

Committed table. The `committed_*` tests require `scenarios/storm-sol4190/dose_series.json` and check
its order, null gaps, schema and integral. The SHA-256 check waits for T21.08's `scenario.json`.
The optional raw-file reproduction test skips explicitly if D8, SPDF or cdflib is absent.

Expected values come from the inputs and arithmetic identities. Rates, times, totals and ids below are
SYNTHETIC (invented to exercise the rules); the 8,100 uGy published total is deliberately not used.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import re
import subprocess
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DOSE_SCHEMA = REPO_ROOT / "schemas" / "dose-series.schema.json"

PER_DAY, PER_H = "uGy/day", "uGy/h"  # the two input units build_dose_series accepts
HOURS_PER_DAY = 24  # unit identity for the uGy/day -> uGy/h conversion (data-downloads D8)
ISO_FMT = "%Y-%m-%dT%H:%M:%SZ"
T0 = "2024-05-20T00:00:00Z"
SERIES_ID = "synthetic-series"
SOURCE_ID = "synthetic-rad-source"
BACKGROUND = 7.5  # SYNTHETIC background rate, uGy/h
PUBLISHED_TOTAL = 123456.0  # SYNTHETIC "published total", deliberately unlike any computed value


def _mod():
    from marswalk_pipeline import rad  # deferred: module is written by T21.07

    return rad


def _t(offset_min: float) -> str:
    base = datetime.strptime(T0, ISO_FMT).replace(tzinfo=timezone.utc)
    return (base + timedelta(minutes=offset_min)).strftime(ISO_FMT)


def _build(samples, *, input_unit, **overrides):
    """`input_unit` has no default here either: build_dose_series takes it keyword-only, no default."""
    kwargs = dict(
        input_unit=input_unit,
        series_id=SERIES_ID,
        source_id=SOURCE_ID,
        background_rate_ugy_per_h=BACKGROUND,
        expected_ugy=PUBLISHED_TOTAL,
    )
    kwargs.update(overrides)
    return _mod().build_dose_series(samples, **kwargs)


# SYNTHETIC uGy/h series on an uneven grid: 60 min, 30 min, 120 min between samples.
UNEVEN_H = [(_t(0), 100.0), (_t(60), 300.0), (_t(90), 50.0), (_t(210), 10.0)]
UNEVEN_STEP_HOLD = 100.0 * 1.0 + 300.0 * 0.5 + 50.0 * 2.0  # rate_i x hours to the next sample
UNEVEN_TRAPEZOID = (100.0 + 300.0) / 2 * 1.0 + (300.0 + 50.0) / 2 * 0.5 + (50.0 + 10.0) / 2 * 2.0


# ---------------------------------------------------------------------------------------------
# Unit conversion and ordering
# ---------------------------------------------------------------------------------------------


def test_ugy_per_day_input_is_divided_by_24_to_ugy_per_h():
    per_day = [(_t(0), 240.0), (_t(60), 100.0), (_t(120), 0.0), (_t(180), 7.0)]  # SYNTHETIC uGy/day
    series = _build(per_day, input_unit=PER_DAY)
    assert series["unit"] == "uGy/h"
    assert [s[0] for s in series["samples"]] == [t for t, _ in per_day]
    assert [s[1] for s in series["samples"]] == pytest.approx([v / HOURS_PER_DAY for _, v in per_day], rel=1e-12)
    assert series["samples"][2][1] == 0.0  # a measured zero stays zero; it is not a gap


def test_ugy_per_h_input_is_kept_and_other_units_are_refused():
    series = _build(UNEVEN_H, input_unit="uGy/h")
    assert series["samples"] == [[t, v] for t, v in UNEVEN_H]
    with pytest.raises(ValueError):
        _build(UNEVEN_H, input_unit="mGy/day")
    with pytest.raises(ValueError):
        _build(UNEVEN_H, input_unit="Sv/h")  # 02 L9: never Sv for the event


def test_samples_come_out_sorted_strictly_increasing_with_values_following_their_times():
    shuffled = [UNEVEN_H[2], UNEVEN_H[0], UNEVEN_H[3], UNEVEN_H[1]]
    series = _build(shuffled, input_unit="uGy/h")
    assert series["samples"] == [[t, v] for t, v in UNEVEN_H]
    stamps = [datetime.strptime(s[0], ISO_FMT) for s in series["samples"]]
    assert all(a < b for a, b in zip(stamps, stamps[1:]))


def test_a_repeated_timestamp_is_refused():
    dup = UNEVEN_H + [(UNEVEN_H[1][0], 1.0)]
    with pytest.raises(ValueError):
        _build(dup, input_unit="uGy/h")


# ---------------------------------------------------------------------------------------------
# Gaps
# ---------------------------------------------------------------------------------------------


def test_gaps_stay_null_and_are_neither_interpolated_nor_zero_nor_dropped():
    raw = [(_t(0), 48.0), (_t(60), None), (_t(120), float("nan")), (_t(180), 96.0), (_t(240), 0.0)]  # SYNTHETIC
    series = _build(raw, input_unit=PER_DAY)
    assert len(series["samples"]) == len(raw)  # no sample added or removed
    assert [s[0] for s in series["samples"]] == [t for t, _ in raw]
    rates = [s[1] for s in series["samples"]]
    assert rates[1] is None and rates[2] is None  # null, not 0.0 and not a value between the neighbours
    assert rates[0] == pytest.approx(48.0 / HOURS_PER_DAY) and rates[3] == pytest.approx(96.0 / HOURS_PER_DAY)
    assert rates[4] == 0.0
    json.dumps(series, allow_nan=False)  # NaN must not reach the file


def test_a_gap_adds_nothing_to_the_step_hold_integral():
    samples = [[_t(0), 100.0], [_t(60), None], [_t(120), 40.0], [_t(180), 40.0]]  # SYNTHETIC uGy/h
    # interval 0-60 min holds 100; 60-120 min is the gap and holds nothing; 120-180 min holds 40.
    expected = 100.0 * 1.0 + 0.0 * 1.0 + 40.0 * 1.0
    assert _mod().step_hold_integral_ugy(samples) == pytest.approx(expected, rel=1e-12)


# ---------------------------------------------------------------------------------------------
# integral_check
# ---------------------------------------------------------------------------------------------


def test_step_hold_integral_matches_hand_calculation_for_a_3_step_series():
    """02 §F.2: dose integral matches hand calculation for a 3-step series (uneven steps)."""
    got = _mod().step_hold_integral_ugy([list(s) for s in UNEVEN_H])
    assert got == pytest.approx(UNEVEN_STEP_HOLD, rel=1e-12)
    assert abs(got - UNEVEN_TRAPEZOID) > 1.0  # it is the step-hold reading, not the trapezoid one


def test_step_hold_integral_last_sample_and_single_sample_add_nothing():
    mod = _mod()
    assert mod.step_hold_integral_ugy([[_t(0), 500.0]]) == 0.0
    two = [[_t(0), 10.0], [_t(30), 9999.0]]
    assert mod.step_hold_integral_ugy(two) == pytest.approx(10.0 * 0.5, rel=1e-12)


def test_step_hold_integral_window_clips_intervals():
    samples = [list(s) for s in UNEVEN_H]
    # Window 30..100 min: 30 min of 100 (30-60), 30 min of 300 (60-90), 10 min of 50 (90-100).
    got = _mod().step_hold_integral_ugy(samples, window=(_t(30), _t(100)))
    assert got == pytest.approx(100.0 * 0.5 + 300.0 * 0.5 + 50.0 * (10.0 / 60.0), rel=1e-12)
    # A window entirely outside the samples holds nothing.
    assert _mod().step_hold_integral_ugy(samples, window=(_t(-120), _t(-60))) == 0.0
    assert _mod().step_hold_integral_ugy(samples, window=(_t(300), _t(360))) == 0.0


def test_integral_check_is_filled_expected_from_argument_computed_from_samples():
    series = _build(UNEVEN_H, input_unit=PER_H)
    check = series["integral_check"]
    assert set(check) == {"expected_ugy", "computed_ugy"}
    assert check["expected_ugy"] == PUBLISHED_TOTAL  # taken from the input, not computed
    assert check["computed_ugy"] == pytest.approx(UNEVEN_STEP_HOLD, rel=1e-12)
    # Changing only the published total moves `expected_ugy` and leaves `computed_ugy` alone: neither is
    # derived from the other, and a difference between them is reported, never forced to zero.
    other = _build(UNEVEN_H, input_unit=PER_H, expected_ugy=PUBLISHED_TOTAL * 2)["integral_check"]
    assert other["expected_ugy"] == PUBLISHED_TOTAL * 2
    assert other["computed_ugy"] == check["computed_ugy"]


def test_computed_integral_uses_the_converted_ugy_per_h_samples():
    per_day = [(t, v * HOURS_PER_DAY) for t, v in UNEVEN_H]  # same series expressed in uGy/day
    check = _build(per_day, input_unit=PER_DAY)["integral_check"]
    assert check["computed_ugy"] == pytest.approx(UNEVEN_STEP_HOLD, rel=1e-12)


def test_integral_window_argument_limits_the_computed_integral():
    series = _build(UNEVEN_H, input_unit="uGy/h", integral_window=(_t(60), _t(90)))
    assert series["integral_check"]["computed_ugy"] == pytest.approx(300.0 * 0.5, rel=1e-12)


def test_expected_total_is_required():
    with pytest.raises((TypeError, ValueError)):
        _build(UNEVEN_H, input_unit="uGy/h", expected_ugy=None)


def test_input_unit_is_keyword_only_with_no_default():
    """A unit is never assumed: leaving it out, or passing it positionally, is a TypeError."""
    mod = _mod()
    common = dict(series_id=SERIES_ID, source_id=SOURCE_ID, background_rate_ugy_per_h=BACKGROUND, expected_ugy=PUBLISHED_TOTAL)
    with pytest.raises(TypeError):
        mod.build_dose_series(UNEVEN_H, **common)  # no input_unit
    with pytest.raises(TypeError):
        mod.build_dose_series(UNEVEN_H, PER_H, **common)  # positional


def test_building_does_not_modify_the_input_samples():
    for unit, rows in ((PER_H, UNEVEN_H), (PER_DAY, [(t, v * HOURS_PER_DAY) for t, v in UNEVEN_H])):
        shuffled = [rows[2], rows[0], rows[3], rows[1], (_t(300), None)]  # unsorted, with a gap
        as_lists = [list(r) for r in shuffled]
        before_tuples, before_lists = list(shuffled), [list(r) for r in as_lists]
        _build(shuffled, input_unit=unit)
        _build(as_lists, input_unit=unit)
        assert shuffled == before_tuples  # not sorted in place
        assert as_lists == before_lists  # items not rewritten in place either


def test_step_hold_integral_does_not_modify_its_input():
    samples = [[t, v] for t, v in UNEVEN_H] + [[_t(300), None]]
    before = [list(s) for s in samples]
    _mod().step_hold_integral_ugy(samples, window=(_t(30), _t(100)))
    assert samples == before


# ---------------------------------------------------------------------------------------------
# Output shape
# ---------------------------------------------------------------------------------------------


def test_series_carries_method_archive_provenance_replayed_and_the_given_ids():
    series = _build(UNEVEN_H, input_unit="uGy/h")
    assert series["method"] == "archive"
    assert series["provenance"] == "replayed"
    assert series["quantity"] == "surface absorbed dose rate"
    assert series["series_id"] == SERIES_ID
    assert series["source_id"] == SOURCE_ID
    assert series["background_rate"] == BACKGROUND
    assert set(series) == {
        "series_id", "quantity", "unit", "samples", "background_rate",
        "method", "provenance", "source_id", "integral_check",
    }


def _assert_valid_against_schema(series: dict) -> None:
    """Validate against the schema using the pipeline environment's jsonschema."""
    import jsonschema

    cls = jsonschema.Draft202012Validator
    cls(json.loads(DOSE_SCHEMA.read_text()), format_checker=cls.FORMAT_CHECKER).validate(series)


def test_series_validates_against_dose_series_schema():
    raw = [(_t(0), 48.0), (_t(60), None), (_t(120), 96.0)]  # includes a gap
    series = _build(raw, input_unit=PER_DAY)  # red before T21.07
    assert series["samples"][1][1] is None
    _assert_valid_against_schema(series)


def test_empty_and_non_numeric_inputs_are_refused():
    with pytest.raises(ValueError):
        _build([], input_unit=PER_DAY)
    with pytest.raises((TypeError, ValueError)):
        _build([(_t(0), "high"), (_t(60), 1.0)], input_unit=PER_DAY)


def test_large_series_of_10k_samples_sorts_and_integrates():
    """About 88 samples per sol over ~114 sols is ~10k samples; order and total must still be exact."""
    n = 10_000
    rng = random.Random(4190)  # fixed seed: deterministic SYNTHETIC rates
    base = datetime.strptime(T0, ISO_FMT).replace(tzinfo=timezone.utc)
    step_min = 17
    rates = [rng.uniform(0.0, 500.0) for _ in range(n)]
    samples = [((base + timedelta(minutes=step_min * i)).strftime(ISO_FMT), r) for i, r in enumerate(rates)]
    shuffled = samples[:]
    rng.shuffle(shuffled)
    series = _build(shuffled, input_unit="uGy/h")
    assert series["samples"] == [[t, r] for t, r in samples]
    expected = math.fsum(r * (step_min / 60.0) for r in rates[:-1])
    assert series["integral_check"]["computed_ugy"] == pytest.approx(expected, rel=1e-9)


def test_special_characters_in_ids_survive():
    series = _build(UNEVEN_H, input_unit="uGy/h", series_id="rad-é-火星", source_id='src "q"')
    assert series["series_id"] == "rad-é-火星" and series["source_id"] == 'src "q"'


# ---------------------------------------------------------------------------------------------
# File output
# ---------------------------------------------------------------------------------------------


def test_write_dose_series_returns_sha256_of_the_exact_bytes_and_is_deterministic(tmp_path: Path):
    mod = _mod()
    series = _build([(_t(0), 48.0), (_t(60), None), (_t(120), 96.0)], input_unit=PER_DAY)
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    sha_a = mod.write_dose_series(series, a)
    sha_b = mod.write_dose_series(series, b)
    assert sha_a == hashlib.sha256(a.read_bytes()).hexdigest()
    assert sha_a == sha_b and a.read_bytes() == b.read_bytes()
    assert json.loads(a.read_text(encoding="utf-8")) == series  # null gap survives the round trip


def test_written_fractional_rates_integrate_to_the_stored_computed_total_exactly(tmp_path: Path):
    mod = _mod()
    # SYNTHETIC fractional uGy/day rates exercise conversion and JSON float precision.
    series = _build([(_t(0), 1 / 3), (_t(1440), 0.001), (_t(2880), 0.0)], input_unit=PER_DAY)
    path = tmp_path / "fractional.json"
    mod.write_dose_series(series, path)
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert mod.step_hold_integral_ugy(saved["samples"]) == saved["integral_check"]["computed_ugy"]


# ---------------------------------------------------------------------------------------------
# Committed table (scenarios/storm-sol4190/dose_series.json), once T21.07 (or T21.13) has written it
# ---------------------------------------------------------------------------------------------

SCENARIO_DIR = REPO_ROOT / "scenarios" / "storm-sol4190"
T_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _committed_series() -> dict:
    path = SCENARIO_DIR / "dose_series.json"
    assert path.is_file(), f"missing {path.relative_to(REPO_ROOT)}"
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_dose_series_has_strict_time_order_and_null_gaps():
    series = _committed_series()
    samples = series["samples"]
    assert samples, "an empty series"
    assert all(T_UTC_RE.match(s[0]) for s in samples)
    stamps = [datetime.strptime(s[0], ISO_FMT) for s in samples]
    assert all(a < b for a, b in zip(stamps, stamps[1:]))  # strictly increasing
    assert all(s[1] is None or (isinstance(s[1], (int, float)) and math.isfinite(s[1]) and s[1] >= 0) for s in samples)
    assert series["unit"] == "uGy/h" and series["provenance"] == "replayed"
    check = series["integral_check"]
    assert math.isfinite(check["expected_ugy"]) and math.isfinite(check["computed_ugy"])


def test_committed_dose_series_validates_against_schema():
    _assert_valid_against_schema(_committed_series())


def test_committed_dose_series_integral_matches_saved_step_hold_samples():
    series = _committed_series()
    rows = series["samples"]
    independent_total = math.fsum(
        rate * (datetime.strptime(next_time, ISO_FMT) - datetime.strptime(time, ISO_FMT)).total_seconds() / 3600
        for (time, rate), (next_time, _) in zip(rows, rows[1:]) if rate is not None
    )
    assert series["integral_check"]["computed_ugy"] == pytest.approx(independent_total, rel=1e-14)


def test_zenodo_reader_uses_original_e_column_preserves_gap_and_truncates_timestamp(tmp_path):
    # Synthetic values: six fields despite the five-field product header.
    path = tmp_path / "d8.txt"
    path.write_text(
        "Datetime\tDoy\tSol\tDoseE [micro Gray per day]\tDoseE_filtered [micro Gray per day]\n"
        "2024-05-20 00:00:00.987654\t2024\t141\t4190.0\t48\t900\n"
        "2024-05-20 00:17:00.123456\t2024\t141\t4190.1\tnan\t901\n",
        encoding="utf-8",
    )
    assert _mod().read_product(path, "zenodo-d8") == [
        ("2024-05-20T00:00:00Z", 4190.0, 48.0),
        ("2024-05-20T00:17:00Z", 4190.1, None),
    ]


def test_zenodo_reader_rejects_unexpected_row_layout(tmp_path):
    path = tmp_path / "d8.txt"
    path.write_text("Datetime\tDoseE [micro Gray per day]\n2024-05-20 00:00:00\t4190\t48\n")
    with pytest.raises(ValueError, match="six"):
        _mod().read_product(path, "zenodo-d8")


def test_zenodo_reader_rejects_out_of_order_or_duplicate_times(tmp_path):
    path = tmp_path / "d8.txt"
    path.write_text(
        "Datetime\tDoy\tSol\tDoseE [micro Gray per day]\tDoseE_filtered [micro Gray per day]\n"
        "2024-05-20 00:17:00\t2024\t141\t4190.1\t48\t900\n"
        "2024-05-20 00:00:00\t2024\t141\t4190.0\t48\t900\n"
    )
    with pytest.raises(ValueError, match="strictly increasing"):
        _mod().read_product(path, "zenodo-d8")


def test_spdf_reader_selects_label_converts_units_keeps_fill_and_flags(monkeypatch, tmp_path):
    class FakeCDF:
        def __init__(self, path):
            self.path = path

        def varattsget(self, name):
            return {"UNITS": "uGray/day", "FILLVAL": -999.0, "VALIDMIN": 0.0, "VALIDMAX": 1000.0}

        def varinq(self, name):
            return types.SimpleNamespace(Data_Type_Description="CDF_TIME_TT2000")

        def varget(self, name):
            return {
                "DOSIMETRY_DOSE_LABEL": ["Total Dose E", "Total Dose B"],
                "EPOCH": ["2024-05-20T00:00:00", "2024-05-20T01:00:00", "2024-05-20T02:00:00"],
                "DOSIMETRY_TOTAL": [[48.0, 999.0], [-999.0, 999.0], [1001.0, 999.0]],
                "FLAGGED_DATA": [" Cmds ", "", "Cmds"],
            }[name]

    monkeypatch.setitem(sys.modules, "cdflib", types.SimpleNamespace(
        CDF=FakeCDF, cdfepoch=types.SimpleNamespace(to_datetime=lambda times: times),
    ))
    assert _mod().read_spdf_l2([tmp_path / "input.cdf"]) == [
        ("2024-05-20T00:00:00Z", 2.0, "Cmds"),
        ("2024-05-20T01:00:00Z", None, ""),
        ("2024-05-20T02:00:00Z", None, "Cmds"),
    ]
    original_varget = FakeCDF.varget
    monkeypatch.setattr(FakeCDF, "varget", lambda self, name: ["Cmds", "", ""]
                        if name == "FLAGGED_DATA" else original_varget(self, name))
    with pytest.raises(ValueError, match="invalid SPDF dose"):
        _mod().read_spdf_l2([tmp_path / "input.cdf"])


def test_spdf_reference_requires_complete_bracketing_and_clips_edges():
    rows = [(_t(0), 10.0, ""), (_t(60), 20.0, "Cmds"), (_t(120), 30.0, "")]
    assert _mod().spdf_reference_ugy(rows, (_t(30), _t(90))) == pytest.approx(10.0)
    with pytest.raises(ValueError, match="cover"):
        _mod().spdf_reference_ugy(rows, (_t(-30), _t(90)))
    with pytest.raises(ValueError, match="gap"):
        _mod().spdf_reference_ugy([rows[0], (_t(60), None, ""), rows[2]], (_t(30), _t(90)))


def test_spdf_reference_excludes_flagged_records_and_holds_the_previous_rate():
    # SYNTHETIC flags before and within the window, including consecutive flags
    # and a flagged fill value, must not interrupt the last unflagged rate.
    rows = [(_t(-30), 2.0, ""), (_t(-15), 99.0, "Cmds"),
            (_t(15), 98.0, "Cmds"), (_t(45), None, "Other"),
            (_t(75), 6.0, ""), (_t(120), 97.0, "Cmds"), (_t(150), 20.0, "")]
    assert _mod().spdf_reference_ugy(rows, (_t(0), _t(120))) == pytest.approx(7.0)


def test_spdf_reference_requires_unflagged_records_to_bracket_window():
    with pytest.raises(ValueError, match="cover"):
        _mod().spdf_reference_ugy([(_t(0), 2.0, "Cmds"), (_t(60), 3.0, ""),
                                   (_t(120), 4.0, "")], (_t(0), _t(60)))
    with pytest.raises(ValueError, match="cover"):
        _mod().spdf_reference_ugy([(_t(0), 2.0, ""), (_t(60), 3.0, ""),
                                   (_t(120), 4.0, "Cmds")], (_t(0), _t(120)))


def test_spdf_reference_preserves_unflagged_gaps_through_flagged_records():
    rows = [(_t(0), None, ""), (_t(60), 20.0, "Cmds"), (_t(120), 30.0, "")]
    with pytest.raises(ValueError, match="gap"):
        _mod().spdf_reference_ugy(rows, (_t(30), _t(90)))


def test_spdf_reference_rejects_missing_day_between_bracketing_records():
    rows = [(_t(0), 10.0, ""), (_t(3 * 24 * 60), 20.0, "")]
    with pytest.raises(ValueError, match="calendar day"):
        _mod().spdf_reference_ugy(rows, (_t(0), _t(3 * 24 * 60)))


def test_spdf_reference_holds_across_a_day_with_only_flagged_observations():
    rows = [(_t(0), 2.0, ""), (_t(24 * 60), 99.0, "Cmds"),
            (_t(2 * 24 * 60), 4.0, "")]
    assert _mod().spdf_reference_ugy(rows, (_t(0), _t(2 * 24 * 60))) == pytest.approx(96.0)


def test_spdf_reference_rejects_duplicate_flagged_timestamps():
    rows = [(_t(0), 2.0, ""), (_t(60), 99.0, "Cmds"),
            (_t(60), 3.0, ""), (_t(120), 4.0, "")]
    with pytest.raises(ValueError, match="strictly increasing"):
        _mod().spdf_reference_ugy(rows, (_t(0), _t(120)))


def test_archive_builder_uses_pre_event_median_and_matched_independent_reference(monkeypatch):
    mod = _mod()
    # Synthetic sol/rate fixtures exercise selection and units without any download.
    d8 = [(_t(-120), 4188.0, 24.0), (_t(-60), 4189.0, 72.0),
          (_t(0), 4190.0, 240.0), (_t(60), 4191.0, 480.0),
          (_t(120), 4192.0, 720.0), (_t(180), 4193.0, 960.0)]
    spdf = [(_t(-30), 1.0, ""), (_t(30), 2.0, "Cmds"),
            (_t(90), 3.0, ""), (_t(150), 4.0, "")]
    monkeypatch.setattr(mod, "read_product", lambda path, product: d8)
    monkeypatch.setattr(mod, "read_spdf_l2", lambda paths: spdf)
    series, diagnostics = mod.archive_series("synthetic-d8", ["synthetic-spdf"])
    assert series["samples"] == [[_t(0), 10.0], [_t(60), 20.0], [_t(120), 30.0]]
    assert series["background_rate"] == 2.0
    assert series["integral_check"] == {"computed_ugy": 30.0, "expected_ugy": 3.0}
    assert diagnostics["spdf_flagged_records_in_window"] == 1


def test_raw_archives_reproduce_committed_series_when_available(tmp_path):
    raw = Path(os.environ.get("MARSWALK_RAD_DIR", REPO_ROOT / "pipeline" / "work" / "rad"))
    d8 = raw / "doseE_sol_filter_update.txt"
    cdfs = sorted((raw / "spdf-l2").glob("*.cdf"))
    if not d8.is_file() or not cdfs:
        pytest.skip("raw D8 or SPDF L2 files absent; set MARSWALK_RAD_DIR to reproduce")
    pytest.importorskip("cdflib", reason="cdflib is not in pipeline/environment.yml until T14.01")
    output = tmp_path / "dose_series.json"
    proc = subprocess.run(
        [sys.executable, "-m", "marswalk_pipeline.rad", "--d8", str(d8),
         "--spdf-l2", *map(str, cdfs), "--output", str(output)],
        cwd=REPO_ROOT, check=False, capture_output=True, text=True,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT / "pipeline" / "src") + os.pathsep + os.environ.get("PYTHONPATH", "")},
    )
    assert proc.returncode == 0, proc.stderr
    assert output.read_bytes() == (SCENARIO_DIR / "dose_series.json").read_bytes()


def test_committed_dose_series_sha256_matches_scenario_json():
    path = SCENARIO_DIR / "dose_series.json"
    scenario = SCENARIO_DIR / "scenario.json"
    if not path.is_file():
        pytest.skip(f"{path.relative_to(REPO_ROOT)} does not exist yet (written by T21.07)")
    if not scenario.is_file():
        pytest.skip(f"{scenario.relative_to(REPO_ROOT)} does not exist yet (assembled by T21.08)")
    entry = json.loads(scenario.read_text(encoding="utf-8"))["tables"]["dose_series"]
    assert (scenario.parent / entry["path"]).resolve() == path.resolve()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]


# ---------------------------------------------------------------------------------------------
# BD-25: the step-hold boundary convention is the same in Python and in compute `rateAt`
# ---------------------------------------------------------------------------------------------


def test_step_hold_is_left_closed_at_every_real_sample_instant_bd25():
    """An interval [t_i, t_{i+1}) takes rate_i. The window one second either side of a sample instant therefore holds
    rate_{i-1} for one second and rate_i for one second. The Vitest `rateAtBoundary.test.ts` feeds the same instants to
    compute `rateAt` and expects the same rates, so the two languages cannot disagree on an endpoint."""
    mod = _mod()
    samples = json.loads((SCENARIO_DIR / "dose_series.json").read_text(encoding="utf-8"))["samples"]
    for (_, before), (t, after), _next in zip(samples, samples[1:], samples[2:]):  # the last sample holds nothing
        if before is None or after is None:
            continue
        lo = (datetime.strptime(t, ISO_FMT) - timedelta(seconds=1)).strftime(ISO_FMT)
        hi = (datetime.strptime(t, ISO_FMT) + timedelta(seconds=1)).strftime(ISO_FMT)
        assert mod.step_hold_integral_ugy(samples, window=(lo, hi)) == pytest.approx((before + after) / 3600, rel=1e-12)


def test_truncation_of_fractional_seconds_never_makes_two_samples_collide():
    """BD-25: D8 times are truncated to whole seconds; the committed series, built from them, is strictly increasing."""
    samples = json.loads((SCENARIO_DIR / "dose_series.json").read_text(encoding="utf-8"))["samples"]
    times = [s[0] for s in samples]
    assert all(a < b for a, b in zip(times, times[1:]))


# ---------------------------------------------------------------------------------------------
# T21.06 (BD-06, BD-25): a scripted second read of the raw archive files
# ---------------------------------------------------------------------------------------------


def test_reread_of_the_raw_archive_recomputes_sol_4190_coverage_and_the_product_id():
    """Recomputes, from the raw D8 file, the SPDF L2 files and the PDS label, the coverage and product claims of
    docs/ops/rad-series.md, parsing each claimed number out of that note. Skips, naming the reason, when the raw files are absent."""
    import re

    raw = Path(os.environ.get("MARSWALK_RAD_DIR", REPO_ROOT / "pipeline" / "work" / "rad"))
    d8 = raw / "doseE_sol_filter_update.txt"
    label = raw / "pds-rdr" / "RAD_RDR_2024_140_18_30_4190_V00.LBL"
    cdfs = sorted((raw / "spdf-l2").glob("*.cdf"))
    if not (d8.is_file() and label.is_file() and cdfs):
        pytest.skip("raw D8, PDS label or SPDF L2 files absent; set MARSWALK_RAD_DIR")
    pytest.importorskip("cdflib")
    note = (REPO_ROOT / "docs/ops/rad-series.md").read_text(encoding="utf-8")
    claim = re.search(r"D8: (\d+) samples with sol (\d+\.\d+)…(\d+\.\d+); SPDF L2: (\d+) records on 20 May 2024", note)
    assert claim, "the U-15 row of rad-series.md no longer states D8 and SPDF coverage"

    rows = _mod().read_product(d8, "zenodo-d8")
    on_sol = [sol for _, sol, _ in rows if 4190 <= sol < 4191]
    assert len(on_sol) == int(claim.group(1))
    assert f"{min(on_sol):.3f}" == claim.group(2) and f"{max(on_sol):.3f}" == claim.group(3)
    spdf = _mod().read_spdf_l2(cdfs)
    assert sum(1 for t, _, _ in spdf if t.startswith("2024-05-20")) == int(claim.group(4))

    products = re.findall(r'PRODUCT_ID\s*=\s*"([^"]+)"', label.read_text(encoding="latin-1"))
    product = "RAD_RDR_2024_140_18_30_4190_V00"
    assert product in products  # the label's own PRODUCT_ID (the first one is the product type, RAD_RDR)
    assert f'Label `PRODUCT_ID = "{product}"`' in note

    series = json.loads((SCENARIO_DIR / "dose_series.json").read_text(encoding="utf-8"))
    d8_times = {t for t, sol, _ in rows if 4190 <= sol < 4193}
    assert {t for t, _ in series["samples"]} <= d8_times  # every committed sample is a D8 row of the event sols
    assert series["source_id"] == "rad-sol4190"
