"""Package traverse and POIs as GeoJSON in working-projection metres (docs/specs/02 §C.2 L6; 05 §C POI, TraversePoint).

FR-04, FR-17. Supports PDS PLACES CSV and MMGIS GeoJSON traverse sources with AOI margin clipping.
Coordinates go through pyproj with the site's Mars ``+proj=eqc`` string only (02 §C.1, §C.4):
planetocentric latitude, east-positive longitude, never EPSG:3857 or WGS84.
"""
from __future__ import annotations

import csv
import json
from collections.abc import Iterator, Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

PROVENANCE_CLASSES = frozenset({"measured", "derived", "modelled", "assumed", "replayed", "simulated"})
MAX_POI_TEXT_CHARS = 300  # 05 §C POI: science_objective and why_it_matters
DEFAULT_TRAVERSE_SOURCE_ID = "pds-msl-places-localizations"
_REQUIRED_POI_FIELDS = (
    "poi_id", "name", "lat", "lon_e", "science_objective", "why_it_matters",
    "position_source", "position_uncertainty_m", "provenance",
)
_POI_TEXT_FIELDS = ("science_objective", "why_it_matters")
_CSV_LAT_KEYS = ("planetocentric_latitude", "lat")
_CSV_LON_KEYS = ("longitude", "lon", "lon_e")
_CSV_ELEVATION_KEYS = ("elevation", "elev_geoid", "elevation_m")
_GEOJSON_LON_KEYS = ("lon_e", "lon")
_GEOJSON_ELEVATION_KEYS = ("elev_geoid", "elevation_m")


@lru_cache(maxsize=None)
def _transformer(proj4: str) -> Any:
    """Build the planetocentric-degrees to working-metres transformer once per projection string."""
    import pyproj

    crs = pyproj.CRS.from_proj4(proj4)
    return pyproj.Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def _project_point(lon_e: float, lat: float, proj4: str) -> tuple[float, float]:
    """Project planetocentric (lon_e, lat) in degrees to working-projection metres (x_m, y_m)."""
    x, y = _transformer(proj4).transform(lon_e, lat)
    return float(x), float(y)


def _clean_coord(val: float) -> float:
    """Round coordinate in metres to 2 decimal places (centimetres), avoiding -0.0."""
    rounded = round(val, 2)
    return 0.0 if abs(rounded) < 1e-6 else rounded


def _present(value: Any) -> bool:
    """True for any value except None and the empty string, so a real 0 is kept."""
    return value is not None and value != ""


def _first_present(mapping: Mapping[str, Any], keys: Sequence[str]) -> Any:
    """First value among ``keys`` that is present (0 counts as present), else None."""
    for key in keys:
        if _present(mapping.get(key)):
            return mapping[key]
    return None


def _require(value: Any, what: str, where: str) -> Any:
    if not _present(value):
        raise ValueError(f"{where}: missing required traverse value '{what}'")
    return value


def _validated_extent(aoi_extent_m: Sequence[float] | None) -> tuple[float, float, float, float]:
    """The AOI extent_m as four floats; the clip is never silently skipped."""
    if aoi_extent_m is None or len(aoi_extent_m) != 4:
        raise ValueError(
            "package_traverse needs the AOI extent [minx, miny, maxx, maxy] in metres "
            "(aoi_extent_m, from site.json aoi.extent_m); it will not guess one"
        )
    min_x, min_y, max_x, max_y = (float(v) for v in aoi_extent_m)
    if not (min_x < max_x and min_y < max_y):
        raise ValueError(f"AOI extent must satisfy min < max on both axes, got {list(aoi_extent_m)}")
    return min_x, min_y, max_x, max_y


