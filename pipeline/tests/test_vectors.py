"""Tests for traverse and POI packaging (docs/specs/02 §C.1, §E.1; docs/specs/05 §C POI, TraversePoint, §F.2).

Tasks: T04.02 (tests), T04.03 (packaging code).
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

pytest.importorskip("pyproj")  # the geo stack lives in the conda env (02 §C.1)

from marswalk_pipeline.vectors import package_pois, package_traverse

# Illustrative working projection and AOI extent from docs/specs/05 §F.1.
# Mars spherical datum IAU_2015:49900 (R = 3,396,190 m).
EXAMPLE_PROJ4 = (
    "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 "
    "+x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)

ORIGIN_LAT = -4.70
ORIGIN_LON_E = 137.38


def _create_synthetic_pois(curated_dir: Path) -> None:
    """Create synthetic POI files conforming to 05 §C POI and C5 site-config layout."""
    curated_dir.mkdir(parents=True, exist_ok=True)

    # POI 1: At the projection origin (lat_0, lon_0)
    poi_origin = {
        "poi_id": "poi-origin-sample",
        "name": "Origin Reference Point",
        "lat": ORIGIN_LAT,
        "lon_e": ORIGIN_LON_E,
        "science_objective": "Test projection origin mapping directly to coordinates (0, 0).",
        "why_it_matters": "Confirms the working-projection center aligns with the AOI origin (02 §C.1).",
        "position_source": "Synthetic test reference position",
        "position_uncertainty_m": 0.5,
        "provenance": "assumed",
        "stop_type": "science",
        "ez_theme": "Origin calibration",
        "evidence": [
            {
                "text": "Defined at working projection origin for synthetic verification.",
                "source_id": "test-data-source"
            }
        ]
    }
    (curated_dir / "poi-origin-sample.json").write_text(
        json.dumps(poi_origin, indent=2) + "\n", encoding="utf-8"
    )

    # POI 2: Offset point with ground imagery asset
    poi_ridge = {
        "poi_id": "poi-ridge-sample",
        "name": "Boxwork Ridge Sample",
        "lat": -4.6945,
        "lon_e": 137.3869,
        "science_objective": "Examine mineral-cemented ridge bedrock and fracture patterns.",
        "why_it_matters": "Groundwater moved through fractures as Mars dried (01 FR-04).",
        "image_asset": "img-ridge-sample",
        "image_credit": "NASA/JPL-Caltech",
        "image_source_url": "https://science.nasa.gov/mission/curiosity/sample-ridge",
        "image_sol": 4611,
        "image_date": "2025-07-27",
        "image_camera": "Left Navigation Camera (Navcam)",
        "position_source": "Nearest Curiosity waypoint at sol 4611",
        "position_uncertainty_m": 10.0,
        "provenance": "assumed",
        "stop_type": "resource",
        "ez_theme": "Hydrated sulfates record",
        "evidence": [
            {
                "text": "Ridge bedrock imaged by Navcam at sol 4611.",
                "source_id": "nasa-msl-blog-test"
            }
        ]
    }
    (curated_dir / "poi-ridge-sample.json").write_text(
        json.dumps(poi_ridge, indent=2) + "\n", encoding="utf-8"
    )


def _create_synthetic_places_csv(csv_path: Path) -> None:
    """Create synthetic PDS PLACES localized_interp.csv layout."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "frame", "site", "drive", "planetocentric_latitude", "longitude", "elevation", "sol"
    ]
    rows = [
        # Point 1: At origin, sol 4600 (ROVER frame -> kept)
        {
            "frame": "ROVER",
            "site": "118",
            "drive": "2200",
            "planetocentric_latitude": str(ORIGIN_LAT),
            "longitude": str(ORIGIN_LON_E),
            "elevation": "-4000.5",
            "sol": "4600"
        },
        # Non-ROVER row (SITE frame -> must be filtered out)
        {
            "frame": "SITE",
            "site": "118",
            "drive": "2200",
            "planetocentric_latitude": str(ORIGIN_LAT),
            "longitude": str(ORIGIN_LON_E),
            "elevation": "-4000.5",
            "sol": "4600"
        },
        # Point 2: Offset point inside AOI, sol 4601 (ROVER frame -> kept)
        {
            "frame": "ROVER",
            "site": "118",
            "drive": "2210",
            "planetocentric_latitude": "-4.6945",
            "longitude": "137.3869",
            "elevation": "-3995.0",
            "sol": "4601"
        },
        # Point 3: Point in 100 m margin (e.g. at ~1050 m when AOI is 1000 m; kept)
        # 1050 m north: ~0.0177 degrees lat offset
        {
            "frame": "ROVER",
            "site": "118",
            "drive": "2220",
            "planetocentric_latitude": "-4.6823",
            "longitude": "137.3800",
            "elevation": "-3990.0",
            "sol": "4602"
        },
        # Point 4: Point outside 100 m margin (e.g. at ~1200 m when AOI is 1000 m; clipped/excluded)
        # 1200 m north: ~0.0203 degrees lat offset
        {
            "frame": "ROVER",
            "site": "118",
            "drive": "2230",
            "planetocentric_latitude": "-4.6700",
            "longitude": "137.3800",
            "elevation": "-3985.0",
            "sol": "4603"
        }
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _create_synthetic_geojson_traverse(json_path: Path) -> None:
    """Create synthetic MMGIS GeoJSON traverse file."""
    json_path.parent.mkdir(parents=True, exist_ok=True)
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [ORIGIN_LON_E, ORIGIN_LAT, -4000.5]
                },
                "properties": {
                    "site": 118,
                    "drive": 2200,
                    "sol": 4600,
                    "lat": ORIGIN_LAT,
                    "lon": ORIGIN_LON_E,
                    "elev_geoid": -4000.5,
                    "source_id": "test-traverse-source"
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [137.3869, -4.6945, -3995.0]
                },
                "properties": {
                    "site": 118,
                    "drive": 2210,
                    "sol": 4601,
                    "lat": -4.6945,
                    "lon": 137.3869,
                    "elev_geoid": -3995.0,
                    "source_id": "test-traverse-source"
                }
            }
        ]
    }
    json_path.write_text(json.dumps(fc, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# POI Packaging Tests (T04.02 / 01 FR-04, 05 §C POI, 05 §F.2, 02 §E.1)
# ---------------------------------------------------------------------------

def test_package_pois_properties_and_structure(tmp_path: Path) -> None:
    """pois.geojson is a FeatureCollection of Point features with required 05 properties."""
    curated_dir = tmp_path / "pois"
    out_file = tmp_path / "vectors" / "pois.geojson"
    _create_synthetic_pois(curated_dir)

    package_pois(curated_dir, EXAMPLE_PROJ4, out_file)

    assert out_file.is_file()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data.get("type") == "FeatureCollection"
    features = data.get("features", [])
    assert len(features) == 2

    # Check each feature meets 05 POI and 02 §E.1 specifications
    for feat in features:
        assert feat.get("type") == "Feature"
        geom = feat.get("geometry", {})
        assert geom.get("type") == "Point"
        coords = geom.get("coordinates", [])
        assert len(coords) == 2
        assert all(isinstance(c, (int, float)) for c in coords)

        props = feat.get("properties", {})
        # Required properties
        for req in [
            "poi_id", "name", "lat", "lon_e", "science_objective",
            "why_it_matters", "position_source", "position_uncertainty_m",
            "provenance", "stop_type", "ez_theme", "evidence"
        ]:
            assert req in props, f"Missing required property: {req}"

        # Lat / lon_e preserved in properties (02 §E.1)
        assert isinstance(props["lat"], (int, float))
        assert isinstance(props["lon_e"], (int, float))

        # Text length limit <= 300 characters
        assert len(props["science_objective"]) <= 300
        assert len(props["why_it_matters"]) <= 300

        # position_uncertainty_m >= 0
        assert props["position_uncertainty_m"] >= 0

        # provenance valid enum
        assert props["provenance"] in {"measured", "derived", "modelled", "assumed"}

        # Image asset rules (01 FR-04, 05 §C)
        if props.get("image_asset"):
            assert props.get("image_credit"), "image_credit required when image_asset is present"
            assert props.get("image_source_url"), "image_source_url required when image_asset is present"


def test_package_pois_origin_maps_to_zero(tmp_path: Path) -> None:
    """With EXAMPLE_PROJ4, a point at (lat_0, lon_0) is written at (0, 0) (02 §C.1)."""
    curated_dir = tmp_path / "pois"
    out_file = tmp_path / "vectors" / "pois.geojson"
    _create_synthetic_pois(curated_dir)

    package_pois(curated_dir, EXAMPLE_PROJ4, out_file)

    data = json.loads(out_file.read_text(encoding="utf-8"))
    origin_feat = next(
        f for f in data["features"] if f["properties"]["poi_id"] == "poi-origin-sample"
    )
    coords = origin_feat["geometry"]["coordinates"]
    assert coords[0] == pytest.approx(0.0, abs=0.01)
    assert coords[1] == pytest.approx(0.0, abs=0.01)


def test_package_pois_repeat_is_byte_identical(tmp_path: Path) -> None:
    """Packaging POIs twice from identical inputs yields byte-identical files (T03.22)."""
    curated_dir = tmp_path / "pois"
    out_1 = tmp_path / "vectors" / "pois_run1.geojson"
    out_2 = tmp_path / "vectors" / "pois_run2.geojson"
    _create_synthetic_pois(curated_dir)

    package_pois(curated_dir, EXAMPLE_PROJ4, out_1)
    package_pois(curated_dir, EXAMPLE_PROJ4, out_2)

    assert out_1.read_bytes() == out_2.read_bytes()


# ---------------------------------------------------------------------------
# Traverse Packaging Tests (T04.02 / 01 FR-17, 05 §C TraversePoint, 02 §E.1)
# ---------------------------------------------------------------------------

def test_package_traverse_points_and_linestring(tmp_path: Path) -> None:
    """traverse.geojson holds Point features with sol, source_id + exactly one LineString."""
    csv_file = tmp_path / "localized_interp.csv"
    out_file = tmp_path / "vectors" / "traverse.geojson"
    _create_synthetic_places_csv(csv_file)

    # AOI large enough to include first 3 ROVER points
    aoi_extent = (-2000.0, -2000.0, 2000.0, 2000.0)
    package_traverse(csv_file, EXAMPLE_PROJ4, out_file, aoi_extent_m=aoi_extent)

    assert out_file.is_file()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    assert data.get("type") == "FeatureCollection"
    features = data.get("features", [])

    points = [f for f in features if f.get("geometry", {}).get("type") == "Point"]
    linestrings = [f for f in features if f.get("geometry", {}).get("type") == "LineString"]

    # Exactly one LineString feature
    assert len(linestrings) == 1, "Must contain exactly one LineString feature"
    ls = linestrings[0]
    ls_coords = ls["geometry"]["coordinates"]

    # Point features hold sol (int), source_id (FK), and coordinates match line sequence
    assert len(points) >= 2
    for pt in points:
        props = pt.get("properties", {})
        assert "sol" in props and isinstance(props["sol"], int)
        assert "source_id" in props and isinstance(props["source_id"], str)
        assert "lat" in props
        assert "lon_e" in props

    # LineString coordinates connect point positions in sequence
    point_coords = [p["geometry"]["coordinates"] for p in points]
    assert ls_coords == point_coords


def test_package_traverse_filters_non_rover_frames(tmp_path: Path) -> None:
    """Non-ROVER frame rows in PLACES CSV (e.g. SITE) are filtered out."""
    csv_file = tmp_path / "localized_interp.csv"
    out_file = tmp_path / "vectors" / "traverse.geojson"
    _create_synthetic_places_csv(csv_file)

    # Use large AOI so all points pass extent filter
    package_traverse(csv_file, EXAMPLE_PROJ4, out_file, aoi_extent_m=(-5000.0, -5000.0, 5000.0, 5000.0))

    data = json.loads(out_file.read_text(encoding="utf-8"))
    points = [f for f in data["features"] if f["geometry"]["type"] == "Point"]

    # In synthetic CSV, there are 4 ROVER rows and 1 SITE row. Exactly 4 Point features kept.
    assert len(points) == 4


def test_package_traverse_clipping_with_margin(tmp_path: Path) -> None:
    """Points inside AOI + 100 m margin are kept; points outside are clipped (U-04 / T04.01)."""
    csv_file = tmp_path / "localized_interp.csv"
    out_file = tmp_path / "vectors" / "traverse.geojson"
    _create_synthetic_places_csv(csv_file)

    # Set AOI extent: [-1000, -1000, 1000, 1000]
    # Margin is 100 m -> allowable range is [-1100, -1100, 1100, 1100]
    # Point 1 (sol 4600) is at y=0 (inside AOI) -> kept
    # Point 2 (sol 4601) is at y~326 m (inside AOI) -> kept
    # Point 3 (sol 4602) is at y~1050 m (outside 1000 m AOI, but within 1100 m margin) -> kept
    # Point 4 (sol 4603) is at y~1200 m (outside 1100 m margin) -> clipped out
    aoi_extent = (-1000.0, -1000.0, 1000.0, 1000.0)
    package_traverse(csv_file, EXAMPLE_PROJ4, out_file, aoi_extent_m=aoi_extent, margin_m=100.0)

    data = json.loads(out_file.read_text(encoding="utf-8"))
    points = [f for f in data["features"] if f["geometry"]["type"] == "Point"]

    # Points 1, 2, 3 kept; point 4 clipped
    sols = [p["properties"]["sol"] for p in points]
    assert 4600 in sols
    assert 4601 in sols
    assert 4602 in sols
    assert 4603 not in sols


def test_package_traverse_repeat_is_byte_identical(tmp_path: Path) -> None:
    """Packaging traverse twice from identical inputs yields byte-identical files (T03.22)."""
    csv_file = tmp_path / "localized_interp.csv"
    out_1 = tmp_path / "vectors" / "traverse_run1.geojson"
    out_2 = tmp_path / "vectors" / "traverse_run2.geojson"
    _create_synthetic_places_csv(csv_file)

    aoi_extent = (-2000.0, -2000.0, 2000.0, 2000.0)
    package_traverse(csv_file, EXAMPLE_PROJ4, out_1, aoi_extent_m=aoi_extent)
    package_traverse(csv_file, EXAMPLE_PROJ4, out_2, aoi_extent_m=aoi_extent)

    assert out_1.read_bytes() == out_2.read_bytes()


def test_package_traverse_from_geojson_source(tmp_path: Path) -> None:
    """Traverse packaging also accepts MMGIS / GeoJSON input sources."""
    json_file = tmp_path / "traverse_source.geojson"
    out_file = tmp_path / "vectors" / "traverse.geojson"
    _create_synthetic_geojson_traverse(json_file)

    aoi_extent = (-2000.0, -2000.0, 2000.0, 2000.0)
    package_traverse(json_file, EXAMPLE_PROJ4, out_file, aoi_extent_m=aoi_extent)

    assert out_file.is_file()
    data = json.loads(out_file.read_text(encoding="utf-8"))
    points = [f for f in data["features"] if f["geometry"]["type"] == "Point"]
    linestrings = [f for f in data["features"] if f["geometry"]["type"] == "LineString"]

    assert len(points) == 2
    assert len(linestrings) == 1
    assert points[0]["properties"]["sol"] == 4600
    assert points[1]["properties"]["sol"] == 4601


# ---------------------------------------------------------------------------
# Review fixes: strict inputs, explicit AOI, POI rules (05 §C POI)
# ---------------------------------------------------------------------------

EQUATOR_PROJ4 = (
    "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"
)


def test_package_traverse_requires_an_aoi_extent(tmp_path: Path) -> None:
    """No AOI extent means no silent skip of the clip and no guessed site.json."""
    csv_file = tmp_path / "localized_interp.csv"
    _create_synthetic_places_csv(csv_file)
    # A site.json beside the output must not be picked up.
    (tmp_path / "site.json").write_text(
        json.dumps({"aoi": {"extent_m": [-1.0, -1.0, 1.0, 1.0]}}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="AOI extent"):
        package_traverse(csv_file, EXAMPLE_PROJ4, tmp_path / "vectors" / "traverse.geojson")
    with pytest.raises(ValueError, match="AOI extent"):
        package_traverse(
            csv_file, EXAMPLE_PROJ4, tmp_path / "vectors" / "traverse.geojson", aoi_extent_m=(0.0, 0.0, 1.0)
        )


def test_package_traverse_rejects_invalid_projection(tmp_path: Path) -> None:
    """A bad proj4 string fails loudly; there is no hand-written projection fallback."""
    from pyproj.exceptions import CRSError

    csv_file = tmp_path / "localized_interp.csv"
    _create_synthetic_places_csv(csv_file)
    with pytest.raises(CRSError):
        package_traverse(
            csv_file, "+proj=nonsense", tmp_path / "t.geojson", aoi_extent_m=(-1.0, -1.0, 1.0, 1.0)
        )


@pytest.mark.parametrize(
    "missing, match",
    [("sol", "sol"), ("planetocentric_latitude", "latitude"), ("longitude", "longitude")],
)
def test_places_csv_missing_required_value_raises(tmp_path: Path, missing: str, match: str) -> None:
    """A blank sol, latitude or longitude is an error, never a 0 default."""
    csv_file = tmp_path / "localized_interp.csv"
    row = {
        "frame": "ROVER", "site": "1", "drive": "2",
        "planetocentric_latitude": "-4.7", "longitude": "137.4", "elevation": "1", "sol": "10",
    }
    row[missing] = ""
    with csv_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
    with pytest.raises(ValueError, match=match):
        package_traverse(csv_file, EXAMPLE_PROJ4, tmp_path / "t.geojson", aoi_extent_m=(-9e6, -9e6, 9e6, 9e6))


def test_places_csv_zero_coordinates_are_real_values(tmp_path: Path) -> None:
    """Latitude 0 and longitude 0 are valid, not missing."""
    csv_file = tmp_path / "localized_interp.csv"
    csv_file.write_text(
        "frame,site,drive,planetocentric_latitude,longitude,elevation,sol\nROVER,0,0,0,0,0,0\n",
        encoding="utf-8",
    )
    out = tmp_path / "t.geojson"
    package_traverse(csv_file, EQUATOR_PROJ4, out, aoi_extent_m=(-10.0, -10.0, 10.0, 10.0))
    point = next(f for f in json.loads(out.read_text(encoding="utf-8"))["features"] if f["geometry"]["type"] == "Point")
    assert point["properties"]["sol"] == 0
    assert point["properties"]["lat"] == 0.0
    assert point["properties"]["lon_e"] == 0.0
    assert point["properties"]["elevation_m"] == 0.0
    assert point["properties"]["site_drive"] == "0_0"
    assert point["geometry"]["coordinates"] == [0.0, 0.0]


def test_geojson_zero_properties_win_over_coordinates(tmp_path: Path) -> None:
    """lat 0 / lon 0 in properties are kept, not replaced by the geometry (no `or` chains)."""
    src = tmp_path / "traverse.geojson"
    src.write_text(
        json.dumps({"type": "FeatureCollection", "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [137.0, -4.0]},
            "properties": {"sol": 0, "lat": 0, "lon_e": 0},
        }]}),
        encoding="utf-8",
    )
    out = tmp_path / "t.geojson"
    package_traverse(src, EQUATOR_PROJ4, out, aoi_extent_m=(-10.0, -10.0, 10.0, 10.0))
    point = next(f for f in json.loads(out.read_text(encoding="utf-8"))["features"] if f["geometry"]["type"] == "Point")
    assert point["properties"]["lat"] == 0.0
    assert point["properties"]["lon_e"] == 0.0
    assert point["properties"]["sol"] == 0


@pytest.mark.parametrize(
    "feature, match",
    [
        ({"geometry": {"type": "Point", "coordinates": [137.4, -4.7]}, "properties": {}}, "sol"),
        ({"geometry": {"type": "Point", "coordinates": []}, "properties": {"sol": 1}}, "lat"),
        ({"geometry": {"type": "Point", "coordinates": []}, "properties": {"sol": 1, "lat": -4.7}}, "lon"),
    ],
)
def test_geojson_missing_required_value_raises(tmp_path: Path, feature: dict, match: str) -> None:
    """Missing sol, latitude or longitude raises instead of defaulting to 0."""
    src = tmp_path / "traverse.geojson"
    src.write_text(
        json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", **feature}]}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match=match):
        package_traverse(src, EXAMPLE_PROJ4, tmp_path / "t.geojson", aoi_extent_m=(-9e6, -9e6, 9e6, 9e6))


def test_traverse_unknown_source_format_raises(tmp_path: Path) -> None:
    """Only .csv (PLACES) and .geojson / .json (MMGIS) sources are accepted."""
    src = tmp_path / "traverse.txt"
    src.write_text("whatever", encoding="utf-8")
    with pytest.raises(ValueError, match="traverse source"):
        package_traverse(src, EXAMPLE_PROJ4, tmp_path / "t.geojson", aoi_extent_m=(-1.0, -1.0, 1.0, 1.0))


def _poi_record() -> dict:
    return {
        "poi_id": "poi-valid", "name": "Valid", "lat": -4.7, "lon_e": 137.38,
        "science_objective": "Short.", "why_it_matters": "Short.",
        "position_source": "Synthetic", "position_uncertainty_m": 0.0, "provenance": "assumed",
    }


@pytest.mark.parametrize(
    "change, match",
    [
        ({"science_objective": "x" * 301}, "science_objective"),
        ({"why_it_matters": "x" * 301}, "why_it_matters"),
        ({"position_uncertainty_m": -0.1}, "position_uncertainty_m"),
        ({"position_uncertainty_m": "10"}, "position_uncertainty_m"),
        ({"provenance": "live"}, "provenance"),
        ({"provenance": "Measured"}, "provenance"),
    ],
)
def test_package_pois_rejects_invalid_records(tmp_path: Path, change: dict, match: str) -> None:
    """05 §C POI: text <= 300 chars, uncertainty >= 0, provenance one of the six classes."""
    curated = tmp_path / "pois"
    curated.mkdir()
    (curated / "poi-valid.json").write_text(json.dumps({**_poi_record(), **change}), encoding="utf-8")
    with pytest.raises(ValueError, match=match):
        package_pois(curated, EXAMPLE_PROJ4, tmp_path / "vectors" / "pois.geojson")


def test_package_pois_accepts_boundary_values(tmp_path: Path) -> None:
    """300-character text, zero uncertainty and each of the six provenance classes are valid."""
    curated = tmp_path / "pois"
    curated.mkdir()
    for index, provenance in enumerate(
        ("measured", "derived", "modelled", "assumed", "replayed", "simulated")
    ):
        record = {**_poi_record(), "poi_id": f"poi-{index}", "provenance": provenance, "science_objective": "x" * 300}
        (curated / f"poi-{index}.json").write_text(json.dumps(record), encoding="utf-8")
    out = tmp_path / "vectors" / "pois.geojson"
    package_pois(curated, EXAMPLE_PROJ4, out)
    assert len(json.loads(out.read_text(encoding="utf-8"))["features"]) == 6
