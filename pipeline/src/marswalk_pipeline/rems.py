"""REMS L_s-binned seasonal weather context from cached PDS4/PDS3 RDR files (T18.02, N-24, BD-164).

Reads cached PDS Atmospheres Node MSL REMS environmental RDR (.TAB + .xml/.LBL) files offline,
derives areocentric solar longitude L_s using the Allison & McEwen (2000) equations (matching
packages/compute/src/mars24.ts), filters PDS missing/sentinel values, aggregates ambient air
temperature, ground brightness temperature, and atmospheric pressure in L_s bins, and records the
contributing RDR filenames on every output metric.

Never fetches from the network and never invents numbers.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LS_BIN_WIDTH_DEG = 5.0
REMS_SOURCE_ID = "pds-atmos-msl-rems"
SENTINEL_CUTOFF = -900.0

# PDS4 ENVRDR6 column indices (0-based fallback if XML Field_Character metadata is omitted)
_DEFAULT_COL_INDEX = {
    "BRIGHTNESS_TEMP_A": 17,
    "BOOM1_AIR_TEMP": 27,
    "BOOM2_AIR_TEMP": 34,
    "BAROCAP_PRESSURE_1": 66,
    "BAROCAP_PRESSURE_2": 67,
}

# Leap-second transitions (TAI-UTC, seconds) as day offsets from 1972-01-01 00:00 UTC (JD 2441317.5).
# Matches packages/compute/src/mars24.ts (BD-55; IERS Bulletin C 72).
_LEAP_DATES: list[tuple[int, float]] = [
    (0, 10.0),
    (182, 11.0),
    (366, 12.0),
    (731, 13.0),
    (1096, 14.0),
    (1461, 15.0),
    (1827, 16.0),
    (2192, 17.0),
    (2557, 18.0),
    (2922, 19.0),
    (3469, 20.0),
    (3834, 21.0),
    (4199, 22.0),
    (4930, 23.0),
    (5844, 24.0),
    (6575, 25.0),
    (6940, 26.0),
    (7487, 27.0),
    (7852, 28.0),
    (8217, 29.0),
    (8766, 30.0),
    (9313, 31.0),
    (9862, 32.0),
    (12419, 33.0),
    (13515, 34.0),
    (14792, 35.0),
    (15887, 36.0),
    (16437, 37.0),
]

_A_PERTURBS = (0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018)
_TAU_PERTURBS = (2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493)
_PHI_PERTURBS = (49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095)

_SOL_FROM_NAME_RE = re.compile(r"RNV(\d{4})")
_LBL_KEY_RE = re.compile(r"^([A-Z0-9_]+)\s*=\s*(.+?)\s*$")


def _parse_utc(utc_str: str) -> datetime:
    normalized = utc_str.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def j2000_offset_tt(utc: str | datetime) -> float:
    """Elapsed days since J2000 epoch (2000-01-01 12:00:00 TT), matching mars24.ts."""
    dt = _parse_utc(utc) if isinstance(utc, str) else utc.astimezone(timezone.utc)
    jday_utc = 2440587.5 + dt.timestamp() / 86400.0
    rel = jday_utc - 2441317.5
    if rel < 0:
        raise ValueError(f"UTC date {dt.isoformat()} is before 1972-01-01")
    leap_sec = 37.0
    for i in range(len(_LEAP_DATES) - 1):
        if _LEAP_DATES[i][0] <= rel < _LEAP_DATES[i + 1][0]:
            leap_sec = _LEAP_DATES[i][1]
            break
    jday_tt = jday_utc + (32.184 + leap_sec) / 86400.0
    return jday_tt - 2451545.0


def mars_ls_from_utc(utc: str | datetime) -> float:
    """Areocentric solar longitude L_s in [0, 360) deg (Allison & McEwen 2000)."""
    ott = j2000_offset_tt(utc)
    alpha_fms = (270.3863 + 0.5240384 * ott) % 360.0
    m_deg = (19.387 + 0.52402075 * ott) % 360.0
    m_rad = math.radians(m_deg)
    pbs = sum(
        a * math.cos(math.radians((0.985626 * ott) / tau + phi))
        for a, tau, phi in zip(_A_PERTURBS, _TAU_PERTURBS, _PHI_PERTURBS, strict=True)
    )
    v_minus_m = (
        (10.691 + 3.0e-7 * ott) * math.sin(m_rad)
        + 0.623 * math.sin(2.0 * m_rad)
        + 0.05 * math.sin(3.0 * m_rad)
        + 0.005 * math.sin(4.0 * m_rad)
        + 0.0005 * math.sin(5.0 * m_rad)
        + pbs
    )
    return (alpha_fms + v_minus_m) % 360.0


@dataclass(frozen=True)
class _RdrMetadata:
    sol: int
    start_ts: float
    stop_ts: float
    col_indices: dict[str, int]


def _read_metadata(tab_path: Path) -> _RdrMetadata:
    xml_path = tab_path.with_suffix(".xml")
    lbl_path = tab_path.with_suffix(".LBL")
    col_indices = dict(_DEFAULT_COL_INDEX)
    sol: int | None = None
    start_dt: datetime | None = None
    stop_dt: datetime | None = None

    if xml_path.exists():
        root = ET.parse(xml_path).getroot()
        ns = {"pds": "http://pds.nasa.gov/pds4/pds/v1"}
        s_txt = root.findtext(".//pds:Time_Coordinates/pds:start_date_time", namespaces=ns)
        e_txt = root.findtext(".//pds:Time_Coordinates/pds:stop_date_time", namespaces=ns)
        if s_txt:
            start_dt = _parse_utc(s_txt)
        if e_txt:
            stop_dt = _parse_utc(e_txt)
        for fc in root.findall(".//pds:Field_Character", ns):
            name = fc.findtext("pds:name", namespaces=ns)
            num_txt = fc.findtext("pds:field_number", namespaces=ns)
            if name in col_indices and num_txt and num_txt.isdigit():
                col_indices[name] = int(num_txt) - 1

    if lbl_path.exists():
        for line in lbl_path.read_text(encoding="utf-8", errors="replace").splitlines():
            m = _LBL_KEY_RE.match(line.strip())
            if not m:
                continue
            key, raw_val = m.group(1), m.group(2).strip().strip('"')
            if key == "PLANET_DAY_NUMBER" and raw_val.isdigit():
                sol = int(raw_val)
            elif key == "START_TIME" and start_dt is None:
                start_dt = _parse_utc(raw_val)
            elif key == "STOP_TIME" and stop_dt is None:
                stop_dt = _parse_utc(raw_val)

    if sol is None:
        m_sol = _SOL_FROM_NAME_RE.search(tab_path.stem)
        if not m_sol:
            raise ValueError(f"Cannot determine sol number for {tab_path.name}")
        sol = int(m_sol.group(1))
    if start_dt is None or stop_dt is None:
        raise ValueError(f"Missing start/stop UTC metadata alongside {tab_path.name} (.xml or .LBL)")

    return _RdrMetadata(
        sol=sol,
        start_ts=start_dt.timestamp(),
        stop_ts=stop_dt.timestamp(),
        col_indices=col_indices,
    )


def _valid_float(cell: str) -> float | None:
    try:
        val = float(cell)
    except ValueError:
        return None
    if not math.isfinite(val) or val <= SENTINEL_CUTOFF:
        return None
    return val


def _quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        raise ValueError("Cannot compute quantile of empty series")
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return sorted_vals[lo]
    frac = pos - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def _summarize_metric(values: list[float], unit: str, source_files: list[str]) -> dict | None:
    if not values:
        return None
    assert source_files, "Every output REMS metric must trace to named RDR source files (FR-13)"
    ordered = sorted(values)
    return {
        "unit": unit,
        "count": len(ordered),
        "min": ordered[0],
        "p10": _quantile(ordered, 0.10),
        "median": _quantile(ordered, 0.50),
        "p90": _quantile(ordered, 0.90),
        "max": ordered[-1],
        "source_id": REMS_SOURCE_ID,
        "provenance": "measured",
        "source_files": sorted(set(source_files)),
    }


def _bin_index(ls_deg: float, width_deg: float) -> int:
    n_bins = round(360.0 / width_deg)
    return math.floor((ls_deg % 360.0) / width_deg) % n_bins


def build_rems_context(
    rems_dir: Path,
    ls_bin_width_deg: float = DEFAULT_LS_BIN_WIDTH_DEG,
) -> dict:
    """Aggregate cached REMS ENV RDR files under `rems_dir` into deterministic L_s bins."""
    if not math.isfinite(ls_bin_width_deg) or ls_bin_width_deg <= 0 or 360.0 % ls_bin_width_deg != 0:
        raise ValueError(f"ls_bin_width_deg must divide 360 evenly, got {ls_bin_width_deg}")

    tab_files = sorted(rems_dir.glob("*.TAB"))
    if not tab_files:
        raise FileNotFoundError(f"No REMS RDR *.TAB files found in {rems_dir}")

    bins_data: dict[int, dict] = {}
    used_files: set[str] = set()

    for tab_path in tab_files:
        meta = _read_metadata(tab_path)
        idx = meta.col_indices
        with tab_path.open("r", encoding="utf-8", errors="replace") as handle:
            rows = list(csv.reader(handle))
        if not rows:
            continue

        row_count = len(rows)
        span_s = max(0.0, meta.stop_ts - meta.start_ts)
        # Estimate bin at start and endpoints cleanly; assign exact interpolated row UTC to bin.
        for i, row in enumerate(rows):
            if len(row) <= max(idx.values()):
                continue
            frac = i / (row_count - 1) if row_count > 1 else 0.0
            row_dt = datetime.fromtimestamp(meta.start_ts + frac * span_s, tz=timezone.utc)
            ls_deg = mars_ls_from_utc(row_dt)
            b_idx = _bin_index(ls_deg, ls_bin_width_deg)

            t_air = _valid_float(row[idx["BOOM1_AIR_TEMP"]])
            if t_air is None:
                t_air = _valid_float(row[idx["BOOM2_AIR_TEMP"]])
            t_gnd = _valid_float(row[idx["BRIGHTNESS_TEMP_A"]])
            press = _valid_float(row[idx["BAROCAP_PRESSURE_1"]])
            if press is None:
                press = _valid_float(row[idx["BAROCAP_PRESSURE_2"]])

            if t_air is None and t_gnd is None and press is None:
                continue

            used_files.add(tab_path.name)
            bucket = bins_data.setdefault(
                b_idx,
                {
                    "sols": set(),
                    "air_vals": [],
                    "air_files": set(),
                    "gnd_vals": [],
                    "gnd_files": set(),
                    "press_vals": [],
                    "press_files": set(),
                    "all_files": set(),
                },
            )
            bucket["sols"].add(meta.sol)
            bucket["all_files"].add(tab_path.name)
            if t_air is not None:
                bucket["air_vals"].append(t_air)
                bucket["air_files"].add(tab_path.name)
            if t_gnd is not None:
                bucket["gnd_vals"].append(t_gnd)
                bucket["gnd_files"].add(tab_path.name)
            if press is not None:
                bucket["press_vals"].append(press)
                bucket["press_files"].add(tab_path.name)

    bins_out: list[dict] = []
    for b_idx in sorted(bins_data):
        bucket = bins_data[b_idx]
        bin_files = sorted(bucket["all_files"])
        assert bin_files, f"Bin {b_idx} has no contributing RDR files"
        bins_out.append(
            {
                "ls_bin_start_deg": b_idx * ls_bin_width_deg,
                "ls_bin_end_deg": (b_idx + 1) * ls_bin_width_deg,
                "sols": sorted(bucket["sols"]),
                "source_files": bin_files,
                "air_temp_k": _summarize_metric(bucket["air_vals"], "K", list(bucket["air_files"])),
                "ground_temp_k": _summarize_metric(bucket["gnd_vals"], "K", list(bucket["gnd_files"])),
                "pressure_pa": _summarize_metric(bucket["press_vals"], "Pa", list(bucket["press_files"])),
            }
        )

    assert used_files, f"No valid REMS measurements extracted from {rems_dir}"
    for b in bins_out:
        assert b["source_files"]
        for metric_key in ("air_temp_k", "ground_temp_k", "pressure_pa"):
            metric = b[metric_key]
            if metric is not None:
                assert metric["source_files"], f"Missing source_files on {metric_key}"

    return {
        "source_id": REMS_SOURCE_ID,
        "provenance": "measured",
        "ls_bin_width_deg": ls_bin_width_deg,
        "source_files": sorted(used_files),
        "bins": bins_out,
    }


def write_rems_context(
    rems_dir: Path,
    out_path: Path,
    ls_bin_width_deg: float = DEFAULT_LS_BIN_WIDTH_DEG,
) -> dict:
    """Build REMS context JSON and write deterministically with sorted keys."""
    context = build_rems_context(rems_dir, ls_bin_width_deg=ls_bin_width_deg)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(context, sort_keys=True, indent=2) + "\n"
    out_path.write_text(payload, encoding="utf-8")
    return context


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build REMS L_s-bin environmental context JSON (T18.02).")
    parser.add_argument("--work", type=Path, default=Path("pipeline/work/rems"), help="Directory containing cached REMS RDR .TAB/.xml/.LBL files.")
    parser.add_argument("--out", type=Path, default=Path("pipeline/work/rems/rems_context.json"), help="Destination JSON file.")
    parser.add_argument("--ls-bin-width", type=float, default=DEFAULT_LS_BIN_WIDTH_DEG, help="Solar longitude bin width in degrees (must divide 360).")
    args = parser.parse_args(argv)
    context = write_rems_context(args.work, args.out, ls_bin_width_deg=args.ls_bin_width)
    print(f"rems_context: wrote {len(context['bins'])} bin(s) from {len(context['source_files'])} file(s) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
