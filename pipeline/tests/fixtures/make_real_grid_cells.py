"""F5 (T03.21, BD-54): ten real routing-grid cells, read back from the bundle arrays.

The cells are chosen by a seeded rule and nothing is typed: `numpy.random.default_rng(SEED)` draws
`COUNT` distinct cells, without replacement, from the cells that have both a finite elevation and a
slope p90 other than no-data (255). SEED is the scenario seed (05 §F, 4190). Each cell is then read
from `grid/elevation.f32` and `grid/slope_p90.u8` (the arrays the app shows, so the comparison is
exact), addressed as in 05 §E.1: x = origin_x + (col + 0.5) * cell_m, y = origin_y - (row + 0.5) * cell_m.

The slope in `slope_p90_deg` is the u8 code divided by 4, so it is quantised to 0.25 degrees (at most
0.125 degrees from the float raster); see pipeline/tests/fixtures/README.md.

Run (twice gives identical bytes):
    $(make -s pipeline-python) pipeline/tests/fixtures/make_real_grid_cells.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "data/sites/gale_boxwork"
OUT = Path(__file__).resolve().parent / "real-grid-cells.json"
SEED = 4190
COUNT = 10
RULE = ("numpy.random.default_rng(seed).choice over the row-major indices of the cells with a finite "
        "elevation and a slope p90 code below 255, COUNT cells without replacement, sorted by (row, col)")


def choose_cells(valid: np.ndarray, seed: int = SEED, count: int = COUNT) -> list[tuple[int, int]]:
    """(row, col) of `count` distinct valid cells, drawn by the seeded rule and sorted."""
    flat = np.flatnonzero(valid.ravel())
    if flat.size < count:
        raise ValueError(f"only {flat.size} valid cells, need {count}")
    picked = np.random.default_rng(seed).choice(flat, size=count, replace=False)
    return sorted((int(i) // valid.shape[1], int(i) % valid.shape[1]) for i in picked)


def build(site: Path = SITE) -> dict:
    manifest = json.loads((site / "site-manifest.json").read_text(encoding="utf-8"))
    grid = manifest["grid"]
    width, height, cell = grid["width"], grid["height"], grid["cell_m"]
    elevation = np.fromfile(site / "grid/elevation.f32", dtype="<f4").reshape(height, width)
    slope = np.fromfile(site / "grid/slope_p90.u8", dtype=np.uint8).reshape(height, width)
    cells = choose_cells(np.isfinite(elevation) & (slope != 255))
    ox, oy = grid["origin_m"]
    return {
        "fixture": "F5",
        "data_version": manifest["data_version"],
        "seed": SEED,
        "rule": RULE.replace("COUNT", str(COUNT)),
        "source": {"elevation": "grid/elevation.f32 (float32, little-endian)", "slope_p90": "grid/slope_p90.u8 (degrees x 4; 255 = no data)"},
        "grid": {"width": width, "height": height, "cell_m": cell, "origin_m": [ox, oy], "row_order": grid["row_order"]},
        "cells": [{
            "row": row, "col": col,
            "x_m": ox + (col + 0.5) * cell, "y_m": oy - (row + 0.5) * cell,
            "elevation_m": float(elevation[row, col]),
            "slope_p90_u8": int(slope[row, col]),
            "slope_p90_deg": int(slope[row, col]) / 4,
        } for row, col in cells],
    }


def main() -> None:
    OUT.write_text(json.dumps(build(), indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