def _validate_poi(record: Mapping[str, Any], name: str) -> None:
    """Enforce the 05 §C POI rules for one curated record."""
    for req in _REQUIRED_POI_FIELDS:
        if req not in record:
            raise ValueError(f"{name}: missing required POI field '{req}'")
    for field in _POI_TEXT_FIELDS:
        text = record[field]
        if not isinstance(text, str) or len(text) > MAX_POI_TEXT_CHARS:
            raise ValueError(f"{name}: '{field}' must be a string of at most {MAX_POI_TEXT_CHARS} characters")
    uncertainty = record["position_uncertainty_m"]
    if isinstance(uncertainty, bool) or not isinstance(uncertainty, (int, float)) or uncertainty < 0:
        raise ValueError(f"{name}: 'position_uncertainty_m' must be a number >= 0, got {uncertainty!r}")
    if record["provenance"] not in PROVENANCE_CLASSES:
        raise ValueError(
            f"{name}: 'provenance' must be one of {sorted(PROVENANCE_CLASSES)}, got {record['provenance']!r}"
        )
    if record.get("image_asset") and not (record.get("image_credit") and record.get("image_source_url")):
        raise ValueError(f"{name}: POI with image_asset requires image_credit and image_source_url")


def package_pois(curated: Path, proj4: str, out: Path) -> None:
    """Write vectors/pois.geojson; every POI keeps credit and position source (01 FR-04). TASK-04.

    Accepts curated directory of POI JSON files (C5 layout).
    Outputs FeatureCollection of Point features in working-projection metres.
    """
    if not curated.is_dir():
        raise FileNotFoundError(f"Curated POI directory not found: {curated}")

    features: list[dict[str, Any]] = []
    for file_path in sorted(curated.glob("*.json")):
        record = json.loads(file_path.read_text(encoding="utf-8"))
        _validate_poi(record, file_path.name)
        x_m, y_m = _project_point(float(record["lon_e"]), float(record["lat"]), proj4)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [_clean_coord(x_m), _clean_coord(y_m)]},
            "properties": record,
        })

    _write_feature_collection(out, features)


def package_poi_images(curated: Path, images_src: Path, out_dir: Path) -> None:
    """Copy the locked image of every POI that names one to `out_dir/<poi_id>.jpg` (02 §E.1), byte for byte.

    The POI's `image_asset` must be `img-<poi_id without its `poi-` prefix>` (the manifest's asset id rule) and
    the source file `images_src/<poi_id>.jpg` must exist; either failure stops the build. A site with no POI
    folder has nothing to copy.
    """
    import shutil

    if not curated.is_dir():
        return
    for file_path in sorted(curated.glob("*.json")):
        record = json.loads(file_path.read_text(encoding="utf-8"))
        if not record.get("image_asset"):
            continue
        poi_id = record["poi_id"]
        expected = f"img-{poi_id.removeprefix('poi-')}"
        if record["image_asset"] != expected:
            raise ValueError(f"{poi_id}: image_asset {record['image_asset']!r} must be {expected!r}")
        source = images_src / f"{poi_id}.jpg"
        if not source.is_file():
            raise FileNotFoundError(f"{poi_id}: image file not found: {source}")
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, out_dir / f"{poi_id}.jpg")


def _site_drive(site: Any, drive: Any, fallback: Any) -> str | None:
    if _present(site) and _present(drive):
        return f"{site}_{drive}"
    return str(fallback) if _present(fallback) else None


