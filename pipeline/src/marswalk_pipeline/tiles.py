"""Render local working-projection tiles (02 §E.1; 05 Layer.tile_grid)."""
from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path

def render_tiles(
    raster: Path,
    layer_id: str,
    origin_m: tuple[float, float],
    resolutions_m: list[float],
    tile_size_px: int,
    fmt: str,
    out_dir: Path,
    *,
    data_encoded: bool = False,
    hillshade: bool = False,
    aoi_extent_m: tuple[float, float, float, float] | None = None,
) -> None:
    """Render a north-up raster already in the site's working projection.

    TODO(verify): C9 must confirm addressing, sampling, pixel encoding and index.
    For data_encoded=True the single input band is slope in degrees. With
    hillshade=True it is illumination in [0, 1], encoded in 1–255. Otherwise
    input bands must already be display-ready uint8 grayscale or RGB; any colour
    ramp is TODO(verify). PNG retains missing pixels as alpha. JPEG has no alpha:
    reject missing source data within the AOI, while allowing outside padding.
    The viewer must clip that padding; 02 §C.2 L1's coverage polygon remains open.
    The supplied resolutions determine output resolution, including the finest.
    """
    import numpy as np
    import rasterio
    from rasterio.enums import ColorInterp, Resampling
    from rasterio.io import MemoryFile
    from rasterio.windows import from_bounds

    if not layer_id or layer_id in {".", ".."} or Path(layer_id).name != layer_id or "\\" in layer_id:
        raise ValueError("layer_id must be a single path component")
    if fmt not in {"png", "jpg", "jpeg"}:
        raise ValueError("format must be png, jpg or jpeg")
    if hillshade and (data_encoded or fmt != "png"):
        raise ValueError("hillshade requires display PNG")
    if data_encoded and fmt != "png":
        raise ValueError("data-encoded slope requires lossless PNG")
    if tile_size_px <= 0 or not resolutions_m or any(not math.isfinite(r) or r <= 0 for r in resolutions_m):
        raise ValueError("tile size and resolutions must be positive")
    if len(origin_m) != 2 or not all(math.isfinite(v) for v in origin_m):
        raise ValueError("origin must contain two finite coordinates")
    if fmt in {"jpg", "jpeg"}:
        if aoi_extent_m is None or len(aoi_extent_m) != 4 or not all(math.isfinite(v) for v in aoi_extent_m):
            raise ValueError("JPEG tiles require a finite aoi.extent_m")
        if aoi_extent_m[0] >= aoi_extent_m[2] or aoi_extent_m[1] >= aoi_extent_m[3]:
            raise ValueError("JPEG aoi.extent_m must have positive width and height")

    root = Path(out_dir) / "tiles" / layer_id
    entries = []
    with rasterio.open(raster) as src:
        transform = src.transform
        if transform.b != 0 or transform.d != 0 or transform.a <= 0 or transform.e >= 0:
            raise ValueError("raster must be north-up in the working projection")
        alpha_indexes = [i for i, color in enumerate(src.colorinterp, 1) if color == ColorInterp.alpha]
        bands = [i for i in src.indexes if i not in alpha_indexes]
        if len(bands) not in (1, 3) or ((data_encoded or hillshade) and len(bands) != 1):
            raise ValueError("expected one grayscale/slope band or three RGB bands")
        if not data_encoded and not hillshade and any(src.dtypes[i - 1] != "uint8" for i in bands):
            raise ValueError("display raster must be uint8; colour mapping is not specified")

        if fmt in {"jpg", "jpeg"}:
            from rasterio.windows import Window

            assert aoi_extent_m is not None  # validated above
            minx, miny, maxx, maxy = aoi_extent_m
            error = f"{layer_id}: JPEG cannot represent invalid or no-data source pixels inside aoi.extent_m"
            bounds = src.bounds
            # Missing raster coverage is also missing data within the AOI.
            for actual, required, lower in ((bounds.left, minx, True), (bounds.bottom, miny, True),
                                            (bounds.right, maxx, False), (bounds.top, maxy, False)):
                tolerance = 4 * max(math.ulp(actual), math.ulp(required))
                gap = actual - required if lower else required - actual
                if gap > tolerance:
                    raise ValueError(f"{error}: source does not cover the AOI")

            aoi_window = from_bounds(minx, miny, maxx, maxy, transform)

            def snap(value: float) -> float:
                nearest = round(value)
                return float(nearest) if abs(value - nearest) <= 4 * math.ulp(value) else value

            col_start = max(0, math.floor(snap(aoi_window.col_off)))
            row_start = max(0, math.floor(snap(aoi_window.row_off)))
            col_end = min(src.width, math.ceil(snap(aoi_window.col_off + aoi_window.width)))
            row_end = min(src.height, math.ceil(snap(aoi_window.row_off + aoi_window.height)))
            # Check all source pixels intersecting the AOI before any resampling.
            # Bounded windows avoid materializing a large raster in memory.
            for row in range(row_start, row_end, 1024):
                for col in range(col_start, col_end, 1024):
                    window = Window(col, row, min(1024, col_end - col), min(1024, row_end - row))
                    if (src.read_masks(bands, window=window) == 0).any() or (
                        alpha_indexes and (src.read(alpha_indexes, window=window) == 0).any()
                    ):
                        raise ValueError(error)

        ox, oy = origin_m
        west, north = src.bounds.left, src.bounds.top
        if (west < ox and ox - west > 4 * max(math.ulp(west), math.ulp(ox))) or (
            north > oy and north - oy > 4 * max(math.ulp(north), math.ulp(oy))
        ):
            raise ValueError(f"raster bounds west/north ({west}, {north}) extend beyond origin_m ({ox}, {oy})")

        if root.parent.is_symlink():
            raise ValueError("tiles directory must not be a symlink")
        if root.is_symlink():
            root.unlink()
        elif root.exists():
            shutil.rmtree(root)

        # TODO(verify): mock-site grid uses top-left origin, eastward x, southward y.
        for z, resolution in enumerate(resolutions_m):
            span = tile_size_px * resolution
            for x in range(max(0, math.floor((src.bounds.left - ox) / span)), math.ceil((src.bounds.right - ox) / span)):
                for y in range(max(0, math.floor((oy - src.bounds.top) / span)), math.ceil((oy - src.bounds.bottom) / span)):
                    left, top = ox + x * span, oy - y * span
                    window = from_bounds(left, top - span, left + span, top, transform)
                    values = src.read(bands, window=window, out_shape=(len(bands), tile_size_px, tile_size_px),
                                      boundless=True, masked=True,
                                      resampling=Resampling.nearest if data_encoded else Resampling.bilinear)
                    missing = np.ma.getmaskarray(values).any(axis=0) | ~np.isfinite(values.data).all(axis=0)
                    # Mask pixel centres beyond the source extent regardless of GDAL fill value.
                    cols = window.col_off + (np.arange(tile_size_px) + .5) * window.width / tile_size_px
                    rows = window.row_off + (np.arange(tile_size_px) + .5) * window.height / tile_size_px
                    missing |= (rows[:, None] < 0) | (rows[:, None] >= src.height) | (cols[None, :] < 0) | (cols[None, :] >= src.width)
                    if data_encoded:
                        from .grid import encode_slope_u8

                        pixels = encode_slope_u8(np.where(missing, np.nan, values.data[0]))[np.newaxis, :, :]
                    elif hillshade:
                        # TODO(verify): gdaldem-style display range; encoded 0 is no-data.
                        shade = np.clip(values.data[0], 0, 1)
                        pixels = np.where(missing, 0, np.rint(1 + 254 * shade)).astype("uint8")[np.newaxis, :, :]
                    else:
                        pixels = np.where(missing[np.newaxis, :, :], 0, values.data).astype("uint8")
                    if fmt == "png":
                        alpha = np.where(missing, 0, 255).astype("uint8")
                        pixels = np.concatenate((pixels, alpha[np.newaxis, :, :]))
                    with MemoryFile() as memory:
                        with memory.open(driver="PNG" if fmt == "png" else "JPEG", width=tile_size_px,
                                         height=tile_size_px, count=pixels.shape[0], dtype="uint8") as tile:
                            tile.write(pixels)
                        payload = memory.read()
                    relative = f"{z}/{x}/{y}.{fmt}"
                    destination = root / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(payload)
                    entries.append({"path": relative, "bytes": len(payload),
                                    "sha256": hashlib.sha256(payload).hexdigest()})
    # TODO(verify): provisional mock-site index, not yet the C9 contract.
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.json").write_text(
        json.dumps({"tiles": sorted(entries, key=lambda entry: entry["path"])},
                   sort_keys=True, indent=2, allow_nan=False) + "\n", encoding="utf-8")
