"""Referential-integrity checks for a site bundle (docs/specs/05 §E.3)."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re

import jsonschema

from . import config

# 05 §F.1 and 05 §E.4.
_SCHEMA_MAJOR = 1
# 05 §C RoutingGrid maximum.
_MAX_GRID_CELLS = 4_000_000
_SCHEMA = Path(__file__).resolve().parents[3] / "schemas/site-manifest.schema.json"
_PLAN_EXPORT_SCHEMA = Path(__file__).resolve().parents[3] / "schemas/plan-export.schema.json"


def _limit_field(name: str) -> float:
    schema = json.loads(_PLAN_EXPORT_SCHEMA.read_text(encoding="utf-8"))
    return schema["$defs"]["MissionScenario"]["properties"]["hard_slope_limit_deg"][name]


def hard_slope_limit_deg() -> float:
    """The passability limit for a start: the 05 MissionScenario default `hard_slope_limit_deg` (BD-21).

    Read from the plan-export schema, so the validator and the planner start from one number.
    """
    return _limit_field("default")


def max_slope_limit_deg() -> float:
    """The passability limit for a POI: the largest `hard_slope_limit_deg` a plan may set (BD-140).

    A POI is a place of interest, reachable if some allowed limit reaches it; the planner reports the stops a
    plan's own limit cannot reach.
    """
    return _limit_field("maximum")


def validate(site_dir: Path) -> list[str]:
    """Return all detectable site-bundle integrity problems; an empty list means valid."""
    site_dir = Path(site_dir)
    problems: list[str] = []
    try:
        manifest = json.loads((site_dir / "site-manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"site-manifest.json: {exc}"]
    if not isinstance(manifest, dict):
        return ["site-manifest.json must contain an object"]

    try:
        schema = json.loads(_SCHEMA.read_text(encoding="utf-8"))
        validator = jsonschema.Draft202012Validator(schema)
        for error in validator.iter_errors(manifest):
            location = ".".join(str(part) for part in error.absolute_path) or "manifest"
            problems.append(f"schema {location}: {error.message}")
    except (OSError, ValueError, jsonschema.exceptions.SchemaError) as exc:
        problems.append(f"manifest schema: {exc}")

    version = manifest.get("schema_version")
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version) or version.split(".")[0].lstrip("0") != str(_SCHEMA_MAJOR):
        problems.append(f"schema_version: unsupported or invalid version {version!r}; expected major {_SCHEMA_MAJOR}")
    site_id = manifest.get("site_id")
    expected = config.PROJ4_BY_SITE.get(site_id) if isinstance(site_id, str) else None
    if expected is None:
        problems.append(f"site_id {site_id!r}: unknown projection")
    elif not isinstance(manifest.get("crs"), dict) or manifest["crs"].get("proj4") != expected:
        problems.append("crs.proj4 differs from the pipeline projection")

    for field, expected_type in (("crs", dict), ("aoi", dict), ("default_start", dict),
                                 ("known_offsets_m", dict), ("grid", dict),
                                 ("layers", list), ("sources", list),
                                 ("env_constants", list), ("assets", list)):
        if field in manifest and not isinstance(manifest[field], expected_type):
            problems.append(f"{field}: invalid container type")

    assets = {}
    asset_records = manifest.get("assets")
    for asset in asset_records if isinstance(asset_records, list) else []:
        if not isinstance(asset, dict) or not isinstance(asset.get("asset_id"), str):
            problems.append("assets: invalid asset_id record")
            continue
        aid = asset["asset_id"]
        if aid in assets:
            problems.append(f"duplicate asset_id {aid}")
        assets[aid] = asset
    sources = set()
    source_records = manifest.get("sources")
    for source in source_records if isinstance(source_records, list) else []:
        if not isinstance(source, dict) or not isinstance(source.get("source_id"), str):
            problems.append("sources: invalid source_id record")
            continue
        sources.add(source["source_id"])

    def references(value: object, location: str = "manifest") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                where = f"{location}.{key}"
                if (key.endswith("_asset") or key == "asset_id") and not (key == "image_asset" and item is None):
                    # Asset records define IDs rather than referencing themselves.
                    if not (key == "asset_id" and location.startswith("manifest.assets[")):
                        if not isinstance(item, str) or item not in assets:
                            problems.append(f"{where}: unknown asset {item!r}")
                elif key == "source_id" and not location.startswith("manifest.sources["):
                    if not isinstance(item, str) or item not in sources:
                        problems.append(f"{where}: unknown source {item!r}")
                elif key == "source_ids":
                    if not isinstance(item, list):
                        problems.append(f"{where}: expected an array of source IDs")
                    for source in item if isinstance(item, list) else []:
                        if not isinstance(source, str) or source not in sources:
                            problems.append(f"{where}: unknown source {source!r}")
                references(item, where)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                references(item, f"{location}[{index}]")

    references(manifest)
    payloads: dict[str, bytes] = {}
    grid = manifest.get("grid") if isinstance(manifest.get("grid"), dict) else {}
    ti_id = grid.get("ti_asset")
    for aid, asset in assets.items():
        path = asset.get("path")
        if not isinstance(path, str):
            problems.append(f"asset {aid}: invalid path")
            continue
        target = site_dir / path
        if asset.get("format") == "tiles":
            target = target / "index.json"
        try:
            # Lexical check: the bundle's tiles, grid and images folders may be links to the data SSD (BD-12),
            # so a resolved path is not required to stay under the bundle folder; `..` and absolute paths are.
            if Path(path).is_absolute() or ".." in Path(path).parts:
                raise ValueError("path escapes site directory")
            payload = target.read_bytes()
        except (OSError, ValueError) as exc:
            problems.append(f"asset {aid} ({path}): {exc}")
            continue
        payloads[aid] = payload
        if hashlib.sha256(payload).hexdigest() != asset.get("sha256"):
            problems.append(f"asset {aid} ({path}): SHA-256 mismatch")
        if asset.get("format") != "tiles" and len(payload) != asset.get("bytes"):
            problems.append(f"asset {aid}: bytes does not match file size")
        if asset.get("format") in ("u8", "f32"):
            width, height = asset.get("width"), asset.get("height")
            if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
                problems.append(f"asset {aid}: invalid width or height")
            elif len(payload) != width * height * (4 if asset["format"] == "f32" else 1):
                problems.append(f"asset {aid}: array byte size does not match width and height")
            if aid != ti_id:
                for field in ("width", "height"):
                    if asset.get(field) != grid.get(field):
                        problems.append(f"asset {aid}: {field} differs from grid")
                for field in ("cell_m", "origin_m"):
                    if field in asset and asset[field] != grid.get(field):
                        problems.append(f"asset {aid}: {field} differs from grid")

    def finite_number(value: object) -> bool:
        try:
            return isinstance(value, (int, float)) and math.isfinite(value)
        except OverflowError:
            return False

    width, height = grid.get("width"), grid.get("height")
    cell, origin = grid.get("cell_m"), grid.get("origin_m")
    valid_grid = (isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0
                  and finite_number(cell) and cell > 0
                  and isinstance(origin, list) and len(origin) == 2
                  and all(finite_number(n) for n in origin))
    if not valid_grid:
        problems.append("grid: invalid width, height, cell_m or origin_m")
    elif width * height > _MAX_GRID_CELLS:
        problems.append("grid: width * height exceeds 05 §C limit")
    extent = manifest.get("aoi", {}).get("extent_m") if isinstance(manifest.get("aoi"), dict) else None
    valid_extent = (isinstance(extent, list) and len(extent) == 4
                    and all(finite_number(n) for n in extent)
                    and extent[0] < extent[2] and extent[1] < extent[3])
    if not valid_extent:
        problems.append("aoi.extent_m: invalid extent")
    def payload_for(value: object) -> bytes | None:
        return payloads.get(value) if isinstance(value, str) else None

    slope_limit_u8 = hard_slope_limit_deg() * config.SLOPE_U8_SCALE
    flags = payload_for(grid.get("flags_asset"))
    slopes = payload_for(grid.get("slope_p90_asset"))

    poi_limit_u8 = max_slope_limit_deg() * config.SLOPE_U8_SCALE

    def check_point(label: str, x: object, y: object, limit_u8: float | None = None) -> None:
        if not (finite_number(x) and finite_number(y)):
            problems.append(f"{label}: invalid coordinates")
            return
        if not valid_extent or not valid_grid:
            return
        if not (extent[0] <= x <= extent[2] and extent[1] <= y <= extent[3]):
            problems.append(f"{label}: outside aoi.extent_m")
            return
        try:
            col = math.floor((x - origin[0]) / cell)
            row = math.floor((origin[1] - y) / cell)
        except (OverflowError, ValueError):
            problems.append(f"{label}: outside grid")
            return
        if not (0 <= col < width and 0 <= row < height):
            problems.append(f"{label}: outside grid")
            return
        index = row * width + col
        if flags is None or slopes is None or index >= len(flags) or index >= len(slopes):
            problems.append(f"{label}: cannot check passability of grid cell")
            return
        mask = (1 << config.FLAG_BITS["NO_DATA"]) | (1 << config.FLAG_BITS["HARD_HAZARD"])
        if (flags[index] == config.U8_NODATA or flags[index] & mask
                or slopes[index] == config.U8_NODATA
                or slopes[index] > (slope_limit_u8 if limit_u8 is None else limit_u8)):
            problems.append(f"{label}: impassable grid cell")

    start = manifest.get("default_start")
    if isinstance(start, dict):
        check_point("default_start", start.get("x_m"), start.get("y_m"))

    # 05 §E.3 (rule of 2026-11-10): the candidate hab sites. A manifest without `hab_candidates`
    # is the single `default_start` / `hab_mast` site and is checked as before.
    candidates = manifest.get("hab_candidates")
    if isinstance(candidates, list) and candidates:
        problems.extend(check_hab_candidates(candidates, grid, manifest, check_point))
    traverse_payload = payload_for(manifest.get("traverse_asset"))
    if traverse_payload is not None:
        try:
            references(json.loads(traverse_payload), "traverse")
        except (ValueError, UnicodeDecodeError) as exc:
            problems.append(f"traverse asset: invalid GeoJSON: {exc}")
    poi_payload = payload_for(manifest.get("pois_asset"))
    if poi_payload is not None:
        try:
            collection = json.loads(poi_payload)
            if not isinstance(collection, dict) or not isinstance(collection.get("features"), list):
                raise ValueError("expected a GeoJSON feature collection")
            references(collection, "pois")
            for index, feature in enumerate(collection["features"]):
                if not isinstance(feature, dict):
                    problems.append(f"POI {index}: invalid feature")
                    continue
                props = feature.get("properties") or {}
                geometry = feature.get("geometry") or {}
                label = f"POI {props.get('poi_id', index)}" if isinstance(props, dict) else f"POI {index}"
                coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
                if not isinstance(coords, list) or len(coords) < 2:
                    problems.append(f"{label}: invalid coordinates")
                else:
                    check_point(label, coords[0], coords[1], poi_limit_u8)
        except (ValueError, UnicodeDecodeError) as exc:
            problems.append(f"pois asset: invalid GeoJSON: {exc}")
    return problems


def check_hab_candidates(candidates, grid: dict, manifest: dict, check_point) -> list[str]:
    """The 05 §E.3 rules for the candidate hab sites (rule of 2026-11-10).

    Checks: every candidate mast and `default_start` lies inside `aoi.extent_m` on a passable
    cell; `candidate_id`s and `rank`s are unique; exactly one candidate has `rank` 1; the rank-1
    candidate matches the manifest's `default_start`, `grid.comm_hab_asset` and `grid.hab_mast`.
    Every `comm_hab_asset` resolving to a known Asset is already checked by the generic
    reference walk in `validate()`.
    """
    problems: list[str] = []
    ids: set[str] = set()
    ranks: dict[int, int] = {}
    rank_one = None

    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            problems.append(f"hab_candidates[{index}]: invalid candidate record")
            continue
        candidate_id = candidate.get("candidate_id")
        label = candidate_id if isinstance(candidate_id, str) and candidate_id else f"hab_candidates[{index}]"
        if isinstance(candidate_id, str):
            if candidate_id in ids:
                problems.append(f"hab_candidates: duplicate candidate_id {candidate_id!r}")
            ids.add(candidate_id)
        rank = candidate.get("rank")
        if isinstance(rank, int) and not isinstance(rank, bool):
            if rank in ranks:
                problems.append(f"hab_candidates: duplicate rank {rank}")
            ranks[rank] = index
            if rank == 1:
                rank_one = candidate
        mast = candidate.get("hab_mast")
        if isinstance(mast, dict):
            check_point(f"hab_candidates[{label}].hab_mast", mast.get("x_m"), mast.get("y_m"))
        candidate_start = candidate.get("default_start")
        if isinstance(candidate_start, dict):
            check_point(f"hab_candidates[{label}].default_start",
                        candidate_start.get("x_m"), candidate_start.get("y_m"))

    if 1 not in ranks:
        problems.append("hab_candidates: no candidate has rank 1")
    elif rank_one is not None:
        # 05 Site: the rank-1 candidate mirrors the manifest's single-site fields.
        start = manifest.get("default_start")
        if isinstance(start, dict) and isinstance(rank_one.get("default_start"), dict):
            for field in ("x_m", "y_m"):
                if rank_one["default_start"].get(field) != start.get(field):
                    problems.append(
                        f"hab_candidates: the rank-1 candidate's default_start {field} differs from "
                        f"the manifest's default_start"
                    )
        mast = grid.get("hab_mast")
        if isinstance(mast, dict) and isinstance(rank_one.get("hab_mast"), dict):
            for field in ("x_m", "y_m", "height_m"):
                if rank_one["hab_mast"].get(field) != mast.get(field):
                    problems.append(
                        f"hab_candidates: the rank-1 candidate's hab_mast {field} differs from "
                        f"the manifest's grid.hab_mast"
                    )
        if rank_one.get("comm_hab_asset") != grid.get("comm_hab_asset"):
            problems.append(
                f"hab_candidates: the rank-1 candidate's comm_hab_asset "
                f"{rank_one.get('comm_hab_asset')!r} differs from the manifest's grid.comm_hab_asset "
                f"{grid.get('comm_hab_asset')!r}"
            )
    return problems


def main() -> int:
    """Validate a site directory and print every problem."""
    parser = argparse.ArgumentParser(description="Validate a Marswalk site bundle")
    parser.add_argument("site_dir", type=Path)
    args = parser.parse_args()
    problems = validate(args.site_dir)
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
