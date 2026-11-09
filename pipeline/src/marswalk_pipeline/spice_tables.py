"""Offline SPICE Earth-link geometry (TASK-21 T21.04; FR-43; 02 L10/§D.12, 05 EarthLinkTable).

UTC inputs/outputs use YYYY-MM-DDTHH:MM:SSZ. The CLI writes sorted JSON keys,
rounds floats to six decimal places, and derives passes from those rounded rows.
Pass boundaries are the first/last qualifying samples, including series edges;
there is no crossing interpolation (data lead decision, 2026-11-07).
TODO(verify): carry this sampled-pass convention into 05 EarthLinkTable.

Earth geometry uses MARS BARYCENTER (4), as specified by the T21.03 API
contract. Light time uses spkpos LT in J2000; the angle at Earth and all
elevations use geometric (NONE) positions at the observation epoch. Directions
are rotated into IAU_MARS at that epoch before subtracting the spherical site.
TODO(verify): quantify the barycenter/body-centre difference for Earth geometry.
Orbiter positions are always relative to MARS (499). mar099s bridges the
MRO/MAVEN segments centred on 4 to 499. Load DE440s after mar099s so its
planetary states take precedence over the planetary states embedded in mar099s.

Kernel selection follows the mission meta-kernels (data-downloads D13; T21.02):
MRO mro_2024_v07.tm loads mro_psp71.bsp then mro_psp71_ssd_mro95a.bsp;
TGO em16_ops.tm loads fsp_335 then fsp_352. Later files take priority where
coverage overlaps. Continuous combined coverage is checked with spkcov.
MAVEN selection is unchanged (fewest covering intervals, ties by filename).
Before 2024-05-20T22:45:10Z, TGO comes from fsp_335 only and is likely
predicted: TODO(verify), see T21.02. From that epoch fsp_352 takes priority;
its May data are reconstructed (delivered September 2024; T21.02).
Only selected, loaded files appear in the manifest. Kernel quality notes stay
in this docstring and CLI output because EarthLinkTable forbids extra fields.
No kernels are downloaded.

Example (the hab first choice is from docs/ops/feasibility/hab-site.md):
    python -m marswalk_pipeline.spice_tables --start 2024-05-18T00:00:00Z \\
        --end 2024-05-22T23:59:00Z --kernel-dir /path/to/spice \\
        --out scenarios/storm-sol4190/earth_link.json

AI assistance: T21.04 implementation and validation by Codex, 2026-11-07;
recorded in docs/AI_USE.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock

from . import config

ISO_FMT = "%Y-%m-%dT%H:%M:%SZ"
STEP_S = 60  # 05 EarthLinkTable
ORBITERS = {"mro": "-74", "maven": "-202", "tgo": "-143"}  # NAIF identifiers
_SPICE_LOCK = RLock()  # CSPICE's kernel pool is process-global.


def _parse_utc(value: str) -> datetime:
    parsed = datetime.strptime(value, ISO_FMT).replace(tzinfo=timezone.utc)
    if parsed.strftime(ISO_FMT) != value:
        raise ValueError(f"Expected UTC timestamp in {ISO_FMT}: {value}")
    return parsed


def time_grid(start_utc: str, end_utc: str, step_s: int = STEP_S) -> list[str]:
    """Inclusive regular UTC grid; an off-grid end is never exceeded."""
    start, end = _parse_utc(start_utc), _parse_utc(end_utc)
    if not math.isfinite(step_s) or step_s <= 0 or int(step_s) != step_s:
        raise ValueError("step_s must be a positive whole number of seconds")
    if end < start:
        raise ValueError("end_utc must not precede start_utc")
    count = int((end - start).total_seconds() // step_s) + 1
    return [(start + timedelta(seconds=i * step_s)).strftime(ISO_FMT) for i in range(count)]


def site_position_km(lat_deg: float, lon_east_deg: float) -> tuple[float, float, float]:
    """Planetocentric, east-positive spherical site in IAU_MARS (02 §C.1)."""
    lat, lon = math.radians(lat_deg), math.radians(lon_east_deg)
    radius = config.MARS_RADIUS_M / 1000
    return (radius * math.cos(lat) * math.cos(lon),
            radius * math.cos(lat) * math.sin(lon), radius * math.sin(lat))


def derive_passes(times_utc: list[str], elevations_deg: list[float], min_elev_deg: float) -> list[dict]:
    """Maximal sampled runs at or above the given relay elevation threshold."""
    if len(times_utc) != len(elevations_deg):
        raise ValueError("Times and elevations must have equal length")
    passes = []
    current = None
    for stamp, elevation in zip(times_utc, elevations_deg):
        if elevation >= min_elev_deg:
            if current is None:
                current = {"start_utc": stamp, "end_utc": stamp, "max_elev_deg": elevation}
            else:
                current["end_utc"] = stamp
                current["max_elev_deg"] = max(current["max_elev_deg"], elevation)
        elif current is not None:
            passes.append(current)
            current = None
    if current is not None:
        passes.append(current)
    return passes


def is_conjunction_blackout(sep_angle_deg: float, conjunction_deg: float) -> bool:
    """02 §D.12: conjunction uses a strict comparison."""
    return sep_angle_deg < conjunction_deg


def assemble_earth_link_table(rows: list[dict], link_values: dict, kernels: list[dict]) -> dict:
    """Validate cadence and assemble passes without changing the supplied rows."""
    times = [row["t_utc"] for row in rows]
    parsed = [_parse_utc(stamp) for stamp in times]
    if any((b - a).total_seconds() != STEP_S for a, b in zip(parsed, parsed[1:])):
        raise ValueError("Earth-link rows must be strictly increasing and exactly 60 s apart")
    passes = []
    for orbiter in ORBITERS:
        elevations = [row["orbiters"][orbiter] for row in rows]
        passes.extend({"orbiter": orbiter, **p} for p in derive_passes(
            times, elevations, link_values["relay_min_elev_deg"]))
    passes.sort(key=lambda p: (p["start_utc"], p["orbiter"]))
    return {"step_s": STEP_S, "rows": rows, "passes": passes,
            "kernels": kernels, "provenance": "derived"}


def _find_one(kernel_dir: Path, name: str) -> Path:
    files = sorted(p.resolve() for p in kernel_dir.rglob(name) if p.is_file())
    if len(files) != 1:
        raise ValueError(f"Expected exactly one {name} under {kernel_dir}; found {len(files)}")
    return files[0]


@contextmanager
def _kernel_pool(files: list[Path]):
    """Isolate calls and restore caller kernels AND direct kernel-pool assignments."""
    import spiceypy as sp

    with _SPICE_LOCK:
        # KernelPool restores loaded files but discards direct pool assignments.
        # Save the complete pool as well, including caller deletions/overrides.
        saved_pool = {}
        try:
            names = sp.gnpool("*", 0, 100000)
        except sp.utils.exceptions.NotFoundError:
            names = []
        for name in names:
            count, kind = sp.dtpool(name)
            saved_pool[name] = (kind, sp.gcpool(name, 0, count) if kind == "C"
                                else sp.gdpool(name, 0, count))
        try:
            with sp.KernelPool([str(path) for path in files]):
                yield sp
        finally:
            sp.clpool()
            for name, (kind, values) in saved_pool.items():
                if kind == "C":
                    sp.pcpool(name, values)
                else:
                    sp.pdpool(name, values)


def _coverage(sp, path: Path, body_id: int) -> list[tuple[float, float]]:
    window = sp.spkcov(str(path), body_id)
    return [sp.wnfetd(window, i) for i in range(sp.wncard(window))]


def _require_coverage(sp, path: Path, body_id: int, start: float, end: float) -> None:
    if not any(a <= start and end <= b for a, b in _coverage(sp, path, body_id)):
        raise ValueError(f"{path.name}: body {body_id} lacks continuous coverage of the requested window")


def _orbiter_files(sp, root: Path, orbiter: str, start: float, end: float) -> list[Path]:
    # Mission meta-kernel order, approved for T21.04; do not minimize these lists.
    mission_order = {
        "mro": ("mro_psp71.bsp", "mro_psp71_ssd_mro95a.bsp"),
        "tgo": ("em16_tgo_fsp_335_01_20240113_20240706_v01.bsp",
                "em16_tgo_fsp_352_01_20240520_20241102_v01.bsp"),
    }
    if orbiter in mission_order:
        candidates = [_find_one(root, name) for name in mission_order[orbiter]]
    else:
        candidates = sorted(p.resolve() for p in root.rglob("maven_orb_rec_*.bsp") if p.is_file())
    intervals = [(a, b, path) for path in candidates
                 for a, b in _coverage(sp, path, int(ORBITERS[orbiter]))]
    selected = []
    cursor = start
    while True:
        covering = [(a, b, p) for a, b, p in intervals if a <= cursor <= b]
        if not covering:
            raise ValueError(f"{orbiter}: SPKs do not cover the requested window under {root}")
        _, reach, path = min(covering, key=lambda item: (-item[1], item[2].name))
        if path not in selected:
            selected.append(path)
        if reach >= end:
            return candidates if orbiter in mission_order else selected
        if reach <= cursor:
            raise ValueError(f"{orbiter}: gap in SPK coverage under {root}")
        cursor = reach


@contextmanager
def _geometry_kernels(kernel_dir, start_utc: str, end_utc: str, orbiters: bool = False):
    root = Path(kernel_dir)
    roles = [("naif0012.tls", "naif-lsk"), ("pck00011.tpc", "naif-pck"),
             ("mar099s.bsp", "naif-mar099s"), ("de440s.bsp", "naif-de440s")]
    files = [(_find_one(root, name), source_id) for name, source_id in roles]
    with _kernel_pool([path for path, _ in files]) as sp:
        start, end = sp.str2et(start_utc), sp.str2et(end_utc)
        for body in (399, 4, 10):  # Earth, Mars barycenter, Sun
            _require_coverage(sp, files[3][0], body, start, end)
        _require_coverage(sp, files[2][0], 499, start, end)
        if orbiters:
            for orbiter, source_id in (("mro", "naif-mro-spk"),
                                       ("maven", "naif-maven-spk"), ("tgo", "esa-tgo-spk")):
                for path in _orbiter_files(sp, root, orbiter, start, end):
                    sp.furnsh(str(path))
                    files.append((path, source_id))
        yield sp, files


def _light_time(sp, et: float) -> float:
    return float(sp.spkpos("EARTH", et, "J2000", "LT", "MARS BARYCENTER")[1])


def _sep_angle(sp, et: float) -> float:
    sun, _ = sp.spkpos("SUN", et, "J2000", "NONE", "EARTH")
    mars, _ = sp.spkpos("MARS BARYCENTER", et, "J2000", "NONE", "EARTH")
    return math.degrees(sp.vsep(sun, mars))


def _elevation(fixed_position, site: tuple[float, float, float]) -> float:
    relative = [body - surface for body, surface in zip(fixed_position, site)]
    norm = math.sqrt(sum(component * component for component in relative))
    radius = config.MARS_RADIUS_M / 1000
    sine = sum(a * b for a, b in zip(site, relative)) / (radius * norm)
    return math.degrees(math.asin(max(-1.0, min(1.0, sine))))


def _earth_elevation(sp, et: float, site: tuple[float, float, float]) -> float:
    earth, _ = sp.spkpos("EARTH", et, "J2000", "NONE", "MARS BARYCENTER")
    fixed = sp.mxv(sp.pxform("J2000", "IAU_MARS", et), earth)
    return _elevation(fixed, site)


def light_time_s(t_utc: str, kernel_dir) -> float:
    """One-way Mars-Earth LT-corrected light time in seconds."""
    _parse_utc(t_utc)
    with _geometry_kernels(kernel_dir, t_utc, t_utc) as (sp, _):
        return _light_time(sp, sp.str2et(t_utc))


def sun_earth_mars_angle_deg(t_utc: str, kernel_dir) -> float:
    """Geometric Sun-Earth-Mars angle, with the vertex at Earth."""
    _parse_utc(t_utc)
    with _geometry_kernels(kernel_dir, t_utc, t_utc) as (sp, _):
        return _sep_angle(sp, sp.str2et(t_utc))


def earth_elevation_deg(t_utc: str, lat_deg: float, lon_east_deg: float, kernel_dir) -> float:
    """Earth elevation above the spherical site's local horizon."""
    _parse_utc(t_utc)
    site = site_position_km(lat_deg, lon_east_deg)
    with _geometry_kernels(kernel_dir, t_utc, t_utc) as (sp, _):
        return _earth_elevation(sp, sp.str2et(t_utc), site)


