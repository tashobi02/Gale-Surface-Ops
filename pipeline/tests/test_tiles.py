"""Display encoding and JPEG coverage of synthetic rasters."""
import json

import numpy as np
import pytest

rasterio = pytest.importorskip('rasterio')
from rasterio.transform import from_origin
from marswalk_pipeline.tiles import render_tiles


def test_float_hillshade_encodes_valid_black_and_nodata(tmp_path):
    raster = tmp_path / 'shade.tif'
    values = np.array([[0., 0.5], [1., np.nan]], dtype='float32')
    with rasterio.open(raster, 'w', driver='GTiff', width=2, height=2, count=1,
                       dtype='float32', transform=from_origin(0, 2, 1, 1), nodata=np.nan) as dst:
        dst.write(values, 1)
    render_tiles(raster, 'hillshade', (0, 2), [1], 2, 'png', tmp_path, hillshade=True)
    with rasterio.open(tmp_path / 'tiles/hillshade/0/0/0.png') as tile:
        pixels = tile.read()
    np.testing.assert_array_equal(pixels[0], [[1, 128], [255, 0]])
    np.testing.assert_array_equal(pixels[1], [[255, 255], [255, 0]])


def test_hillshade_boundless_padding_is_transparent(tmp_path, monkeypatch):
    raster = tmp_path / 'shade.tif'
    with rasterio.open(raster, 'w', driver='GTiff', width=2, height=2, count=1,
                       dtype='float32', transform=from_origin(0, 2, 1, 1), nodata=np.nan) as dst:
        dst.write(np.full((2, 2), .5, dtype='float32'), 1)
    real_open = rasterio.open
    class UnmaskedPadding:
        def __init__(self, dataset):
            self.dataset = dataset
        def __enter__(self):
            return self
        def __exit__(self, *args):
            self.dataset.close()
        def __getattr__(self, name):
            return getattr(self.dataset, name)
        def read(self, *args, **kwargs):
            values = self.dataset.read(*args, **kwargs)
            return np.ma.array(values.filled(0), mask=False)
    monkeypatch.setattr(rasterio, 'open', lambda path, *args, **kwargs: UnmaskedPadding(real_open(path, *args, **kwargs)) if path == raster else real_open(path, *args, **kwargs))
    render_tiles(raster, 'hillshade', (0, 2), [1], 4, 'png', tmp_path, hillshade=True)
    with rasterio.open(tmp_path / 'tiles/hillshade/0/0/0.png') as tile:
        pixels = tile.read()
    np.testing.assert_array_equal(pixels[1], [[255, 255, 0, 0], [255, 255, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    assert np.all(pixels[0, 2:, :] == 0)


def _run_jpeg_tiles(tmp_path, monkeypatch, *, extent, missing=None, missing_kind='alpha', black=False, tile_size=4):
    """Run the real tiles step on an 8 x 8 synthetic RGB raster."""
    from marswalk_pipeline import __main__ as runner
    from rasterio.enums import ColorInterp

    site = tmp_path / 'site'
    (site / 'layers').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': extent}}))
    (site / 'layers/ortho.json').write_text(json.dumps({'tile_grid': {
        'origin_m': [0, 8], 'resolutions_m': [2], 'tile_size_px': tile_size, 'format': 'jpg',
    }}))
    scratch = tmp_path / 'work/runs/gale_boxwork'
    scratch.mkdir(parents=True)
    rgb = np.full((3, 8, 8), 0 if black else 100, dtype='uint8')
    alpha = np.full((8, 8), 255, dtype='uint8')
    if missing is not None:
        if missing_kind == 'nodata':
            rgb[:, missing[0], missing[1]] = 0
        else:
            alpha[missing] = 0
    count = 4 if missing_kind == 'alpha' else 3
    with rasterio.open(scratch / 'ortho.tif', 'w', driver='GTiff', width=8, height=8, count=count,
                       dtype='uint8', transform=from_origin(0, 8, 1, 1),
                       nodata=0 if missing_kind == 'nodata' else None) as dst:
        dst.write(rgb, indexes=[1, 2, 3])
        if missing_kind == 'alpha':
            dst.write(alpha, 4)
            dst.colorinterp = (ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha)
        elif missing_kind == 'mask':
            dst.write_mask(alpha)

    deferred = {'hillshade', 'slope', 'elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab'}
    monkeypatch.setattr(runner, '_unstyled_layers', lambda _: {name: 'test' for name in deferred})
    monkeypatch.setattr(runner, '_skipped_layers', lambda _: deferred)
    runner._run_step('tiles', tmp_path, site, tmp_path / 'work', tmp_path / 'out', skip_unstyled_optional=True)
    return tmp_path / 'out/tiles/ortho/0/0/0.jpg'


@pytest.mark.parametrize('missing_kind', ['alpha', 'mask', 'nodata'])
def test_jpeg_rejects_source_hole_inside_aoi_even_if_downsampled(tmp_path, monkeypatch, missing_kind):
    # The hole is smaller than an output pixel; tile-only checks can miss it.
    with pytest.raises(ValueError, match=r'(?i)ortho.*jpeg.*(invalid|no.data).*aoi'):
        _run_jpeg_tiles(tmp_path, monkeypatch, extent=[0, 0, 8, 8], missing=(1, 1), missing_kind=missing_kind)


def test_jpeg_allows_source_hole_outside_aoi(tmp_path, monkeypatch):
    # The invalid pixel touches the AOI at a corner, but lies outside it.
    tile = _run_jpeg_tiles(tmp_path, monkeypatch, extent=[2, 2, 6, 6], missing=(1, 1))
    assert tile.is_file()


def test_jpeg_allows_tile_padding_outside_aoi(tmp_path, monkeypatch):
    tile = _run_jpeg_tiles(tmp_path, monkeypatch, extent=[0, 0, 8, 8], tile_size=8)
    assert tile.is_file()


def test_jpeg_keeps_valid_black_inside_aoi(tmp_path, monkeypatch):
    tile = _run_jpeg_tiles(tmp_path, monkeypatch, extent=[0, 0, 8, 8], black=True)
    with rasterio.open(tile) as result:
        assert not result.read().any()


def test_jpeg_rejects_source_extent_that_does_not_cover_aoi(tmp_path, monkeypatch):
    with pytest.raises(ValueError, match=r'(?i)ortho.*jpeg.*(invalid|no.data).*aoi'):
        _run_jpeg_tiles(tmp_path, monkeypatch, extent=[0, 0, 9, 8])


def test_jpeg_requires_aoi_extent(tmp_path):
    with pytest.raises(ValueError, match=r'JPEG.*aoi\.extent_m'):
        render_tiles(tmp_path / 'unused.tif', 'ortho', (0, 8), [2], 4, 'jpg', tmp_path)
