"""scripts/build_credits.py: docs/ops/credits.md is rebuilt from the records, never typed by hand (backend package 22; T04.06, BD-13, BD-134).

The generated block lists every DataSource record (credit, licence and URL exactly as the record has them, with the layers,
environment constants and POIs that cite it) and every POI image (credit, sol, camera, page, and the file name, size and
SHA-256 of its entry in pipeline/sources.lock.json). A record with an empty licence or credit, or a marker, is an error
(BD-13: no open licence field); a POI image with no lock entry is an error (BD-14).
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_credits  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts' / 'build_credits.py'
BEGIN, END = '<!-- credits:generated:begin -->', '<!-- credits:generated:end -->'
OPEN = 'TODO' + '(verify)'  # built so this file holds no marker


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')


def record(sid, **kw):
    base = {'source_id': sid, 'title': f'Title of {sid}', 'publisher': 'Pub', 'authors': 'A. Author', 'missions': [], 'instruments': [],
            'version': 'v1', 'url': f'https://example.test/{sid}', 'credit': f'Credit for {sid}', 'licence': f'Licence of {sid}', 'accessed': '2026-11-12'}
    base.update(kw)
    return base


def tree(tmp_path, records=None, pois=None, lock_entries=None, extra_layers=None):
    site = tmp_path / 'pipeline/sites/gale_boxwork'
    for r in records if records is not None else [record('b-source'), record('a-source')]:
        put(site / 'sources' / f"{r['source_id']}.json", r)
    put(site / 'layers/elevation.json', {'layer_id': 'elevation', 'source_ids': ['a-source']})
    for k, v in (extra_layers or {}).items():
        put(site / 'layers' / f'{k}.json', v)
    put(site / 'env_constants/rad-x.json', {'const_id': 'rad-x', 'source_id': 'b-source'})
    put(tmp_path / 'scenarios/storm-sol4190/param_sets/ps-x.json', {'param_set_id': 'ps-x', 'source_ids': ['a-source']})
    put(tmp_path / 'scenarios/storm-sol4190/param_sets/ps-none.json', {'param_set_id': 'ps-none', 'source_ids': []})
    for p in pois if pois is not None else []:
        put(site / 'pois' / f"{p['poi_id']}.json", p)
    put(tmp_path / 'pipeline/sources.lock.json', {'sources': lock_entries if lock_entries is not None else []})
    credits = tmp_path / 'docs/ops/credits.md'
    credits.parent.mkdir(parents=True, exist_ok=True)
    credits.write_text(f'# Credits\n\nhand-written intro\n\n{BEGIN}\nold\n{END}\n\nhand-written outro\n', encoding='utf-8')
    return credits


def poi(pid='poi-x', **kw):
    base = {'poi_id': pid, 'name': 'X', 'image_asset': 'img-x', 'image_credit': 'NASA/JPL-Caltech', 'image_source_url': 'https://example.test/page',
            'image_sol': 4650, 'image_date': '2025-09-05', 'image_camera': 'Navcam', 'evidence': [{'text': 't', 'source_id': 'b-source'}]}
    base.update(kw)
    return base


def lock_img(sid='img-x', fname='poi-x.jpg'):
    return {'source_id': sid, 'url': 'https://example.test/i.jpg', 'size': 123, 'sha256': 'ab' * 32, 'dir': 'images', 'filename': fname}


def run(tmp_path, *args):
    return subprocess.run([sys.executable, str(SCRIPT), '--root', str(tmp_path), *args], capture_output=True, text=True)


def generated(credits):
    text = credits.read_text(encoding='utf-8')
    return text.split(BEGIN)[1].split(END)[0]


def test_block_lists_records_sorted_with_fields_verbatim_and_users(tmp_path):
    credits = tree(tmp_path)
    r = run(tmp_path)
    assert r.returncode == 0, r.stderr
    block = generated(credits)
    assert block.index('`a-source`') < block.index('`b-source`')
    assert 'Credit for a-source' in block and 'Licence of b-source' in block
    assert '<https://example.test/a-source>' in block
    rows = {line.split('|')[1].strip(): line for line in block.splitlines() if line.startswith('| `')}
    assert 'layer `elevation`' in rows['`a-source`']
    assert 'param set `ps-x`' in rows['`a-source`'] and 'ps-none' not in block
    assert 'env constant `rad-x`' in rows['`b-source`']
    text = credits.read_text(encoding='utf-8')
    assert text.startswith('# Credits\n\nhand-written intro') and text.rstrip().endswith('hand-written outro')


def test_a_poi_cites_a_record_as_evidence_and_its_image_gets_a_row_with_the_locked_digest(tmp_path):
    credits = tree(tmp_path, pois=[poi()], lock_entries=[lock_img()])
    assert run(tmp_path).returncode == 0
    block = generated(credits)
    row_b = [line for line in block.splitlines() if line.startswith('| `b-source`')][0]
    assert 'poi `poi-x`' in row_b
    img = [line for line in block.splitlines() if line.startswith('| `poi-x`')][0]
    for needle in ('Navcam', '4650', '2025-09-05', 'NASA/JPL-Caltech', '<https://example.test/page>', '`img-x`', 'images/poi-x.jpg', '123', 'ab' * 32):
        assert needle in img, needle


def test_a_poi_without_an_image_has_no_image_row(tmp_path):
    credits = tree(tmp_path, pois=[poi(image_asset=None)])
    assert run(tmp_path).returncode == 0
    assert '| `poi-x` |' not in generated(credits)


def test_a_poi_image_without_a_lock_entry_is_an_error(tmp_path):
    credits = tree(tmp_path, pois=[poi()], lock_entries=[])
    r = run(tmp_path)
    assert r.returncode == 1
    assert 'img-x' in r.stderr
    assert generated(credits) == '\nold\n'


@pytest.mark.parametrize('field,value', [('licence', ''), ('credit', ''), ('licence', OPEN), ('credit', f'text {OPEN}'), ('publisher', OPEN)])
def test_an_open_or_empty_field_is_an_error_naming_the_record(tmp_path, field, value):
    credits = tree(tmp_path, records=[record('a-source', **{field: value}), record('b-source')])
    r = run(tmp_path)
    assert r.returncode == 1
    assert 'a-source' in r.stderr and field in r.stderr
    assert generated(credits) == '\nold\n'


def test_cell_text_cannot_break_the_table(tmp_path):
    credits = tree(tmp_path, records=[record('a-source', credit='A | B\nC'), record('b-source')])
    assert run(tmp_path).returncode == 0
    row = [line for line in generated(credits).splitlines() if line.startswith('| `a-source`')][0]
    assert 'A \\| B C' in row
    assert row.count(' | ') >= 6


def test_a_url_inside_a_cell_is_wrapped_so_markdown_lint_accepts_it(tmp_path):
    credits = tree(tmp_path, records=[record('a-source', licence='Used under the policy (https://example.test/policy/), checked today; see also https://example.test/two.'), record('b-source')])
    assert run(tmp_path).returncode == 0
    row = [line for line in generated(credits).splitlines() if line.startswith('| `a-source`')][0]
    assert '(<https://example.test/policy/>)' in row
    assert 'see also <https://example.test/two>.' in row
    assert '<<' not in row


def test_missing_markers_is_an_error_and_the_file_is_untouched(tmp_path):
    credits = tree(tmp_path)
    credits.write_text('# Credits\n\nno markers\n', encoding='utf-8')
    r = run(tmp_path)
    assert r.returncode == 1
    assert 'credits:generated' in r.stderr
    assert credits.read_text(encoding='utf-8') == '# Credits\n\nno markers\n'


def test_check_mode_flags_a_stale_block_and_passes_a_fresh_one_without_writing(tmp_path):
    credits = tree(tmp_path)
    before = credits.read_text(encoding='utf-8')
    r = run(tmp_path, '--check')
    assert r.returncode == 1 and 'stale' in r.stderr
    assert credits.read_text(encoding='utf-8') == before
    assert run(tmp_path).returncode == 0
    fresh = credits.read_text(encoding='utf-8')
    assert run(tmp_path, '--check').returncode == 0
    assert run(tmp_path).returncode == 0 and credits.read_text(encoding='utf-8') == fresh  # idempotent


def test_a_changed_record_makes_the_block_stale(tmp_path):
    tree(tmp_path)
    assert run(tmp_path).returncode == 0
    p = tmp_path / 'pipeline/sites/gale_boxwork/sources/a-source.json'
    d = json.loads(p.read_text())
    d['licence'] = 'Another licence'
    p.write_text(json.dumps(d))
    assert run(tmp_path, '--check').returncode == 1


def test_the_committed_credits_are_current_and_complete():
    r = subprocess.run([sys.executable, str(SCRIPT), '--check'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    text = (ROOT / 'docs/ops/credits.md').read_text(encoding='utf-8')
    assert OPEN not in text and 'TODO' + '(decision)' not in text
    for f in sorted((ROOT / 'pipeline/sites/gale_boxwork/sources').glob('*.json')):
        rec = json.loads(f.read_text(encoding='utf-8'))
        assert build_credits._cell(rec['credit']) in text, rec['source_id']
        assert build_credits._cell(rec['licence']) in text, rec['source_id']
    for f in sorted((ROOT / 'pipeline/sites/gale_boxwork/pois').glob('*.json')):
        assert f'`{json.loads(f.read_text(encoding="utf-8"))["poi_id"]}`' in text
