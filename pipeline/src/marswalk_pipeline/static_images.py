"""One static PNG per 2 m display layer (opt-in `--static-images`, T03.25; docs/contracts/tile-grid.md §6, BD-23).

The ImageStatic fallback: a layer that would be tiled is rendered as a single image covering `aoi.extent_m`, with the C9 pixel
encoding of its tiles (slope u8 = degrees x 4, hillshade 1-255, ramp RGB, categorical RGBA; PNG alpha for missing pixels). It
reuses `render_tiles` with one level and one tile the size of the AOI, so the encoding cannot drift from the tiled path.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from .tiles import render_tiles


def render_static_image(raster: Path, layer_id: str, extent_m: tuple[float, float, float, float], resolution_m: float, out_png: Path, **options) -> None:
    """Render `raster` (north-up, working projection) to `out_png`, one pixel per `resolution_m`, covering `extent_m`.

    `options` are `render_tiles`' (data_encoded, hillshade, ramp, categorical). The extent must be square and a whole number of
    pixels wide, because the image is one square tile (C9 §3 addressing); the 6 km Gale window is 3000 px at 2 m.
    """
    minx, miny, maxx, maxy = extent_m
    width, height = maxx - minx, maxy - miny
    if width <= 0 or width != height:
        raise ValueError(f"a static image needs a square, non-empty extent, got {width} x {height} m")
    pixels = width / resolution_m
    if resolution_m <= 0 or pixels != int(pixels):
        raise ValueError(f"the extent {width} m is not a whole number of {resolution_m} m pixels")
    out_png = Path(out_png)
    with tempfile.TemporaryDirectory() as scratch:
        render_tiles(Path(raster), layer_id, (minx, maxy), [resolution_m], int(pixels), "png", Path(scratch),
                     aoi_extent_m=extent_m, **options)
        out_png.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(Path(scratch) / "tiles" / layer_id / "0" / "0" / "0.png"), str(out_png))
