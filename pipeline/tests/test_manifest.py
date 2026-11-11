"""Manifest integrity: docs/specs/05 §E.3; 06 TASK-03 done-when; NFR-09.

Positive case: the F4 mock site (data/sites/mock_site, T03.02) passes validate().
Negative cases: one broken copy of F4 per 05 §E.3 rule, built in a temporary folder.
F4 itself is only ever read. Real-bundle tests skip while the bundle is absent (T03.19).
Tests never touch the network.

Red until T03.13 (write_manifest) and T03.14 (validate) land.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

import marswalk_pipeline.validate_manifest  # noqa: F401  (stubs must import cleanly)
from marswalk_pipeline import config
from marswalk_pipeline.config import FLAG_BITS, SLOPE_U8_SCALE, U8_NODATA
from marswalk_pipeline.manifest import write_manifest
from marswalk_pipeline.validate_manifest import validate

ROOT = Path(__file__).resolve().parents[2]
MOCK_SITE = ROOT / "data/sites/mock_site"
SCHEMA = ROOT / "schemas/site-manifest.schema.json"
REAL_SITE_ID = "gale_boxwork"
REAL_SITE = ROOT / "data/sites" / REAL_SITE_ID
REAL_MANIFEST = REAL_SITE / "site-manifest.json"
WORK_DIR = ROOT / "pipeline/work"

# NFR-09 (02 §F): site bundle <= 250 MB. TODO(verify): decimal MB (used here, the stricter
# reading) or MiB; the spec does not say.
BUNDLE_LIMIT_BYTES = 250 * 1_000_000

# Sample positions per axis for the real-bundle value check; the cells are the evenly spaced
# lattice from sample_indices(), so the set is deterministic and includes the corners.
SAMPLE_POSITIONS_PER_AXIS = 4

# TODO(verify): file names of the 5 m source rasters under pipeline/work/. No spec fixes them yet
# (T03.18 / T03.20 write them); update this table when they land. Elevation is metres, slopes are
# degrees, row 0 = north (02 §C.4.3).
SOURCE_RASTERS_5M = {
    "elevation_asset": f"{REAL_SITE_ID}/elevation_5m.tif",
    "slope_p90_asset": f"{REAL_SITE_ID}/slope_p90_5m.tif",
    "slope_max_asset": f"{REAL_SITE_ID}/slope_max_5m.tif",
}

NO_SUCH_ASSET = "no-such-asset"
NO_SUCH_SOURCE = "no-such-source"


# --------------------------------------------------------------------------------------
# helpers


def load_manifest(site: Path) -> dict:
    return json.loads((site / "site-manifest.json").read_text())


def save_manifest(site: Path, manifest: dict) -> None:
    (site / "site-manifest.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")


def asset_by_path(manifest: dict, path: str) -> dict:
    return next(a for a in manifest["assets"] if a["path"] == path)


def asset_by_id(manifest: dict, asset_id: str) -> dict:
    return next(a for a in manifest["assets"] if a["asset_id"] == asset_id)


def refresh_asset_record(site: Path, asset_id: str) -> None:
    """Re-record sha256 and bytes of a plain-file asset after a deliberate edit of its file.

    Lets a passability case change one file without also tripping the checksum rule.
    """
    manifest = load_manifest(site)
    record = asset_by_id(manifest, asset_id)
    payload = (site / record["path"]).read_bytes()
    record["sha256"] = hashlib.sha256(payload).hexdigest()
    record["bytes"] = len(payload)
    save_manifest(site, manifest)


def mentions(problems: list[str], *needles: str) -> bool:
    """True when some reported problem names at least one of the needles (case-insensitive)."""
    return any(n.lower() in p.lower() for p in problems for n in needles)


def problems_after(site: Path, mutate) -> list[str]:
    """Check the untouched copy is clean, apply `mutate(site)`, return validate()'s problems."""
    assert validate(site) == [], "the untouched F4 copy must pass before it is broken"
    mutate(site)
    problems = validate(site)
    assert isinstance(problems, list) and problems, "the broken copy must be reported"
    return problems


