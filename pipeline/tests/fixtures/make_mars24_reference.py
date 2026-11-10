"""Generate fixture F6 (apps/web/tests/fixtures/mars24-reference.json) using marstime.

Task T06.02 (FR-11, 02 §D.5).
Generates Mars24 reference values (MSD, L_s, Mars Year, LTST, solar elevation,
azimuth, flat-horizon sunrise/sunset) for reference timestamps at Gale Crater.

Outputs are generated entirely from the Python marstime package; no science
numbers are typed by hand.

Sunrise/sunset selection (repair 2026-11-10): both events are taken from the local sol that
contains the timestamp (LTST 0 h to the next 0 h), never from a neighbouring sol, and a sol with
no sunrise/sunset pair raises instead of falling back to the nearest event. The earlier selection
could return a sunrise of the next sol with a sunset of this sol for timestamps after sunset.
The committed F6 JSON was NOT regenerated (marstime is not pinned; TODO(verify)): its four records
lie in sols whose events the corrected selection also returns (checked against the TypeScript
implementation within 2 s in packages/compute/tests/sun.test.ts).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import sys

try:
    import marstime
except ImportError:
    sys.exit("Error: 'marstime' is required. Run 'pip install marstime' first.")

ROOT = Path(__file__).resolve().parents[3]
DESTINATION = ROOT / "apps/web/tests/fixtures/mars24-reference.json"

# 05 §F.1 Gale Crater AOI center coordinate (declared synthetic reference point)
SITE_LAT = -4.70
SITE_LON_E = 137.38
# 02 §C.4.1: marstime expects planetographic west longitude
SITE_LON_W = (360.0 - SITE_LON_E) % 360.0

# At least 3 reference timestamps within 2000-2100 (02 §D.5, 02 §E.2, 02 §E.3)
REFERENCE_TIMESTAMPS = [
    {
        "utc": "2026-11-14T08:00:00Z",
        "description": "02 §E.2 / 05 §F.3 plan start UTC example (early morning)",
    },
    {
        "utc": "2026-11-14T12:00:00Z",
        "description": "Midday sample on the same sol (high solar elevation)",
    },
    {
        "utc": "2024-05-18T06:00:00Z",
        "description": "Sol 4190 solar particle event scenario start (May 2024)",
    },
    {
        "utc": "2012-08-06T05:17:57Z",
        "description": "MSL Curiosity touchdown instant at Gale Crater",
    },
]


def get_j2000_ott(dt: datetime) -> float:
    """Compute offset from J2000 epoch in Terrestrial Time (TT) days."""
    m = dt.timestamp() * 1000.0
    jday_utc = marstime.julian(m)
    jday_tt = marstime.julian_tt(jday_utc)
    return marstime.j2000_offset_tt(jday_tt)


def format_ltst(ltst_hours: float) -> str:
    """Format decimal LTST hours into HH:MM string."""
    h = int(ltst_hours) % 24
    mins = int(round((ltst_hours - int(ltst_hours)) * 60))
    if mins == 60:
        h = (h + 1) % 24
        mins = 0
    return f"{h:02d}:{mins:02d}"


def get_elevation(dt: datetime, lat: float, lon_w: float) -> float:
    """Compute solar elevation angle in degrees for flat horizon."""
    ott = get_j2000_ott(dt)
    return float(marstime.solar_elevation(lon_w, lat, ott))


def bisect_elevation_crossing(
    dt_start: datetime, dt_end: datetime, lat: float, lon_w: float, max_iter: int = 40
) -> datetime:
    """Bisect time interval to find zero crossing of solar elevation (flat horizon)."""
    t_low = dt_start
    t_high = dt_end
    e_low = get_elevation(t_low, lat, lon_w)

    for _ in range(max_iter):
        t_mid = t_low + (t_high - t_low) / 2
        e_mid = get_elevation(t_mid, lat, lon_w)
        if abs(e_mid) < 1e-7 or (t_high - t_low).total_seconds() < 0.01:
            return t_mid
        if (e_low <= 0 and e_mid <= 0) or (e_low > 0 and e_mid > 0):
            t_low = t_mid
        else:
            t_high = t_mid

    return t_mid


# Mean Mars solar day in Earth seconds (1.027491252 Earth days; Allison & McEwen 2000).
SOL_SECONDS = 1.027491252 * 86400.0
SOLAR_HOUR_SECONDS = SOL_SECONDS / 24.0


def ltst_hours_at(dt: datetime, lon_w: float) -> float:
    """Local true solar time in hours [0, 24) from marstime."""
    return float(marstime.Local_True_Solar_Time(lon_w, get_j2000_ott(dt))) % 24.0


def refine_to_ltst(dt: datetime, target_hours: float, lon_w: float) -> datetime:
    """Instant near `dt` at which LTST equals `target_hours` (iterate on the wrapped LTST error)."""
    t = dt
    for _ in range(8):
        err_h = ((ltst_hours_at(t, lon_w) - target_hours + 12.0) % 24.0) - 12.0
        if abs(err_h) * SOLAR_HOUR_SECONDS < 0.5:
            break
        t = t - timedelta(seconds=err_h * SOLAR_HOUR_SECONDS)
    return t


def local_sol_bounds(dt_base: datetime, lon_w: float) -> tuple[datetime, datetime]:
    """Local true solar midnights (LTST 0 h) at or before dt_base and the next one after it."""
    ltst = ltst_hours_at(dt_base, lon_w)
    start = refine_to_ltst(dt_base - timedelta(seconds=ltst * SOLAR_HOUR_SECONDS), 0.0, lon_w)
    if start > dt_base:
        start = refine_to_ltst(start - timedelta(seconds=SOL_SECONDS), 0.0, lon_w)
    end = refine_to_ltst(start + timedelta(seconds=SOL_SECONDS), 0.0, lon_w)
    return start, end


def select_sol_events(
    crossings: list[tuple[datetime, str]], sol_start: datetime, sol_end: datetime
) -> tuple[datetime, datetime]:
    """Pick the sunrise and sunset that both lie inside [sol_start, sol_end).

    Crossings outside the local sol belong to the neighbouring sols and are never borrowed. Raises
    ValueError when the sol does not hold exactly one sunrise followed by one sunset (no fallback).
    """
    inside = sorted((t, kind) for t, kind in crossings if sol_start <= t < sol_end)
    sunrises = [t for t, kind in inside if kind == "sunrise"]
    sunsets = [t for t, kind in inside if kind == "sunset"]
    if len(sunrises) != 1 or len(sunsets) != 1 or not sunrises[0] < sunsets[0]:
        raise ValueError(
            f"expected one sunrise followed by one sunset inside the local sol "
            f"{sol_start.isoformat()} to {sol_end.isoformat()}, got {len(sunrises)} sunrise(s) and {len(sunsets)} sunset(s)"
        )
    return sunrises[0], sunsets[0]


def find_sol_sunrise_sunset(
    dt_base: datetime, lat: float, lon_w: float
) -> dict[str, str]:
    """Flat-horizon sunrise and sunset of the local sol (LTST 0 h to the next 0 h) containing dt_base."""
    sol_start, sol_end = local_sol_bounds(dt_base, lon_w)

    # Scan the whole sol in 2-minute steps for elevation zero crossings.
    step_seconds = 120
    n_steps = int((sol_end - sol_start).total_seconds() // step_seconds) + 1
    sample_times = [sol_start + timedelta(seconds=i * step_seconds) for i in range(n_steps + 1)]
    elevations = [get_elevation(t, lat, lon_w) for t in sample_times]

    crossings: list[tuple[datetime, str]] = []
    for i in range(len(elevations) - 1):
        if (elevations[i] <= 0 and elevations[i + 1] > 0) or (elevations[i] > 0 and elevations[i + 1] <= 0):
            t_cross = bisect_elevation_crossing(sample_times[i], sample_times[i + 1], lat, lon_w)
            # Determine if sunrise (going up) or sunset (going down)
            is_rising = get_elevation(t_cross + timedelta(seconds=30), lat, lon_w) > 0
            crossings.append((t_cross, "sunrise" if is_rising else "sunset"))

    sunrise_dt, sunset_dt = select_sol_events(crossings, sol_start, sol_end)

    sr_ott = get_j2000_ott(sunrise_dt)
    ss_ott = get_j2000_ott(sunset_dt)
    sr_ltst_h = float(marstime.Local_True_Solar_Time(lon_w, sr_ott))
    ss_ltst_h = float(marstime.Local_True_Solar_Time(lon_w, ss_ott))

    return {
        "sunrise_utc": sunrise_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sunset_utc": sunset_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sunrise_ltst": format_ltst(sr_ltst_h),
        "sunset_ltst": format_ltst(ss_ltst_h),
    }


def build_fixture() -> dict:
    """Build the complete F6 Mars24 reference fixture dictionary."""
    records = []

    for item in REFERENCE_TIMESTAMPS:
        iso_str = item["utc"]
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        ott = get_j2000_ott(dt)

        msd = float(marstime.Mars_Solar_Date(ott))
        ls = float(marstime.Mars_Ls(ott))
        my = int(marstime.Mars_Year(ott))
        eot = float(marstime.equation_of_time(ott))
        ltst_h = float(marstime.Local_True_Solar_Time(SITE_LON_W, ott))
        ltst_str = format_ltst(ltst_h)
        dec = float(marstime.solar_declination(ls))
        elev = float(marstime.solar_elevation(SITE_LON_W, SITE_LAT, ott))
        az_raw = float(marstime.solar_azimuth(SITE_LON_W, SITE_LAT, ott))

        # Standard spherical trigonometry azimuth (Allison & McEwen 2000 Eq. 41)
        ha = float(marstime.hourangle(SITE_LON_W, ott))
        dec_rad = math.radians(dec)
        lat_rad = math.radians(SITE_LAT)
        denom = math.cos(lat_rad) * math.tan(dec_rad) - math.sin(lat_rad) * math.cos(ha)
        num = math.sin(ha)
        az_std = (360.0 + math.atan2(num, denom) * 180.0 / math.pi) % 360.0

        sol_events = find_sol_sunrise_sunset(dt, SITE_LAT, SITE_LON_W)

        records.append({
            "utc": iso_str,
            "description": item["description"],
            "msd": round(msd, 6),
            "ls_deg": round(ls, 4),
            "mars_year": my,
            "equation_of_time_deg": round(eot, 4),
            "ltst_hours": round(ltst_h, 6),
            "ltst": ltst_str,
            "solar_declination_deg": round(dec, 4),
            "solar_elevation_deg": round(elev, 4),
            "solar_azimuth_marstime_deg": round(az_raw, 4),
            "solar_azimuth_standard_deg": round(az_std, 4),
            "sunrise_sunset": sol_events,
        })

    version_val = getattr(marstime, "__version__", getattr(marstime, "version", None))
    if callable(version_val):
        version_str = str(version_val())
    elif isinstance(version_val, str) and version_val:
        version_str = version_val
    else:
        raise RuntimeError("Unable to determine marstime package version from module attributes")

    return {
        "$comment": "Mars24 reference fixture F6 generated by pipeline/tests/fixtures/make_mars24_reference.py. Do not edit by hand.",
        "generator": "pipeline/tests/fixtures/make_mars24_reference.py",
        "marstime_version": str(version_str),
        "site": {
            "lat": SITE_LAT,
            "lon_e": SITE_LON_E,
            "lon_w": round(SITE_LON_W, 2),
            "source": "05 §F.1 crs.proj4 centre, declared synthetic",
            "longitude_conventions": {
                "app": "east-positive degrees (IAU_2015:49900)",
                "marstime": "planetographic west degrees (02 §C.4.1)",
            },
        },
        "records": records,
    }


def main() -> None:
    fixture = build_fixture()
    payload = (json.dumps(fixture, indent=2, sort_keys=False) + "\n").encode("utf-8")

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if not DESTINATION.exists() or DESTINATION.read_bytes() != payload:
        DESTINATION.write_bytes(payload)
        print(f"Generated fixture F6: {DESTINATION} ({len(payload)} bytes)")
    else:
        print(f"Fixture F6 is already up to date: {DESTINATION}")


if __name__ == "__main__":
    main()
