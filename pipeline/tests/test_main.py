"""T03.15 entry-point orchestration and local output isolation."""
import json
from pathlib import Path

import pytest

from marswalk_pipeline import __main__ as runner


def test_main_runs_steps_in_order_and_redirects_outputs(tmp_path, monkeypatch):
    root = tmp_path / 'repo'
    site = root / 'pipeline' / 'sites' / 'test'
    site.mkdir(parents=True)
    (site / 'site.json').write_text('{"site_id": "test"}')
    work, out = tmp_path / 'work', tmp_path / 'out'
    calls = []
    monkeypatch.setattr(runner, '_paths', lambda _: (root, site, root / 'work', root / 'out'))
    monkeypatch.setattr(runner, '_run_step', lambda name, *args, **kwargs: calls.append((name, args)))
    assert runner.main(['test', '--work', str(work), '--out', str(out)]) == 0
    assert [name for name, _ in calls] == list(runner.STEPS)
    assert all(args[-2:] == (work, out) for _, args in calls)


def test_main_stops_and_names_failing_step(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    (tmp_path / 'site.json').write_text('{"site_id": "test"}')
    calls = []
    def fail(name, *args, **kwargs):
        calls.append(name)
        if name == 'vectors':
            raise NotImplementedError('T04.01/T04.03-05')
    monkeypatch.setattr(runner, '_run_step', fail)
    assert runner.main(['test']) == 1
    assert calls[-1] == 'vectors'
    assert 'vectors' in capsys.readouterr().err


def test_help_lists_steps(capsys):
    with pytest.raises(SystemExit) as exc:
        runner.main(['--help'])
    assert exc.value.code == 0
    output = capsys.readouterr().out
    assert all(step in output for step in runner.STEPS)


def test_synthetic_rasters_run_through_grid_and_comm(tmp_path):
    import json
    import numpy as np
    rasterio = pytest.importorskip('rasterio')
    from rasterio.transform import from_origin
    from marswalk_pipeline import config

    root = Path(runner.__file__).resolve().parents[3]
    site, work, out = tmp_path / 'site', tmp_path / 'work', tmp_path / 'out'
    site.mkdir()
    out.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}, 'hab_mast': {'x_m': 50, 'y_m': 50}}))
    for name in ('hazards.geojson', 'low_res_dem.geojson'):
        (site / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': []}))
    (site / 'ti_threshold.json').write_text(json.dumps({'value': 12}))
    def raster(path, resolution, value, dtype, nodata):
        path.parent.mkdir(parents=True, exist_ok=True)
        n = int(100 / resolution)
        with rasterio.open(path, 'w', driver='GTiff', width=n, height=n, count=1, dtype=dtype,
                           crs=config.WORKING_PROJ, transform=from_origin(0, 100, resolution, resolution), nodata=nodata) as dst:
            dst.write(np.full((n, n), value, dtype=dtype), 1)
    raster(work / 'dem/aoi_1m.tif', 1, 100, 'float32', -9999)
    raster(work / 'ortho/hirise_lrgb_aoi.tif', .5, 90, 'uint8', 0)
    raster(work / 'ti/themis_ti_aoi_pad1km.tif', 100, 10, 'float32', -9999)
    absent_lock = tmp_path / 'no-such.lock.json'  # the committed lock now names real files, which this synthetic work folder does not hold
    for step in runner.STEPS[1:6]:
        runner._run_step(step, root, site, work, out, lock_path=absent_lock)
    elevation = np.fromfile(out / 'grid/elevation.f32', dtype='<f4')
    flags = np.fromfile(out / 'grid/flags.u8', dtype='u1')
    ti = np.fromfile(out / 'grid/ti_100m.f32', dtype='<f4')
    assert elevation.shape == (400,)
    assert np.all(elevation == 100)
    assert np.all(flags & (1 << config.FLAG_BITS['LOW_TI']))
    assert not np.any(flags & (1 << config.FLAG_BITS['TI_UNKNOWN']))
    np.testing.assert_array_equal(ti, [10])
    assert (out / 'grid/comm_hab.u8').stat().st_size == 400


def test_vectors_step_packages_traverse_and_pois(tmp_path):
    """T04.03 is implemented: the vectors step writes both GeoJSON files with the site AOI."""
    import json
    pytest.importorskip('pyproj')
    site = tmp_path / 'site'
    (site / 'pois').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [-1000, -1000, 1000, 1000]}}))
    (site / 'pois' / 'poi-a.json').write_text(json.dumps({
        'poi_id': 'poi-a', 'name': 'A', 'lat': -4.81, 'lon_e': 137.38, 'science_objective': 'x', 'why_it_matters': 'y',
        'position_source': 'synthetic', 'position_uncertainty_m': 1, 'provenance': 'assumed'}))
    traverse = tmp_path / 'localized_interp.csv'
    traverse.write_text(
        'frame,site,drive,planetocentric_latitude,longitude,elevation,sol\n'
        'ROVER,1,2,-4.81,137.38,-4000,100\n'
        'ROVER,1,3,-4.0,137.38,-4000,101\n')
    out = tmp_path / 'out'
    runner._run_step('vectors', tmp_path, site, tmp_path / 'work', out, traverse=traverse)
    pois = json.loads((out / 'vectors/pois.geojson').read_text())
    assert pois['features'][0]['geometry']['coordinates'] == [0.0, 0.0]
    features = json.loads((out / 'vectors/traverse.geojson').read_text())['features']
    # The second fix lies far outside the AOI plus margin and is clipped; one Point plus one LineString remain.
    assert [f['geometry']['type'] for f in features] == ['Point', 'LineString']


