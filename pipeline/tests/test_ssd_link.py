"""T14.01 scripts/ssd-link.sh: BD-12 layout, idempotent, never deletes a link target.

Needs no geo stack. The script is run against a temporary SSD and a temporary copy of the repo skeleton.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / 'scripts' / 'ssd-link.sh'
SITE_DIRS = ('tiles', 'grid', 'images')


@pytest.fixture
def skeleton(tmp_path):
    """A repo skeleton with the script copied in, and an SSD with the data folders."""
    root = tmp_path / 'repo'
    (root / 'scripts').mkdir(parents=True)
    if SCRIPT.exists():
        shutil.copy(SCRIPT, root / 'scripts' / 'ssd-link.sh')
    (root / 'pipeline' / 'work').mkdir(parents=True)
    (root / 'pipeline' / 'work' / '.gitkeep').write_text('')
    (root / 'data' / 'sites' / 'gale_boxwork').mkdir(parents=True)
    (root / 'data' / 'sites' / 'gale_boxwork' / 'README.md').write_text('tracked\n')
    ssd = tmp_path / 'ssd'
    for name in ('dem', 'ortho', 'rad'):
        (ssd / 'work' / name).mkdir(parents=True)
        (ssd / 'work' / name / 'data.bin').write_text(name)
    for name in SITE_DIRS:
        (ssd / 'sites' / 'gale_boxwork' / name).mkdir(parents=True)
        (ssd / 'sites' / 'gale_boxwork' / name / 'x.bin').write_text(name)
    return root, ssd


def run(root, *args):
    return subprocess.run(['bash', str(root / 'scripts' / 'ssd-link.sh'), *args],
                          capture_output=True, text=True)


def snapshot(root):
    """Every path under the repo skeleton with its kind and link target."""
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for n in dirnames + filenames:
            p = Path(dirpath) / n
            out[str(p.relative_to(root))] = os.readlink(p) if p.is_symlink() else ('dir' if p.is_dir() else 'file')
    return out


def test_script_exists_and_is_bash():
    assert SCRIPT.exists()
    assert SCRIPT.read_text().startswith('#!/bin/bash')


def test_links_every_data_folder_to_the_ssd_and_keeps_tracked_files(skeleton):
    root, ssd = skeleton
    r = run(root, str(ssd))
    assert r.returncode == 0, r.stderr
    for name in ('dem', 'ortho', 'rad'):
        link = root / 'pipeline' / 'work' / name
        assert link.is_symlink()
        assert Path(os.readlink(link)) == ssd / 'work' / name
        assert (link / 'data.bin').read_text() == name
    for name in SITE_DIRS:
        link = root / 'data' / 'sites' / 'gale_boxwork' / name
        assert link.is_symlink()
        assert Path(os.readlink(link)) == ssd / 'sites' / 'gale_boxwork' / name
    assert (root / 'pipeline' / 'work' / '.gitkeep').is_file()
    assert not (root / 'pipeline' / 'work').is_symlink()
    assert (root / 'data' / 'sites' / 'gale_boxwork' / 'README.md').read_text() == 'tracked\n'
    assert r.stdout.count('->') >= 6  # prints every link it makes


def test_the_pipeline_output_folders_exist_on_the_ssd_after_a_run(skeleton):
    root, ssd = skeleton
    assert run(root, str(ssd)).returncode == 0
    for name in ('dem', 'ortho', 'ti', 'images', 'spice', 'rad', 'donki', 'traverse', 'runs'):
        assert (root / 'pipeline' / 'work' / name).is_symlink(), name
        assert (ssd / 'work' / name).is_dir(), name


def test_second_run_changes_nothing(skeleton):
    root, ssd = skeleton
    assert run(root, str(ssd)).returncode == 0
    before, ssd_before = snapshot(root), snapshot(ssd)
    r = run(root, str(ssd))
    assert r.returncode == 0, r.stderr
    assert snapshot(root) == before
    assert snapshot(ssd) == ssd_before
    assert not [l for l in r.stdout.splitlines() if l.startswith('link ')]
    assert [l for l in r.stdout.splitlines() if l.startswith('ok ')]


def test_a_pipeline_work_symlink_is_replaced_by_a_directory_without_touching_its_target(skeleton, tmp_path):
    root, ssd = skeleton
    target = tmp_path / 'other-clone-work'
    target.mkdir()
    (target / 'precious.txt').write_text('keep')
    (target / 'dem').mkdir()
    shutil.rmtree(root / 'pipeline' / 'work')
    (root / 'pipeline' / 'work').symlink_to(target)
    r = run(root, str(ssd))
    assert r.returncode == 0, r.stderr
    work = root / 'pipeline' / 'work'
    assert work.is_dir() and not work.is_symlink()
    assert (work / '.gitkeep').is_file()
    assert (work / 'dem').is_symlink()
    assert sorted(p.name for p in target.iterdir()) == ['dem', 'precious.txt']
    assert (target / 'precious.txt').read_text() == 'keep'


def test_a_non_empty_real_folder_is_left_alone_and_reported(skeleton):
    root, ssd = skeleton
    dem = root / 'pipeline' / 'work' / 'dem'
    dem.mkdir()
    (dem / 'mine.tif').write_text('local data')
    r = run(root, str(ssd))
    assert r.returncode != 0
    assert (dem / 'mine.tif').read_text() == 'local data'
    assert not dem.is_symlink()
    assert 'dem' in r.stderr


def test_an_empty_real_folder_is_replaced_by_the_link(skeleton):
    root, ssd = skeleton
    (root / 'pipeline' / 'work' / 'dem').mkdir()
    assert run(root, str(ssd)).returncode == 0
    assert (root / 'pipeline' / 'work' / 'dem').is_symlink()


def test_a_link_to_another_place_is_repointed_and_the_old_target_survives(skeleton, tmp_path):
    root, ssd = skeleton
    old = tmp_path / 'old-dem'
    old.mkdir()
    (old / 'f').write_text('old')
    (root / 'pipeline' / 'work' / 'dem').symlink_to(old)
    assert run(root, str(ssd)).returncode == 0
    assert Path(os.readlink(root / 'pipeline' / 'work' / 'dem')) == ssd / 'work' / 'dem'
    assert (old / 'f').read_text() == 'old'


@pytest.mark.parametrize('arg', [None, ''])
def test_refuses_an_empty_or_missing_ssd_argument(skeleton, arg):
    root, _ = skeleton
    before = snapshot(root)
    r = run(root) if arg is None else run(root, arg)
    assert r.returncode != 0
    assert 'SSD' in r.stderr
    assert snapshot(root) == before


def test_refuses_an_ssd_that_is_not_a_directory(skeleton, tmp_path):
    root, _ = skeleton
    f = tmp_path / 'file'
    f.write_text('x')
    before = snapshot(root)
    assert run(root, str(f)).returncode != 0
    assert run(root, str(tmp_path / 'missing')).returncode != 0
    assert snapshot(root) == before


def test_extra_ssd_work_folders_are_linked_too(skeleton):
    root, ssd = skeleton
    (ssd / 'work' / 'rems').mkdir()
    assert run(root, str(ssd)).returncode == 0
    assert (root / 'pipeline' / 'work' / 'rems').is_symlink()


def test_a_link_made_with_a_trailing_slash_counts_as_already_correct(skeleton):
    root, ssd = skeleton
    (root / 'pipeline' / 'work' / 'dem').symlink_to(str(ssd / 'work' / 'dem') + '/')
    r = run(root, str(ssd))
    assert r.returncode == 0
    assert os.readlink(root / 'pipeline' / 'work' / 'dem').endswith('/')
    assert not [l for l in r.stdout.splitlines() if l.startswith('link pipeline/work/dem')]
