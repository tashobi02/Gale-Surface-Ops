"""Candidate hab sites: per-candidate `comm_hab` grids, the manifest `hab_candidates` list
and its validator rules (docs/specs/05 HabCandidate, 05 §E.3 rule of 2026-11-10; 02 §L11).

TASK-03 T03.33 — the test half of the T03.33 → T03.34 pair (_coordination.md §h.3). Every case
below is red until T03.34 implements the behaviour and green afterwards. Synthetic rasters and
synthetic site configs only: no downloaded data is read, and no number is typed that a file or
`config.py` already owns.

---------------------------------------------------------------------------------------------
THE INTERFACE THESE TESTS REQUIRE (T03.34 implements it)
---------------------------------------------------------------------------------------------

1. `marswalk_pipeline.comm_grid.write_comm_hab(out_dir, visibility, file_name="comm_hab.u8")`

   Same as today (T03.29), plus one optional keyword argument: the name of the file written
   inside `out_dir/grid/`. The default keeps writing `grid/comm_hab.u8`, so every current caller
   is unchanged. A candidate other than the rank-1 one writes its own file, e.g. the candidate
   `hab-alternative` writes `write_comm_hab(out_dir, grid, file_name="comm_hab-alternative.u8")`.

2. `marswalk_pipeline.manifest.write_manifest(site_dir, data_version, proj4, config_dir, ...)`
   reads an OPTIONAL `hab_candidates.json` from `config_dir` (the C5 site-config folder,
   `pipeline/sites/<site_id>/`). Its content is the C5 v2 array (T03.31):

       [{"candidate_id": ..., "label": ..., "rank": ..., "hab_mast": {"x_m": ..., "y_m": ...},
         "default_start": {"x_m": ..., "y_m": ..., "label": ...}, "note": ...,
         "provenance": ..., "source_ids": [...]}, ...]

   The pipeline DERIVES, and never reads from the file:
     * `hab_mast.height_m`  — the `hab_mast_m` value of the link ParamSet
                              (`scenarios/storm-sol4190/param_sets/link-assumed.json`);
     * `lat`, `lon_e`       — the pyproj inverse of the working `+proj=eqc` projection
                              (02 §C.1: planetocentric latitude, east-positive longitude);
     * `comm_hab_asset`     — the asset id of the candidate's own comm grid.

   The manifest then lists each candidate as a 05 HabCandidate, and adds one Asset record per
   extra grid.

3. Asset-id rule (T03.31 step 4, Proposed): the rank-1 candidate keeps the existing
   `grid-comm-hab` asset at `grid/comm_hab.u8`; any other candidate gets `grid-comm-<candidate_id>`
   at `grid/comm_<candidate_id>.u8`.

4. `marswalk_pipeline.validate_manifest.validate(site_dir)` additionally enforces the 05 §E.3
   rule of 2026-11-10: when `hab_candidates` is present, every candidate mast and every candidate
   `default_start` lies inside `aoi.extent_m` on a passable cell; `candidate_id`s and `rank`s are
   unique; exactly one candidate has `rank` 1; the rank-1 candidate matches the manifest's
   `default_start`, `grid.comm_hab_asset` and `grid.hab_mast`; every `comm_hab_asset` resolves to
   a known Asset.

   A manifest without `hab_candidates` is unchanged: the field is absent and the F4 mock site
   still validates (05 Site: absent = the single `default_start` / `hab_mast` site).

Field names are copied from 05 HabCandidate and are not renamed here.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

from marswalk_pipeline import config  # noqa: E402
from marswalk_pipeline.validate_manifest import validate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MOCK_SITE = ROOT / "data/sites/mock_site"
LINK_PARAMS = ROOT / "scenarios/storm-sol4190/param_sets/link-assumed.json"

# 05 §C Asset / RoutingGrid no-data value.
U8_NODATA = config.U8_NODATA

# Declared synthetic test parameters (not site data, not measurements).
SYNTH_CELL_M = 20.0          # synthetic grid cell size; differs from the 5 m routing grid
SYNTH_SIZE = 61              # cells per side
SYNTH_ORIGIN_M = (-1000.0, 1000.0)  # asymmetric top-left origin, to catch ignored origins
SYNTH_WALL_FACTOR = 2.0      # wall height = factor * mast height, so the shadow is unambiguous

# The two candidate ids used throughout, matching the 05 §F.1 example and C5 v2.
FIRST_ID = "hab-first"
ALT_ID = "hab-alternative"


# --------------------------------------------------------------------------------------
# helpers


def _mast_height_m() -> float:
    """Hab mast height from the assumed link param set (02 §C.5 L11), never typed here."""
    return float(json.loads(LINK_PARAMS.read_text(encoding="utf-8"))["values"]["hab_mast_m"])


def _link_mast_height_m() -> float:
    """The mast height the manifest derives for every candidate (link ParamSet `hab_mast_m`)."""
    return _mast_height_m()


def _cell_centre(i: int, j: int, cell_m: float, origin_m: tuple[float, float]) -> tuple[float, float]:
    """Centre (x, y) of cell (i, j) for a north-up grid with top-left origin (05 §F)."""
    return origin_m[0] + (j + 0.5) * cell_m, origin_m[1] - (i + 0.5) * cell_m


def _flat(size: int) -> "np.ndarray":
    return np.full((size, size), 0.0, dtype=np.float32)


def _load_manifest(site: Path) -> dict:
    return json.loads((site / "site-manifest.json").read_text(encoding="utf-8"))


def _save_manifest(site: Path, manifest: dict) -> None:
    (site / "site-manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )


def _mentions(problems: list[str], *needles: str) -> bool:
    """True when some reported problem names at least one of the needles (case-insensitive)."""
    return any(n.lower() in p.lower() for p in problems for n in needles)


def _asset_by_id(manifest: dict, asset_id: str) -> dict:
    return next(a for a in manifest["assets"] if a["asset_id"] == asset_id)


def _asset_by_path(manifest: dict, path: str) -> dict:
    return next(a for a in manifest["assets"] if a["path"] == path)


# --------------------------------------------------------------------------------------
# synthetic site fixtures


def _candidate_records(
    mast_x: float, mast_y: float, start_x: float, start_y: float, offset: float = 400.0
) -> list[dict]:
    """Two C5 v2 candidate records (T03.32 layout): no height, latitude, longitude or asset id.

    `offset` places the second candidate relative to the first, in metres; it must keep both
    candidates inside the fixture's AOI. Every number here is a synthetic fixture position,
    not a measurement.
    """
    return [
        {
            "candidate_id": FIRST_ID,
            "label": "First choice",
            "rank": 1,
            "hab_mast": {"x_m": mast_x, "y_m": mast_y},
            "default_start": {"x_m": start_x, "y_m": start_y, "label": "Habitat / rover"},
            "note": "Synthetic fixture candidate; not a site assessment.",
            "provenance": "assumed",
            "source_ids": [],
        },
        {
            "candidate_id": ALT_ID,
            "label": "Alternative",
            "rank": 2,
            "hab_mast": {"x_m": mast_x + offset, "y_m": mast_y - offset},
            "default_start": {"x_m": start_x + offset, "y_m": start_y - offset, "label": "Habitat / rover"},
            "note": "Synthetic fixture candidate; not a site assessment.",
            "provenance": "assumed",
            "source_ids": [],
        },
    ]


def _build_config_dir(tmp_path: Path, candidates: list[dict] | None) -> Path:
    """Lay out a C5 site-config folder from the F4 mock manifest (as test_manifest.py does)."""
    manifest = _load_manifest(MOCK_SITE)
    config_dir = tmp_path / "config"

    def put(relative: str, record: object) -> None:
        path = config_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8")

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
        put(f"known_offsets/{key}.json",
            {"offset_m": offset, "method": "test fixture", "evidence": "test fixture"})
    features = json.loads((MOCK_SITE / "vectors/pois.geojson").read_text())["features"]
    for feature in features:
        put(f"pois/{feature['properties']['poi_id']}.json", feature["properties"])
    if candidates is not None:
        put("hab_candidates.json", candidates)
    return config_dir


def _bundle_with_candidates(tmp_path: Path, candidates: list[dict] | None) -> tuple[Path, Path, dict]:
    """A throwaway copy of F4 with a candidate list in the config folder.

    Returns (bundle dir, config dir, the original F4 manifest). The bundle also holds a
    synthetic grid file per non-rank-1 candidate, so the manifest writer can record an Asset
    with a checksum for it (T03.34 step 3).
    """
    original = _load_manifest(MOCK_SITE)
    bundle = tmp_path / "bundle"
    shutil.copytree(MOCK_SITE, bundle)
    (bundle / "site-manifest.json").unlink()
    if candidates is not None:
        width = original["grid"]["width"]
        height = original["grid"]["height"]
        for record in candidates:
            if int(record["rank"]) == 1:
                continue
            path = bundle / "grid" / f"comm_{record['candidate_id']}.u8"
            # A synthetic binary mask, not a computed viewshed: the bytes are a fixture.
            path.write_bytes(bytes([1]) * (width * height))
    config_dir = _build_config_dir(tmp_path, candidates)
    return bundle, config_dir, original


def _write_manifest(bundle: Path, config_dir: Path, original: dict) -> dict:
    """Run write_manifest on the fixture and return the parsed manifest."""
    from marswalk_pipeline.manifest import write_manifest

    # F4 deliberately uses a synthetic coarse grid, while production config defaults to 5 m.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(config, "GRID_CELL_M", original["grid"]["cell_m"])
        path = write_manifest(bundle, original["data_version"], original["crs"]["proj4"], config_dir)
    return json.loads(Path(path).read_text(encoding="utf-8"))


# --------------------------------------------------------------------------------------
# 1. Grids: one comm grid per candidate (02 §L11, 05 RoutingGrid `comm_hab_asset`)


def test_write_comm_hab_takes_the_output_file_name(tmp_path: Path):
    """T03.34 step 1: write_comm_hab(out_dir, visibility, file_name=...) writes grid/<file_name>."""
    from marswalk_pipeline.comm_grid import write_comm_hab

    grid = np.ones((4, 4), dtype=np.uint8)

    write_comm_hab(tmp_path, grid, file_name="comm_hab-alternative.u8")

    assert (tmp_path / "grid" / "comm_hab-alternative.u8").is_file()
    assert (tmp_path / "grid" / "comm_hab-alternative.u8").read_bytes() == grid.tobytes()


def test_write_comm_hab_default_file_name_is_unchanged(tmp_path: Path):
    """The default keeps the current path, so every existing caller and asset id is unchanged."""
    from marswalk_pipeline.comm_grid import write_comm_hab

    grid = np.ones((4, 4), dtype=np.uint8)

    write_comm_hab(tmp_path, grid)

    assert (tmp_path / "grid" / "comm_hab.u8").read_bytes() == grid.tobytes()


def test_two_masts_on_one_plane_give_different_grids(tmp_path: Path):
    """T03.33 step 1: two masts on either side of a wall see different cells."""
    from marswalk_pipeline.comm_grid import build_comm_hab

    h = _mast_height_m()
    cell, n, origin = SYNTH_CELL_M, SYNTH_SIZE, SYNTH_ORIGIN_M
    wall_j = n // 2
    elev = _flat(n)
    elev[:, wall_j] = SYNTH_WALL_FACTOR * h  # a north-south wall between the two masts
    west = _cell_centre(n // 2, n // 2 - 8, cell, origin)
    east = _cell_centre(n // 2, n // 2 + 8, cell, origin)

    west_grid = build_comm_hab(elev, cell, origin, west[0], west[1], ROOT)
    east_grid = build_comm_hab(elev, cell, origin, east[0], east[1], ROOT)

    assert west_grid.shape == east_grid.shape == elev.shape
    assert not (west_grid == east_grid).all(), "the two masts must not see the same cells"


def test_each_candidate_grid_equals_build_comm_hab_at_that_mast(tmp_path: Path):
    """T03.33 step 1: the per-candidate grid equals build_comm_hab run alone at that mast.

    Same origin, same cell size, row 0 = north: the pipeline writes the candidate's grid from
    the same elevation array, so the bytes must be identical.
    """
    from marswalk_pipeline.comm_grid import build_comm_hab

    h = _mast_height_m()
    cell, n, origin = SYNTH_CELL_M, SYNTH_SIZE, SYNTH_ORIGIN_M
    wall_j = n // 2
    elev = _flat(n)
    elev[:, wall_j] = SYNTH_WALL_FACTOR * h
    masts = {
        FIRST_ID: _cell_centre(n // 2, n // 2 - 8, cell, origin),
        ALT_ID: _cell_centre(n // 2, n // 2 + 8, cell, origin),
    }

    written: dict[str, bytes] = {}
    for candidate_id, (mx, my) in masts.items():
        expected = build_comm_hab(elev, cell, origin, mx, my, ROOT)
        assert expected.dtype == np.uint8
        assert expected.shape == elev.shape
        # The wall is a north-south column: the western mast sees everything west of it and
        # nothing beyond it, the eastern mast the other way round.
        if candidate_id == FIRST_ID:
            assert (expected[:, :wall_j] == 1).all()
            assert (expected[:, wall_j + 1 :] == 0).all()
        else:
            assert (expected[:, wall_j + 1 :] == 1).all()
            assert (expected[:, :wall_j] == 0).all()
        written[candidate_id] = np.ascontiguousarray(expected).tobytes()

    assert written[FIRST_ID] != written[ALT_ID]


def test_comm_grid_step_writes_one_grid_per_candidate(tmp_path: Path):
    """T03.34 step 2: the `comm_grid` step writes one grid per candidate; rank 1 keeps comm_hab.u8."""
    from marswalk_pipeline import __main__ as runner

    site, work, out = tmp_path / "site", tmp_path / "work", tmp_path / "out"
    site.mkdir()
    out.mkdir()
    # AOI [0, 0, 400, 400] with a 5 m routing grid: 80 x 80 cells, origin (0, 400).
    # Both masts sit on interior cells, so neither ray starts outside the grid.
    (site / "site.json").write_text(json.dumps({
        "site_id": "gale_boxwork", "aoi": {"extent_m": [0, 0, 400, 400]},
        "hab_mast": {"x_m": 100, "y_m": 300},
        "default_start": {"x_m": 100, "y_m": 300, "label": "Habitat / rover"},
    }))
    (site / "hab_candidates.json").write_text(
        json.dumps(_candidate_records(100.0, 300.0, 100.0, 300.0, offset=100.0))
    )
    scratch = work / "runs" / "gale_boxwork"
    scratch.mkdir(parents=True)
    np.save(scratch / "elevation.npy", np.zeros((80, 80), dtype="float32"))

    runner._run_step("comm_grid", ROOT, site, work, out)

    assert (out / "grid" / "comm_hab.u8").is_file(), "the rank-1 candidate keeps grid/comm_hab.u8"
    assert (out / "grid" / f"comm_{ALT_ID}.u8").is_file(), (
        "a non-rank-1 candidate writes grid/comm_<candidate_id>.u8 (T03.31 step 4)"
    )


# --------------------------------------------------------------------------------------
# 2. Manifest: the `hab_candidates` list (05 HabCandidate)


def test_manifest_lists_both_candidates_with_derived_fields(tmp_path: Path):
    """T03.33 step 2: the manifest lists both candidates with derived height, lat, lon_e and asset."""
    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )

    manifest = _write_manifest(bundle, config_dir, original)

    assert "hab_candidates" in manifest
    candidates = manifest["hab_candidates"]
    assert [c["candidate_id"] for c in candidates] == [FIRST_ID, ALT_ID]
    for candidate in candidates:
        # height_m comes from the link ParamSet, never from the config file.
        assert candidate["hab_mast"]["height_m"] == _link_mast_height_m()
        # lat / lon_e are derived from the working projection (02 §C.1).
        assert isinstance(candidate["lat"], (int, float))
        assert isinstance(candidate["lon_e"], (int, float))
        # The 05 HabCandidate fields the config file carries survive unchanged.
        assert candidate["provenance"] == "assumed"
        assert candidate["default_start"]["label"] == "Habitat / rover"
        assert candidate["comm_hab_asset"].startswith("grid-comm-")


def test_candidate_lat_and_lon_e_are_the_pyproj_inverse_of_the_mast(tmp_path: Path):
    """05 HabCandidate: lat / lon_e are consistent with hab_mast; T03.34 derives both with pyproj."""
    pyproj = pytest.importorskip("pyproj")

    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )
    manifest = _write_manifest(bundle, config_dir, original)

    crs = pyproj.CRS.from_proj4(manifest["crs"]["proj4"])
    to_geo = pyproj.Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
    for candidate in manifest["hab_candidates"]:
        lon_e, lat = to_geo.transform(candidate["hab_mast"]["x_m"], candidate["hab_mast"]["y_m"])
        assert candidate["lon_e"] == pytest.approx(lon_e, abs=1e-6)
        assert candidate["lat"] == pytest.approx(lat, abs=1e-6)


def test_manifest_lists_one_asset_with_a_checksum_per_candidate_grid(tmp_path: Path):
    """T03.33 step 2: every candidate grid has an Asset record with a SHA-256 checksum."""
    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )
    manifest = _write_manifest(bundle, config_dir, original)

    for candidate in manifest["hab_candidates"]:
        asset = _asset_by_id(manifest, candidate["comm_hab_asset"])
        assert asset["format"] == "u8"
        assert asset["sha256"]
        assert asset["bytes"] == asset["width"] * asset["height"]
        path = bundle / asset["path"]
        assert path.is_file(), f"{asset['path']} must exist in the bundle"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]


def test_rank_one_candidate_mirrors_default_start_and_grid(tmp_path: Path):
    """05 Site and 05 §E.3 (2026-11-10): rank 1 equals default_start, grid.hab_mast, grid.comm_hab_asset."""
    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )
    manifest = _write_manifest(bundle, config_dir, original)

    rank_one = next(c for c in manifest["hab_candidates"] if c["rank"] == 1)
    assert rank_one["default_start"]["x_m"] == manifest["default_start"]["x_m"]
    assert rank_one["default_start"]["y_m"] == manifest["default_start"]["y_m"]
    assert rank_one["hab_mast"]["x_m"] == manifest["grid"]["hab_mast"]["x_m"]
    assert rank_one["hab_mast"]["y_m"] == manifest["grid"]["hab_mast"]["y_m"]
    assert rank_one["hab_mast"]["height_m"] == manifest["grid"]["hab_mast"]["height_m"]
    assert rank_one["comm_hab_asset"] == manifest["grid"]["comm_hab_asset"]


def test_rank_one_candidate_keeps_the_existing_comm_hab_asset(tmp_path: Path):
    """T03.31 step 4 (Proposed): rank 1 keeps `grid-comm-hab`; others get `grid-comm-<candidate_id>`."""
    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )
    manifest = _write_manifest(bundle, config_dir, original)

    by_rank = {c["rank"]: c for c in manifest["hab_candidates"]}
    assert by_rank[1]["comm_hab_asset"] == "grid-comm-hab"
    assert _asset_by_id(manifest, "grid-comm-hab")["path"] == "grid/comm_hab.u8"
    assert by_rank[2]["comm_hab_asset"] == f"grid-comm-{ALT_ID}"
    assert _asset_by_id(manifest, f"grid-comm-{ALT_ID}")["path"] == f"grid/comm_{ALT_ID}.u8"


def _same_manifest(left: dict, right: dict) -> bool:
    """Compare two manifests, ignoring the order of the record lists.

    `write_manifest` sorts `layers`, `sources` and `env_constants` by their primary key; the
    F4 fixture stores them in the order of the 05 §F.1 example. The content must match.
    """
    def normalise(manifest: dict) -> dict:
        result = dict(manifest)
        for field in ("layers", "sources", "env_constants", "assets"):
            if field in result:
                result[field] = sorted(result[field], key=lambda record: json.dumps(record, sort_keys=True))
        return result

    return normalise(left) == normalise(right)


def test_manifest_without_candidate_file_is_unchanged(tmp_path: Path):
    """T03.33 step 3: without hab_candidates.json the manifest has no hab_candidates (F4 mock site)."""
    bundle, config_dir, original = _bundle_with_candidates(tmp_path, None)

    manifest = _write_manifest(bundle, config_dir, original)

    assert "hab_candidates" not in manifest
    assert _same_manifest(manifest, _load_manifest(MOCK_SITE)), (
        "the F4 manifest must be reproduced unchanged"
    )


# --------------------------------------------------------------------------------------
# 3. Validator: the 05 §E.3 rule of 2026-11-10


def _valid_candidate_manifest(tmp_path: Path) -> tuple[Path, dict]:
    """A bundle whose manifest carries a valid two-candidate list; returns (bundle, manifest)."""
    bundle, config_dir, original = _bundle_with_candidates(
        tmp_path, _candidate_records(-1800.0, -1500.0, -1800.0, -1500.0)
    )
    manifest = _write_manifest(bundle, config_dir, original)
    return bundle, manifest


def _break(bundle: Path, change) -> list[str]:
    """Apply `change(manifest)` to a valid candidate manifest and return validate()'s problems."""
    manifest = _load_manifest(bundle)
    change(manifest)
    _save_manifest(bundle, manifest)
    return validate(bundle)


