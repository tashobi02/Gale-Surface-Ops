"""T03.30 / T03.35: compare a candidate's `comm_hab` grid with `gdal_viewshed` at five points and over the grid.

The method is the one of the T03.30 section of docs/ops/verification-log.md: the bundle's 5 m elevation
array is written once as a GeoTIFF, so both tools read identical heights; `gdal_viewshed` runs from the
candidate's mast with the ParamSet mast and suit-antenna heights, `-cc 1.0` (the sphere's curvature, which
GDAL reproduces for this CRS without a correction factor) and visible = 255. The five points are the AOI
centre and the centres of the four quadrants of the AOI, each snapped to the 5 m cell that contains it.

    $(make -s pipeline-python) pipeline/tests/fixtures/check_viewshed.py [candidate_id ...]
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/src"))

from marswalk_pipeline import config  # noqa: E402
from marswalk_pipeline.comm_grid import read_comm_heights  # noqa: E402
from marswalk_pipeline.manifest import candidate_file_name  # noqa: E402

SITE = ROOT / "data/sites/gale_boxwork"


def gdal_viewshed_binary() -> str | None:
    """`gdal_viewshed` from the pipeline environment's folder, else the PATH."""
    beside = Path(sys.executable).parent / "gdal_viewshed"
    return str(beside) if beside.exists() else shutil.which("gdal_viewshed")


def five_points(grid: dict) -> list[tuple[str, int, int]]:
    """(label, row, col): AOI centre and the four quadrant centres, snapped to cells (row 0 = north)."""
    width, height = grid["width"], grid["height"]
    return [("AOI centre", height // 2, width // 2), ("NE quadrant", height // 4, 3 * width // 4),
            ("NW quadrant", height // 4, width // 4), ("SE quadrant", 3 * height // 4, 3 * width // 4),
            ("SW quadrant", 3 * height // 4, width // 4)]


def compare(candidate_id: str, scratch: Path, site: Path = SITE) -> dict:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_origin

    manifest = json.loads((site / "site-manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    candidate = next(c for c in manifest["hab_candidates"] if c["candidate_id"] == candidate_id)
    width, height, cell = grid["width"], grid["height"], grid["cell_m"]
    ox, oy = grid["origin_m"]
    mast = candidate["hab_mast"]
    antenna = read_comm_heights()[1]
    elevation = np.fromfile(site / "grid/elevation.f32", dtype="<f4").reshape(height, width)
    comm = np.fromfile(site / "grid" / candidate_file_name(candidate), dtype=np.uint8).reshape(height, width)

    scratch.mkdir(parents=True, exist_ok=True)
    source, result = scratch / "elevation_5m.tif", scratch / f"gdal_viewshed_{candidate_id}.tif"
    with rasterio.open(source, "w", driver="GTiff", width=width, height=height, count=1, dtype="float32",
                       crs=CRS.from_proj4(manifest["crs"]["proj4"]), transform=from_origin(ox, oy, cell, cell)) as dst:
        dst.write(elevation, 1)
    binary = gdal_viewshed_binary()
    subprocess.run([binary, "-ox", str(mast["x_m"]), "-oy", str(mast["y_m"]), "-oz", str(mast["height_m"]), "-tz", str(antenna),
                    "-cc", "1.0", "-vv", "255", "-iv", "0", "-ov", "0", "-a_nodata", "254", "--quiet", str(source), str(result)],
                   check=True, capture_output=True)
    with rasterio.open(result) as src:
        gdal = src.read(1)

    mast_cell = (int((oy - mast["y_m"]) // cell), int((mast["x_m"] - ox) // cell))
    points = []
    for label, row, col in five_points(grid):
        if (row, col) == mast_cell:
            row, col = row, col + 1
        points.append({"label": label, "row": row, "col": col, "x_m": ox + (col + .5) * cell, "y_m": oy - (row + .5) * cell,
                       "comm_hab": int(comm[row, col]), "gdal_viewshed": int(gdal[row, col]),
                       "match": bool((comm[row, col] == 1) == (gdal[row, col] == 255))})
    valid = comm != 255
    agree = ((comm == 1) == (gdal == 255))[valid]
    return {"candidate_id": candidate_id, "mast": mast, "antenna_m": antenna, "points": points,
            "agreement_pct": float(agree.mean() * 100), "comm_visible_pct": float((comm == 1)[valid].mean() * 100),
            "gdal_visible_pct": float((gdal == 255)[valid].mean() * 100)}


def main(argv: list[str]) -> int:
    manifest = json.loads((SITE / "site-manifest.json").read_text(encoding="utf-8"))
    ids = argv or [c["candidate_id"] for c in manifest["hab_candidates"]]
    with tempfile.TemporaryDirectory() as tmp:
        for candidate_id in ids:
            report = compare(candidate_id, Path(tmp))
            print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
