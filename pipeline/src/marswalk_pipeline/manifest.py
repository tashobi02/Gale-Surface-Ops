"""Write site-manifest.json with provenance and checksums (docs/specs/05 §C Site, §F.1). FR-01, FR-15, NFR-06.

Inputs: the C5 site-config folder (pipeline/sites/README.md) and the produced site bundle folder.
Every number comes from an input file, a produced asset or config.py.

C5 v2: an optional `hab_candidates.json` in the site-config folder adds the 05 HabCandidate
list to the manifest, with `height_m`, `lat`, `lon_e` and `comm_hab_asset` derived here and
never read from the file. Deriving `lat` / `lon_e` needs pyproj (the pipeline geo stack);
everything else is standard library only.
"""
from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

from marswalk_pipeline import config

# 05 §F.1: manifest structure version (SemVer).
SCHEMA_VERSION = "1.0.0"

# 02 §C.2 L4: the thermal-inertia sidecar is a 100 m/px grid (grid/ti_100m.f32, own grid, 05 RoutingGrid).
TI_CELL_M = 100

# Repo root: pipeline/src/marswalk_pipeline/manifest.py -> parents[3].
REPO_ROOT = Path(__file__).resolve().parents[3]
HAB_LINK_PARAM_SET = REPO_ROOT / "scenarios/storm-sol4190/param_sets/link-assumed.json"

# Asset id -> (path in the site folder, format). Ids follow pipeline/sites/README.md "Ids";
# file paths follow the bundle layout of data/sites/mock_site.
FILE_ASSETS = {
    "grid-elevation": ("grid/elevation.f32", "f32"),
    "grid-slope-p90": ("grid/slope_p90.u8", "u8"),
    "grid-slope-max": ("grid/slope_max.u8", "u8"),
    "grid-flags": ("grid/flags.u8", "u8"),
    "grid-ti": ("grid/ti_100m.f32", "f32"),
    "grid-comm-hab": ("grid/comm_hab.u8", "u8"),
    "vec-pois": ("vectors/pois.geojson", "geojson"),
    "vec-traverse": ("vectors/traverse.geojson", "geojson"),
}
TI_ASSET = "grid-ti"

# C5 v2: the optional candidate hab site records live in this file of the site-config folder.
CANDIDATES_FILE = "hab_candidates.json"

# C5 v2 candidate asset ids (05 HabCandidate `comm_hab_asset`, decided 2026-11-11 by T03.37):
# the rank-1 candidate keeps the existing `grid-comm-hab` asset at `grid/comm_hab.u8`; any other
# candidate gets `grid-comm-<candidate_id>` at `grid/comm_<candidate_id>.u8`. The rule keeps
# `grid.comm_hab_asset` unchanged for every current consumer.
RANK_ONE_ASSET_ID = "grid-comm-hab"
RANK_ONE_FILE_NAME = "comm_hab.u8"

# Bytes per array element, from the struct module rather than typed in.
ITEM_BYTES = {"f32": struct.calcsize("<f"), "u8": struct.calcsize("<B")}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
KIND_BY_FORMAT = {"tiles": "raster_tiles", "geojson": "vector", "png": "image_static"}


def read_candidates(config_dir: Path) -> list[dict]:
    """The candidate hab site records of a site-config folder, in rank order (C5 v2).

    `config_dir` is `pipeline/sites/<site_id>/`. The file is optional: a site without it has no
    candidates and every caller keeps today's single-mast behaviour. The records are the
    hand-written C5 v2 entries (candidate_id, label, rank, hab_mast, default_start, note,
    provenance, source_ids); the pipeline derives height_m, lat, lon_e and comm_hab_asset.
    """
    path = Path(config_dir) / CANDIDATES_FILE
    if not path.is_file():
        return []
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError(f"{path}: expected an array of candidate records")
    # Rank order, then candidate_id, so the output never depends on the file order.
    return sorted(records, key=lambda record: (record["rank"], record["candidate_id"]))


def candidate_asset_id(candidate: dict) -> str:
    """The Asset id of a candidate's own comm grid (C5 v2 candidate asset ids)."""
    if int(candidate["rank"]) == 1:
        return RANK_ONE_ASSET_ID
    return f"grid-comm-{candidate['candidate_id']}"


def candidate_file_name(candidate: dict) -> str:
    """The name of a candidate's comm grid file inside `grid/` (C5 v2 candidate asset ids)."""
    if int(candidate["rank"]) == 1:
        return RANK_ONE_FILE_NAME
    return f"comm_{candidate['candidate_id']}.u8"


def candidate_path(candidate: dict) -> str:
    """The bundle-relative path of a candidate's comm grid (C5 v2 candidate asset ids)."""
    return f"grid/{candidate_file_name(candidate)}"