def _sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def build_earth_link_table(start_utc: str, end_utc: str, site_lat_deg: float,
                           site_lon_east_deg: float, kernel_dir, link_values: dict) -> dict:
    """Build deterministic six-decimal geometry and a manifest of every loaded kernel."""
    times = time_grid(start_utc, end_utc)
    site = site_position_km(site_lat_deg, site_lon_east_deg)
    rows = []
    with _geometry_kernels(kernel_dir, start_utc, end_utc, orbiters=True) as (sp, files):
        kernels = [{"file": path.name, "sha256": _sha256(path), "source_id": source_id}
                   for path, source_id in sorted(files, key=lambda item: item[0].name)]
        for stamp in times:
            et = sp.str2et(stamp)
            elevations = {}
            for orbiter, body in ORBITERS.items():
                fixed, _ = sp.spkpos(body, et, "IAU_MARS", "NONE", "MARS")
                elevations[orbiter] = round(_elevation(fixed, site), 6)
            rows.append({"t_utc": stamp, "light_time_s": round(_light_time(sp, et), 6),
                         "sep_angle_deg": round(_sep_angle(sp, et), 6),
                         "earth_elev_deg": round(_earth_elevation(sp, et, site), 6),
                         "orbiters": elevations})
    return assemble_earth_link_table(rows, link_values, kernels)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="First UTC sample (YYYY-MM-DDTHH:MM:SSZ)")
    parser.add_argument("--end", required=True, help="Last UTC sample, inclusive if on the 60 s grid")
    parser.add_argument("--kernel-dir", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    # Data lead's first choice, docs/ops/feasibility/hab-site.md, 2026-11-07.
    parser.add_argument("--site-lat-deg", type=float, default=-4.83787)
    parser.add_argument("--site-lon-east-deg", type=float, default=137.39756)
    repo_root = Path(__file__).resolve().parents[3]
    parser.add_argument("--link-param-set", type=Path, default=(
        repo_root / "scenarios/storm-sol4190/param_sets/link-assumed.json"))
    args = parser.parse_args(argv)
    param_set = json.loads(args.link_param_set.read_text(encoding="utf-8"))
    if param_set["kind"] != "link":
        parser.error("--link-param-set must have kind 'link'")
    table = build_earth_link_table(args.start, args.end, args.site_lat_deg,
                                   args.site_lon_east_deg, args.kernel_dir, param_set["values"])
    encoded = (json.dumps(table, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")
    args.out.write_bytes(encoded)
    print("Kernels: MRO psp71 then psp71_ssd_mro95a; TGO fsp_335 then fsp_352 "
          "(later files take priority). Mars bridge: mar099s then de440s.")
    print("TGO before 2024-05-20T22:45:10Z comes from fsp_335 only and is likely "
          "predicted: TODO(verify), see T21.02. From that epoch fsp_352 takes "
          "priority (May data reconstructed; delivered September 2024).")
    print(f"{hashlib.sha256(encoded).hexdigest()}  {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
