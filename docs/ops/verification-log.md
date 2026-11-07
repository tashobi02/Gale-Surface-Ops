# Verification log

| | |
| --- | --- |
| **Owner** | Shared, append-only. Each section names the subtask and the person who ran it |
| **Date** | 2026-11-06 (first section) |
| **Status** | Open: sections are added as verify subtasks finish. Add new sections at the end and keep existing ones on rebase |
| **Related** | [Docs index](../README.md) · [Feasibility check](feasibility.md) · [Coverage](feasibility/coverage.md) · [Task coordination](../tasks/_coordination.md) |

Each section records what was run, the result, and what it hands on. Detailed notes live in the file a section links to.

## T01.04 — THEMIS TI, colour HiRISE COG and CRISM coverage of the AOI

| | |
| --- | --- |
| **Owner** | Obidit Islam (R1 Data & GIS), run by Claude Code on the data lead's instruction |
| **Date** | 2026-11-06 |
| **Status** | Done: each of the three products has a result. Full note: [coverage.md](feasibility/coverage.md) |
| **Inputs** | [aoi.md](feasibility/aoi.md): working projection and `extent_m` `[-3000, -3000, 3000, 3000]`, byte for byte; GDAL 3.13.3 from the `marswalk-pipeline` environment |

| Product | Result | Evidence |
| --- | --- | --- |
| Colour HiRISE LRGB COG, `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`, 0.25 m/px | **Covered**, 100 % valid | `gdalinfo -stats` on the AOI window: `STATISTICS_VALID_PERCENT=100` on all bands including the alpha mask |
| THEMIS quantitative TI, tile id `THEMIS_TI_Mosaic_Quant_30S120E_100mpp`, 100 m/px | **Covered**, 100 % valid, no gaps in the AOI window | `gdalinfo -stats`: `STATISTICS_VALID_PERCENT=100`, 61 × 61 px, values 255.661 to 646.241 |
| CRISM MTRDR, volume MROCR_4001, 7 observations | **Covered, patchwork**: best single observation `FRT0000B6F1` 97.12 % valid; worst 8.996 % | Footprint index (62,418 records, 35 box matches, 7 observations), then `gdalinfo -stats` on each summary-parameter window |

- URLs, versions (`Last-Modified`, `ETag`), CRS, resolution, observation ids and every command with its output are in [coverage.md](feasibility/coverage.md).
- Window reads only; no product was downloaded in full. Extracts are local, git-ignored scratch (path in coverage.md), not in `pipeline/work/`, and nothing was committed.
- Every coordinate passed to GDAL was in the Mars working projection; no EPSG:4326 or EPSG:3857 argument was used.
- `TODO(verify)`: TI cube unit string; meaning of 136,454 all-zero RGB pixels in the HiRISE window; meaning of the CRISM corner columns against the min/max columns. `TODO(decision)`: whether CRISM (FR-18) stays, and which observation (T01.05, T18.01).
- Disagreements with the specs: the grayscale orthophoto file is 50,404,480,837 bytes, not 23 GB; the CRISM data and index are on the PDS Geosciences Node, not under the `pds.nasa.gov` release folder named in 02 Sources.
- Hands on to: T01.05; T03.07 and T03.19 (product URLs, tile id); T03.26 and T03.27 (fallback triggers, none triggered for L1 or L4); T18.01 (CRISM trigger).
- Not run: `make lint` and `make docs-check`, because `node_modules` is absent in this worktree. `python3 scripts/check_links.py` was run on its own (result in the subtask report).

## T13.04 — Base styles: typography defaults, focus ring, reduced motion

| | |
| --- | --- |
| **Owner** | Ridita Alam (R5 EVA & Ops UI · design system) |
| **Date** | 2026-11-08 |
| **Status** | Done: base styles verified offline; zero external network requests |
| **Inputs** | [04 §C.1, §C.2, §C.3, §E](../specs/04_Design_Brief.md); [base.css](../../apps/web/src/ui/styles/base.css); self-hosted fonts in `apps/web/public/fonts/` (T13.02) |

| Feature | Result | Evidence |
| --- | --- | --- |
| Fonts offline (NFR-01, NFR-07) | **Verified offline**, zero external requests | `@font-face` rules in `base.css` reference `/fonts/...`; Vite production build (`base: "./"`) rebases to `../fonts/...`; bundle passes offline verification |
| Typography defaults (04 §C.2) | **Verified** against 04 §C.2 specs | Body 14 px / 400 Inter (line-height 1.45), panel headings 16 px / 600, screen titles 20 px / 600, microcopy 12 px mono, no text renders below 12 px |
| Focus ring (04 §E, 04 P10) | **Verified** | 2 px white outline with 2 px offset and box-shadow gap on `:focus-visible`, never removed |
| Reduced motion (04 §E Motion) | **Verified** | `@media (prefers-reduced-motion: reduce)` zeroes animation and transition durations and forces `scroll-behavior: auto` |
| Target sizes (04 §C.3) | **Verified** | Minimum mouse ≥ 32 px, touch ≥ 44 px via `@media (pointer: coarse)`, EVA ≥ 56 px with `[data-surface="eva"]` / `.eva-target` |

- Hands on to: T13.09 (axe scan), T13.10 (keyboard-only run).
