"""RAD dose-series helpers (TASK-21, T21.07; FR-37, FR-38; 05 DoseSeries, §E.7).

Only caller-supplied samples are processed. Product selection and parsing remain
TODO(decision): U-45, owned by the data lead and Mishkat.
JSON preserves full float precision so saved samples reproduce the computed integral.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Sequence
from datetime import datetime
from numbers import Real
from pathlib import Path

_ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
_SECONDS_PER_HOUR = 60 * 60  # Unit identity.
_HOURS_PER_DAY = 24  # Unit identity, not a Mars sol duration.


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
    ``expected_ugy`` is a caller-supplied published total, never an estimate from
    the samples. Integration uses the converted samples at full float precision.
    TODO(decision): T21.06/T21.07 must settle raw versus background-subtracted
    comparison with the published total; this helper performs no subtraction.
    """
    # 05 DoseSeries requires uGy/h; test_rad.py's contract (data-downloads D8)
    # allows uGy/day via the unit identity 24 hours/day, or uGy/h unchanged.
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
    """TODO(decision): U-45 must choose the RAD product before parsing exists."""
    raise NotImplementedError("U-45: RAD product selection and parsing are TODO(decision)")