def test_valid_two_candidate_manifest_passes(tmp_path: Path):
    """A valid two-candidate manifest passes validate() with no problems."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    assert validate(bundle) == []


def test_validator_rejects_duplicate_candidate_id(tmp_path: Path):
    """05 §E.3 (2026-11-10): candidate_ids are unique in the Site."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def duplicate(manifest: dict) -> None:
        manifest["hab_candidates"][1]["candidate_id"] = manifest["hab_candidates"][0]["candidate_id"]

    problems = _break(bundle, duplicate)

    assert _mentions(problems, FIRST_ID, "candidate")


def test_validator_rejects_duplicate_rank(tmp_path: Path):
    """05 §E.3 (2026-11-10): ranks are unique."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def duplicate(manifest: dict) -> None:
        manifest["hab_candidates"][1]["rank"] = manifest["hab_candidates"][0]["rank"]

    problems = _break(bundle, duplicate)

    assert _mentions(problems, "rank")


def test_validator_rejects_a_manifest_without_rank_one(tmp_path: Path):
    """05 Site: exactly one candidate has rank 1."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def no_rank_one(manifest: dict) -> None:
        for candidate in manifest["hab_candidates"]:
            candidate["rank"] += 1

    problems = _break(bundle, no_rank_one)

    assert _mentions(problems, "rank")


