"""T21.11 (TASK-21; FR-38, NFR-06): cut the onset hour of the real storm tables into a small fixture for engine tests.

    $(make -s pipeline-python) apps/hab-core/tests/fixtures/storm-excerpt/make_storm_excerpt.py [--out <dir>]

The onset hour is the UTC hour that holds the scenario's `event_library[0].series_start_utc` (BD-143), read from
`scenarios/storm-sol4190/scenario.json`: every dose sample and every Earth-link row in that hour, in source order, with the
source's other fields unchanged and the passes that touch the hour. `integral_check` is recomputed over the excerpt (step-hold,
`marswalk_pipeline.rad`); it has no published total to compare with, so `expected_ugy` equals `computed_ugy`. Standard layout:
sorted keys, compact separators, final newline (as `rad.write_dose_series`). Deterministic: no clock, no randomness.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
sys.path.insert(0, str(ROOT / "pipeline/src"))

from marswalk_pipeline.rad import step_hold_integral_ugy  # noqa: E402

SCENARIO_REL = Path("scenarios/storm-sol4190")


def _dump(value) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")


def write_excerpt(root: Path, out: Path) -> None:
    scenario_dir = root / SCENARIO_REL
    scenario = json.loads((scenario_dir / "scenario.json").read_text(encoding="utf-8"))
    hour = scenario["event_library"][0]["series_start_utc"][:13]  # "YYYY-MM-DDTHH"
    dose = json.loads((scenario_dir / "dose_series.json").read_text(encoding="utf-8"))
    link = json.loads((scenario_dir / "earth_link.json").read_text(encoding="utf-8"))

    samples = [s for s in dose["samples"] if s[0][:13] == hour]
    computed = step_hold_integral_ugy(samples)
    dose_out = {**dose, "samples": samples, "integral_check": {"computed_ugy": computed, "expected_ugy": computed}}
    rows = [r for r in link["rows"] if r["t_utc"][:13] == hour]
    passes = [p for p in link["passes"] if p["start_utc"][:13] <= hour <= p["end_utc"][:13]]
    link_out = {**link, "rows": rows, "passes": passes}

    out.mkdir(parents=True, exist_ok=True)
    (out / "dose_series.json").write_bytes(_dump(dose_out))
    (out / "earth_link.json").write_bytes(_dump(link_out))
    sha = lambda name: hashlib.sha256((scenario_dir / name).read_bytes()).hexdigest()  # noqa: E731
    readme = f"""# storm-excerpt: the onset hour of the real storm tables

| | |
| --- | --- |
| **Owner** | Backend plan package 25 (T21.11) |
| **Status** | Fixture for engine tests; a cut of real tables, not new data |
| **Related** | [TASK-21](../../../../../docs/tasks/TASK-21_scenario-builder.md) · [scenario README](../../../../../scenarios/storm-sol4190/README.md) |

Written by `make_storm_excerpt.py` (**Do not edit** the files here; re-run the script, which gives the same bytes).

- **The cut:** every sample and every row whose UTC hour is `{hour}`, the hour that holds `series_start_utc`
  (`{scenario['event_library'][0]['series_start_utc']}`) of `scenarios/storm-sol4190/scenario.json`. It holds the alert sample
  `2024-05-20T05:50:32Z`.
- **Counts:** {len(samples)} dose samples, {len(rows)} Earth-link rows, {len(passes)} passes touching the hour.
- **`dose_series.json`:** cut of `scenarios/storm-sol4190/dose_series.json` (SHA-256 `{sha('dose_series.json')}`). Every field except `samples` and `integral_check` is the source's. `integral_check` is recomputed over the excerpt, and `expected_ugy` equals `computed_ugy` because an excerpt has no published total.
- **`earth_link.json`:** cut of `scenarios/storm-sol4190/earth_link.json` (SHA-256 `{sha('earth_link.json')}`); `kernels`, `step_s` and `provenance` unchanged.
- **Check:** `pipeline/tests/test_storm_excerpt.py` re-runs the script into a temporary folder and compares every file byte for byte.
"""
    (out / "README.md").write_bytes(readme.encode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Cut the onset hour of the storm tables (T21.11)")
    parser.add_argument("--out", type=Path, default=HERE)
    write_excerpt(ROOT, parser.parse_args().out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
