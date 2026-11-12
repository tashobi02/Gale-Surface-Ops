"""scripts/check_todos.py: lists every TODO(decision)/TODO(verify) in the backend scope (decisions-index.md)."""
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'check_todos.py'
D, V = 'TODO(' + 'decision)', 'TODO(' + 'verify)'  # built so this file holds no marker


def make(root, rel, text):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def run(root, *args):
    return subprocess.run([sys.executable, str(SCRIPT), '--root', str(root), *args], capture_output=True, text=True)


def test_clean_tree_exits_zero(tmp_path):
    make(tmp_path, 'apps/hab-core/src/a.ts', 'export const a = 1;\n')
    r = run(tmp_path)
    assert r.returncode == 0
    assert '0 markers' in r.stdout


def test_lists_each_marker_with_file_line_and_kind(tmp_path):
    make(tmp_path, 'apps/hab-core/src/a.ts', f'ok\n// {D} pick one\n// {V} check\n')
    make(tmp_path, 'packages/compute/tests/b.test.ts', f'// {V}\n')
    make(tmp_path, 'pipeline/src/x.py', f'# {D}\n')
    r = run(tmp_path)
    assert r.returncode == 1
    assert 'apps/hab-core/src/a.ts:2' in r.stdout
    assert 'apps/hab-core/src/a.ts:3' in r.stdout
    assert 'packages/compute/tests/b.test.ts:1' in r.stdout
    assert 'pipeline/src/x.py:1' in r.stdout
    assert '4 markers' in r.stdout


def test_task_files_in_scope_are_scanned_and_others_are_not(tmp_path):
    make(tmp_path, 'docs/tasks/TASK-05b_compute-v2.md', f'{D}\n')
    make(tmp_path, 'docs/tasks/TASK-07_app-shell.md', f'{D}\n')  # frontend task, out of scope
    make(tmp_path, 'apps/web/src/a.ts', f'// {D}\n')  # frontend files, out of scope
    make(tmp_path, 'scripts/x.py', f'{D}\n')
    r = run(tmp_path)
    assert r.returncode == 1
    assert 'TASK-05b' in r.stdout
    assert 'TASK-07' not in r.stdout
    assert 'apps/web' not in r.stdout
    assert 'scripts/x.py' not in r.stdout
    assert '1 markers' in r.stdout


def test_scope_covers_scenarios_schemas_data_sites_and_pipeline_dirs(tmp_path):
    for rel in ('scenarios/s/scenario.json', 'schemas/a.json', 'data/sites/s/site.json', 'pipeline/spice/k.json',
                'pipeline/cache/donki/r.json', 'pipeline/sites/s/site.json', 'packages/protocol/src/p.ts',
                'apps/hab-core/scripts/d.ts', 'apps/hab-core/tests/t.ts'):
        make(tmp_path, rel, f'{V}\n')
    r = run(tmp_path)
    assert r.returncode == 1
    assert '9 markers' in r.stdout


def test_skips_binary_symlinked_and_dependency_folders(tmp_path):
    (tmp_path / 'data/sites/s').mkdir(parents=True)
    (tmp_path / 'data/sites/s/tile.bin').write_bytes(b'\xff\xfe\x00' + D.encode())
    make(tmp_path, 'apps/hab-core/node_modules/m/i.js', f'{D}\n')
    make(tmp_path, 'pipeline/src/__pycache__/x.py', f'{D}\n')
    external = tmp_path.parent / (tmp_path.name + '-ext')
    make(external, 'a.txt', f'{D}\n')
    (tmp_path / 'data/sites/s/grid').symlink_to(external)
    r = run(tmp_path)
    assert r.returncode == 0, r.stdout


def test_allow_file_excludes_it_from_the_count(tmp_path):
    make(tmp_path, 'pipeline/src/x.py', f'# {D}\n')
    make(tmp_path, 'pipeline/src/y.py', f'# {V}\n')
    r = run(tmp_path, '--allow', 'pipeline/src/x.py')
    assert r.returncode == 1
    assert '1 markers' in r.stdout
    assert 'x.py' not in r.stdout.split('markers')[0] or 'y.py' in r.stdout
    assert run(tmp_path, '--allow', 'pipeline/src/x.py', '--allow', 'pipeline/src/y.py').returncode == 0