def test_validator_rejects_rank_one_that_differs_from_default_start(tmp_path: Path):
    """05 §E.3 (2026-11-10): the rank-1 candidate matches default_start."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def move_start(manifest: dict) -> None:
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 1)
        candidate["default_start"]["x_m"] = manifest["default_start"]["x_m"] + 100.0

    problems = _break(bundle, move_start)

    assert _mentions(problems, "default_start", "default start")


def test_validator_rejects_rank_one_that_differs_from_grid_hab_mast(tmp_path: Path):
    """05 §E.3 (2026-11-10): the rank-1 candidate matches grid.hab_mast."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def move_mast(manifest: dict) -> None:
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 1)
        candidate["hab_mast"]["x_m"] = manifest["grid"]["hab_mast"]["x_m"] + 100.0

    problems = _break(bundle, move_mast)

    assert _mentions(problems, "hab_mast", "mast")


def test_validator_rejects_rank_one_that_differs_from_grid_comm_hab_asset(tmp_path: Path):
    """05 §E.3 (2026-11-10): the rank-1 candidate matches grid.comm_hab_asset."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def swap_asset(manifest: dict) -> None:
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 1)
        candidate["comm_hab_asset"] = f"grid-comm-{ALT_ID}"

    problems = _break(bundle, swap_asset)

    assert _mentions(problems, "comm_hab_asset", "grid-comm-hab")


def test_validator_rejects_a_mast_outside_the_aoi(tmp_path: Path):
    """05 §E.3 (2026-11-10): every candidate mast lies inside aoi.extent_m."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def outside(manifest: dict) -> None:
        _, _, maxx, maxy = manifest["aoi"]["extent_m"]
        step = manifest["grid"]["cell_m"]
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 2)
        candidate["hab_mast"]["x_m"] = maxx + step
        candidate["hab_mast"]["y_m"] = maxy + step

    problems = _break(bundle, outside)

    assert _mentions(problems, "mast")