def edit_manifest(change):
    def mutate(site: Path) -> None:
        manifest = load_manifest(site)
        change(manifest)
        save_manifest(site, manifest)

    return mutate


def cell_centre(manifest: dict, row: int, col: int) -> tuple[float, float]:
    grid = manifest["grid"]
    ox, oy = grid["origin_m"]
    return ox + (col + 0.5) * grid["cell_m"], oy - (row + 0.5) * grid["cell_m"]


def first_cell_with_flag(site: Path, manifest: dict, flag_name: str) -> tuple[int, int]:
    """(row, col) of the first cell of the flags grid with the named bit set (row 0 = north)."""
    flags = (site / asset_by_id(manifest, manifest["grid"]["flags_asset"])["path"]).read_bytes()
    mask = 1 << FLAG_BITS[flag_name]
    index = next(i for i, value in enumerate(flags) if value != U8_NODATA and value & mask)
    return divmod(index, manifest["grid"]["width"])


def sample_indices(count: int, positions: int = SAMPLE_POSITIONS_PER_AXIS) -> list[int]:
    """Evenly spaced indices 0 .. count-1, endpoints included; deterministic, no hand-picked cells."""
    return sorted({i * (count - 1) // (positions - 1) for i in range(positions)})


def bundle_size_bytes(site: Path) -> int:
    return sum(p.stat().st_size for p in site.rglob("*") if p.is_file())


@pytest.fixture
def site(tmp_path: Path) -> Path:
    """A throwaway copy of F4. Never write into data/sites/mock_site."""
    destination = tmp_path / "site"
    shutil.copytree(MOCK_SITE, destination)
    return destination


def build_config_dir(manifest: dict, poi_properties: list[dict], destination: Path) -> Path:
    """Lay out records from the F4 manifest per pipeline/sites/README.md (contract C5)."""
    def put(relative: str, record: object) -> None:
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, sort_keys=True, indent=2) + "\n")

    mast = manifest["grid"]["hab_mast"]
    put("site.json", {
        "site_id": manifest["site_id"], "name": manifest["name"], "body": manifest["body"],
        "data_version": manifest["data_version"], "aoi": manifest["aoi"],
        "default_start": manifest["default_start"],
        "hab_mast": {"x_m": mast["x_m"], "y_m": mast["y_m"]},
    })
    empty = {"type": "FeatureCollection", "features": []}
    put("hazards.geojson", empty)
    put("low_res_dem.geojson", empty)
    for record in manifest["sources"]:
        put(f"sources/{record['source_id']}.json", record)
    for record in manifest["layers"]:
        put(f"layers/{record['layer_id']}.json", record)
    for record in manifest["env_constants"]:
        put(f"env_constants/{record['const_id']}.json", record)
    for key, offset in manifest["known_offsets_m"].items():
        # method / evidence are record-keeping text only (C5); not part of the manifest.
        put(f"known_offsets/{key}.json",
            {"offset_m": offset, "method": "test fixture", "evidence": "test fixture"})
    for properties in poi_properties:
        put(f"pois/{properties['poi_id']}.json", properties)
    return destination


def written_manifest(tmp_path: Path) -> tuple[dict, dict, Path]:
    """Run write_manifest on a copy of F4 without its manifest; return (original, written, site_dir)."""
    original = load_manifest(MOCK_SITE)
    features = json.loads((MOCK_SITE / "vectors/pois.geojson").read_text())["features"]
    site_dir = tmp_path / "bundle"
    shutil.copytree(MOCK_SITE, site_dir)
    (site_dir / "site-manifest.json").unlink()  # write_manifest must produce it
    config_dir = build_config_dir(original, [f["properties"] for f in features], tmp_path / "config")

    # F4 deliberately uses a synthetic coarse grid, while production config defaults to 5 m.
    # C5 site.json carries no routing geometry: supply the fixture's resolution through the
    # public grid constant, so the writer can derive dimensions from the AOI and check bytes.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(config, "GRID_CELL_M", original["grid"]["cell_m"])
        path = write_manifest(site_dir, original["data_version"], original["crs"]["proj4"], config_dir)

    assert Path(path) == site_dir / "site-manifest.json"
    return original, json.loads(Path(path).read_text()), site_dir