def test_traverse_cli_passes_cached_source_to_packager(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import vectors
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, site, tmp_path / 'work', tmp_path / 'out'))
    monkeypatch.setattr(runner, 'STEPS', ('vectors',))
    calls = []
    monkeypatch.setattr(vectors, 'package_traverse', lambda *args, **kwargs: calls.append((args, kwargs)))
    monkeypatch.setattr(vectors, 'package_pois', lambda *args: None)
    traverse = tmp_path / 'cache' / 'localized_interp.csv'
    assert runner.main(['gale_boxwork', '--traverse', str(traverse)]) == 0
    assert calls[0][0][0] == traverse
    assert calls[0][1]['aoi_extent_m'] == (0, 0, 100, 100)


def test_vectors_require_traverse_with_task_guidance(tmp_path):
    import json
    (tmp_path / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    with pytest.raises(ValueError, match=r'--traverse.*T04\.01.*T04\.03'):
        runner._run_step('vectors', tmp_path, tmp_path, tmp_path / 'work', tmp_path / 'out')


@pytest.mark.parametrize('name,source_id', [
    ('dem', 'usgs-gale-dem-1m-v3'),
    ('ortho', 'usgs-gale-ortho-25cm-v3'),
    ('ti', 'usgs-themis-ti-30s120e'),
])
@pytest.mark.parametrize('matches', [True, False])
def test_raster_override_must_match_locked_checksum(tmp_path, monkeypatch, name, source_id, matches):
    import hashlib
    import json
    from marswalk_pipeline import clip_reproject
    (tmp_path / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    override = tmp_path / 'override.tif'
    override.write_bytes(b'fixture input')
    checksum = hashlib.sha256(b'fixture input' if matches else b'different input').hexdigest()
    lock = tmp_path / 'lock.json'
    lock.write_text(json.dumps({'sources': [{'source_id': source_id, 'sha256': checksum}]}))
    calls = []
    monkeypatch.setattr(clip_reproject, 'clip_and_reproject', lambda source, *args, **kwargs: calls.append(source))
    monkeypatch.setattr(clip_reproject, 'nodata_to_nan', lambda *args: None)
    if matches:
        runner._run_step('clip_reproject', tmp_path, tmp_path, tmp_path / 'work', tmp_path / 'out', lock_path=lock, inputs={name: override})
        assert override in calls
    else:
        with pytest.raises(ValueError, match=r'checksum.*' + name):
            runner._run_step('clip_reproject', tmp_path, tmp_path, tmp_path / 'work', tmp_path / 'out', lock_path=lock, inputs={name: override})
        assert not calls


def test_raster_override_requires_locked_checksum(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import clip_reproject
    (tmp_path / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    override = tmp_path / 'override.tif'
    override.write_bytes(b'fixture input')
    lock = tmp_path / 'lock.json'
    lock.write_text(json.dumps({'sources': [{'source_id': 'usgs-themis-ti-30s120e', 'sha256': None}]}))
    calls = []
    monkeypatch.setattr(clip_reproject, 'clip_and_reproject', lambda *args, **kwargs: calls.append(args))
    with pytest.raises(ValueError, match='lock checksum.*ti'):
        runner._run_step('clip_reproject', tmp_path, tmp_path, tmp_path / 'work', tmp_path / 'out', lock_path=lock, inputs={'ti': override})
    assert not calls


def test_masked_ti_sets_unknown_flag_through_pipeline(tmp_path, monkeypatch):
    import json
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    from marswalk_pipeline import clip_reproject, config

    site, work = tmp_path / 'site', tmp_path / 'work'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('hazards.geojson', 'low_res_dem.geojson'):
        (site / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': []}))
    ti_path = work / 'ti/themis_ti_aoi_pad1km.tif'
    ti_path.parent.mkdir(parents=True)
    with rasterio.Env(GDAL_TIFF_INTERNAL_MASK=True):
        with rasterio.open(ti_path, 'w', driver='GTiff', width=2, height=2, count=1, dtype='float32',
                           crs=config.WORKING_PROJ, transform=from_origin(0, 100, 50, 50)) as source:
            source.write(np.array([[10, 0], [30, 40]], dtype='float32'), 1)
            source.write_mask(np.array([[0, 255], [255, 255]], dtype='uint8'))
    warp = clip_reproject.clip_and_reproject
    def ti_only(source, *args, **kwargs):
        if source == ti_path:
            warp(source, *args, **kwargs)
    monkeypatch.setattr(clip_reproject, 'clip_and_reproject', ti_only)
    monkeypatch.setattr(clip_reproject, 'nodata_to_nan', lambda *args: None)
    runner._run_step('clip_reproject', tmp_path, site, work, tmp_path / 'out')
    scratch = work / 'runs/gale_boxwork'
    np.save(scratch / 'elevation.npy', np.ones((20, 20), dtype='float32'))
    runner._run_step('flags', tmp_path, site, work, tmp_path / 'out')
    flags = np.load(scratch / 'flags.npy')
    unknown = flags & (1 << config.FLAG_BITS['TI_UNKNOWN'])
    assert unknown[0, 0]
    assert not unknown[0, 10]


def test_absent_ti_threshold_sets_no_low_ti_flag_through_pipeline(tmp_path, monkeypatch):
    """U-03 is decided (2026-11-10): no defensible TI threshold for the AOI, so `ti_threshold.json` is
    absent and T03.10 sets no LOW_TI bits (C5; docs/ops/ti-threshold.md). The TI values here are far below
    any plausible threshold, so a LOW_TI bit would mean the absent file was read as a threshold anyway."""
    import json
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    from marswalk_pipeline import clip_reproject, config

    site, work = tmp_path / 'site', tmp_path / 'work'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('hazards.geojson', 'low_res_dem.geojson'):
        (site / name).write_text(json.dumps({'type': 'FeatureCollection', 'features': []}))
    assert not (site / 'ti_threshold.json').exists()
    ti_path = work / 'ti/themis_ti_aoi_pad1km.tif'
    ti_path.parent.mkdir(parents=True)
    with rasterio.Env(GDAL_TIFF_INTERNAL_MASK=True):
        with rasterio.open(ti_path, 'w', driver='GTiff', width=2, height=2, count=1, dtype='float32',
                           crs=config.WORKING_PROJ, transform=from_origin(0, 100, 50, 50)) as source:
            source.write(np.full((2, 2), 10, dtype='float32'), 1)
    warp = clip_reproject.clip_and_reproject
    def ti_only(source, *args, **kwargs):
        if source == ti_path:
            warp(source, *args, **kwargs)
    monkeypatch.setattr(clip_reproject, 'clip_and_reproject', ti_only)
    monkeypatch.setattr(clip_reproject, 'nodata_to_nan', lambda *args: None)
    runner._run_step('clip_reproject', tmp_path, site, work, tmp_path / 'out')
    scratch = work / 'runs/gale_boxwork'
    np.save(scratch / 'elevation.npy', np.ones((20, 20), dtype='float32'))
    runner._run_step('flags', tmp_path, site, work, tmp_path / 'out')
    flags = np.load(scratch / 'flags.npy')
    assert not np.any(flags & (1 << config.FLAG_BITS['LOW_TI']))
    # The TI values themselves are present: only the LOW_TI flag is withheld.
    assert not np.any(flags & (1 << config.FLAG_BITS['TI_UNKNOWN']))


def test_gale_boxwork_site_has_no_ti_threshold_file():
    """U-03 decided 2026-11-10: there is no defensible TI threshold for the AOI, so the real site's
    `ti_threshold.json` must stay absent. Writing one needs a new recorded decision (T04.07), not an
    edit to this file."""
    repo_root = Path(__file__).resolve().parents[2]
    assert not (repo_root / 'pipeline/sites/gale_boxwork/ti_threshold.json').exists()


def test_hazard_flags_layer_limitations_do_not_imply_a_threshold():
    """The legend text is copied into the T03.19 manifest, so it must not say that a LOW_TI threshold
    is pending: U-03 decided on 2026-11-10 that no defensible threshold exists."""
    repo_root = Path(__file__).resolve().parents[2]
    layer = json.loads((repo_root / 'pipeline/sites/gale_boxwork/layers/hazard_flags.json').read_text())
    limitations = layer['limitations']
    assert 'unresolved threshold' not in limitations
    assert 'LOW_TI is not set' in limitations


def test_local_source_paths_are_configurable(tmp_path, monkeypatch):
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    (tmp_path / 'site.json').write_text('{"site_id": "site"}')
    observed = []
    monkeypatch.setattr(runner, '_run_step', lambda name, *args, **kwargs: observed.append(kwargs.get('inputs')))
    assert runner.main(['site', '--dem', 'a.tif', '--ortho', 'b.tif', '--ti', 'c.tif']) == 0
    assert observed[0] == {'dem': Path('a.tif'), 'ortho': Path('b.tif'), 'ti': Path('c.tif')}




def test_site_id_mismatch_stops_before_steps(tmp_path, monkeypatch, capsys):
    import json
    (tmp_path / 'site.json').write_text(json.dumps({'site_id': 'other'}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    assert runner.main(['requested']) != 0
    assert 'requested' in capsys.readouterr().err


def test_lock_argument_and_version_are_passed_to_acquire(tmp_path, monkeypatch):
    import json
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'data_version': 'v1', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    lock = tmp_path / 'lock.json'
    lock.write_text(json.dumps({'sources': [], 'data_version': None}))
    runner._run_step('acquire', tmp_path, site, tmp_path / 'work', tmp_path / 'out', lock_path=lock)
    assert json.loads(lock.read_text())['data_version'] == 'v1'




def test_clip_resolves_acquired_sources_and_respects_override(tmp_path, monkeypatch):
    import hashlib
    import json
    from marswalk_pipeline import clip_reproject
    from marswalk_pipeline.acquire import source_filename
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    entries = [{'source_id': sid, 'url': f'file:///some/{name}.tif'} for sid, name in [('usgs-gale-dem-1m-v3', 'dem'), ('usgs-gale-ortho-25cm-v3', 'ortho'), ('usgs-themis-ti-30s120e', 'ti')]]
    override = tmp_path / 'override.tif'
    override.write_bytes(b'fixture')
    entries[2]['sha256'] = hashlib.sha256(b'fixture').hexdigest()
    lock = tmp_path / 'lock.json'
    lock.write_text(json.dumps({'sources': entries}))
    calls = []
    monkeypatch.setattr(clip_reproject, 'clip_and_reproject', lambda source, *args, **kwargs: calls.append(source))
    monkeypatch.setattr(clip_reproject, 'nodata_to_nan', lambda *args: None)
    runner._run_step('clip_reproject', tmp_path, site, tmp_path / 'work', tmp_path / 'out', lock_path=lock, inputs={'ti': override})
    assert calls == [tmp_path / 'work' / source_filename(entries[0]), tmp_path / 'work' / source_filename(entries[1]), override, override]


def test_acquire_fills_scratch_lock_and_cli_forwards_it(tmp_path, monkeypatch):
    import hashlib
    import json
    from marswalk_pipeline.acquire import fetch_sources
    pytest.importorskip('osgeo')
    source = tmp_path / 'input.tif'
    source.write_bytes(b'fixture raster')
    lock = tmp_path / 'scratch.lock.json'
    lock.write_text(json.dumps({'sources': [{'source_id': 'test', 'url': source.as_uri(), 'sha256': None}]}))
    fetch_sources(lock, tmp_path / 'cache', data_version='site-v1')
    data = json.loads(lock.read_text())
    assert data['data_version'] == 'site-v1'
    assert data['sources'][0]['sha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert data['tools']['gdal'] and data['tools']['rasterio']
    assert (tmp_path / 'cache' / source.name).read_bytes() == source.read_bytes()
    (tmp_path / 'site.json').write_text('{"site_id": "site"}')
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    calls = []
    monkeypatch.setattr(runner, '_run_step', lambda *args, **kwargs: calls.append(kwargs))
    assert runner.main(['site', '--lock', str(lock), '--skip-unstyled-optional']) == 0
    assert all(call['lock_path'] == lock and call['skip_unstyled_optional'] for call in calls)
    calls.clear()
    assert runner.main(['site']) == 0
    assert all(call['lock_path'] == tmp_path / 'pipeline/sources.lock.json' and not call['skip_unstyled_optional'] for call in calls)


def test_offline_flag_reaches_the_acquire_step_only_when_given(tmp_path, monkeypatch):
    (tmp_path / 'site.json').write_text('{"site_id": "site"}')
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, tmp_path, tmp_path / 'w', tmp_path / 'o'))
    calls = []
    monkeypatch.setattr(runner, '_run_step', lambda *args, **kwargs: calls.append(kwargs))
    assert runner.main(['site', '--offline']) == 0
    assert calls and all(call['offline'] is True for call in calls)
    calls.clear()
    assert runner.main(['site']) == 0
    assert calls and all(call['offline'] is False for call in calls)


def test_acquire_step_passes_offline_to_fetch_sources(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import acquire
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'data_version': 'v', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    seen = {}
    monkeypatch.setattr(acquire, 'fetch_sources', lambda lock, work, **kw: seen.update(kw))
    runner._run_step('acquire', tmp_path, site, tmp_path / 'work', tmp_path / 'out', offline=True)
    assert seen == {'data_version': 'v', 'offline': True}


# --- Display tiles (BD-17, BD-18, BD-22; C9) ---------------------------------------------------

DISPLAY_LAYERS = ('ortho', 'hillshade', 'slope', 'elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab')
SITE_ROOT = Path(runner.__file__).resolve().parents[3]


def _tiles_fixture(tmp_path, *, elevation=None, ti=None, flags=None, comm=None):
    """A 10 m x 10 m corner of the real tile grid with every raster the tiles step reads."""
    import shutil
    import numpy as np
    rasterio = pytest.importorskip('rasterio')
    from rasterio.enums import ColorInterp
    from rasterio.transform import from_origin
    from marswalk_pipeline.comm_grid import write_comm_hab

    site = tmp_path / 'site'
    shutil.copytree(SITE_ROOT / 'pipeline/sites/gale_boxwork/layers', site / 'layers')
    extent = [-3000, 2990, -2990, 3000]
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': extent}}))
    scratch = tmp_path / 'work/runs/gale_boxwork'
    scratch.mkdir(parents=True)
    out = tmp_path / 'out'

    def write(name, array, cell, dtype, nodata=None):
        rows, cols = array.shape[-2:]
        count = array.shape[0] if array.ndim == 3 else 1
        with rasterio.open(scratch / name, 'w', driver='GTiff', width=cols, height=rows, count=count, dtype=dtype,
                           transform=from_origin(-3000, 3000, cell, cell), nodata=nodata) as dst:
            dst.write(array if array.ndim == 3 else array[np.newaxis])
            if name == 'ortho.tif':
                dst.colorinterp = (ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha)

    elevation = np.arange(100, dtype='float32').reshape(10, 10) if elevation is None else elevation
    ti = np.arange(4, dtype='float32').reshape(2, 2) if ti is None else ti
    write('dem.tif', elevation, 1, 'float32', np.nan)
    write('ti.tif', ti, 5, 'float32', np.nan)
    ortho = np.full((4, 20, 20), 120, dtype='uint8')
    ortho[3] = 255
    write('ortho.tif', ortho, .5, 'uint8')
    write('hillshade.tif', np.full((10, 10), .5, dtype='float32'), 1, 'float32', np.nan)
    write('slope.tif', np.full((10, 10), 5, dtype='float32'), 1, 'float32', np.nan)
    np.save(scratch / 'flags.npy', np.zeros((2, 2), dtype='uint8') if flags is None else flags)
    write_comm_hab(out, np.array([[0, 1], [255, 1]], dtype='uint8') if comm is None else comm)
    return site, tmp_path / 'work', out, scratch


def _pixel(out, layer, z=0, x=0, y=0, ext='png'):
    rasterio = pytest.importorskip('rasterio')
    with rasterio.open(out / f'tiles/{layer}/{z}/{x}/{y}.{ext}') as tile:
        return tile.read()


def test_every_display_layer_is_built_by_default(tmp_path):
    """BD-17: nothing is deferred; all seven display layers are tiled and indexed."""
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    for layer in DISPLAY_LAYERS:
        assert (out / f'tiles/{layer}/index.json').is_file(), layer


def test_bd17_ramp_stops_are_data_p2_p98_and_written_to_the_layer_records(tmp_path):
    import numpy as np
    elevation = np.arange(100, dtype='float32').reshape(10, 10)
    elevation[0, :3] = np.nan                         # unknown cells never count
    ti = np.array([[10, 20], [np.nan, 40]], dtype='float32')
    site, work, out, _ = _tiles_fixture(tmp_path, elevation=elevation, ti=ti)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    for layer, values, unit in (('elevation', elevation, 'm'), ('thermal_inertia', ti, 'tiu')):
        valid = values[np.isfinite(values)].astype('float64')
        low, high = (float(np.percentile(valid, q)) for q in (2, 98))
        record = json.loads((site / f'layers/{layer}.json').read_text())
        assert record['legend']['type'] == 'ramp'
        (low_value, low_label), (high_value, high_label) = record['legend']['stops']
        assert (low_value, high_value) == pytest.approx((low, high), abs=1e-6)
        assert low_label.endswith(unit) and high_label.endswith(unit)
        assert 'TODO' not in (site / f'layers/{layer}.json').read_text()


def test_bd17_ramp_tiles_use_the_stops(tmp_path):
    from marswalk_pipeline import config
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    pixels = _pixel(out, 'elevation', z=4)          # 2 m: the 10 m corner spans five pixels
    assert pixels[3, 0, 0] == 255
    low, high = (tuple(pixels[:3, row, col]) for row, col in ((0, 0), (4, 4)))
    assert low[0] < high[0]
    assert all(config.DATA_RAMP_RGB[0][i] <= low[i] <= config.DATA_RAMP_RGB[-1][i] for i in range(3))


def test_bd17_ramp_stops_are_deterministic(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    first = (site / 'layers/elevation.json').read_text()
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    assert (site / 'layers/elevation.json').read_text() == first


def test_bd17_hazard_flag_tiles_use_the_status_colours(tmp_path):
    import numpy as np
    from marswalk_pipeline import config
    flags = np.array([[1 << config.FLAG_BITS['HARD_HAZARD'], 0],
                      [(1 << config.FLAG_BITS['LOW_RES_DEM']) | (1 << config.FLAG_BITS['TI_UNKNOWN']), 1 << config.FLAG_BITS['NO_DATA']]], dtype='uint8')
    site, work, out, _ = _tiles_fixture(tmp_path, flags=flags)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    pixels = _pixel(out, 'hazard_flags', z=4)          # 2 m pixels; cells are 5 m: rows and columns 0-1 = first cell
    colours = dict(config.HAZARD_DISPLAY_RGB)
    assert tuple(pixels[:3, 0, 0]) == colours['HARD_HAZARD'] and pixels[3, 0, 0] == 255
    assert pixels[3, 0, 4] == 0                         # no flag: transparent
    assert tuple(pixels[:3, 4, 0]) == colours['LOW_RES_DEM']   # the higher-priority of two flags
    assert tuple(pixels[:3, 4, 4]) == colours['NO_DATA']


def test_bd17_comm_tiles_are_white_where_visible_and_transparent_elsewhere(tmp_path):
    from marswalk_pipeline import config
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    pixels = _pixel(out, 'comm_hab', z=4)
    assert pixels[3, 0, 0] == 0                         # cell (0,0) shadow
    assert tuple(pixels[:3, 0, 4]) == config.COMM_VISIBLE_RGB and pixels[3, 0, 4] == 255
    assert pixels[3, 4, 0] == 0                         # cell (1,0) no data


def test_bd18_ortho_layer_record_states_the_background_rule():
    record = json.loads((SITE_ROOT / 'pipeline/sites/gale_boxwork/layers/ortho.json').read_text())
    assert 'background' in record['limitations'] and 'source mask' in record['limitations']
    assert 'padding' not in record['limitations']


def test_c9_tile_grids_of_the_gale_layer_records():
    """C9: origin is the AOI's top-left corner, 256 px tiles, ladders from config, PNG except the JPEG ortho."""
    from marswalk_pipeline import config
    site = json.loads((SITE_ROOT / 'pipeline/sites/gale_boxwork/site.json').read_text())
    minx, miny, maxx, maxy = site['aoi']['extent_m']
    for layer in DISPLAY_LAYERS:
        text = (SITE_ROOT / f'pipeline/sites/gale_boxwork/layers/{layer}.json').read_text()
        assert 'TODO' not in text, layer
        grid = json.loads(text)['tile_grid']
        assert grid['origin_m'] == [minx, maxy]
        assert grid['tile_size_px'] == 256
        assert grid['resolutions_m'] == (config.ORTHO_TILE_RESOLUTIONS_M if layer == 'ortho' else config.TILE_RESOLUTIONS_M)
        assert grid['format'] == ('jpg' if layer == 'ortho' else 'png')


def test_ortho_is_tiled_as_jpeg_at_half_metre(tmp_path):
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out)
    index = json.loads((out / 'tiles/ortho/index.json').read_text())
    assert {entry['path'] for entry in index['tiles']} == {f'{z}/0/0.jpg' for z in range(6)}
    assert not list((out / 'tiles/ortho').rglob('*.png'))
    pixels = _pixel(out, 'ortho', z=5, ext='jpg')
    assert abs(int(pixels[0, 5, 5]) - 120) <= 8


def test_skip_unstyled_optional_skips_the_four_derived_display_layers(tmp_path, capsys):
    """`--skip-unstyled-optional` stays an option (BD-17): optional derived layers are omitted and excluded from the manifest."""
    from marswalk_pipeline import manifest
    site, work, out, _ = _tiles_fixture(tmp_path)
    runner._run_step('tiles', SITE_ROOT, site, work, out, skip_unstyled_optional=True)
    assert {path.name for path in (out / 'tiles').iterdir()} == {'ortho', 'hillshade', 'slope'}
    assert runner._skipped_layers(site) == {'elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab'}
    assert 'TODO' not in capsys.readouterr().err


def test_vectors_step_copies_the_locked_poi_images_into_the_bundle(tmp_path):
    """The POI image files of the lock (work/images/<poi_id>.jpg) are copied byte for byte to images/ of the bundle."""
    pytest.importorskip('pyproj')
    site = tmp_path / 'site'
    (site / 'pois').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [-1000, -1000, 1000, 1000]}}))
    (site / 'pois' / 'poi-a.json').write_text(json.dumps({
        'poi_id': 'poi-a', 'name': 'A', 'lat': -4.81, 'lon_e': 137.38, 'science_objective': 'x', 'why_it_matters': 'y',
        'image_asset': 'img-a', 'image_credit': 'c', 'image_source_url': 'u',
        'position_source': 'synthetic', 'position_uncertainty_m': 1, 'provenance': 'assumed'}))
    (tmp_path / 'work/images').mkdir(parents=True)
    (tmp_path / 'work/images/poi-a.jpg').write_bytes(b'jpeg-bytes')
    traverse = tmp_path / 'localized_interp.csv'
    traverse.write_text('frame,site,drive,planetocentric_latitude,longitude,elevation,sol\nROVER,1,2,-4.81,137.38,-4000,100\n')
    out = tmp_path / 'out'
    runner._run_step('vectors', tmp_path, site, tmp_path / 'work', out, traverse=traverse)
    assert (out / 'images/poi-a.jpg').read_bytes() == b'jpeg-bytes'


def test_a_poi_whose_image_file_is_missing_stops_the_vectors_step(tmp_path):
    pytest.importorskip('pyproj')
    site = tmp_path / 'site'
    (site / 'pois').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [-1000, -1000, 1000, 1000]}}))
    (site / 'pois' / 'poi-a.json').write_text(json.dumps({
        'poi_id': 'poi-a', 'name': 'A', 'lat': -4.81, 'lon_e': 137.38, 'science_objective': 'x', 'why_it_matters': 'y',
        'image_asset': 'img-a', 'image_credit': 'c', 'image_source_url': 'u',
        'position_source': 'synthetic', 'position_uncertainty_m': 1, 'provenance': 'assumed'}))
    traverse = tmp_path / 'localized_interp.csv'
    traverse.write_text('frame,site,drive,planetocentric_latitude,longitude,elevation,sol\nROVER,1,2,-4.81,137.38,-4000,100\n')
    with pytest.raises(FileNotFoundError, match='poi-a'):
        runner._run_step('vectors', tmp_path, site, tmp_path / 'work', tmp_path / 'out', traverse=traverse)


def test_a_poi_image_asset_id_must_follow_the_poi_id(tmp_path):
    pytest.importorskip('pyproj')
    from marswalk_pipeline.vectors import package_poi_images
    (tmp_path / 'pois').mkdir()
    (tmp_path / 'pois/poi-a.json').write_text(json.dumps({'poi_id': 'poi-a', 'image_asset': 'img-other'}))
    (tmp_path / 'images').mkdir()
    (tmp_path / 'images/poi-a.jpg').write_bytes(b'x')
    with pytest.raises(ValueError, match='img-a'):
        package_poi_images(tmp_path / 'pois', tmp_path / 'images', tmp_path / 'out/images')

