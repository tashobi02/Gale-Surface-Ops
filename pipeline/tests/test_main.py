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
    for step in runner.STEPS[1:6]:
        runner._run_step(step, root, site, work, out)
    elevation = np.fromfile(out / 'grid/elevation.f32', dtype='<f4')
    flags = np.fromfile(out / 'grid/flags.u8', dtype='u1')
    ti = np.fromfile(out / 'grid/ti_100m.f32', dtype='<f4')
    assert elevation.shape == (400,)
    assert np.all(elevation == 100)
    assert np.all(flags & (1 << config.FLAG_BITS['LOW_TI']))
    assert not np.any(flags & (1 << config.FLAG_BITS['TI_UNKNOWN']))
    np.testing.assert_array_equal(ti, [10])
    assert (out / 'grid/comm_hab.u8').stat().st_size == 400


def test_vectors_report_owning_tasks(tmp_path):
    import json
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    with pytest.raises(NotImplementedError, match=r'T04\.01.*T04\.03-05'):
        runner._run_step('vectors', tmp_path, site, tmp_path / 'work', tmp_path / 'out', traverse=Path('cached.csv'))


def test_traverse_cli_passes_cached_source_to_packager(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import vectors
    site = tmp_path / 'site'
    site.mkdir()
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    monkeypatch.setattr(runner, '_paths', lambda _: (tmp_path, site, tmp_path / 'work', tmp_path / 'out'))
    monkeypatch.setattr(runner, 'STEPS', ('vectors',))
    calls = []
    monkeypatch.setattr(vectors, 'package_traverse', lambda *args: calls.append(args))
    monkeypatch.setattr(vectors, 'package_pois', lambda *args: None)
    traverse = tmp_path / 'cache' / 'localized_interp.csv'
    assert runner.main(['gale_boxwork', '--traverse', str(traverse)]) == 0
    assert calls[0][0] == traverse


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


def test_tiles_follow_record_and_stop_on_unknown_ramp(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import tiles
    site = tmp_path / 'site'
    (site / 'layers').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('ortho', 'hillshade', 'slope', 'elevation'):
        record = {'tile_grid': {'origin_m': [0, 100], 'resolutions_m': [32, 2], 'tile_size_px': 256, 'format': 'png'}, 'legend': {'stops': 'TODO(verify)'}}
        (site / 'layers' / f'{name}.json').write_text(json.dumps(record))
    rendered = []
    monkeypatch.setattr(tiles, 'render_tiles', lambda *args, **kwargs: rendered.append((args, kwargs)))
    with pytest.raises(ValueError, match='elevation.*colour ramp'):
        runner._run_step('tiles', tmp_path, site, tmp_path / 'work', tmp_path / 'out')
    assert [args[1] for args, _ in rendered] == ['ortho', 'hillshade', 'slope']
    assert rendered[0][0][3] == [32, 2]
    assert rendered[1][1]['hillshade']
    assert rendered[2][1]['data_encoded']


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


def test_skip_unstyled_optional_and_manifest_exclusion(tmp_path, monkeypatch, capsys):
    import json
    from marswalk_pipeline import tiles, manifest
    site = tmp_path / 'site'
    (site / 'layers').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'data_version': 'v', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('ortho', 'hillshade', 'slope', 'elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab'):
        record = {'layer_id': name, 'optional': name in ('elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab'), 'tile_grid': {'origin_m': [0, 100], 'resolutions_m': [1], 'tile_size_px': 2, 'format': 'png'}}
        if name in ('elevation', 'thermal_inertia'):
            record['legend'] = {'stops': 'TODO(verify)'}
        (site / 'layers' / f'{name}.json').write_text(json.dumps(record))
    rendered, excluded = [], []
    monkeypatch.setattr(tiles, 'render_tiles', lambda *args, **kwargs: rendered.append(args[1]))
    monkeypatch.setattr(manifest, 'write_manifest', lambda *args, **kwargs: excluded.extend(kwargs['exclude_layers']))
    for step in ('tiles', 'manifest'):
        runner._run_step(step, tmp_path, site, tmp_path / 'work', tmp_path / 'out', skip_unstyled_optional=True)
    assert rendered == ['ortho', 'hillshade', 'slope']
    assert set(excluded) == {'elevation', 'thermal_inertia', 'hazard_flags', 'comm_hab'}
    warnings = capsys.readouterr().err
    assert all(name in warnings for name in excluded)
    assert 'TODO(decision)' in warnings


def test_thermal_inertia_unresolved_ramp_stops(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import tiles
    site = tmp_path / 'site'
    (site / 'layers').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('ortho', 'hillshade', 'slope', 'elevation', 'thermal_inertia'):
        legend = {'stops': 'TODO(verify)'} if name == 'thermal_inertia' else {}
        (site / 'layers' / f'{name}.json').write_text(json.dumps({'layer_id': name, 'legend': legend, 'tile_grid': {'origin_m': [0, 100], 'resolutions_m': [1], 'tile_size_px': 2, 'format': 'png'}}))
    monkeypatch.setattr(tiles, 'render_tiles', lambda *args, **kwargs: None)
    with pytest.raises(ValueError, match='thermal_inertia.*colour ramp'):
        runner._run_step('tiles', tmp_path, site, tmp_path / 'work', tmp_path / 'out')


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


def test_skip_does_not_hide_required_unstyled_layer(tmp_path, monkeypatch):
    import json
    from marswalk_pipeline import tiles
    site = tmp_path / 'site'
    (site / 'layers').mkdir(parents=True)
    (site / 'site.json').write_text(json.dumps({'site_id': 'gale_boxwork', 'aoi': {'extent_m': [0, 0, 100, 100]}}))
    for name in ('ortho', 'hillshade', 'slope', 'elevation'):
        record = {'layer_id': name, 'optional': False, 'legend': {'stops': 'TODO(verify)'} if name == 'elevation' else {}, 'tile_grid': {'origin_m': [0, 100], 'resolutions_m': [1], 'tile_size_px': 2, 'format': 'png'}}
        (site / 'layers' / f'{name}.json').write_text(json.dumps(record))
    monkeypatch.setattr(tiles, 'render_tiles', lambda *args, **kwargs: None)
    with pytest.raises(ValueError, match='elevation.*colour ramp'):
        runner._run_step('tiles', tmp_path, site, tmp_path / 'work', tmp_path / 'out', skip_unstyled_optional=True)
