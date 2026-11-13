"""Clip source rasters and reproject them to the local Mars working projection."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT


def clip_and_reproject(
    src: Path,
    dst: Path,
    proj4: str,
    extent_m: tuple[float, float, float, float],
    resolution_m: float,
    *,
    resampling: str = "bilinear",
    preserve_unknown: bool = False,
) -> None:
    """Warp the requested extent to a north-up raster, reading by output window.

    Use bilinear for elevation and thermal-inertia display, nearest for flags.
    Extent dimensions must be whole multiples of the requested resolution.
    """
    methods = {"bilinear": Resampling.bilinear, "nearest": Resampling.nearest}
    if resampling not in methods:
        raise ValueError(f"Unsupported resampling method: {resampling}")
    minx, miny, maxx, maxy = extent_m
    if not all(math.isfinite(value) for value in (*extent_m, resolution_m)):
        raise ValueError("Extent and resolution must be finite")
    if resolution_m <= 0 or maxx <= minx or maxy <= miny:
        raise ValueError("Extent and resolution must be positive")
    columns = (maxx - minx) / resolution_m
    rows = (maxy - miny) / resolution_m
    width, height = round(columns), round(rows)
    if (
        width < 1
        or height < 1
        or abs(columns - width) > math.ulp(columns)
        or abs(rows - height) > math.ulp(rows)
    ):
        raise ValueError("Extent dimensions must be multiples of resolution")
    transform = from_origin(minx, maxy, resolution_m, resolution_m)

    # BD-19: the routing-grid elevation is the block mean of this bilinear-warped 1 m DEM (the
    # derive step), not a direct warp to the 5 m grid.
    with rasterio.open(src) as source:
        profile = source.profile.copy()
        profile.update(driver="GTiff", crs=proj4, transform=transform, width=width, height=height)
        if preserve_unknown:
            profile.update(dtype="float32", nodata=np.nan)
        with WarpedVRT(
            source,
            crs=proj4,
            transform=transform,
            width=width,
            height=height,
            resampling=methods[resampling],
            add_alpha=preserve_unknown,
        ) as warped, rasterio.open(dst, "w", **profile) as output:
            for _, window in output.block_windows():
                if preserve_unknown:
                    data = warped.read(indexes=list(source.indexes), window=window, out_dtype="float32")
                    data[:, warped.read(source.count + 1, window=window) == 0] = np.nan
                    output.write(data, window=window)
                else:
                    output.write(warped.read(window=window), window=window)


def nodata_to_nan(path: Path) -> None:
    """Convert declared DEM no-data values to NaN in place, block by block."""
    with rasterio.open(path, "r+") as dataset:
        nodata = dataset.nodata
        # BD-19: the no-data value is the GeoTIFF tag. Neither PDS3 label states one (T01.01,
        # docs/ops/feasibility.md), so an untagged DEM is refused rather than guessed.
        if nodata is None:
            raise ValueError("DEM has no declared no-data value and its PDS3 labels state none (T01.01)")
        if any(not np.issubdtype(np.dtype(dtype), np.floating) for dtype in dataset.dtypes):
            raise ValueError("DEM must have a floating-point dtype to store NaN")
        for band in dataset.indexes:
            for _, window in dataset.block_windows(band):
                data = dataset.read(band, window=window)
                data[data == nodata] = np.nan
                dataset.write(data, band, window=window)
        dataset.nodata = np.nan
