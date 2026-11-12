"""T05b.20 (BD-61): `gdal_viewshed` reference for the compute relay viewshed, at the five check points.

The bundle's 5 m elevation array is written once as a GeoTIFF (so both tools read identical heights);
`gdal_viewshed` runs from each viewpoint with the ParamSet mast and suit-antenna heights, `-cc 1.0` (the
sphere's curvature, as in `check_viewshed.py`), `-md` 4000 m (02 §D.11) and visible = 255. Each result is
resampled to the centres of the 20 m, 4 km relay viewshed cells and written as `view_<n>.u8` (row 0 = north,
1 = visible), with `reference.json` naming the points and heights. The Vitest check
`packages/compute/tests/realGridVerify.test.ts` runs this and compares.

    $(make -s pipeline-python) pipeline/tests/fixtures/gdal_viewshed_reference.py <out_dir>
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "src"))

from check_viewshed import SITE, five_points, gdal_viewshed_binary  # noqa: E402
from marswalk_pipeline.comm_grid import read_comm_heights  # noqa: E402

RADIUS_M = 4000.0
CELL_M = 20.0


def main(out_dir: Path) -> None:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_origin

    manifest = json.loads((SITE / "site-manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    width, height, cell = grid["width"], grid["height"], grid["cell_m"]
    ox, oy = grid["origin_m"]
    mast, antenna = read_comm_heights()
    elevation = np.fromfile(SITE / "grid/elevation.f32", dtype="<f4").reshape(height, width)
    out_dir.mkdir(parents=True, exist_ok=True)
    source = out_dir / "elevation_5m.tif"
    with rasterio.open(source, "w", driver="GTiff", width=width, height=height, count=1, dtype="float32",
                       crs=CRS.from_proj4(manifest["crs"]["proj4"]), transform=from_origin(ox, oy, cell, cell)) as dst:
        dst.write(elevation, 1)

    n = int(2 * RADIUS_M / CELL_M)
    points = []
    for index, (label, row, col) in enumerate(five_points(grid)):
        x, y = ox + (col + 0.5) * cell, oy - (row + 0.5) * cell
        result = out_dir / f"gdal_{index}.tif"
        subprocess.run([gdal_viewshed_binary(), "-ox", str(x), "-oy", str(y), "-oz", str(mast), "-tz", str(antenna),
                        "-cc", "1.0", "-md", str(RADIUS_M), "-vv", "255", "-iv", "0", "-ov", "0", "-a_nodata", "254",
                        "--quiet", str(source), str(result)], check=True, capture_output=True)
        view = np.zeros((n, n), dtype=np.uint8)
        with rasterio.open(result) as src:
            data = src.read(1)
            for r in range(n):
                cy = y + RADIUS_M - (r + 0.5) * CELL_M
                rows, cols = rasterio.transform.rowcol(src.transform, [x - RADIUS_M + (c + 0.5) * CELL_M for c in range(n)], [cy] * n)
                rows, cols = np.asarray(rows), np.asarray(cols)
                ok = (rows >= 0) & (rows < src.height) & (cols >= 0) & (cols < src.width)
                view[r, ok] = (data[rows[ok], cols[ok]] == 255).astype(np.uint8)
        (out_dir / f"view_{index}.u8").write_bytes(view.tobytes())
        points.append({"label": label, "row": row, "col": col, "x_m": x, "y_m": y})
    (out_dir / "reference.json").write_text(json.dumps({
        "data_version": manifest["data_version"], "mast_height_m": mast, "antenna_height_m": antenna,
        "radius_m": RADIUS_M, "cell_m": CELL_M, "size": n, "points": points}, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
