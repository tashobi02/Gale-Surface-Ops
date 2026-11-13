"""Render local working-projection tiles (02 §E.1; 05 Layer.tile_grid)."""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import warnings
from pathlib import Path

from . import config


def ramp_colours(values, low: float, high: float):
    """Map float values to RGB along `config.DATA_RAMP_RGB` between `low` (2nd percentile) and `high` (98th).

    Values outside the range take the end colours; NaN maps to the first colour and the caller
    makes it transparent. Returns an (h, w, 3) uint8 array. BD-17.
    """
    import numpy as np

    if not (math.isfinite(low) and math.isfinite(high) and high > low):
        raise ValueError("a colour ramp needs finite stops with high > low")
    colours = np.asarray(config.DATA_RAMP_RGB, dtype="float64")
    position = np.clip((np.nan_to_num(np.asarray(values, dtype="float64"), nan=low) - low) / (high - low), 0.0, 1.0) * (len(colours) - 1)
    lower = np.minimum(np.floor(position).astype(int), len(colours) - 2)
    fraction = (position - lower)[..., np.newaxis]
    return np.rint(colours[lower] * (1 - fraction) + colours[lower + 1] * fraction).astype("uint8")


def ramp_stops(values, unit: str, decimals: int) -> list:
    """The legend stops of a data ramp: the 2nd and 98th percentile of the finite cells (BD-17).

    NumPy's default linear interpolation, float64, NaN cells ignored. Each stop is `[value, label]`
    (05 Layer.legend, `RampLegend`); the label is the value rounded to `decimals` and the unit.
    """
    import numpy as np

    array = np.asarray(values, dtype="float64")
    finite = array[np.isfinite(array)]
    if finite.size == 0:
        raise ValueError("no valid cells to build a colour ramp from")
    low, high = (float(np.percentile(finite, q)) for q in config.RAMP_PERCENTILES)
    return [[value, f"{value:.{decimals}f} {unit}"] for value in (low, high)]


def set_legend_stops(record_path: Path, stops: list) -> None:
    """Write computed ramp stops into a layer record (pipeline/sites/<site>/layers/<id>.json)."""
    record = json.loads(Path(record_path).read_text(encoding="utf-8"))
    record["legend"] = {"type": "ramp", "stops": stops}
    Path(record_path).write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def hazard_rgba(flags):
    """Display RGBA (4, h, w) of the routing-grid flags: the highest-priority flag's status colour (BD-136)."""
    import numpy as np

    flags = np.asarray(flags, dtype="uint8")
    out = np.zeros((4,) + flags.shape, dtype="uint8")
    painted = np.zeros(flags.shape, dtype=bool)
    for name, rgb in config.HAZARD_DISPLAY_RGB:
        hit = ((flags >> config.FLAG_BITS[name]) & 1).astype(bool) & ~painted
        for band, value in enumerate(rgb):
            out[band][hit] = value
        out[3][hit] = 255
        painted |= hit
    return out


def comm_rgba(visibility):
    """Display RGBA (4, h, w) of comm_hab: white where in line of sight, transparent in shadow and no-data (C9 §4)."""
    import numpy as np

    visible = np.asarray(visibility, dtype="uint8") == 1
    out = np.zeros((4,) + visible.shape, dtype="uint8")
    for band, value in enumerate(config.COMM_VISIBLE_RGB):
        out[band][visible] = value
    out[3][visible] = 255
    return out


