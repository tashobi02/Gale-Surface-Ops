"""Package traverse and POIs as GeoJSON in working-projection metres (docs/specs/02 §C.2 L6; 05 §C POI, TraversePoint).

FR-04, FR-17. Supports PDS PLACES CSV and MMGIS GeoJSON traverse sources with AOI margin clipping.
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

# Fallback Mars radius (m) per IAU_2015:49900 spherical datum (02 §C.1)
_MARS_RADIUS_M = 3396190


def _parse_proj4_params(proj4: str) -> dict[str, float]:
    """Parse numeric parameters from a proj4 string for equirectangular projection."""
    params: dict[str, float] = {
        "lat_ts": 0.0,
        "lat_0": 0.0,
        "lon_0": 0.0,
        "x_0": 0.0,
        "y_0": 0.0,
        "R": float(_MARS_RADIUS_M),
    }
    for token in proj4.split():
        if token.startswith("+") and "=" in token:
            key, val = token[1:].split("=", 1)
            try:
                params[key] = float(val)
            except ValueError:
                pass
    return params


def _project_point(lon_e: float, lat: float, proj4: str) -> tuple[float, float]:
    """Project planetocentric (lon_e, lat) in degrees to working-projection metres (x_m, y_m).

    Uses pyproj when installed; falls back to exact spherical equirectangular projection math.
    """
    try:
        import pyproj
        crs = pyproj.CRS.from_proj4(proj4)
        transformer = pyproj.Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        x, y = transformer.transform(lon_e, lat)
        return float(x), float(y)
    except (ImportError, Exception):
        # Exact spherical equirectangular projection formula (+proj=eqc)
        params = _parse_proj4_params(proj4)
        r = params.get("R", float(_MARS_RADIUS_M))
        lat_ts_rad = math.radians(params.get("lat_ts", 0.0))
        lat_0_rad = math.radians(params.get("lat_0", 0.0))
        lon_0_rad = math.radians(params.get("lon_0", 0.0))
        x_0 = params.get("x_0", 0.0)
        y_0 = params.get("y_0", 0.0)

        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon_e)

        x = r * (lon_rad - lon_0_rad) * math.cos(lat_ts_rad) + x_0
        y = r * (lat_rad - lat_0_rad) + y_0
        return float(x), float(y)


def _clean_coord(val: float) -> float:
    """Round coordinate in metres to 2 decimal places (centimetres), avoiding -0.0."""
    rounded = round(val, 2)
    return 0.0 if abs(rounded) < 1e-6 else rounded


def _resolve_aoi_extent(
    out: Path,
    src: Path,
    provided_extent: tuple[float, float, float, float] | list[float] | None,
) -> tuple[float, float, float, float] | None:
    """Find AOI extent_m if not provided explicitly."""
    if provided_extent is not None and len(provided_extent) == 4:
        return (
            float(provided_extent[0]),
            float(provided_extent[1]),
            float(provided_extent[2]),
            float(provided_extent[3]),
        )

    candidates = [
        out.parent.parent / "site.json",
        Path("pipeline/sites") / out.parent.parent.name / "site.json",
        out.parent / "site.json",
        src.parent / "site.json",
    ]
    if "gale_boxwork" in str(out) or "gale_boxwork" in str(src):
        candidates.append(Path("pipeline/sites/gale_boxwork/site.json"))

    for candidate in candidates:
        if candidate.is_file():
            try:
                data = json.loads(candidate.read_text(encoding="utf-8"))
                extent = data.get("aoi", {}).get("extent_m")
                if isinstance(extent, list) and len(extent) == 4:
                    return (
                        float(extent[0]),
                        float(extent[1]),
                        float(extent[2]),
                        float(extent[3]),
                    )
            except Exception:
                pass
    return None


def package_pois(curated: Path, proj4: str, out: Path) -> None:
    """Write vectors/pois.geojson; every POI keeps credit and position source (01 FR-04). TASK-04.

    Accepts curated directory of POI JSON files (C5 layout).
    Outputs FeatureCollection of Point features in working-projection metres.
    """
    if not curated.is_dir():
        raise FileNotFoundError(f"Curated POI directory not found: {curated}")

    poi_files = sorted(curated.glob("*.json"))
    features: list[dict[str, Any]] = []

    for file_path in poi_files:
        record = json.loads(file_path.read_text(encoding="utf-8"))

        # Verify required 05 POI properties
        for req in [
            "poi_id", "name", "lat", "lon_e", "science_objective",
            "why_it_matters", "position_source", "position_uncertainty_m",
            "provenance"
        ]:
            if req not in record:
                raise ValueError(f"{file_path.name}: missing required POI field '{req}'")

        if record.get("image_asset") and not (record.get("image_credit") and record.get("image_source_url")):
            raise ValueError(
                f"{file_path.name}: POI with image_asset requires image_credit and image_source_url"
            )

        lat = float(record["lat"])
        lon_e = float(record["lon_e"])
        x_m, y_m = _project_point(lon_e, lat, proj4)

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [_clean_coord(x_m), _clean_coord(y_m)],
            },
            "properties": record,
        }
        features.append(feature)

    feature_collection = {
        "type": "FeatureCollection",
        "features": features,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(feature_collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def package_traverse(
    src: Path,
    proj4: str,
    out: Path,
    aoi_extent_m: tuple[float, float, float, float] | list[float] | None = None,
    margin_m: float = 100.0,
) -> None:
    """Write vectors/traverse.geojson (Points with sol, source_id + one LineString). TASK-04.

    Parses either PDS PLACES CSV or MMGIS GeoJSON traverse source.
    Clips points to the AOI extent plus margin_m (default 100 m per data-lead decision U-04).
    """
    if not src.is_file():
        raise FileNotFoundError(f"Traverse source file not found: {src}")

    extent = _resolve_aoi_extent(out, src, aoi_extent_m)
    clip_box: tuple[float, float, float, float] | None = None
    if extent is not None:
        clip_box = (
            extent[0] - margin_m,
            extent[1] - margin_m,
            extent[2] + margin_m,
            extent[3] + margin_m,
        )

    points: list[dict[str, Any]] = []
    default_source_id = "pds-msl-places-localizations"

    # Detect source format
    is_csv = src.suffix.lower() == ".csv"
    if not is_csv:
        try:
            with src.open("r", encoding="utf-8") as f:
                first_char = f.read(1)
                if first_char not in ("{", "["):
                    is_csv = True
        except Exception:
            pass

    if is_csv:
        with src.open("r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            has_frame = "frame" in (reader.fieldnames or [])
            for row in reader:
                if has_frame and row.get("frame") != "ROVER":
                    continue

                sol = int(float(row["sol"]))
                lat = float(row.get("planetocentric_latitude") or row.get("lat", 0.0))
                lon_e = float(row.get("longitude") or row.get("lon") or row.get("lon_e", 0.0))

                elevation_m: float | None = None
                raw_elev = row.get("elevation") or row.get("elev_geoid") or row.get("elevation_m")
                if raw_elev is not None and raw_elev != "":
                    try:
                        elevation_m = float(raw_elev)
                    except ValueError:
                        pass

                site = row.get("site")
                drive = row.get("drive")
                if site is not None and drive is not None and site != "" and drive != "":
                    site_drive = f"{site}_{drive}"
                else:
                    site_drive = row.get("site_drive") or row.get("RMC")

                source_id = row.get("source_id") or default_source_id

                x_m, y_m = _project_point(lon_e, lat, proj4)
                if clip_box is not None:
                    if not (clip_box[0] <= x_m <= clip_box[2] and clip_box[1] <= y_m <= clip_box[3]):
                        continue

                point_props: dict[str, Any] = {
                    "sol": sol,
                    "source_id": source_id,
                }
                if site_drive:
                    point_props["site_drive"] = site_drive
                point_props["lat"] = lat
                point_props["lon_e"] = lon_e
                if elevation_m is not None:
                    point_props["elevation_m"] = _clean_coord(elevation_m)

                points.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [_clean_coord(x_m), _clean_coord(y_m)],
                    },
                    "properties": point_props,
                })
    else:
        # GeoJSON source
        data = json.loads(src.read_text(encoding="utf-8"))
        features = data.get("features", [])
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [])

            sol = int(props.get("sol", 0))
            lon_e = float(props.get("lon_e") or props.get("lon") or (coords[0] if len(coords) > 0 else 0.0))
            lat = float(props.get("lat") or (coords[1] if len(coords) > 1 else 0.0))

            elevation_m: float | None = None
            if len(coords) > 2:
                elevation_m = float(coords[2])
            elif props.get("elev_geoid") is not None:
                elevation_m = float(props["elev_geoid"])
            elif props.get("elevation_m") is not None:
                elevation_m = float(props["elevation_m"])

            site = props.get("site")
            drive = props.get("drive")
            if site is not None and drive is not None:
                site_drive = f"{site}_{drive}"
            else:
                site_drive = props.get("site_drive") or props.get("RMC")

            source_id = props.get("source_id") or default_source_id

            x_m, y_m = _project_point(lon_e, lat, proj4)
            if clip_box is not None:
                if not (clip_box[0] <= x_m <= clip_box[2] and clip_box[1] <= y_m <= clip_box[3]):
                    continue

            point_props = {
                "sol": sol,
                "source_id": source_id,
            }
            if site_drive:
                point_props["site_drive"] = str(site_drive)
            point_props["lat"] = lat
            point_props["lon_e"] = lon_e
            if elevation_m is not None:
                point_props["elevation_m"] = _clean_coord(elevation_m)

            points.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [_clean_coord(x_m), _clean_coord(y_m)],
                },
                "properties": point_props,
            })

    # Exactly one LineString feature connecting all points in sequence
    line_coords = [p["geometry"]["coordinates"] for p in points]
    line_feature = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": line_coords,
        },
        "properties": {
            "source_id": points[0]["properties"]["source_id"] if points else default_source_id,
        },
    }

    feature_collection = {
        "type": "FeatureCollection",
        "features": [*points, line_feature],
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(feature_collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
