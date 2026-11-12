"""T06.02: the committed F6 file is exactly what the generator writes with the pinned `marstime` (BD-55, BD-122).

Runs the generator in a child process against a temporary copy of the repo paths so the real `marstime` is used and
the committed file is never rewritten. Skipped where `marstime` is not installed (CI without the pipeline
environment); `make test` runs it in the conda environment.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("marstime")

ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "pipeline" / "tests" / "fixtures" / "make_mars24_reference.py"
COMMITTED = ROOT / "apps" / "web" / "tests" / "fixtures" / "mars24-reference.json"
PIN = re.search(r"marstime==([\w.]+)", (ROOT / "pipeline" / "environment.yml").read_text()).group(1)

CHILD = """
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('gen', sys.argv[1])
gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)
sys.stdout.write(json.dumps(gen.build_fixture(), indent=2, sort_keys=False) + '\\n')
"""


def generate() -> bytes:
    r = subprocess.run([sys.executable, '-I', '-c', CHILD, str(GENERATOR)], capture_output=True, check=True)
    return r.stdout


def test_regenerating_gives_the_committed_bytes():
    assert generate() == COMMITTED.read_bytes()


def test_two_runs_give_identical_bytes():
    assert generate() == generate()


def test_the_fixture_records_the_pinned_marstime_version_and_a_sol_per_record():
    data = json.loads(COMMITTED.read_text())
    assert data['marstime_version'] == PIN
    assert len(data['records']) >= 3
    assert all(isinstance(r['msl_sol'], int) for r in data['records'])
    assert all('Sol 4190' not in r['description'] for r in data['records'])