# --------------------------------------------------------------------------------------
# positive case


def test_f4_mock_site_passes_validate(site: Path):
    assert validate(site) == []


# --------------------------------------------------------------------------------------
# schema validity


def test_manifest_validates_against_json_schema(site: Path):
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads(SCHEMA.read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    errors = list(jsonschema.Draft202012Validator(schema).iter_errors(load_manifest(site)))
    assert errors == [], [e.message for e in errors]

    # A manifest missing a required field is reported by validate() as well.
    def drop_site_id(manifest: dict) -> None:
        del manifest["site_id"]

    assert mentions(problems_after(site, edit_manifest(drop_site_id)), "site_id")


def test_write_manifest_output_validates_against_json_schema(tmp_path: Path):
    jsonschema = pytest.importorskip("jsonschema")
    original, manifest, _ = written_manifest(tmp_path)

    schema = json.loads(SCHEMA.read_text())
    errors = list(jsonschema.Draft202012Validator(schema).iter_errors(manifest))
    assert errors == [], [e.message for e in errors]
    # Values the caller supplies, and records read from the config folder, arrive intact.
    assert manifest["data_version"] == original["data_version"]
    assert manifest["crs"]["proj4"] == original["crs"]["proj4"]
    assert manifest["site_id"] == original["site_id"]
    assert {s["source_id"] for s in manifest["sources"]} == {s["source_id"] for s in original["sources"]}
    assert {a["asset_id"] for a in manifest["assets"]} == {a["asset_id"] for a in original["assets"]}


def test_write_manifest_output_passes_validate(tmp_path: Path):
    _, _, site_dir = written_manifest(tmp_path)

    assert validate(site_dir) == []


# --------------------------------------------------------------------------------------
# 05 §E.3: every asset reference resolves and its SHA-256 matches


@pytest.mark.parametrize("path", ["vectors/traverse.geojson", "grid/ti_100m.f32", "tiles/elevation/index.json"])
def test_every_asset_ref_resolves_and_sha256_matches_missing_file(site: Path, path: str):
    asset_id = asset_by_path(load_manifest(site), path.removesuffix("/index.json"))["asset_id"]

    problems = problems_after(site, lambda s: (s / path).unlink())

    assert mentions(problems, asset_id, path)


@pytest.mark.parametrize("path", ["grid/elevation.f32", "vectors/pois.geojson", "tiles/slope/index.json"])
def test_every_asset_ref_resolves_and_sha256_matches_wrong_sha(site: Path, path: str):
    asset_id = asset_by_path(load_manifest(site), path.removesuffix("/index.json"))["asset_id"]

    def tamper(s: Path) -> None:
        payload = (s / path).read_bytes()
        # Same length, different content; for a tiles index append whitespace, which stays valid JSON.
        changed = payload + b" " if path.endswith("index.json") else bytes([payload[0] ^ 0xFF]) + payload[1:]
        (s / path).write_bytes(changed)

    problems = problems_after(site, tamper)

    assert mentions(problems, asset_id, path)


@pytest.mark.parametrize("where", ["grid.elevation_asset", "layers[0].asset_id", "pois_asset"])
def test_every_asset_ref_resolves_and_sha256_matches_dangling_ref(site: Path, where: str):
    def dangle(manifest: dict) -> None:
        if where == "grid.elevation_asset":
            manifest["grid"]["elevation_asset"] = NO_SUCH_ASSET
        elif where == "layers[0].asset_id":
            manifest["layers"][0]["asset_id"] = NO_SUCH_ASSET
        else:
            manifest["pois_asset"] = NO_SUCH_ASSET

    problems = problems_after(site, edit_manifest(dangle))

    assert mentions(problems, NO_SUCH_ASSET)


# --------------------------------------------------------------------------------------
# 05 §E.3: every source id resolves


@pytest.mark.parametrize("where", ["layers[0].source_ids", "env_constants[0].source_id"])
def test_every_source_id_resolves_to_a_data_source(site: Path, where: str):
    def dangle(manifest: dict) -> None:
        if where == "layers[0].source_ids":
            manifest["layers"][0]["source_ids"].append(NO_SUCH_SOURCE)
        else:
            manifest["env_constants"][0]["source_id"] = NO_SUCH_SOURCE

    problems = problems_after(site, edit_manifest(dangle))

    assert mentions(problems, NO_SUCH_SOURCE)


def test_gale_solar_min_source_resolves_in_manifest(site: Path):
    records = ROOT / 'pipeline/sites/gale_boxwork'
    minimum = json.loads((records / 'env_constants/rad-gale-dose-eq-solar-min.json').read_text())
    source = json.loads((records / 'sources/simonsen-2024-rad.json').read_text())
    manifest = load_manifest(site)
    assert sum(c['const_id'] == minimum['const_id'] for c in manifest['env_constants']) == 1
    assert sum(s['source_id'] == source['source_id'] for s in manifest['sources']) == 1
    manifest['env_constants'] = [minimum if c['const_id'] == minimum['const_id'] else c
                                 for c in manifest['env_constants']]
    manifest['sources'] = [source if s['source_id'] == source['source_id'] else s
                           for s in manifest['sources']]
    save_manifest(site, manifest)

    assert minimum['source_id'] == source['source_id'] == 'simonsen-2024-rad'
    assert validate(site) == []


# --------------------------------------------------------------------------------------
# 05 §E.3: grids share width, height, cell, origin


@pytest.mark.parametrize("field", ["width", "height"])
def test_all_grids_share_width_height_cell_origin_asset_mismatch(site: Path, field: str):
    asset_id = load_manifest(site)["grid"]["elevation_asset"]

    def shrink(manifest: dict) -> None:
        asset_by_id(manifest, asset_id)[field] -= 1

    problems = problems_after(site, edit_manifest(shrink))

    assert mentions(problems, asset_id)


@pytest.mark.parametrize("field", ["width", "height"])
def test_all_grids_share_width_height_cell_origin_grid_mismatch(site: Path, field: str):
    def shrink(manifest: dict) -> None:
        manifest["grid"][field] -= 1

    problems = problems_after(site, edit_manifest(shrink))

    assert mentions(problems, field, "grid")


# --------------------------------------------------------------------------------------
# 05 §E.3: POIs and default start inside the AOI and passable


@pytest.mark.parametrize("target", ["poi", "default_start"])
@pytest.mark.parametrize("case", ["no_data", "hard_hazard", "outside_aoi"])
def test_pois_and_default_start_inside_aoi_and_passable(site: Path, target: str, case: str):
    manifest = load_manifest(site)
    if case == "outside_aoi":
        _, _, maxx, maxy = manifest["aoi"]["extent_m"]
        step = manifest["grid"]["cell_m"]
        x, y = maxx + step, maxy + step
    else:
        # F4's no-data patch and HARD_HAZARD cell are impassable under any slope limit.
        row, col = first_cell_with_flag(site, manifest, "NO_DATA" if case == "no_data" else "HARD_HAZARD")
        x, y = cell_centre(manifest, row, col)
    poi_id = json.loads((site / "vectors/pois.geojson").read_text())["features"][0]["properties"]["poi_id"]
    pois_asset = manifest["pois_asset"]

    def move(s: Path) -> None:
        if target == "poi":
            path = s / "vectors/pois.geojson"
            collection = json.loads(path.read_text())
            collection["features"][0]["geometry"]["coordinates"] = [x, y]
            path.write_text(json.dumps(collection, sort_keys=True, indent=2) + "\n")
            refresh_asset_record(s, pois_asset)  # isolate the rule: the checksum stays consistent
        else:
            edited = load_manifest(s)
            edited["default_start"].update(x_m=x, y_m=y)
            save_manifest(s, edited)

    problems = problems_after(site, move)

    if target == "poi":
        assert mentions(problems, poi_id)
    else:
        assert mentions(problems, "default_start", "default start")


# --------------------------------------------------------------------------------------
# 05 §E.3: crs.proj4 byte-identical to the site's pipeline projection (behaviour only).
# Data-lead decision 2026-11-06 / T03.07: mock_site expects its 05 §F.1 example string;
# validate() selects the expected projection per site. These tests do not inspect its lookup.


@pytest.mark.parametrize("alteration", ["trailing_space", "reordered_tokens"])
def test_crs_proj4_byte_identical_to_pipeline_constant(site: Path, alteration: str):
    def alter(manifest: dict) -> None:
        proj4 = manifest["crs"]["proj4"]
        manifest["crs"]["proj4"] = proj4 + " " if alteration == "trailing_space" else " ".join(reversed(proj4.split()))

    problems = problems_after(site, edit_manifest(alter))

    assert mentions(problems, "proj4", "crs")


# --------------------------------------------------------------------------------------
# real bundle (skips while data/sites/gale_boxwork/site-manifest.json is absent; T03.19)

real_bundle_only = pytest.mark.skipif(
    not REAL_MANIFEST.exists(), reason=f"{REAL_MANIFEST.relative_to(ROOT)} absent until T03.19"
)


@real_bundle_only
def test_real_bundle_passes_validate():
    assert validate(REAL_SITE) == []


@real_bundle_only
def test_sampled_values_match_source_rasters():
    np = pytest.importorskip("numpy")
    rasterio = pytest.importorskip("rasterio")
    manifest = load_manifest(REAL_SITE)
    grid = manifest["grid"]
    width, height, cell_m = grid["width"], grid["height"], grid["cell_m"]
    rows, cols = sample_indices(height), sample_indices(width)

    for key, raster_name in SOURCE_RASTERS_5M.items():
        raster_path = WORK_DIR / raster_name
        if not raster_path.exists():
            pytest.skip(f"{raster_path.relative_to(ROOT)} absent (local, git-ignored)")
        record = asset_by_id(manifest, grid[key])
        raw = (REAL_SITE / record["path"]).read_bytes()
        bundle = np.frombuffer(raw, dtype="<f4" if record["format"] == "f32" else np.uint8).reshape(height, width)
        with rasterio.open(raster_path) as src:
            # Same georeferencing as the grid: origin is the top-left corner, row 0 = north.
            assert (src.width, src.height) == (width, height), key
            assert src.transform.a == pytest.approx(cell_m), key
            assert src.transform.e == pytest.approx(-cell_m), key
            assert (src.transform.c, src.transform.f) == pytest.approx(tuple(grid["origin_m"])), key
            source = src.read(1).astype("float32")
        for row in rows:
            for col in cols:
                cell = f"{key} cell (row {row}, col {col})"
                if record["format"] == "f32":
                    assert np.array_equal(bundle[row, col], source[row, col], equal_nan=True), cell
                elif bundle[row, col] == U8_NODATA:
                    assert np.isnan(source[row, col]), cell
                else:
                    degrees = float(bundle[row, col]) / SLOPE_U8_SCALE
                    # T03.11 decision 2026-11-06: steeper source slopes clamp to 63.5°.
                    encodable_max = (U8_NODATA - 1) / SLOPE_U8_SCALE
                    expected = min(float(source[row, col]), encodable_max)
                    assert abs(degrees - expected) <= 1 / SLOPE_U8_SCALE, cell


@real_bundle_only
def test_site_bundle_at_most_250_mb():
    assert bundle_size_bytes(REAL_SITE) <= BUNDLE_LIMIT_BYTES


def test_excluded_layer_and_existing_tiles_are_omitted(tmp_path: Path):
    original, _, site_dir = written_manifest(tmp_path)
    layer_id = 'elevation'
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(config, 'GRID_CELL_M', original['grid']['cell_m'])
        path = write_manifest(site_dir, original['data_version'], original['crs']['proj4'], tmp_path / 'config', exclude_layers={layer_id})
    manifest = json.loads(path.read_text())
    assert layer_id not in {layer['layer_id'] for layer in manifest['layers']}
    assert 'tiles-elevation' not in {asset['asset_id'] for asset in manifest['assets']}
