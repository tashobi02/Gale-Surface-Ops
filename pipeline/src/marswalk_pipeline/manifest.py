"""Write site-manifest.json with provenance and checksums (docs/specs/05 §C Site, §F.1). FR-01, FR-15, NFR-06.

Inputs: the C5 site-config folder (pipeline/sites/README.md) and the produced site bundle folder.
Every number comes from an input file, a produced asset or config.py. Standard library only.
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

# Bytes per array element, from the struct module rather than typed in.
ITEM_BYTES = {"f32": struct.calcsize("<f"), "u8": struct.calcsize("<B")}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
KIND_BY_FORMAT = {"tiles": "raster_tiles", "geojson": "vector", "png": "image_static"}


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

    # Single static images (T03.25 fallback). TODO(verify): images/<name>.png is not fixed by C5 or 05.
    images = site_dir / "images"
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


def write_manifest(site_dir: Path, data_version: str, proj4: str, config_dir: Path, *, exclude_layers: set[str] | None = None) -> Path:
    """Assemble and write site-manifest.json (schema: schemas/site-manifest.schema.json). TASK-03.

    site_dir holds the produced assets; config_dir is pipeline/sites/<site_id>/ (C5).
    Returns site_dir/site-manifest.json. Output is deterministic: sorted keys, no timestamps.
    """
    site = _read_json(config_dir / "site.json")
    minx, miny, maxx, maxy = site["aoi"]["extent_m"]
    cell_m = config.GRID_CELL_M
    grid_width = _whole_cells(maxx - minx, cell_m)
    grid_height = _whole_cells(maxy - miny, cell_m)
    ti_present = (site_dir / FILE_ASSETS[TI_ASSET][0]).is_file()
    ti_dims = (_whole_cells(maxx - minx, TI_CELL_M), _whole_cells(maxy - miny, TI_CELL_M)) if ti_present else None

    excluded = exclude_layers or set()
    assets = [asset for asset in _produced_assets(site_dir, (grid_width, grid_height), ti_dims)
              if asset["asset_id"] not in {f"tiles-{layer}" for layer in excluded}]
    produced = {a["asset_id"]: a for a in assets}

    sources = _records(config_dir / "sources", "source_id")
    layers = [_layer(record, produced) for record in _records(config_dir / "layers", "layer_id")
              if record["layer_id"] not in excluded]
    env_constants = _records(config_dir / "env_constants", "const_id")
    known_offsets = {
        path.stem: _read_json(path)["offset_m"]
        for path in sorted((config_dir / "known_offsets").glob("*.json"))
    } if (config_dir / "known_offsets").is_dir() else {}

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
        "comm_hab_asset": "grid-comm-hab",
        "hab_mast": {
            "x_m": site["hab_mast"]["x_m"],
            "y_m": site["hab_mast"]["y_m"],
            "height_m": _read_json(HAB_LINK_PARAM_SET)["values"]["hab_mast_m"],
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
        "default_start": site["default_start"],
        "known_offsets_m": known_offsets,
        "layers": layers,
        "sources": sources,
        "grid": grid,
        "env_constants": env_constants,
        "pois_asset": "vec-pois",
        "traverse_asset": "vec-traverse",
        "assets": assets,
    }

    target = site_dir / "site-manifest.json"
    target.write_text(
        json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target
