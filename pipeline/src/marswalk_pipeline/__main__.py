"""Run the offline preprocessing pipeline for one configured site."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

STEPS = ("acquire", "clip_reproject", "derive", "flags", "grid", "comm_grid", "tiles", "vectors", "manifest", "validate")


def _paths(site_id: str) -> tuple[Path, Path, Path, Path]:
    root = Path(__file__).resolve().parents[3]
    return root, root / "pipeline" / "sites" / site_id, root / "pipeline" / "work", root / "data" / "sites" / site_id


# Display layers whose tiles are derived from the other outputs: a computed colour ramp or a flag
# encoding (BD-17). The build renders all of them; `--skip-unstyled-optional` can omit the optional ones.
DERIVED_DISPLAY_LAYERS = ("elevation", "thermal_inertia", "hazard_flags", "comm_hab")
# Ramp layers: (source raster in the scratch folder, unit of the legend labels, decimals of the labels).
RAMP_LAYERS = {"elevation": ("dem.tif", "m", 1), "thermal_inertia": ("ti.tif", "tiu", 0)}


def _skipped_layers(site_dir: Path) -> set[str]:
    """The optional derived display layers (the ones `--skip-unstyled-optional` may omit)."""
    result = set()
    for layer in DERIVED_DISPLAY_LAYERS:
        path = site_dir / "layers" / f"{layer}.json"
        if path.exists() and json.loads(path.read_text(encoding="utf-8")).get("optional") is True:
            result.add(layer)
    return result


def _run_step(name: str, root: Path, site_dir: Path, work_dir: Path, bundle_dir: Path, *, inputs: dict[str, Path] | None = None, lock_path: Path | None = None, skip_unstyled_optional: bool = False, traverse: Path | None = None, offline: bool = False) -> None:
    """Invoke one step, persisting intermediates separately from source inputs."""
    from . import config

    site = json.loads((site_dir / "site.json").read_text(encoding="utf-8"))
    projection = config.PROJ4_BY_SITE[site["site_id"]]
    extent = tuple(site["aoi"]["extent_m"])
    origin = (extent[0], extent[3])
    scratch = work_dir / "runs" / site["site_id"]
    scratch.mkdir(parents=True, exist_ok=True)

    if name == "acquire":
        from .acquire import fetch_sources
        fetch_sources(lock_path or root / "pipeline" / "sources.lock.json", work_dir, data_version=site["data_version"], offline=offline)
    elif name == "clip_reproject":
        from .clip_reproject import clip_and_reproject, nodata_to_nan
        # Local input paths are relative to --work, independent of the output bundle.
        sources = {"dem": work_dir / "dem/aoi_1m.tif", "ortho": work_dir / "ortho/hirise_lrgb_aoi.tif", "ti": work_dir / "ti/themis_ti_aoi_pad1km.tif"}
        from .acquire import source_filename
        lock = lock_path or root / "pipeline" / "sources.lock.json"
        ids = {"usgs-gale-dem-1m-v3": "dem", "usgs-gale-ortho-25cm-v3": "ortho", "usgs-themis-ti-30s120e": "ti"}
        entries = json.loads(lock.read_text(encoding="utf-8"))["sources"] if lock.exists() else []
        if entries:
            for entry in entries:
                if entry.get("source_id") in ids and entry.get("url"):
                    sources[ids[entry["source_id"]]] = work_dir / source_filename(entry)
        for kind, path in (inputs or {}).items():
            matching = [entry for entry in entries if ids.get(entry.get("source_id")) == kind]
            if len(matching) != 1 or not matching[0].get("sha256"):
                raise ValueError(f"Missing or ambiguous lock checksum for {kind} override: {path}")
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != matching[0]["sha256"]:
                raise ValueError(f"Override checksum mismatch for {kind}: {path}")
        sources.update(inputs or {})
        jobs = (("dem", "dem.tif", 1, "bilinear"), ("ortho", "ortho.tif", 0.5, "bilinear"),
                ("ti", "ti.tif", 100, "bilinear"), ("ti", "ti_flags.tif", config.GRID_CELL_M, "nearest"))
        for source, target, resolution, method in jobs:
            clip_and_reproject(sources[source], scratch / target, projection, extent, resolution, resampling=method, preserve_unknown=source == "ti")
        nodata_to_nan(scratch / "dem.tif")
    elif name == "derive":
        import numpy as np
        import rasterio
        from rasterio.windows import Window
        from .derive import aggregate_slope, hillshade, horn_slope_deg
        factor = int(config.GRID_CELL_M)
        with rasterio.open(scratch / "dem.tif") as dem:
            if dem.width % factor or dem.height % factor:
                raise ValueError("DEM dimensions must be multiples of the grid cell size")
            profile = dem.profile.copy()
            profile.update(dtype="float32", nodata=np.nan, count=1)
            shape = (dem.height // factor, dem.width // factor)
            elevation = np.full(shape, np.nan, dtype="float32")
            p90, maximum = np.full(shape, np.nan, dtype="float32"), np.full(shape, np.nan, dtype="float32")
            with rasterio.open(scratch / "slope.tif", "w", **profile) as slope_out, rasterio.open(scratch / "hillshade.tif", "w", **profile) as shade_out:
                # Whole routing-cell strips with a one-pixel Horn halo.
                for start in range(0, dem.height, factor * 40):
                    end = min(start + factor * 40, dem.height)
                    top, bottom = max(0, start - 1), min(dem.height, end + 1)
                    z = dem.read(1, window=Window(0, top, dem.width, bottom - top), masked=True).filled(np.nan)
                    selected = slice(start - top, end - top)
                    slope = horn_slope_deg(z, 1)[selected]
                    shade = hillshade(z, 1)[selected]
                    window = Window(0, start, dem.width, end - start)
                    slope_out.write(slope.astype("float32"), 1, window=window)
                    shade_out.write(shade.astype("float32"), 1, window=window)
                    p, m = aggregate_slope(slope, factor)
                    p90[start // factor:end // factor] = p
                    maximum[start // factor:end // factor] = m
                    blocks = z[selected].reshape((end - start) // factor, factor, dem.width // factor, factor)
                    with np.errstate(invalid="ignore"):
                        valid = np.isfinite(blocks)
                        count = valid.sum(axis=(1, 3))
                        sums = np.where(valid, blocks, 0).sum(axis=(1, 3), dtype=np.float64)
                        elevation[start // factor:end // factor] = np.divide(sums, count, out=np.full(count.shape, np.nan), where=count != 0)
        for key, array in (("elevation", elevation), ("p90", p90), ("maximum", maximum)):
            np.save(scratch / f"{key}.npy", array)
    elif name == "flags":
        import numpy as np
        import rasterio
        from .flags import hazard_flags, rasterize_mask
        elevation = np.load(scratch / "elevation.npy")
        with rasterio.open(scratch / "ti_flags.tif") as ti:
            values = ti.read(1, masked=True).astype("float32").filled(np.nan)
        threshold_file = site_dir / "ti_threshold.json"
        threshold = json.loads(threshold_file.read_text(encoding="utf-8"))["value"] if threshold_file.exists() else None
        height, width = elevation.shape
        masks = [rasterize_mask(site_dir / filename, width, height, config.GRID_CELL_M, origin) for filename in ("hazards.geojson", "low_res_dem.geojson")]
        np.save(scratch / "flags.npy", hazard_flags(elevation, values, threshold, *masks))
    elif name == "grid":
        import numpy as np
        import rasterio
        from .grid import encode_slope_u8, write_grid
        with rasterio.open(scratch / "ti.tif") as ti:
            values = ti.read(1, masked=True).astype("float32").filled(np.nan)
        write_grid(bundle_dir, np.load(scratch / "elevation.npy"), encode_slope_u8(np.load(scratch / "p90.npy")), encode_slope_u8(np.load(scratch / "maximum.npy")), np.load(scratch / "flags.npy"), values)
    elif name == "comm_grid":
        import numpy as np
        from .comm_grid import build_comm_hab, write_comm_hab
        from .manifest import candidate_file_name, read_candidates
        elevation = np.load(scratch / "elevation.npy")
        candidates = read_candidates(site_dir)
        if candidates:
            # One grid per candidate, all from the same elevation array and the same mast height
            # (the link ParamSet `hab_mast_m`, read by build_comm_hab). The rank-1 candidate writes
            # grid/comm_hab.u8, so `grid.comm_hab_asset` and every current consumer are unchanged.
            for candidate in candidates:
                mast = candidate["hab_mast"]
                write_comm_hab(
                    bundle_dir,
                    build_comm_hab(elevation, config.GRID_CELL_M, origin, mast["x_m"], mast["y_m"], root),
                    file_name=candidate_file_name(candidate),
                )
        else:
            # No hab_candidates.json: the single site mast, exactly as before.
            mast = site["hab_mast"]
            write_comm_hab(bundle_dir, build_comm_hab(elevation, config.GRID_CELL_M, origin, mast["x_m"], mast["y_m"], root))
    elif name == "tiles":
        import numpy as np
        import rasterio
        from .tiles import comm_rgba, hazard_rgba, ramp_stops, render_tiles, set_legend_stops, write_rgba_raster
        skipped = _skipped_layers(site_dir) if skip_unstyled_optional else set()
        for layer, raster in (("ortho", "ortho.tif"), ("hillshade", "hillshade.tif"), ("slope", "slope.tif"), ("elevation", "dem.tif"), ("thermal_inertia", "ti.tif"), ("hazard_flags", "hazard_flags.tif"), ("comm_hab", "comm_hab.tif")):
            if layer in skipped:
                print(f"Warning: {layer}: omitted by --skip-unstyled-optional", file=sys.stderr)
                old = bundle_dir / "tiles" / layer
                if old.is_symlink():
                    old.unlink()
                elif old.exists():
                    shutil.rmtree(old)
                continue
            record_path = site_dir / "layers" / f"{layer}.json"
            record = json.loads(record_path.read_text(encoding="utf-8"))
            tile_grid = record["tile_grid"]
            options: dict = {}
            if layer in RAMP_LAYERS:
                source, unit, decimals = RAMP_LAYERS[layer]
                with rasterio.open(scratch / source) as dataset:
                    values = dataset.read(1, masked=True).astype("float64").filled(np.nan)
                stops = ramp_stops(values, unit, decimals)
                set_legend_stops(record_path, stops)
                options["ramp"] = (stops[0][0], stops[1][0])
            elif layer == "hazard_flags":
                write_rgba_raster(scratch / raster, hazard_rgba(np.load(scratch / "flags.npy")), origin, config.GRID_CELL_M, projection)
                options["categorical"] = True
            elif layer == "comm_hab":
                shape = np.load(scratch / "flags.npy").shape
                visibility = np.fromfile(bundle_dir / "grid" / "comm_hab.u8", dtype=np.uint8).reshape(shape)
                write_rgba_raster(scratch / raster, comm_rgba(visibility), origin, config.GRID_CELL_M, projection)
                options["categorical"] = True
            render_tiles(scratch / raster, layer, tuple(tile_grid["origin_m"]), tile_grid["resolutions_m"], tile_grid["tile_size_px"], tile_grid["format"], bundle_dir, data_encoded=layer == "slope", hillshade=layer == "hillshade", aoi_extent_m=extent, **options)
    elif name == "vectors":
        from .vectors import package_poi_images, package_pois, package_traverse
        if traverse is None:
            raise ValueError("--traverse is required for vectors: provide the T04.01 cached source for the T04.03 parser")
        package_traverse(traverse, projection, bundle_dir / "vectors" / "traverse.geojson", aoi_extent_m=extent)
        package_pois(site_dir / "pois", projection, bundle_dir / "vectors" / "pois.geojson")
        package_poi_images(site_dir / "pois", work_dir / "images", bundle_dir / "images")
    elif name == "manifest":
        from .manifest import write_manifest
        write_manifest(bundle_dir, site["data_version"], projection, site_dir, exclude_layers=_skipped_layers(site_dir) if skip_unstyled_optional else set())
    elif name == "validate":
        from .validate_manifest import validate
        problems = validate(bundle_dir)
        if problems:
            raise RuntimeError("; ".join(problems))
    else:
        raise AssertionError(f"unrecognized pipeline step: {name}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m marswalk_pipeline", description="Build one offline Marswalk site bundle.", epilog="Steps (in execution order): " + " → ".join(STEPS))
    parser.add_argument("site_id", nargs="?", help="site folder under pipeline/sites/")
    parser.add_argument("--out", type=Path, help="output bundle directory (default: data/sites/<site_id>)")
    parser.add_argument("--work", type=Path, help="local inputs and intermediates (default: pipeline/work)")
    parser.add_argument("--lock", type=Path, help="source lock file (default: pipeline/sources.lock.json)")
    parser.add_argument("--traverse", type=Path, help="T04.01 cached traverse source for T04.03 vector packaging")
    parser.add_argument("--offline", action="store_true", help="acquire makes no request: it verifies the files in --work against the lock and fails on a missing one")
    parser.add_argument("--skip-unstyled-optional", action="store_true", help="omit the optional derived display layers (elevation, thermal_inertia, hazard_flags, comm_hab); the build does not use it")
    for source in ("dem", "ortho", "ti"):
        parser.add_argument(f"--{source}", type=Path, help=f"override local {source} input raster")
    args = parser.parse_args(argv)
    if not args.site_id:
        parser.error("site_id is required (see --help for the pipeline steps)")
    if Path(args.site_id).name != args.site_id or args.site_id in (".", ".."):
        parser.error("site_id must be one path component")
    root, site_dir, work_dir, bundle_dir = _paths(args.site_id)
    work_dir = args.work if args.work is not None else work_dir
    bundle_dir = args.out if args.out is not None else bundle_dir
    if not site_dir.is_dir():
        print(f"Unknown site_id {args.site_id!r}: no input folder at {site_dir}", file=sys.stderr)
        return 2
    try:
        configured_id = json.loads((site_dir / "site.json").read_text(encoding="utf-8"))["site_id"]
    except (OSError, ValueError, KeyError) as exc:
        print(f"Cannot read site_id from {site_dir / 'site.json'}: {exc}", file=sys.stderr)
        return 2
    if configured_id != args.site_id:
        print(f"site_id mismatch: CLI {args.site_id!r}, site.json {configured_id!r}", file=sys.stderr)
        return 2
    work_dir.mkdir(parents=True, exist_ok=True)
    bundle_dir.mkdir(parents=True, exist_ok=True)
    for step in STEPS:
        started = time.monotonic()
        try:
            inputs = {name: getattr(args, name) for name in ("dem", "ortho", "ti") if getattr(args, name) is not None}
            _run_step(step, root, site_dir, work_dir, bundle_dir, inputs=inputs,
                      lock_path=args.lock or root / "pipeline" / "sources.lock.json",
                      skip_unstyled_optional=args.skip_unstyled_optional, traverse=args.traverse, offline=args.offline)
        except Exception as exc:
            print(f"Pipeline step '{step}' failed after {time.monotonic() - started:.3f}s: {exc}", file=sys.stderr, flush=True)
            return 1
        print(f"{step}: {time.monotonic() - started:.3f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
