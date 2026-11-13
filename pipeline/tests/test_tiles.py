"""Display encoding and JPEG coverage of synthetic rasters."""
import json

import numpy as np
import pytest

rasterio = pytest.importorskip('rasterio')
from rasterio.transform import from_origin
from marswalk_pipeline import config
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


def _write_rgb(path, *, size=16, value=100, hole=None, kind='alpha', origin=(0, 16), cell=1.0, black=False):
    """Synthetic RGB raster; `hole` is a (row slice, col slice) of source-invalid pixels."""
    from rasterio.enums import ColorInterp

    rgb = np.full((3, size, size), 0 if black else value, dtype='uint8')
    alpha = np.full((size, size), 255, dtype='uint8')
    if hole is not None:
        alpha[hole] = 0
        if kind == 'nodata':
            rgb[:, hole[0], hole[1]] = 0
    count = 4 if kind == 'alpha' else 3
    with rasterio.open(path, 'w', driver='GTiff', width=size, height=size, count=count, dtype='uint8',
                       transform=from_origin(origin[0], origin[1], cell, cell),
                       nodata=0 if kind == 'nodata' else None) as dst:
        dst.write(rgb, indexes=[1, 2, 3])
        if kind == 'alpha':
            dst.write(alpha, 4)
            dst.colorinterp = (ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha)
        elif kind == 'mask':
            dst.write_mask(alpha)


def _jpeg_pixels(tmp_path, *, aoi, size=16, tile_px=16, **kwargs):
    raster = tmp_path / 'ortho.tif'
    _write_rgb(raster, size=size, **kwargs)
    render_tiles(raster, 'ortho', (0, size), [size / tile_px], tile_px, 'jpg', tmp_path, aoi_extent_m=aoi)
    with rasterio.open(tmp_path / 'tiles/ortho/0/0/0.jpg') as tile:
        return tile.read()


def _is_background(pixel, tolerance=8):
    from marswalk_pipeline import config
    return all(abs(int(value) - background) <= tolerance for value, background in zip(pixel, config.MAP_BACKGROUND_RGB))


@pytest.mark.parametrize('kind', ['alpha', 'mask', 'nodata'])
def test_bd18_ortho_outside_source_mask_is_map_background(tmp_path, kind):
    """BD-18: a source hole inside the AOI is written as the 04 map background colour, never refused."""
    pixels = _jpeg_pixels(tmp_path, aoi=[0, 0, 16, 16], hole=(slice(0, 8), slice(0, 8)), kind=kind)
    assert _is_background(pixels[:, 3, 3])
    assert not _is_background(pixels[:, 12, 12])
    assert abs(int(pixels[0, 12, 12]) - 100) <= 8


def test_bd18_ortho_outside_aoi_is_map_background(tmp_path):
    """BD-18: tiles are clipped to aoi.extent_m, so valid source pixels outside it are background."""
    pixels = _jpeg_pixels(tmp_path, aoi=[4, 4, 12, 12])
    assert _is_background(pixels[:, 1, 1])
    assert _is_background(pixels[:, 14, 14])
    assert abs(int(pixels[0, 8, 8]) - 100) <= 8


def test_bd18_source_that_does_not_cover_the_aoi_is_background_there(tmp_path):
    raster = tmp_path / 'ortho.tif'
    _write_rgb(raster, size=8, origin=(0, 8))
    render_tiles(raster, 'ortho', (0, 16), [1], 16, 'jpg', tmp_path, aoi_extent_m=[0, 0, 16, 16])
    with rasterio.open(tmp_path / 'tiles/ortho/0/0/0.jpg') as tile:
        pixels = tile.read()
    assert _is_background(pixels[:, 2, 2])   # row 2 is y 14: no source there
    assert abs(int(pixels[0, 12, 4]) - 100) <= 8


def test_bd18_valid_black_pixels_are_displayed_as_they_are(tmp_path):
    pixels = _jpeg_pixels(tmp_path, aoi=[0, 0, 16, 16], black=True)
    assert pixels[:, 8, 8].max() <= 4
    assert not _is_background(pixels[:, 8, 8], tolerance=2)


def test_jpeg_requires_aoi_extent(tmp_path):
    with pytest.raises(ValueError, match=r'JPEG.*aoi\.extent_m'):
        render_tiles(tmp_path / 'unused.tif', 'ortho', (0, 8), [2], 4, 'jpg', tmp_path)


def test_bd17_ramp_colours_clamp_and_unknown_is_transparent(tmp_path):
    from marswalk_pipeline import config
    raster = tmp_path / 'elevation.tif'
    values = np.array([[-5., 0.], [10., np.nan], ], dtype='float32')
    with rasterio.open(raster, 'w', driver='GTiff', width=2, height=2, count=1, dtype='float32',
                       transform=from_origin(0, 2, 1, 1), nodata=np.nan) as dst:
        dst.write(values, 1)
    render_tiles(raster, 'elevation', (0, 2), [1], 2, 'png', tmp_path, ramp=(0.0, 10.0))
    with rasterio.open(tmp_path / 'tiles/elevation/0/0/0.png') as tile:
        pixels = tile.read()
    assert pixels.shape[0] == 4
    assert tuple(pixels[:3, 0, 0]) == tuple(config.DATA_RAMP_RGB[0])      # below p2: first colour
    assert tuple(pixels[:3, 0, 1]) == tuple(config.DATA_RAMP_RGB[0])      # at p2
    assert tuple(pixels[:3, 1, 0]) == tuple(config.DATA_RAMP_RGB[-1])     # at p98
    assert pixels[3, 1, 1] == 0 and pixels[3, 0, 0] == 255                # unknown is transparent


