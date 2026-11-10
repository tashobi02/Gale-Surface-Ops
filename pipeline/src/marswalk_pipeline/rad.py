"""RAD dose-series helpers (TASK-21, T21.07; FR-37, FR-38; 05 DoseSeries, §E.7).

U-45 selects the D8 original E column and the SPDF L2 Total Dose E reference.
JSON preserves full float precision so saved samples reproduce the computed integral.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from numbers import Real
from pathlib import Path

_ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
_SECONDS_PER_HOUR = 60 * 60  # Unit identity.
_HOURS_PER_DAY = 24  # Unit identity, not a Mars sol duration.
# U-45 recommendation in docs/ops/rad-series.md: event and pre-event sols.
_EVENT_SOLS = (4190, 4193)
_BACKGROUND_SOLS = (4188, 4190)


def _utc(timestamp: str) -> datetime:
    """Parse the contract's UTC second-resolution format without changing it."""
    parsed = datetime.strptime(timestamp, _ISO_FORMAT)
    if parsed.strftime(_ISO_FORMAT) != timestamp:
        raise ValueError("timestamp must use YYYY-MM-DDTHH:MM:SSZ")
    return parsed


def _number(value: Real, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise TypeError(f"{name} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


def step_hold_integral_ugy(
    samples: Iterable[Sequence], window: tuple[str, str] | None = None,
) -> float:
    """Integrate sorted [UTC time, uGy/h rate] samples using 05 §E.7 step-hold.

    Clip each interval to ``window`` when supplied. A null interval contributes
    zero; no background is subtracted and no time outside the samples is added.
    The last sample contributes nothing because its duration is unknown.
    TODO(verify): reconcile that endpoint convention with TASK-05b's rateAt.
    """
    bounds = None if window is None else (_utc(window[0]), _utc(window[1]))
    if bounds is not None and bounds[0] > bounds[1]:
        raise ValueError("integral window must be in chronological order")

    def contributions():
        previous_time = None
        previous_rate = None
        for timestamp, rate in samples:
            current_time = _utc(timestamp)
            current_rate = None if rate is None else _number(rate, "rate")
            if previous_time is not None:
                if current_time <= previous_time:
                    raise ValueError("sample timestamps must be strictly increasing")
                start, end = previous_time, current_time
                if bounds is not None:
                    start, end = max(start, bounds[0]), min(end, bounds[1])
                if previous_rate is not None and end > start:
                    yield previous_rate * ((end - start).total_seconds() / _SECONDS_PER_HOUR)
            previous_time, previous_rate = current_time, current_rate

    return math.fsum(contributions())


def build_dose_series(
    samples: Iterable[Sequence],
    *,
    series_id: str,
    source_id: str,
    background_rate_ugy_per_h: Real,
    expected_ugy: Real,
    input_unit: str,
    integral_window: tuple[str, str] | None = None,
) -> dict:
    """Build an archive/replayed 05 DoseSeries without modifying input samples.

    ``input_unit`` must explicitly be uGy/day or uGy/h. Keep the original UTC
    strings and cadence, sorting strictly by time; None and NaN become null gaps.
    ``expected_ugy`` is an independent caller-supplied reference, never an
    estimate from the replay samples. Integration uses the converted samples
    at full float precision, with no background subtraction (U-45).
    """
    # D8's header and description document µGy/day:
    # https://zenodo.org/records/20536564. Convert to 05's µGy/h by 24 h/day.
    if input_unit not in ("uGy/day", "uGy/h"):
        raise ValueError("input_unit must be 'uGy/day' or 'uGy/h'")
    divisor = _HOURS_PER_DAY if input_unit == "uGy/day" else 1
    background = _number(background_rate_ugy_per_h, "background_rate_ugy_per_h")
    expected = _number(expected_ugy, "expected_ugy")
    rows = []
    for timestamp, rate in samples:
        _utc(timestamp)
        if rate is None or (isinstance(rate, Real) and math.isnan(rate)):
            converted = None
        else:
            converted = _number(rate, "rate") / divisor
        rows.append([timestamp, converted])
    if not rows:
        raise ValueError("at least one sample is required")
    rows.sort(key=lambda row: row[0])
    # Integration also rejects duplicate timestamps, even outside the window.
    computed = step_hold_integral_ugy(rows, window=integral_window)
    return {
        "series_id": series_id,
        "quantity": "surface absorbed dose rate",
        "unit": "uGy/h",
        "samples": rows,
        "background_rate": background,
        "method": "archive",
        "provenance": "replayed",
        "source_id": source_id,
        "integral_check": {"expected_ugy": expected, "computed_ugy": computed},
    }


def write_dose_series(series: dict, path: str | Path) -> str:
    """Write deterministic UTF-8 JSON; return SHA-256 of the exact bytes written.

    Preserve full float precision with JSON's default representation. Sort object
    keys, use compact separators, preserve Unicode and append one LF. Reject
    non-finite floats before opening the file. Float precision is a serialization
    policy, not a claim of measurement accuracy.
    """
    payload = (json.dumps(
        series, sort_keys=True, ensure_ascii=False,
        allow_nan=False, separators=(",", ":"),
    ) + "\n").encode("utf-8")
    Path(path).write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def read_product(path: str | Path, product: str):
    """Read D8's six-field rows as (second-resolution time, sol, original E).

    D8's times have no stated scale: appending Z provisionally maps them to UTC
    (TODO(verify), docs/ops/rad-series.md). Fractional seconds are truncated.
    An explicit NaN in the original column is preserved as a null gap. The D8
    original column is already interpolated and cannot expose earlier gaps.
    """
    if product != "zenodo-d8":
        raise ValueError("unsupported RAD product")
    rows = []
    with Path(path).open(encoding="utf-8") as stream:
        header = next(stream, "")
        if "DoseE [micro Gray per day]" not in header:
            raise ValueError("unexpected D8 header or unit")
        for line_number, line in enumerate(stream, start=2):
            fields = line.rstrip("\r\n").split("\t")
            if len(fields) != 6:
                raise ValueError(f"D8 line {line_number} must have six fields")
            time = datetime.fromisoformat(fields[0])
            if time.tzinfo is not None:
                raise ValueError("D8 timestamp unexpectedly has a time zone")
            sol = _number(float(fields[3]), "sol")
            rate = float(fields[4])
            if math.isnan(rate):
                rate = None
            else:
                rate = _number(rate, "original E rate")
                if rate < 0:
                    raise ValueError("negative original E rate")
            timestamp = time.strftime(_ISO_FORMAT)
            if rows and timestamp <= rows[-1][0]:
                raise ValueError("D8 timestamps must be strictly increasing after truncation")
            rows.append((timestamp, sol, rate))
    return rows


def read_spdf_l2(paths: Iterable[str | Path]):
    """Read TT2000, labelled Total Dose E, and quality flags from SPDF CDFs."""
    # Optional, offline preprocessing dependency, not needed to consume JSON.
    import cdflib

    rows = []
    for path in paths:
        cdf = cdflib.CDF(Path(path))
        attrs = cdf.varattsget("DOSIMETRY_TOTAL")
        if attrs["UNITS"] != "uGray/day":
            raise ValueError(f"unexpected SPDF dose unit in {path}")
        if cdf.varinq("EPOCH").Data_Type_Description != "CDF_TIME_TT2000":
            raise ValueError(f"unexpected SPDF epoch type in {path}")
        labels = [str(value).strip() for value in cdf.varget("DOSIMETRY_DOSE_LABEL")]
        index = labels.index("Total Dose E")
        times = cdflib.cdfepoch.to_datetime(cdf.varget("EPOCH"))
        doses = cdf.varget("DOSIMETRY_TOTAL")
        flags = cdf.varget("FLAGGED_DATA")
        if not (len(times) == len(doses) == len(flags)):
            raise ValueError(f"inconsistent SPDF record counts in {path}")
        for time, dose, flag in zip(times, doses, flags):
            stamp = datetime.fromisoformat(str(time)).strftime(_ISO_FORMAT)
            flag = str(flag).strip()
            value = float(dose[index])
            if not math.isfinite(value) or value == float(attrs["FILLVAL"]):
                rate = None
            elif not float(attrs["VALIDMIN"]) <= value <= float(attrs["VALIDMAX"]):
                if not flag:
                    raise ValueError(f"invalid SPDF dose in {path}")
                rate = None  # The flagged record is excluded from the reference.
            else:
                # SPDF DOSIMETRY_TOTAL UNITS = uGray/day (CDF metadata, D9).
                rate = value / _HOURS_PER_DAY
            rows.append((stamp, rate, flag))
    rows.sort(key=lambda row: row[0])
    if any(a[0] >= b[0] for a, b in zip(rows, rows[1:])):
        raise ValueError("SPDF timestamps must be strictly increasing")
    return rows


def spdf_reference_ugy(rows: Sequence[Sequence], window: tuple[str, str]) -> float:
    """Step-hold unflagged SPDF observations on the fully covered window."""
    start, end = map(_utc, window)
    if start >= end:
        raise ValueError("reference window must have positive duration")
    for first, second in zip(rows, rows[1:]):
        if _utc(second[0]) <= _utc(first[0]):
            raise ValueError("SPDF timestamps must be strictly increasing")

    # SPDF FLAGGED_DATA metadata says flagged data should be removed for science.
    # U-45 (Obidit Islam, 2026-11-10): exclude every nonempty flag, holding the
    # previous unflagged rate until the next unflagged record, not a null gap.
    unflagged = [row for row in rows if not row[2]]
    if len(unflagged) < 2 or unflagged[0][0] > window[0] or unflagged[-1][0] < window[1]:
        raise ValueError("unflagged SPDF samples do not cover the replay window")

    # Check raw observation days so a day containing only flagged records is
    # distinguished from a missing file; the chosen hold rule still spans it.
    observed_days = {_utc(row[0]).date() for row in rows}
    day, last_day = start.date(), (end - timedelta(microseconds=1)).date()
    while day <= last_day:
        if day not in observed_days:
            raise ValueError(f"SPDF has no records for calendar day {day}")
        day += timedelta(days=1)
    for first, second in zip(unflagged, unflagged[1:]):
        a, b = _utc(first[0]), _utc(second[0])
        if first[1] is None and max(a, start) < min(b, end):
            raise ValueError("SPDF gap overlaps the reference window")
    return step_hold_integral_ugy(((time, rate) for time, rate, _ in unflagged), window=window)


def archive_series(d8_path: str | Path, spdf_paths: Iterable[str | Path]):
    """Build the U-45 archive and its independent, matched-window diagnostics."""
    rows = read_product(d8_path, "zenodo-d8")
    event = [(time, rate) for time, sol, rate in rows if _EVENT_SOLS[0] <= sol < _EVENT_SOLS[1]]
    background = [rate for _, sol, rate in rows
                  if _BACKGROUND_SOLS[0] <= sol < _BACKGROUND_SOLS[1] and rate is not None]
    if len(event) < 2 or not background:
        raise ValueError("D8 event or background window has insufficient samples")
    observed_sols = {int(sol) for _, sol, _ in rows}
    if not set(range(*_EVENT_SOLS)).issubset(observed_sols) or not set(range(*_BACKGROUND_SOLS)).issubset(observed_sols):
        raise ValueError("D8 is missing an event or background sol")
    window = (event[0][0], event[-1][0])
    spdf = read_spdf_l2(spdf_paths)
    expected = spdf_reference_ugy(spdf, window)
    series = build_dose_series(
        event, series_id="rad-sol4190", source_id="rad-sol4190", input_unit="uGy/day",
        background_rate_ugy_per_h=statistics.median(background) / _HOURS_PER_DAY,
        expected_ugy=expected,
    )
    inside = [row for row in spdf if window[0] <= row[0] < window[1]]
    computed = series["integral_check"]["computed_ugy"]
    diagnostics = {
        "window_start": window[0], "window_end": window[1],
        "samples": len(event), "background_samples": len(background),
        "background_rate_ugy_h": series["background_rate"],
        "spdf_records_in_window": len(inside),
        "spdf_flagged_records_in_window": sum(bool(row[2]) for row in inside),
        "computed_ugy": computed, "expected_ugy": expected,
        "difference_ugy": computed - expected,
        "difference_percent_of_expected": (computed / expected - 1) * 100 if expected else None,
    }
    return series, diagnostics


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the U-45 RAD archive dose series")
    parser.add_argument("--d8", type=Path, required=True, help="Zenodo D8 doseE_sol_filter_update.txt")
    parser.add_argument("--spdf-l2", type=Path, nargs="+", required=True, help="SPDF L2 CDF files")
    parser.add_argument("--output", type=Path, required=True, help="destination dose_series.json")
    args = parser.parse_args()
    series, diagnostics = archive_series(args.d8, args.spdf_l2)
    diagnostics["sha256"] = write_dose_series(series, args.output)
    diagnostics["output_bytes"] = args.output.stat().st_size
    print(json.dumps(diagnostics, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
