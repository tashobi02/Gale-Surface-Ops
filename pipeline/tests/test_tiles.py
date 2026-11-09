"""Display encoding of synthetic hillshade rasters."""
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
