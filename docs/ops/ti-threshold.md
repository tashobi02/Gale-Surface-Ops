# Thermal-inertia evidence for T04.07 (U-03)

| | |
| --- | --- |
| **Owner** | Obidit Islam |
| **Date** | 2026-11-09 (evidence); 2026-11-10 (U-03 decision) |
| **Status** | U-03 **decided 2026-11-10**: no defensible threshold; `ti_threshold.json` not written |
| **Related** | [T04.07](../tasks/TASK-04_vectors-pois-images.md#t0407--resolve-u-03-ti-loose-fines-threshold-from-the-aoi-histogram-and-literature) · [02 §C.2 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) · [01 A-05](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) · [THEMIS coverage](feasibility/coverage.md#themis-quantitative-thermal-inertia-l4-d4) · [C5 input layout](../../pipeline/sites/README.md#records) |

This note records the evidence for FR-10 and U-03, and the decision taken on it: **there is no defensible TI "loose fines" threshold for this AOI** (see [Decision](#decision)). `pipeline/sites/gale_boxwork/ti_threshold.json` is not written, so per [C5](../../pipeline/sites/README.md#records) T03.10 sets no `LOW_TI` bits. No threshold number is proposed, recommended or implied anywhere in this note.

## Method

### Inputs and provenance

All histogram values are **derived**, source id `usgs-themis-ti-30s120e`. The upstream product is the quantitative THEMIS mosaic, tile `THEMIS_TI_Mosaic_Quant_30S120E_100mpp`: [USGS product page](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp), [source cube](https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub). The local input and its external mask were supplied upstream; the command prints their SHA-256 fingerprints. Product identity follows the [existing DataSource record](../../pipeline/sites/gale_boxwork/sources/usgs-themis-ti-30s120e.json) and coverage note. The product page returned HTTP 403 during this task; its current metadata is **unverified here**, `TODO(verify)` on a future successful page access. The histogram itself uses only local files.

Local paths below are relative to the main checkout's git-ignored `/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work/`:

| Input | Role | Evidence |
| --- | --- | --- |
| `ti/themis_ti_aoi_pad1km.tif` and `.tif.msk` | Native source-CRS raster, 100 m pixels, 81 × 81 before selection | Rasterio metadata and fingerprints in the output below; quantitative cube URL above |
| `t03/dryrun3/site/grid/ti_100m.f32` | Clipped/reprojected TI, 60 × 60, little-endian float32 | `grid-ti` in `t03/dryrun3/site/site-manifest.json`; its recorded SHA-256 matches the file |
| `t03/dryrun3/site/site-manifest.json` | Dry-run projection, extent, dimensions and TI asset identity | Asserted against the worktree configuration; this is a sidecar grid, not a GeoTIFF |

The AOI is `extent_m = [-3000, -3000, 3000, 3000]` from [site.json](../../pipeline/sites/gale_boxwork/site.json). Contrary to the task prompt's location hint, `site.json` contains no projection field: [C5](../../pipeline/sites/README.md#sitejson) assigns it to [config.py](../../pipeline/src/marswalk_pipeline/config.py). The command imports `WORKING_PROJ` byte for byte and asserts that the dry-run manifest has that same string:

```text
+proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs
```

The Mars sphere radius and coordinate conventions come from [02 §C.1](../specs/02_Technical_Requirements_Document.md#c1-coordinate-reference-conventions-applies-to-every-layer). These are configured values, not fitted by this analysis. No Earth CRS or Earth-radius helper is used.

### Sampling and verification

- **Native centres:** transform each native pixel centre from the raster's own Mars CRS into the working projection; retain centres inside the AOI with lower bounds inclusive and upper bounds exclusive. This selects 60 rows and 61 columns. Values are neither interpolated nor weighted by the fraction of each boundary pixel inside the AOI. The source mask and finite-value check exclude unknowns; they never replace gaps with zero.
- **Dry-run grid:** use the manifest's full AOI-aligned grid. There is no intermediate TI GeoTIFF under `dryrun3`; the TI sidecar is present. A fresh bilinear reprojection of the supplied native raster reproduces this grid exactly, including its NaN pattern, as asserted by the command. Both distributions originate from the same source and are not independent observations.
- **Statistics:** NumPy percentiles use `method='linear'`, after conversion to float64. Values are printed to six decimal places for reproducibility, not as a claim of physical accuracy. The requested percentile ranks and 25 tiu bin width come from this task's instructions. Bins are multiples of that width, anchored by the observed minimum and maximum; they are descriptive bins, not classification boundaries. NumPy uses left-closed/right-open intervals except the final bin, which includes its upper edge.
- **Environment:** the interpreter is exactly the output of `make -s pipeline-python` in the main checkout. Python, NumPy, Rasterio and GDAL versions are printed below. The command runs locally with GDAL metadata sidecar writes disabled.

### Exact command

Run from this worktree. It reads the supplied rasters and configuration, performs assertions and prints the evidence; it makes no network requests. A local copy is cached as `pipeline/work/t0407/histogram.sh` in the main checkout. The command was re-run (`pipeline/work/t0407/histogram-rerun.txt`, byte-identical to the cached output).

```bash
cd /home/obidit/secondBrain/coding/wt-t04.07-ti-threshold
pipeline_python="$(make -s -C /home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge pipeline-python)"
GDAL_PAM_ENABLED=NO "$pipeline_python" - <<'PY'
from pathlib import Path
import hashlib, json, sys
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform, reproject, Resampling
sys.path.insert(0, str(Path('pipeline/src').resolve()))
from marswalk_pipeline.config import WORKING_PROJ
root = Path('/home/obidit/secondBrain/coding/CheesySpace-NasaSpaceAppChallenge/pipeline/work')
extent = json.loads(Path('pipeline/sites/gale_boxwork/site.json').read_text())['aoi']['extent_m']
xmin, ymin, xmax, ymax = extent
print('versions', sys.version.split()[0], 'numpy', np.__version__, 'rasterio', rasterio.__version__, 'GDAL', rasterio.__gdal_version__)
print('working_proj', WORKING_PROJ)
print('extent_m', extent)
source = root / 'ti/themis_ti_aoi_pad1km.tif'
with rasterio.open(source) as src:
    assert src.scales == (1.0,) and src.offsets == (0.0,)
    data = src.read(1, masked=True).astype('float64').filled(np.nan)
    rows, cols = np.indices(data.shape)
    xs, ys = rasterio.transform.xy(src.transform, rows.ravel(), cols.ravel())
    x, y = map(np.asarray, transform(src.crs, WORKING_PROJ, xs, ys))
    inside = ((x >= xmin) & (x < xmax) & (y >= ymin) & (y < ymax)).reshape(data.shape)
    print('source_shape', list(src.shape), 'resolution_m', list(src.res))
    print('selected_rows_cols', int(inside.any(axis=1).sum()), int(inside.any(axis=0).sum()))
    print('source_mask_sha256', hashlib.sha256(Path(str(source) + '.msk').read_bytes()).hexdigest())
    arrays = [('native-centres', source, data[inside])]
    run = root / 't03/dryrun3/site'
    manifest = json.loads((run / 'site-manifest.json').read_text())
    assert manifest['crs']['proj4'] == WORKING_PROJ and manifest['aoi']['extent_m'] == extent
    asset = next(a for a in manifest['assets'] if a['asset_id'] == 'grid-ti')
    path = run / asset['path']
    assert asset['format'] == 'f32' and asset['byte_order'] == 'little' and asset['nodata'] is None
    assert hashlib.sha256(path.read_bytes()).hexdigest() == asset['sha256']
    raw = np.fromfile(path, dtype='<f4').reshape(asset['height'], asset['width'])
    fresh = np.full_like(raw, np.nan)
    reproject(rasterio.band(src, 1), fresh, src_transform=src.transform, src_crs=src.crs,
              src_nodata=src.nodata, dst_transform=from_bounds(*extent, asset['width'], asset['height']),
              dst_crs=WORKING_PROJ, dst_nodata=np.nan, resampling=Resampling.bilinear)
    assert np.array_equal(fresh, raw, equal_nan=True)
    print('dryrun_shape', list(raw.shape), 'bilinear_reproduction_equal', True)
    arrays.append(('dryrun-grid', path, raw.astype('float64').ravel()))
for name, path, values in arrays:
    v = values[np.isfinite(values)]
    edges = np.arange(np.floor(v.min() / 25) * 25, (np.floor(v.max() / 25) + 2) * 25, 25)
    counts, _ = np.histogram(v, bins=edges)
    assert int(counts.sum()) == v.size
    print(name, path.relative_to(root), 'sha256', hashlib.sha256(path.read_bytes()).hexdigest())
    print('selected', values.size, 'valid', v.size, 'unknown', values.size - v.size)
    print('min_max', *[f'{q:.6f}' for q in (v.min(), v.max())])
    print('p5_p25_p50_p75_p95', *[f'{q:.6f}' for q in np.percentile(v, [5, 25, 50, 75, 95], method='linear')])
    print('bins_25_tiu', [[int(lo), int(hi), int(n)] for lo, hi, n in zip(edges[:-1], edges[1:], counts)])
PY
```

### Exact output

Cached as `pipeline/work/t0407/histogram-output.txt` in the main checkout. Every count, statistic, version, dimension and fingerprint here is copied from the command output.

```text
versions 3.12.16 numpy 2.5.4 rasterio 1.5.2 GDAL 3.13.3
working_proj +proj=eqc +lat_ts=-4.81 +lat_0=-4.81 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs
extent_m [-3000, -3000, 3000, 3000]
source_shape [81, 81] resolution_m [100.0, 100.0]
selected_rows_cols 60 61
source_mask_sha256 00ce42713e245dbd4442cbe00e00e17b9dc002c192fe34060d1d507520051127
dryrun_shape [60, 60] bilinear_reproduction_equal True
native-centres ti/themis_ti_aoi_pad1km.tif sha256 c697c4836903b3f87c79853055c4647c62287e3a54ae96e574d873e747d20ee2
selected 3660 valid 3660 unknown 0
min_max 255.660706 646.241211
p5_p25_p50_p75_p95 291.887817 336.533257 376.293381 409.387306 465.189546
bins_25_tiu [[250, 275, 47], [275, 300, 240], [300, 325, 380], [325, 350, 518], [350, 375, 619], [375, 400, 669], [400, 425, 624], [425, 450, 292], [450, 475, 150], [475, 500, 56], [500, 525, 28], [525, 550, 19], [550, 575, 8], [575, 600, 5], [600, 625, 3], [625, 650, 2]]
dryrun-grid t03/dryrun3/site/grid/ti_100m.f32 sha256 1395cb6b9c11604b139edde7077e2992d7f81a53a0cb3125adb57d3c8afc69af
selected 3600 valid 3600 unknown 0
min_max 259.028870 639.662109
p5_p25_p50_p75_p95 293.280327 337.510422 376.707535 408.370247 463.799794
bins_25_tiu [[250, 275, 29], [275, 300, 238], [300, 325, 387], [325, 350, 515], [350, 375, 592], [375, 400, 691], [400, 425, 626], [425, 450, 255], [450, 475, 156], [475, 500, 55], [500, 525, 24], [525, 550, 16], [550, 575, 8], [575, 600, 4], [600, 625, 3], [625, 650, 1]]
```

## Histogram

Both columns have provenance **derived**, source id `usgs-themis-ti-30s120e`, [quantitative cube](https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_30S120E_100mpp.cub). Values below are transcribed programmatically from the exact output above. Units follow 02 L4: tiu = J m⁻² K⁻¹ s⁻½; the source-label unit check remains open in [Limits](#limits).

| Statistic | Native centres | Dry-run grid |
| --- | --- | --- |
| Selected samples | 3660 | 3600 |
| Valid finite samples | 3660 | 3600 |
| Unknown / nonfinite samples | 0 | 0 |
| Minimum (tiu) | 255.660706 | 259.028870 |
| Maximum (tiu) | 646.241211 | 639.662109 |
| P5 (tiu) | 291.887817 | 293.280327 |
| P25 (tiu) | 336.533257 | 337.510422 |
| P50 (tiu) | 376.293381 | 376.707535 |
| P75 (tiu) | 409.387306 | 408.370247 |
| P95 (tiu) | 465.189546 | 463.799794 |

| Bin (tiu) | Native-centre count | Dry-run count |
| --- | --- | --- |
| [250, 275) | 47 | 29 |
| [275, 300) | 240 | 238 |
| [300, 325) | 380 | 387 |
| [325, 350) | 518 | 515 |
| [350, 375) | 619 | 592 |
| [375, 400) | 669 | 691 |
| [400, 425) | 624 | 626 |
| [425, 450) | 292 | 255 |
| [450, 475) | 150 | 156 |
| [475, 500) | 56 | 55 |
| [500, 525) | 28 | 24 |
| [525, 550) | 19 | 16 |
| [550, 575) | 8 | 8 |
| [575, 600) | 5 | 4 |
| [600, 625) | 3 | 3 |
| [625, 650] | 2 | 1 |

The native-centre and dry-run counts differ because their pixel grids are aligned differently. Bilinear reprojection also changes the value distribution. Neither histogram selects a threshold. The earlier coverage note's window statistics coincide closely with this native-centre selection; cite this note's figures instead, which are the reproducible output.

## Literature

The source ids below identify the interpretation evidence. Quotations are short excerpts; the adjacent discussion is a paraphrase. Access statements distinguish opened material from unverified full text.

Search-only excerpts were re-queried on 2026-11-09 using OpenAI `web.run` / `search_query`; the underlying search engine is not disclosed by the tool. Queries, result URLs and returned search text are recorded in the main checkout's `pipeline/work/t0407/literature-search-provenance.json` and the response files it names. These artifacts record the present re-check; the original search provenance was not recorded. Direct-access outcomes are recorded in `pipeline/work/t0407/literature-access.json`.

### `lit-fergason-2006` — THEMIS method and interpretation

R. L. Fergason, P. R. Christensen and H. H. Kieffer (2006), *High-resolution thermal inertia derived from the Thermal Emission Imaging System (THEMIS): Thermal model and applications*, JGR 111, E12004, [DOI: 10.1029/2006JE002735](https://doi.org/10.1029/2006JE002735). **Verified:** opened the [author-hosted PDF](https://www.mars.asu.edu/christensen/docs/Fergason_thermal_inertia_from_THEMIS_JGR_2004.pdf), saved with its extracted text as `pipeline/work/t0407/fergason-2006.pdf` and `fergason-2006.txt` in the main checkout; the filename's year differs from the article's own publication year above.

Section 1.2, paragraph [7], article page 2, right column, continuing from the foot of the left column (`fergason-2006.txt:86–87`; checked against the saved page image):

> Fine particles have a lower thermal inertia

Section 5.1, paragraph [48], article page 12, describes the low-TI Tharsis example as having a:

> surface layer of unconsolidated air-fall dust …

These statements support a qualitative association between fine unconsolidated cover and low TI. The ellipsis omits the dust-layer thickness qualifier in that Tharsis example.

Section 1.2, paragraph [6], article page 2, conditions effective particle-size inference on unconsolidated, homogeneous spheres (`fergason-2006.txt:140–142`). Section 1.2, paragraph [7], article page 2, right column, lists ambiguity from mixing particle sizes, duricrust, subsurface layering, sub-pixel-scale slopes, atmospheric dust and water-ice clouds (`fergason-2006.txt:91–94`). The Tharsis example is not a calibration for the Gale boxwork AOI. The Abstract on article page 1 reports the approximately 20 % overall accuracy used in 02 L4.

### `lit-presley-christensen-1997` — laboratory particle-size relation

M. A. Presley and P. R. Christensen (1997), *Thermal conductivity measurements of particulate materials 2. Results*, JGR 102(E3), pp. 6551–6566, [DOI: 10.1029/96JE03303](https://doi.org/10.1029/96JE03303). **Unverified:** the publisher [page](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/96JE03303) returned HTTP 403; the quote is from the indexed Abstract, not from an opened page. The indexed excerpt was reproduced in the recorded search re-check; the Abstract and full article body remain unverified against an opened article, `TODO(verify)`.

> The thermal conductivity increases with increasing particle size and atmospheric pressure.

This is laboratory support for the conductivity/particle-size mechanism discussed by Fergason et al.; it does not directly measure surface cohesion or suited walking conditions at this AOI.

### `lit-putzig-mellon-2007` — unconsolidated fines and heterogeneous surfaces

N. E. Putzig and M. T. Mellon (2007), *Apparent thermal inertia and the surface heterogeneity of Mars*, Icarus 191, pp. 68–94, [DOI: 10.1016/j.icarus.2007.05.013](https://doi.org/10.1016/j.icarus.2007.05.013). **Partial access:** the publisher-indexed [Introduction and Abstract preview](https://www.sciencedirect.com/science/article/pii/S001910350700231X) was retrievable in search output; direct page requests returned HTTP 403 and the full article was not opened. The excerpt and Abstract summary were reproduced in the recorded search re-check. The following Introduction excerpt is **unverified against an opened article**, `TODO(verify)`:

> surfaces of unconsolidated, fine-grained materials will have low values of thermal inertia

The indexed Abstract also explains that horizontal or vertical heterogeneity can make apparent TI vary with time of day and season. The full-text interpretation and precise printed page of the excerpt remain unverified; no claim is made from inaccessible sections.

### `lit-fergason-2012` — Gale-specific context

R. L. Fergason, P. R. Christensen, M. P. Golombek and T. J. Parker (2012), *Surface Properties of the Mars Science Laboratory Candidate Landing Sites: Characterization from Orbit and Predictions*, Space Science Reviews 170, pp. 739–773, [DOI: 10.1007/s11214-012-9891-3](https://doi.org/10.1007/s11214-012-9891-3). **Verified:** opened the publisher's [Abstract section](https://link.springer.com/article/10.1007/s11214-012-9891-3) and the [USGS abstract record](https://www.usgs.gov/publications/surface-properties-mars-science-laboratory-candidate-landing-sites-characterization). Full text requires access and was not opened (**unverified**).

The Abstract describes the majority of the Gale landing-site region as likely:

> an indurated surface mixed with unconsolidated materials

It relates differences in apparent TI to surface mantling and distinguishes layers in Gale's mound. This provides regional context for mixed materials, not a ground-truthed classification for the boxwork AOI. `TODO(verify)`: inspect the full paper's Gale section and its applicability to this AOI before relying on more specific claims. The quotation above is verified only at the Abstract level.

## Interpretive label

[02 §C.2 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) owns the intended caution wording: **“possible loose fines”**, labelled **interpretive**. [01 A-05](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) retains **Assumed interpretation** and limits the use to coarse caution. Those labels are not changed by the literature or histogram.

The TI retrieval and histogram carry provenance **derived**, source id `usgs-themis-ti-30s120e`; a material inference carries provenance **assumed**, with A-05 and the literature ids above as its interpretation references. The word `interpretive` is the C5 label for a threshold value, not an additional provenance class; under the [Decision](#decision) no threshold value exists, so no `LOW_TI` flag is set. A low value alone does not establish loose soil, cohesion, bearing strength or safe footing.

## Limits

- **Spatial support:** native 100 m pixels cannot resolve walking-scale patches. [02 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) states that a TI pixel covers 400 routing cells at 5 m. Resampling onto the routing grid adds no independent spatial information. These values are copied from that spec; the native pixel size is independently printed by Rasterio above.
- **Absolute accuracy:** approximately 20 %, from Fergason et al. (2006), Abstract, article page 1, and retained in 02 L4. The decimal formatting of the statistics is not the instrument/model accuracy. The histogram cannot establish a material boundary by itself.
- **Interpretation:** A-05 remains an **Assumed interpretation**. Fine cover, rock/fine mixtures, crusts, porosity, layering and atmospheric/model effects can affect apparent TI. The opened literature does not validate a boxwork walking-hazard threshold.
- **Grid treatment:** the dry-run sidecar is bilinear-derived, as reproduced above. [02 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) requires nearest resampling for flags. This note describes the existing grids; a future flag implementation must retain that distinction.
- **Units:** `TODO(verify)` the cube's unit against its ISIS label, as already recorded in the THEMIS coverage note and DataSource. Rasterio reports no band unit for the supplied GeoTIFF. The tiu notation here follows 02 L4 and the cited THEMIS method paper; no undocumented scale or offset correction was applied.
- **Unknowns:** no unknown samples occur in these AOI selections. That does not remove the mosaic's coverage/quality gaps elsewhere. Missing TI remains **unknown, never zero** (02 L4).
- **Dry-run provenance:** `t03/dryrun3/sources.lock.json` is an unfilled template. This note therefore verifies the sidecar by its manifest hash and exact reproduction from the supplied raster, not by asserting a completed acquisition lock.
- **Literature access:** Presley/Christensen (1997) and the Putzig/Mellon Introduction excerpt and Abstract summary remain indexed evidence only, unverified against opened articles; Fergason (2012) supports only the opened Abstract-level claims. Inaccessible bodies are unverified, not evidence for an AOI-specific numerical cutoff.

## Decision

**U-03 is decided: there is no defensible TI "loose fines" threshold for the Gale boxwork AOI.** Obidit Islam, the data lead, took this decision on **2026-11-10** in T04.07, on the evidence recorded in this note. The decision is that a threshold in tiu would not be defensible from that evidence; no threshold number is proposed, recommended or implied, and none may be inferred from the bin edges or the percentiles above.

The rationale is the evidence this note already records:

- **Spatial support.** The native product resolves 100 m pixels, and [02 L4](../specs/02_Technical_Requirements_Document.md#l4--thermal-inertia-fr-02-fr-10) states that a TI pixel covers 400 routing cells at 5 m. A walking hazard is a walking-scale question, so the source cannot separate walkable ground from a hazard at the scale the flag would be read at; resampling onto the routing grid adds no independent information (see [Limits](#limits)).
- **Absolute accuracy.** The approximately 20 % absolute accuracy of the THEMIS quantitative mosaic (Fergason et al. 2006, Abstract), as 02 L4 retains, is not a margin a single cut can respect: a cut placed at any one value would be read as exact.
- **The literature does not validate a threshold for this AOI.** The opened sources support a *qualitative* association between fine unconsolidated cover and low TI (Fergason et al. 2006 §1.2 and §5.1, the only source opened in full), and the mechanism behind it (Presley & Christensen 1997). They do not supply an AOI-specific cut, and the note records that Fergason et al.'s Tharsis example is explicitly not a calibration for the Gale boxwork AOI. Three of the four sources are indexed or Abstract-level only (Presley & Christensen 1997, Putzig & Mellon 2007, Fergason 2012); only Fergason 2006 was opened in full. Fergason et al. (2012) gives Gale-region context at Abstract level — an indurated surface mixed with unconsolidated materials — not a ground-truthed classification for this AOI.
- **The inference is confounded.** Fine cover, rock/fine mixtures, crusts, porosity, layering and atmospheric/model effects all change apparent TI ([Limits](#limits), [Literature](#literature)). A single cut would attribute to one of them what the measurement cannot separate.
- **The histogram selects nothing.** The two distributions in [Histogram](#histogram) describe the AOI; they contain no natural break, and the choice of bin width or percentile rank is presentational. Nothing in the recorded method would distinguish a defensible cut from an arbitrary one.

Consequences:

- `pipeline/sites/gale_boxwork/ti_threshold.json` is **not written**. Per [C5](../../pipeline/sites/README.md#records), an absent file means T03.10 sets no `LOW_TI` bits, so the routing grid carries no `LOW_TI` bit and the 1.3 `LOW_TI` cost multiplier and any `LOW_TI` warning stay dormant.
- **[01 A-05](../specs/01_Product_Requirements_Document.md#f2-key-assumptions) stays an Assumed interpretation.** 02 L4's cautious wording and its `interpretive` label are unchanged, and TI gaps stay *unknown*, never zero. TI remains available as a derived layer with its own provenance and limits; only the hazard flag is not set.
- The threshold's home in [02 Unresolved](../specs/02_Technical_Requirements_Document.md#unresolved-decisions-owned-by-this-document) (the U-03 row) is **not edited here**: `docs/specs/**` is unchanged, and the spec-sync note for the T16.02 owner is in the [T04.07 task file](../tasks/TASK-04_vectors-pois-images.md#t0407--resolve-u-03-ti-loose-fines-threshold-from-the-aoi-histogram-and-literature).

**Method choices, proposed and not separately reviewed (evidence presentation only):** the native-centre selection is retained as the unsmoothed source distribution and the existing bilinear dry-run grid is shown separately; the requested descriptive bin width and percentile ranks are used; A-05 and the interpretive wording are preserved. These choices concern evidence presentation only and do not bear on the decision above.