def write_rgba_raster(path: Path, rgba, origin_m: tuple[float, float], cell_m: float, proj4: str) -> None:
    """Write a north-up RGBA GeoTIFF in the working projection from a (4, h, w) array."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.enums import ColorInterp
    from rasterio.transform import from_origin

    _, height, width = rgba.shape
    with rasterio.open(path, "w", driver="GTiff", width=width, height=height, count=4, dtype="uint8",
                       crs=CRS.from_proj4(proj4), transform=from_origin(origin_m[0], origin_m[1], cell_m, cell_m)) as dst:
        dst.write(rgba)
        dst.colorinterp = (ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha)


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
    ramp: tuple[float, float] | None = None,
    categorical: bool = False,
    background_rgb: tuple[int, int, int] = config.MAP_BACKGROUND_RGB,
) -> None:
    """Render a north-up raster already in the site's working projection (docs/contracts/tile-grid.md, C9 v1.2).

    Addressing, sampling, encoding and the index follow C9: tile (z, x, y) covers
    x in [ox + x*span, ox + (x+1)*span], y in [oy - (y+1)*span, oy - y*span], span =
    tile_size_px * resolutions_m[z]; `tiles/<layer>/index.json` lists every tile.
    data_encoded=True: the single band is slope in degrees, written as u8 (degrees x 4).
    hillshade=True: illumination in [0, 1], encoded 1-255. ramp=(low, high): the single float
    band is coloured along config.DATA_RAMP_RGB (BD-17); NaN is transparent. categorical=True
    resamples by nearest neighbour (flags, line of sight). Otherwise the bands must already be
    display-ready uint8 grey or RGB. PNG keeps missing pixels as alpha. JPEG has no alpha: pixels
    outside the source mask or outside `aoi_extent_m` are written as `background_rgb` (the 04 map
    background colour, BD-18); black pixels the source marks valid are written as they are.
    The supplied resolutions determine output resolution, including the finest.
    """
    import numpy as np
    import rasterio
    from rasterio.enums import ColorInterp, Resampling
    from rasterio.errors import NotGeoreferencedWarning
    from rasterio.io import MemoryFile
    from rasterio.windows import from_bounds

    if not layer_id or layer_id in {".", ".."} or Path(layer_id).name != layer_id or "\\" in layer_id:
        raise ValueError("layer_id must be a single path component")
    if fmt not in {"png", "jpg", "jpeg"}:
        raise ValueError("format must be png, jpg or jpeg")
    if ramp is not None and (fmt != "png" or data_encoded or hillshade or len(ramp) != 2):
        raise ValueError("a colour ramp needs PNG and a (low, high) pair")
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
        if len(bands) not in (1, 3) or ((data_encoded or hillshade or ramp is not None) and len(bands) != 1):
            raise ValueError("expected one grayscale/slope band or three RGB bands")
        if not data_encoded and not hillshade and ramp is None and any(src.dtypes[i - 1] != "uint8" for i in bands):
            raise ValueError("display raster must be uint8 unless it is slope, hillshade or a ramp layer")

        ox, oy = origin_m
        west, north = src.bounds.left, src.bounds.top
        if (west < ox and ox - west > 4 * max(math.ulp(west), math.ulp(ox))) or (
            north > oy and north - oy > 4 * max(math.ulp(north), math.ulp(oy))
        ):
            raise ValueError(f"raster bounds west/north ({west}, {north}) extend beyond origin_m ({ox}, {oy})")

        # `tiles/` itself may be a link to the data SSD (BD-12); only a stale layer link is unlinked, never followed.
        if root.is_symlink():
            root.unlink()
        elif root.exists():
            shutil.rmtree(root)

        resampling = Resampling.nearest if (data_encoded or categorical) else Resampling.bilinear
        for z, resolution in enumerate(resolutions_m):
            span = tile_size_px * resolution
            for x in range(max(0, math.floor((src.bounds.left - ox) / span)), math.ceil((src.bounds.right - ox) / span)):
                for y in range(max(0, math.floor((oy - src.bounds.top) / span)), math.ceil((oy - src.bounds.bottom) / span)):
                    left, top = ox + x * span, oy - y * span
                    window = from_bounds(left, top - span, left + span, top, transform)
                    values = src.read(bands, window=window, out_shape=(len(bands), tile_size_px, tile_size_px),
                                      boundless=True, masked=True,
                                      resampling=resampling)
                    missing = np.ma.getmaskarray(values).any(axis=0) | ~np.isfinite(values.data).all(axis=0)
                    if alpha_indexes:
                        alpha_values = src.read(alpha_indexes[0], window=window, out_shape=(tile_size_px, tile_size_px),
                                                boundless=True, fill_value=0, resampling=resampling)
                        missing |= alpha_values < 128
                    # Mask pixel centres beyond the source extent regardless of GDAL fill value.
                    cols = window.col_off + (np.arange(tile_size_px) + .5) * window.width / tile_size_px
                    rows = window.row_off + (np.arange(tile_size_px) + .5) * window.height / tile_size_px
                    missing |= (rows[:, None] < 0) | (rows[:, None] >= src.height) | (cols[None, :] < 0) | (cols[None, :] >= src.width)
                    if fmt in {"jpg", "jpeg"}:
                        assert aoi_extent_m is not None  # validated above
                        x_centres = left + (np.arange(tile_size_px) + .5) * span / tile_size_px
                        y_centres = top - (np.arange(tile_size_px) + .5) * span / tile_size_px
                        missing |= (y_centres[:, None] < aoi_extent_m[1]) | (y_centres[:, None] > aoi_extent_m[3])
                        missing |= (x_centres[None, :] < aoi_extent_m[0]) | (x_centres[None, :] > aoi_extent_m[2])
                    if ramp is not None:
                        rgb = ramp_colours(values.data[0], *ramp)
                        pixels = np.where(missing[:, :, None], 0, rgb).astype("uint8").transpose(2, 0, 1)
                    elif data_encoded:
                        from .grid import encode_slope_u8

                        pixels = encode_slope_u8(np.where(missing, np.nan, values.data[0]))[np.newaxis, :, :]
                    elif hillshade:
                        # Encoded 0 is no-data; illumination 0..1 maps to 1..255.
                        shade = np.clip(values.data[0], 0, 1)
                        pixels = np.where(missing, 0, np.rint(1 + 254 * shade)).astype("uint8")[np.newaxis, :, :]
                    elif fmt in {"jpg", "jpeg"}:
                        fill = np.asarray(background_rgb, dtype="uint8")[:len(bands), None, None]
                        pixels = np.where(missing[np.newaxis, :, :], fill, values.data).astype("uint8")
                    else:
                        pixels = np.where(missing[np.newaxis, :, :], 0, values.data).astype("uint8")
                    if fmt == "png":
                        alpha = np.where(missing, 0, 255).astype("uint8")
                        pixels = np.concatenate((pixels, alpha[np.newaxis, :, :]))
                    with warnings.catch_warnings():
                        # In-memory PNG/JPEG tiles carry no georeferencing by design (BD-22).
                        warnings.simplefilter("ignore", NotGeoreferencedWarning)
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
    # C9 v1.2 §3.3: the index is sorted by path; the tiles Asset's sha256 is the hash of this file.
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.json").write_text(
        json.dumps({"tiles": sorted(entries, key=lambda entry: entry["path"])},
                   sort_keys=True, indent=2, allow_nan=False) + "\n", encoding="utf-8")
