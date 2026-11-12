# Pipeline test fixtures

## F5 — real routing-grid cells (T03.21, BD-54)

`real-grid-cells.json` holds 10 cells of the real `gale_boxwork` routing grid, read back from the
bundle arrays, for the point-inspection check of FR-03.

- **Source.** `grid/elevation.f32` and `grid/slope_p90.u8` of `data/sites/gale_boxwork/`, read with
  NumPy (the routing-grid arrays the app shows), addressed as in 05 §E.1 (row 0 = north,
  `x = origin_x + (col + 0.5) * cell_m`, `y = origin_y - (row + 0.5) * cell_m`).
- **Selection.** `numpy.random.default_rng(4190).choice` over the cells that have a finite elevation
  and a slope p90 code below 255, 10 cells without replacement, sorted by (row, col). 4190 is the
  scenario seed (05 §F). No cell is hand-picked.
- **Quantisation.** The slope is stored as `degrees x 4` (0.25 degree steps, 05 RoutingGrid), so
  `slope_p90_deg` is exact for the code but differs from the float raster by at most 0.125 degrees.
  FR-03 compares the displayed value, which is the code, so the comparison is exact (BD-54).
- **Regenerate** (two runs give identical bytes; the bundle's arrays must be linked in):
  `$(make -s pipeline-python) pipeline/tests/fixtures/make_real_grid_cells.py`. A new data version
  needs a regeneration.