def test_validator_rejects_a_candidate_start_outside_the_aoi(tmp_path: Path):
    """05 §E.3 (2026-11-10): every candidate default_start lies inside aoi.extent_m."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def outside(manifest: dict) -> None:
        minx, miny, _, _ = manifest["aoi"]["extent_m"]
        step = manifest["grid"]["cell_m"]
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 2)
        candidate["default_start"]["x_m"] = minx - step
        candidate["default_start"]["y_m"] = miny - step

    problems = _break(bundle, outside)

    assert _mentions(problems, "default_start", "default start")


def test_validator_rejects_a_mast_on_an_impassable_cell(tmp_path: Path):
    """05 §E.3 (2026-11-10): every candidate mast is on a passable cell.

    The fixture's HARD_HAZARD cell is used, so the case holds under any slope limit.
    """
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def on_hazard(manifest: dict) -> None:
        flags = (bundle / _asset_by_id(manifest, manifest["grid"]["flags_asset"])["path"]).read_bytes()
        mask = 1 << config.FLAG_BITS["HARD_HAZARD"]
        index = next(i for i, value in enumerate(flags) if value != U8_NODATA and value & mask)
        row, col = divmod(index, manifest["grid"]["width"])
        grid = manifest["grid"]
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 2)
        candidate["hab_mast"]["x_m"] = grid["origin_m"][0] + (col + 0.5) * grid["cell_m"]
        candidate["hab_mast"]["y_m"] = grid["origin_m"][1] - (row + 0.5) * grid["cell_m"]

    problems = _break(bundle, on_hazard)

    assert _mentions(problems, "mast")


def test_validator_rejects_a_candidate_start_on_an_impassable_cell(tmp_path: Path):
    """05 §E.3 (2026-11-10): every candidate default_start is on a passable cell."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def on_hazard(manifest: dict) -> None:
        flags = (bundle / _asset_by_id(manifest, manifest["grid"]["flags_asset"])["path"]).read_bytes()
        mask = 1 << config.FLAG_BITS["HARD_HAZARD"]
        index = next(i for i, value in enumerate(flags) if value != U8_NODATA and value & mask)
        row, col = divmod(index, manifest["grid"]["width"])
        grid = manifest["grid"]
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 2)
        candidate["default_start"]["x_m"] = grid["origin_m"][0] + (col + 0.5) * grid["cell_m"]
        candidate["default_start"]["y_m"] = grid["origin_m"][1] - (row + 0.5) * grid["cell_m"]

    problems = _break(bundle, on_hazard)

    assert _mentions(problems, "default_start", "default start")


def test_validator_rejects_an_unknown_comm_hab_asset(tmp_path: Path):
    """05 §E.3: every asset reference resolves; a candidate's comm_hab_asset is a FK."""
    bundle, _ = _valid_candidate_manifest(tmp_path)

    def unknown(manifest: dict) -> None:
        candidate = next(c for c in manifest["hab_candidates"] if c["rank"] == 2)
        candidate["comm_hab_asset"] = "grid-comm-no-such-candidate"

    problems = _break(bundle, unknown)

    assert _mentions(problems, "grid-comm-no-such-candidate")


def test_validator_leaves_a_manifest_without_candidates_alone(tmp_path: Path):
    """05 Site: absent = the single default_start / hab_mast site; the F4 manifest still validates."""
    bundle, config_dir, original = _bundle_with_candidates(tmp_path, None)
    manifest = _write_manifest(bundle, config_dir, original)

    assert "hab_candidates" not in manifest
    assert validate(bundle) == []