def sha256_file(path: Path) -> str:
    """Hex SHA-256 of a file (05 §C Asset.sha256). TASK-03."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _records(directory: Path, key: str) -> list[dict]:
    """Every record in a C5 folder, sorted by its primary key."""
    if not directory.is_dir():
        return []
    return sorted((_read_json(p) for p in directory.glob("*.json")), key=lambda r: r[key])


def _whole_cells(span_m: float, cell_m: float) -> int:
    cells = span_m / cell_m
    if cells != int(cells):
        raise ValueError(f"extent {span_m} m is not a whole number of {cell_m} m cells")
    return int(cells)


def _png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != PNG_SIGNATURE:
        raise ValueError(f"{path} is not a PNG file")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _jpeg_size(path: Path) -> tuple[int, int]:
    """(width, height) from the first start-of-frame marker of a JPEG file (standard library only)."""
    data = path.read_bytes()
    if data[:2] != b"\xff\xd8":
        raise ValueError(f"{path.name} is not a JPEG file")
    position = 2
    while position + 4 <= len(data):
        if data[position] != 0xFF:
            break
        marker = data[position + 1]
        if marker == 0xFF:
            position += 1
            continue
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            position += 2
            continue
        length = struct.unpack(">H", data[position + 2:position + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack(">HH", data[position + 5:position + 9])
            return width, height
        position += 2 + length
    raise ValueError(f"{path.name}: no JPEG frame header found")


def _file_asset(site_dir: Path, asset_id: str, path: str, fmt: str, dims: tuple[int, int] | None) -> dict:
    file = site_dir / path
    size = file.stat().st_size
    record = {"asset_id": asset_id, "path": path, "format": fmt, "sha256": sha256_file(file), "bytes": size}
    if dims is not None:
        width, height = dims
        if size != width * height * ITEM_BYTES[fmt]:
            raise ValueError(f"{path}: {size} bytes does not match {width} x {height} {fmt}")
        record.update(
            width=width,
            height=height,
            nodata=None if fmt == "f32" else config.U8_NODATA,  # 05 §C Asset: NaN for f32 (null in JSON), 255 for u8
            byte_order="little",
        )
    return record


def _produced_assets(site_dir: Path, grid_dims: tuple[int, int], ti_dims: tuple[int, int] | None) -> list[dict]:
    assets = []
    for asset_id, (path, fmt) in FILE_ASSETS.items():
        if not (site_dir / path).is_file():
            continue  # a missing file leaves a dangling reference for validate() to report
        if fmt == "geojson":
            dims = None
        elif asset_id == TI_ASSET:
            dims = ti_dims
        else:
            dims = grid_dims
        assets.append(_file_asset(site_dir, asset_id, path, fmt, dims))

    # 05 §C Asset: a tiles root stores the hash of its index file.
    for index in sorted((site_dir / "tiles").glob("*/index.json")):
        layer_id = index.parent.name
        assets.append({
            "asset_id": f"tiles-{layer_id}",
            "path": f"tiles/{layer_id}",
            "format": "tiles",
            "sha256": sha256_file(index),
        })

    # POI images (02 §E.1 `images/<poi_id>.jpg`): the asset id is `img-<poi_id without its `poi-` prefix>`,
    # the id the POI record's `image_asset` carries; the files are the locked source images, copied as they are.
    images = site_dir / "images"
    for image in sorted(images.glob("*.jpg")) if images.is_dir() else []:
        width, height = _jpeg_size(image)
        assets.append({
            "asset_id": f"img-{image.stem.removeprefix('poi-')}",
            "path": f"images/{image.name}",
            "format": "jpg",
            "sha256": sha256_file(image),
            "bytes": image.stat().st_size,
            "width": width,
            "height": height,
        })
    # Single static images (T03.25 fallback): images/<layer_id>.png, one per 2 m layer (C9 §6); not built in v1.
    for image in sorted(images.glob("*.png")) if images.is_dir() else []:
        width, height = _png_size(image)
        assets.append({
            "asset_id": f"img-{image.stem}",
            "path": f"images/{image.name}",
            "format": "png",
            "sha256": sha256_file(image),
            "bytes": image.stat().st_size,
            "width": width,
            "height": height,
        })
    return sorted(assets, key=lambda a: a["asset_id"])


def _candidate_grid_assets(site_dir: Path, candidates: list[dict], grid_dims: tuple[int, int]) -> list[dict]:
    """One Asset record with a SHA-256 checksum per candidate comm grid (05 §C Asset).

    The rank-1 candidate's grid is the existing `grid-comm-hab` asset, already recorded by
    `_produced_assets`; every other candidate gets its own `grid-comm-<candidate_id>` record.
    A candidate whose grid was not produced leaves no record, so validate() reports the
    dangling reference instead of a checksum that cannot exist.
    """
    assets = []
    for candidate in candidates:
        if int(candidate["rank"]) == 1:
            continue
        path = candidate_path(candidate)
        if not (site_dir / path).is_file():
            continue
        assets.append(_file_asset(site_dir, candidate_asset_id(candidate), path, "u8", grid_dims))
    return assets


def _mast_height_m() -> float:
    """The hab mast height from the link ParamSet (02 §C.5 L11), as for the single mast today.

    The value is passed through unchanged, so the manifest keeps the JSON type the param set
    uses and a site without candidates produces a byte-identical manifest.
    """
    return _read_json(HAB_LINK_PARAM_SET)["values"]["hab_mast_m"]


def _geo_transformer(proj4: str):
    """The pyproj inverse of the working projection: projected metres to planetocentric degrees.

    The working projection is the local `+proj=eqc` string of config.py, copied byte for byte
    into `crs.proj4` (05 §E.3). `always_xy=True` gives east-positive longitude first, then
    latitude, matching 05 HabCandidate's `lon_e` / `lat`.
    """
    try:
        import pyproj
    except ImportError as exc:  # pragma: no cover - the geo stack is required by the pipeline
        raise RuntimeError(
            "pyproj is required to derive the candidate lat/lon_e; install the pipeline geo stack"
        ) from exc
    crs = pyproj.CRS.from_proj4(proj4)
    return pyproj.Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)


def _hab_candidates(candidates: list[dict], proj4: str, mast_height_m: float) -> list[dict]:
    """The 05 HabCandidate list, with the derived fields the pipeline owns (C5 v2).

    Derived here and never read from the config file: `hab_mast.height_m` (the link ParamSet
    `hab_mast_m`), `lat` and `lon_e` (the pyproj inverse of the working projection, so they
    agree with `hab_mast` by construction) and `comm_hab_asset` (the candidate asset-id rule).
    """
    to_geo = _geo_transformer(proj4)
    records = []
    for candidate in candidates:
        mast = candidate["hab_mast"]
        lon_e, lat = to_geo.transform(float(mast["x_m"]), float(mast["y_m"]))
        record = {
            "candidate_id": candidate["candidate_id"],
            "label": candidate["label"],
            "rank": int(candidate["rank"]),
            "hab_mast": {
                "x_m": mast["x_m"],
                "y_m": mast["y_m"],
                "height_m": mast_height_m,
            },
            "lat": lat,
            "lon_e": lon_e,
            "comm_hab_asset": candidate_asset_id(candidate),
            "default_start": dict(candidate["default_start"]),
            "provenance": candidate["provenance"],
            "source_ids": list(candidate.get("source_ids", [])),
        }
        if "note" in candidate:
            record["note"] = candidate["note"]
        records.append(record)
    return records


def _layer(record: dict, produced: dict[str, dict]) -> dict:
    """Layer kind, asset_id and tile_grid follow the produced asset (C5 layers/ rule)."""
    layer = dict(record)
    layer_id = record["layer_id"]
    # Resolve by layer id first (tiles root, then single image), then the record's own asset_id (vector layers).
    asset_id = next(
        (c for c in (f"tiles-{layer_id}", f"img-{layer_id}") if c in produced),
        record.get("asset_id"),
    )
    asset = produced.get(asset_id)
    if asset is None:
        return layer  # left as written; validate() reports the dangling reference
    layer["asset_id"] = asset_id
    layer["kind"] = KIND_BY_FORMAT[asset["format"]]
    # The tiles index carries no grid parameters, so a raster layer keeps the tile_grid it was written with.
    if layer["kind"] != "raster_tiles":
        layer.pop("tile_grid", None)
    return layer


def write_manifest(site_dir: Path, data_version: str, proj4: str, config_dir: Path, *, exclude_layers: set[str] | None = None, cell_m: float | None = None, max_zoom: int | None = None) -> Path:
    """Assemble and write site-manifest.json (schema: schemas/site-manifest.schema.json). TASK-03.

    site_dir holds the produced assets; config_dir is pipeline/sites/<site_id>/ (C5).
    Returns site_dir/site-manifest.json. Output is deterministic: sorted keys, no timestamps.

    Opt-in fallbacks (backend package 29): `cell_m` is the routing-grid cell of a `--cell-m 10` build (default
    `config.GRID_CELL_M`); `max_zoom` is the `--max-zoom` level, so each raster layer's `tile_grid.resolutions_m` lists only
    the levels the tiles step wrote (`config.limit_resolutions`, the one place that drops them).
    """
    site = _read_json(config_dir / "site.json")
    minx, miny, maxx, maxy = site["aoi"]["extent_m"]
    cell_m = config.GRID_CELL_M if cell_m is None else cell_m
    grid_width = _whole_cells(maxx - minx, cell_m)
    grid_height = _whole_cells(maxy - miny, cell_m)
    ti_present = (site_dir / FILE_ASSETS[TI_ASSET][0]).is_file()
    ti_dims = (_whole_cells(maxx - minx, TI_CELL_M), _whole_cells(maxy - miny, TI_CELL_M)) if ti_present else None

    excluded = exclude_layers or set()
    assets = [asset for asset in _produced_assets(site_dir, (grid_width, grid_height), ti_dims)
              if asset["asset_id"] not in {f"tiles-{layer}" for layer in excluded}]

    # C5 v2: the optional candidate hab sites. A site without hab_candidates.json has none, and
    # then every field below is exactly what it was before (the F4 mock manifest is unchanged).
    candidates = read_candidates(config_dir)
    mast_height_m = _mast_height_m()
    if candidates:
        assets.extend(_candidate_grid_assets(site_dir, candidates, (grid_width, grid_height)))
        assets = sorted(assets, key=lambda a: a["asset_id"])
    produced = {a["asset_id"]: a for a in assets}

    sources = _records(config_dir / "sources", "source_id")
    layers = [_layer(record, produced) for record in _records(config_dir / "layers", "layer_id")
              if record["layer_id"] not in excluded]
    if max_zoom is not None:
        for layer in layers:
            grid_record = layer.get("tile_grid")
            if layer["kind"] == "raster_tiles" and grid_record:
                kept = config.limit_resolutions(grid_record["resolutions_m"], max_zoom)
                layer["tile_grid"] = {**grid_record, "resolutions_m": kept}
                # the finest level that is shown is no longer the one the record names
                layer["display_resolution_m"] = max(layer["display_resolution_m"], kept[-1])
    env_constants = _records(config_dir / "env_constants", "const_id")
    known_offsets = {
        path.stem: _read_json(path)["offset_m"]
        for path in sorted((config_dir / "known_offsets").glob("*.json"))
    } if (config_dir / "known_offsets").is_dir() else {}

    # 05 §C RoutingGrid: with candidates present, `comm_hab_asset` and `hab_mast` are those of the
    # rank-1 candidate, so a consumer that ignores the candidates still works.
    rank_one = next((c for c in candidates if int(c["rank"]) == 1), None)
    default_start = site["default_start"]
    if rank_one is None:
        comm_hab_asset = RANK_ONE_ASSET_ID
        hab_mast = {"x_m": site["hab_mast"]["x_m"], "y_m": site["hab_mast"]["y_m"]}
    else:
        comm_hab_asset = candidate_asset_id(rank_one)
        hab_mast = {"x_m": rank_one["hab_mast"]["x_m"], "y_m": rank_one["hab_mast"]["y_m"]}
        # 05 Site: the manifest's default_start and hab_mast are those of the rank-1 candidate.
        # A config file that disagrees is an input error, not a silent choice.
        for field, expected, actual in (
            ("hab_mast", hab_mast, site["hab_mast"]),
            ("default_start", rank_one["default_start"], site["default_start"]),
        ):
            if any(actual.get(key) != expected.get(key) for key in ("x_m", "y_m")):
                raise ValueError(
                    f"{CANDIDATES_FILE}: the rank-1 candidate's {field} does not match site.json's "
                    f"{field}; the manifest cannot mirror both"
                )
        default_start = dict(rank_one["default_start"])

    grid = {
        "cell_m": cell_m,
        "width": grid_width,
        "height": grid_height,
        "origin_m": [minx, maxy],  # top-left corner, row 0 = north (05 §C RoutingGrid)
        "row_order": "north_up",
        "elevation_asset": "grid-elevation",
        "slope_p90_asset": "grid-slope-p90",
        "slope_max_asset": "grid-slope-max",
        "flags_asset": "grid-flags",
        "comm_hab_asset": comm_hab_asset,
        "hab_mast": {
            "x_m": hab_mast["x_m"],
            "y_m": hab_mast["y_m"],
            "height_m": mast_height_m,
        },
    }
    if ti_present:
        grid["ti_asset"] = TI_ASSET
        grid["ti_cell_m"] = TI_CELL_M

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "site_id": site["site_id"],
        "name": site["name"],
        "body": site["body"],
        "data_version": data_version,
        "crs": {"proj4": proj4, "base": config.CRS_BASE},
        "aoi": site["aoi"],
        "default_start": default_start,
        "known_offsets_m": known_offsets,
        "layers": layers,
        "sources": sources,
        "grid": grid,
        "env_constants": env_constants,
        "pois_asset": "vec-pois",
        "traverse_asset": "vec-traverse",
        "assets": assets,
    }
    if candidates:
        manifest["hab_candidates"] = _hab_candidates(candidates, proj4, mast_height_m)

    target = site_dir / "site-manifest.json"
    target.write_text(
        json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target