def _optional_float(value: Any, what: str, where: str) -> float | None:
    if not _present(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{where}: '{what}' is not a number: {value!r}") from exc


def _read_places_csv(src: Path) -> Iterator[dict[str, Any]]:
    """Yield normalised fixes from a PDS PLACES CSV (ROVER frame rows only when a frame column exists)."""
    with src.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        has_frame = "frame" in (reader.fieldnames or [])
        for line, row in enumerate(reader, start=2):
            if has_frame and row.get("frame") != "ROVER":
                continue
            where = f"{src.name}:{line}"
            yield {
                "sol": int(float(_require(row.get("sol"), "sol", where))),
                "lat": float(_require(_first_present(row, _CSV_LAT_KEYS), "latitude", where)),
                "lon_e": float(_require(_first_present(row, _CSV_LON_KEYS), "longitude", where)),
                "elevation_m": _optional_float(_first_present(row, _CSV_ELEVATION_KEYS), "elevation", where),
                "site_drive": _site_drive(row.get("site"), row.get("drive"), _first_present(row, ("site_drive", "RMC"))),
                "source_id": row.get("source_id") or DEFAULT_TRAVERSE_SOURCE_ID,
            }


def _read_geojson(src: Path) -> Iterator[dict[str, Any]]:
    """Yield normalised fixes from an MMGIS GeoJSON traverse (properties first, then Point coordinates)."""
    data = json.loads(src.read_text(encoding="utf-8"))
    for index, feat in enumerate(data.get("features", [])):
        props = feat.get("properties") or {}
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        where = f"{src.name}:feature {index}"
        lon_e = _first_present(props, _GEOJSON_LON_KEYS)
        if lon_e is None and len(coords) > 0:
            lon_e = coords[0]
        lat = props.get("lat")
        if not _present(lat) and len(coords) > 1:
            lat = coords[1]
        elevation = coords[2] if len(coords) > 2 else _first_present(props, _GEOJSON_ELEVATION_KEYS)
        yield {
            "sol": int(float(_require(props.get("sol"), "sol", where))),
            "lat": float(_require(lat, "latitude", where)),
            "lon_e": float(_require(lon_e, "longitude", where)),
            "elevation_m": _optional_float(elevation, "elevation", where),
            "site_drive": _site_drive(props.get("site"), props.get("drive"), _first_present(props, ("site_drive", "RMC"))),
            "source_id": props.get("source_id") or DEFAULT_TRAVERSE_SOURCE_ID,
        }


def _read_traverse(src: Path) -> Iterator[dict[str, Any]]:
    suffix = src.suffix.lower()
    if suffix == ".csv":
        return _read_places_csv(src)
    if suffix in (".geojson", ".json"):
        return _read_geojson(src)
    raise ValueError(f"Unsupported traverse source '{src.name}': expected .csv (PLACES) or .geojson/.json (MMGIS)")


def _write_feature_collection(out: Path, features: list[dict[str, Any]]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    collection = {"type": "FeatureCollection", "features": features}
    out.write_text(json.dumps(collection, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def package_traverse(
    src: Path,
    proj4: str,
    out: Path,
    aoi_extent_m: Sequence[float] | None = None,
    margin_m: float = 100.0,
) -> None:
    """Write vectors/traverse.geojson (Points with sol, source_id + one LineString). TASK-04.

    Parses either PDS PLACES CSV (``.csv``) or MMGIS GeoJSON (``.geojson`` / ``.json``).
    Clips points to ``aoi_extent_m`` plus ``margin_m`` (default 100 m per data-lead decision U-04).
    ``aoi_extent_m`` (the site's ``aoi.extent_m``) is required in practice: a missing or malformed
    extent raises ValueError rather than skipping the clip.
    """
    if not src.is_file():
        raise FileNotFoundError(f"Traverse source file not found: {src}")
    min_x, min_y, max_x, max_y = _validated_extent(aoi_extent_m)
    box = (min_x - margin_m, min_y - margin_m, max_x + margin_m, max_y + margin_m)

    points: list[dict[str, Any]] = []
    for fix in _read_traverse(src):
        x_m, y_m = _project_point(fix["lon_e"], fix["lat"], proj4)
        if not (box[0] <= x_m <= box[2] and box[1] <= y_m <= box[3]):
            continue
        props: dict[str, Any] = {"sol": fix["sol"], "source_id": fix["source_id"]}
        if fix["site_drive"]:
            props["site_drive"] = fix["site_drive"]
        props["lat"] = fix["lat"]
        props["lon_e"] = fix["lon_e"]
        if fix["elevation_m"] is not None:
            props["elevation_m"] = _clean_coord(fix["elevation_m"])
        points.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [_clean_coord(x_m), _clean_coord(y_m)]},
            "properties": props,
        })

    # Exactly one LineString feature connecting all points in sequence
    line_feature = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [p["geometry"]["coordinates"] for p in points]},
        "properties": {"source_id": points[0]["properties"]["source_id"] if points else DEFAULT_TRAVERSE_SOURCE_ID},
    }
    _write_feature_collection(out, [*points, line_feature])
