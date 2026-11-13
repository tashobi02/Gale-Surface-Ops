"""Opt-in pipeline fallbacks (backend package 29; BD-01, BD-150): T03.23 `--max-zoom`, T03.24 `--cell-m 10`, T03.25 `--static-images`.

Each option is off by default (the default build is byte-for-byte what it was) and, when given, changes one thing in one
place. The tests run on small synthetic rasters and on a copy of the F4 mock site, never on the real bundle.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from marswalk_pipeline import __main__ as runner
from marswalk_pipeline import config

# Helpers of the neighbouring suites (pytest puts this folder on sys.path: there is no package).
from test_main import DISPLAY_LAYERS, SITE_ROOT, _pixel, _tiles_fixture  # noqa: E402
from test_manifest import MOCK_SITE, build_config_dir, load_manifest  # noqa: E402

# --- T03.23: --max-zoom ------------------------------------------------------------------------------------------

def test_limit_resolutions_keeps_the_coarsest_levels_through_max_zoom():
    assert config.limit_resolutions([32, 16, 8, 4, 2], 2) == [32, 16, 8]
    assert config.limit_resolutions(config.ORTHO_TILE_RESOLUTIONS_M, 3) == [32, 16, 8, 4]
    assert config.limit_resolutions([32, 16, 8, 4, 2], 0) == [32]


def test_limit_resolutions_without_a_limit_or_above_the_finest_level_changes_nothing():
    assert config.limit_resolutions([32, 16, 8, 4, 2], None) == [32, 16, 8, 4, 2]
    assert config.limit_resolutions([32, 16, 8, 4, 2], 4) == [32, 16, 8, 4, 2]
    assert config.limit_resolutions([32, 16, 8, 4, 2], 9) == [32, 16, 8, 4, 2]


@pytest.mark.parametrize('bad', [-1, 1.5, '2', True])
def test_limit_resolutions_rejects_a_level_that_is_not_a_non_negative_integer(bad):
    with pytest.raises(ValueError, match='max-zoom'):
        config.limit_resolutions([32, 16, 8, 4, 2], bad)


def test_the_tiles_step_writes_only_the_kept_levels(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out, max_zoom=2)
    for layer in DISPLAY_LAYERS:
        index = json.loads((out / f'tiles/{layer}/index.json').read_text())
        levels = {int(entry['path'].split('/')[0]) for entry in index['tiles']}
        assert levels == {0, 1, 2}, layer
        on_disk = {p.name for p in (out / f'tiles/{layer}').iterdir() if p.is_dir()}
        assert on_disk == {'0', '1', '2'}, layer


def test_without_max_zoom_the_tiles_step_is_unchanged(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    levels = {int(e['path'].split('/')[0]) for e in json.loads((out / 'tiles/slope/index.json').read_text())['tiles']}
    assert levels == {0, 1, 2, 3, 4}


def test_the_manifest_lists_only_the_kept_levels_and_the_validator_is_green(tmp_path):
    """F4 copy, finer levels deleted as `--max-zoom 2` leaves them; the manifest follows the disk."""
    from marswalk_pipeline.manifest import write_manifest
    from marswalk_pipeline.validate_manifest import validate

    original = load_manifest(MOCK_SITE)
    features = json.loads((MOCK_SITE / 'vectors/pois.geojson').read_text())['features']
    bundle = tmp_path / 'bundle'
    shutil.copytree(MOCK_SITE, bundle)
    (bundle / 'site-manifest.json').unlink()
    for layer in ('slope', 'elevation'):
        root = bundle / 'tiles' / layer
        for level in (3, 4):
            shutil.rmtree(root / str(level))
        index = json.loads((root / 'index.json').read_text())
        index['tiles'] = [e for e in index['tiles'] if int(e['path'].split('/')[0]) <= 2]
        (root / 'index.json').write_text(json.dumps(index, sort_keys=True, indent=2) + '\n')
    config_dir = build_config_dir(original, [f['properties'] for f in features], tmp_path / 'config')
    write_manifest(bundle, original['data_version'], original['crs']['proj4'], config_dir,
                   cell_m=original['grid']['cell_m'], max_zoom=2)
    written = load_manifest(bundle)
    raster = [layer for layer in written['layers'] if layer['kind'] == 'raster_tiles']
    assert [layer['layer_id'] for layer in raster] == ['elevation', 'slope']
    for layer in raster:
        assert layer['tile_grid']['resolutions_m'] == [32, 16, 8], layer['layer_id']
        levels = {p.name for p in (bundle / 'tiles' / layer['layer_id']).iterdir() if p.is_dir()}
        assert levels == {'0', '1', '2'}
    assert validate(bundle) == []


def test_the_cli_passes_max_zoom_to_the_steps(tmp_path, monkeypatch):
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork'}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, site, tmp_path / 'work', tmp_path / 'out'))
    seen = []
    monkeypatch.setattr(runner, '_run_step', lambda name, *a, **kw: seen.append((name, kw.get('max_zoom'), kw.get('cell_m'), kw.get('static_images'))))
    assert runner.main(['gale_boxwork', '--max-zoom', '3']) == 0
    assert {entry[1] for entry in seen} == {3}
    assert {entry[2] for entry in seen} == {config.GRID_CELL_M}
    assert {entry[3] for entry in seen} == {False}


def test_the_cli_rejects_a_negative_max_zoom(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    with pytest.raises(SystemExit) as exc:
        runner.main(['gale_boxwork', '--max-zoom', '-1'])
    assert exc.value.code == 2


# --- T03.24: --cell-m 10 -----------------------------------------------------------------------------------------

def _synthetic_site(tmp_path, with_dem_values=None):
    import numpy as np
    rasterio = pytest.importorskip('rasterio')
    from rasterio.transform import from_origin

    site, work, out = tmp_path / 'site', tmp_path / 'work', tmp_path / 'out'
    site.mkdir()
    out.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}, 'hab_mast': {'x_m': 55, 'y_m': 45}}))
    for name in ('hazards.geojson', 'low_res_dem.geojson'):
        (site / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': []}))

    def raster(path, resolution, value, dtype, nodata):
        path.parent.mkdir(parents=True, exist_ok=True)
        n = int(100 / resolution)
        data = np.full((n, n), value, dtype=dtype) if not isinstance(value, np.ndarray) else value
        with rasterio.open(path, 'w', driver='GTiff', width=n, height=n, count=1, dtype=dtype,
                           crs=config.WORKING_PROJ, transform=from_origin(0, 100, resolution, resolution), nodata=nodata) as dst:
            dst.write(data, 1)

    raster(work / 'dem/aoi_1m.tif', 1, 100 if with_dem_values is None else with_dem_values, 'float32', -9999)
    raster(work / 'ortho/hirise_lrgb_aoi.tif', .5, 90, 'uint8', 0)
    raster(work / 'ti/themis_ti_aoi_pad1km.tif', 100, 10, 'float32', -9999)
    return site, work, out


def test_cell_m_10_writes_a_ten_metre_routing_grid(tmp_path):
    import numpy as np
    site, work, out = _synthetic_site(tmp_path)
    absent_lock = tmp_path / 'no-such.lock.json'
    for step in runner.STEPS[1:6]:
        runner._run_step(step, SITE_ROOT, site, work, out, lock_path=absent_lock, cell_m=10)
    assert np.fromfile(out / 'grid/elevation.f32', dtype='<f4').shape == (100,)  # 10 x 10 cells of 10 m
    for name in ('slope_p90.u8', 'slope_max.u8', 'flags.u8', 'comm_hab.u8'):
        assert (out / 'grid' / name).stat().st_size == 100, name
    assert np.all(np.fromfile(out / 'grid/elevation.f32', dtype='<f4') == 100)


def test_cell_m_10_aggregates_slope_conservatively_over_the_ten_metre_block(tmp_path):
    """A 1 m DEM with one steep 10 m block: its p90 and max are those of the whole 10 x 10 block (the safe direction)."""
    import numpy as np
    dem = np.zeros((100, 100), dtype='float32')
    # a ramp of 1 m per 1 m (45 degrees) in the block rows 0-9, cols 0-9, flat elsewhere
    dem[0:10, 0:10] = np.arange(10, dtype='float32')[np.newaxis, :] * 1.0
    site, work, out = _synthetic_site(tmp_path, with_dem_values=dem)
    absent_lock = tmp_path / 'no-such.lock.json'
    for step in runner.STEPS[1:6]:
        runner._run_step(step, SITE_ROOT, site, work, out, lock_path=absent_lock, cell_m=10)
    p90 = np.fromfile(out / 'grid/slope_p90.u8', dtype='u1').reshape(10, 10)
    smax = np.fromfile(out / 'grid/slope_max.u8', dtype='u1').reshape(10, 10)
    assert smax[0, 0] > 0 and p90[0, 0] > 0
    assert smax[0, 0] >= p90[0, 0]
    assert smax[5, 5] == 0 and p90[5, 5] == 0


def test_cell_m_10_gives_a_manifest_with_the_ten_metre_grid(tmp_path):
    from marswalk_pipeline.manifest import write_manifest
    original = load_manifest(MOCK_SITE)
    features = json.loads((MOCK_SITE / 'vectors/pois.geojson').read_text())['features']
    bundle = tmp_path / 'bundle'
    shutil.copytree(MOCK_SITE, bundle)
    (bundle / 'site-manifest.json').unlink()
    config_dir = build_config_dir(original, [f['properties'] for f in features], tmp_path / 'config')
    # F4 holds 100 m cells, so the explicit value is what the writer uses (and a 10 m request on it is a size error).
    write_manifest(bundle, original['data_version'], original['crs']['proj4'], config_dir, cell_m=100)
    assert load_manifest(bundle)['grid']['cell_m'] == 100
    with pytest.raises(ValueError, match='bytes does not match'):
        write_manifest(bundle, original['data_version'], original['crs']['proj4'], config_dir, cell_m=10)


def test_the_validator_is_green_on_the_mock_site_through_the_explicit_cell_size(tmp_path):
    from marswalk_pipeline.manifest import write_manifest
    from marswalk_pipeline.validate_manifest import validate
    original = load_manifest(MOCK_SITE)
    features = json.loads((MOCK_SITE / 'vectors/pois.geojson').read_text())['features']
    bundle = tmp_path / 'bundle'
    shutil.copytree(MOCK_SITE, bundle)
    (bundle / 'site-manifest.json').unlink()
    config_dir = build_config_dir(original, [f['properties'] for f in features], tmp_path / 'config')
    write_manifest(bundle, original['data_version'], original['crs']['proj4'], config_dir, cell_m=original['grid']['cell_m'])
    assert validate(bundle) == []


def test_the_cli_accepts_only_the_two_documented_cell_sizes(tmp_path, monkeypatch):
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork'}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, site, tmp_path / 'work', tmp_path / 'out'))
    seen = []
    monkeypatch.setattr(runner, '_run_step', lambda name, *a, **kw: seen.append(kw.get('cell_m')))
    assert runner.main(['gale_boxwork', '--cell-m', '10']) == 0
    assert set(seen) == {10}
    for bad in ('7', '0', '-5', 'x'):
        with pytest.raises(SystemExit) as exc:
            runner.main(['gale_boxwork', '--cell-m', bad])
        assert exc.value.code == 2


def test_the_default_cell_size_is_still_the_config_constant():
    assert config.GRID_CELL_M == 5
    assert config.GRID_CELL_CHOICES_M == (5, 10)


# --- T03.25: --static-images -------------------------------------------------------------------------------------

def test_static_images_replace_the_two_metre_layers_and_keep_the_rest_tiled(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out, static_images=True)
    two_m = {json.loads(p.read_text())['layer_id'] for p in (site / 'layers').glob('*.json')
             if json.loads(p.read_text()).get('display_resolution_m') == 2 and json.loads(p.read_text())['kind'] == 'raster_tiles'}
    assert two_m  # the gale layer records have 2 m layers
    for layer in two_m:
        assert (out / f'images/{layer}.png').is_file(), layer
        assert not (out / f'tiles/{layer}').exists(), layer
    for layer in set(DISPLAY_LAYERS) - two_m:
        assert (out / f'tiles/{layer}/index.json').is_file(), layer
        assert not (out / f'images/{layer}.png').exists(), layer
    assert 'ortho' not in two_m  # the 0.5 m basemap stays a tiled layer (02 §B)


def test_a_static_image_carries_the_c9_pixel_encoding_at_two_metres(tmp_path):
    """The fixture AOI is 10 m square: 5 x 5 pixels at 2 m. Slope is data-encoded (u8 = degrees x 4), alpha 255."""
    rasterio = pytest.importorskip('rasterio')
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out, static_images=True)
    with rasterio.open(out / 'images/slope.png') as image:
        assert (image.width, image.height) == (5, 5)
        data = image.read()
    assert (data[0] == 5 * config.SLOPE_U8_SCALE).all()
    assert (data[-1] == 255).all()


def test_static_images_are_off_by_default(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    assert not (out / 'images').exists()


def test_render_static_image_needs_a_square_extent_that_is_a_whole_number_of_pixels(tmp_path):
    from marswalk_pipeline.static_images import render_static_image
    site, work, out, scratch = _tiles_fixture(tmp_path)
    with pytest.raises(ValueError, match='square'):
        render_static_image(scratch / 'slope.tif', 'slope', (-3000, 2990, -2980, 3000), 2, out / 'images/slope.png', data_encoded=True)
    with pytest.raises(ValueError, match='whole'):
        render_static_image(scratch / 'slope.tif', 'slope', (-3000, 2990, -2990, 3000), 3, out / 'images/slope.png', data_encoded=True)


def test_the_manifest_lists_a_static_image_layer_as_image_static(tmp_path):
    """The writer already follows the produced asset: a layer with images/<id>.png and no tiles is `image_static`."""
    import io
    rasterio = pytest.importorskip('rasterio')
    import numpy as np
    from rasterio.io import MemoryFile
    from marswalk_pipeline.manifest import write_manifest
    from marswalk_pipeline.validate_manifest import validate

    original = load_manifest(MOCK_SITE)
    features = json.loads((MOCK_SITE / 'vectors/pois.geojson').read_text())['features']
    bundle = tmp_path / 'bundle'
    shutil.copytree(MOCK_SITE, bundle)
    (bundle / 'site-manifest.json').unlink()
    shutil.rmtree(bundle / 'tiles/slope')
    (bundle / 'images').mkdir()
    with MemoryFile() as memory:
        with memory.open(driver='PNG', width=3, height=3, count=2, dtype='uint8') as png:
            png.write(np.zeros((2, 3, 3), dtype='uint8'))
        (bundle / 'images/slope.png').write_bytes(memory.read())
    config_dir = build_config_dir(original, [f['properties'] for f in features], tmp_path / 'config')
    write_manifest(bundle, original['data_version'], original['crs']['proj4'], config_dir, cell_m=original['grid']['cell_m'])
    written = load_manifest(bundle)
    slope = next(layer for layer in written['layers'] if layer['layer_id'] == 'slope')
    assert slope['kind'] == 'image_static' and slope['asset_id'] == 'img-slope' and 'tile_grid' not in slope
    assert validate(bundle) == []


def test_the_cli_forwards_static_images(tmp_path, monkeypatch):
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork'}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, site, tmp_path / 'work', tmp_path / 'out'))
    seen = []
    monkeypatch.setattr(runner, '_run_step', lambda name, *a, **kw: seen.append(kw.get('static_images')))
    assert runner.main(['gale_boxwork', '--static-images']) == 0
    assert set(seen) == {True}


def test_a_normal_build_removes_a_stale_static_image_of_an_earlier_run(tmp_path):
    """Tiles and a static image of one layer must never coexist in a bundle (the manifest resolves by layer id)."""
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out, static_images=True)
    assert (out / 'images/slope.png').is_file()
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    assert not (out / 'images/slope.png').exists()
    assert (out / 'tiles/slope/index.json').is_file()