def test_bd17_ramp_midpoint_is_the_middle_colour(tmp_path):
    from marswalk_pipeline import config
    raster = tmp_path / 'ti.tif'
    with rasterio.open(raster, 'w', driver='GTiff', width=1, height=1, count=1, dtype='float32',
                       transform=from_origin(0, 1, 1, 1), nodata=np.nan) as dst:
        dst.write(np.array([[5.]], dtype='float32'), 1)
    render_tiles(raster, 'ti', (0, 1), [1], 1, 'png', tmp_path, ramp=(0.0, 10.0))
    with rasterio.open(tmp_path / 'tiles/ti/0/0/0.png') as tile:
        pixels = tile.read()
    assert tuple(pixels[:3, 0, 0]) == tuple(config.DATA_RAMP_RGB[len(config.DATA_RAMP_RGB) // 2])


def test_categorical_tiles_resample_by_nearest(tmp_path):
    raster = tmp_path / 'flags.tif'
    with rasterio.open(raster, 'w', driver='GTiff', width=2, height=2, count=1, dtype='uint8',
                       transform=from_origin(0, 10, 5, 5), nodata=0) as dst:
        dst.write(np.array([[10, 250], [10, 250]], dtype='uint8'), 1)
    render_tiles(raster, 'comm_hab', (0, 10), [1.25], 8, 'png', tmp_path, categorical=True)
    with rasterio.open(tmp_path / 'tiles/comm_hab/0/0/0.png') as tile:
        pixels = tile.read(1)
    assert set(np.unique(pixels)) == {10, 250}


def test_c9_addressing_x_east_y_south_and_index(tmp_path):
    """C9: tile (z, x, y) covers x in [ox + x*span, ...] and y in [oy - (y+1)*span, oy - y*span]; index.json lists path, bytes, sha256."""
    import hashlib
    size = 8
    values = np.zeros((size, size), dtype='uint8')
    values[:4, :4] = 10      # north-west
    values[:4, 4:] = 20      # north-east
    values[4:, :4] = 30      # south-west
    values[4:, 4:] = 40      # south-east
    raster = tmp_path / 'grey.tif'
    with rasterio.open(raster, 'w', driver='GTiff', width=size, height=size, count=1, dtype='uint8',
                       transform=from_origin(100, 508, 1, 1)) as dst:
        dst.write(values, 1)
    render_tiles(raster, 'ortho_grey', (100, 508), [1], 4, 'png', tmp_path)
    root = tmp_path / 'tiles/ortho_grey'
    expected = {(0, 0): 10, (1, 0): 20, (0, 1): 30, (1, 1): 40}  # (x, y) -> value
    for (x, y), value in expected.items():
        with rasterio.open(root / f'0/{x}/{y}.png') as tile:
            assert set(np.unique(tile.read(1))) == {value}, (x, y)
    index = json.loads((root / 'index.json').read_text())
    assert list(index) == ['tiles']
    assert [entry['path'] for entry in index['tiles']] == sorted(entry['path'] for entry in index['tiles'])
    assert len(index['tiles']) == 4
    for entry in index['tiles']:
        assert set(entry) == {'path', 'bytes', 'sha256'}
        payload = (root / entry['path']).read_bytes()
        assert entry['bytes'] == len(payload)
        assert entry['sha256'] == hashlib.sha256(payload).hexdigest()


def test_bd22_png_writes_do_not_warn_about_georeferencing(tmp_path):
    import warnings
    from rasterio.errors import NotGeoreferencedWarning
    raster = tmp_path / 'shade.tif'
    with rasterio.open(raster, 'w', driver='GTiff', width=2, height=2, count=1, dtype='float32',
                       transform=from_origin(0, 2, 1, 1), nodata=np.nan) as dst:
        dst.write(np.full((2, 2), .5, dtype='float32'), 1)
    with warnings.catch_warnings():
        warnings.simplefilter('error', NotGeoreferencedWarning)
        render_tiles(raster, 'hillshade', (0, 2), [1], 2, 'png', tmp_path, hillshade=True)


def _flat_raster(path):
    with rasterio.open(path, 'w', driver='GTiff', width=2, height=2, count=1, dtype='uint8',
                       transform=from_origin(0, 2, 1, 1)) as dst:
        dst.write(np.full((2, 2), 9, dtype='uint8'), 1)


def test_bd12_tiles_folder_may_be_a_link_to_the_data_ssd(tmp_path):
    """BD-12: data/sites/<site>/tiles is a link to the SSD; tiles are written through it."""
    raster = tmp_path / 'grey.tif'
    _flat_raster(raster)
    ssd = tmp_path / 'ssd-tiles'
    ssd.mkdir()
    bundle = tmp_path / 'bundle'
    bundle.mkdir()
    (bundle / 'tiles').symlink_to(ssd, target_is_directory=True)
    render_tiles(raster, 'ortho_grey', (0, 2), [1], 2, 'png', bundle)
    assert (ssd / 'ortho_grey/index.json').is_file()
    assert (bundle / 'tiles').is_symlink()


def test_a_layer_folder_that_is_a_link_is_unlinked_and_its_target_is_left_alone(tmp_path):
    raster = tmp_path / 'grey.tif'
    _flat_raster(raster)
    precious = tmp_path / 'precious'
    precious.mkdir()
    (precious / 'keep.txt').write_text('keep')
    (tmp_path / 'tiles').mkdir()
    (tmp_path / 'tiles/ortho_grey').symlink_to(precious, target_is_directory=True)
    render_tiles(raster, 'ortho_grey', (0, 2), [1], 2, 'png', tmp_path)
    assert (precious / 'keep.txt').read_text() == 'keep'
    assert not (tmp_path / 'tiles/ortho_grey').is_symlink()
