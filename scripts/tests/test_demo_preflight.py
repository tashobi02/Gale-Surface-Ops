"""scripts/demo-preflight.sh: the preflight block of docs/ops/demo-kit.md (T28.04; BD-02, BD-133).

The script runs against a throw-away root with a stub `make` (DEMO_ROOT, MAKE) and a local stub of GET /api/health
(HAB_URL), so the test needs no conda, no build and no real scenario. A step whose input is absent is skipped with its
reason on stdout (exit 0); a step that runs and fails exits 1.
"""
import json
import os
import stat
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'demo-preflight.sh'

STUB_MAKE = """#!/bin/bash
echo "make $*" >> "$STUB_LOG"
case "$1" in
  check-env) [ "${STUB_FAIL:-}" = check-env ] && { echo "env broken" >&2; exit 1; }; echo env-ok ;;
  validate) [ "${STUB_FAIL:-}" = validate ] && { echo "bad manifest" >&2; exit 1; }; echo validated ;;
  -s) # make -s replay: a counter makes the second run differ when asked
    n=$(cat "$STUB_COUNT" 2>/dev/null || echo 0); echo $((n + 1)) > "$STUB_COUNT"
    if [ "${STUB_FAIL:-}" = replay ] && [ "$n" -ge 1 ]; then echo "$(printf 'b%.0s' $(seq 64))"; else echo "$(printf 'a%.0s' $(seq 64))"; fi ;;
  *) echo "unexpected make $*" >&2; exit 2 ;;
esac
"""


def make_root(tmp_path, manifest=False, scenario=False):
    root = tmp_path / 'root'
    (root / 'data/sites/gale_boxwork').mkdir(parents=True)
    (root / 'scenarios/storm-sol4190').mkdir(parents=True)
    if manifest:
        (root / 'data/sites/gale_boxwork/site-manifest.json').write_text('{}')
    if scenario:
        (root / 'scenarios/storm-sol4190/scenario.json').write_text('{}')
    stub = tmp_path / 'make'
    stub.write_text(STUB_MAKE)
    stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
    return root, stub


class Health:
    """GET /api/health on an ephemeral port answering {"status": <status>}."""

    def __init__(self, status):
        body = json.dumps({'status': status}).encode()

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                code = 200 if self.path == '/api/health' else 404
                self.send_response(code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(('127.0.0.1', 0), H)
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def run(tmp_path, root, stub, health_url=None, fail=None):
    env = {**os.environ, 'DEMO_ROOT': str(root), 'MAKE': str(stub), 'STUB_LOG': str(tmp_path / 'log'),
           'STUB_COUNT': str(tmp_path / 'count'), 'HAB_URL': health_url or 'http://127.0.0.1:9', 'HAB_START': '0'}
    if fail:
        env['STUB_FAIL'] = fail
    return subprocess.run(['bash', str(SCRIPT)], capture_output=True, text=True, env=env, timeout=60)


def test_absent_inputs_are_skipped_with_a_printed_reason(tmp_path):
    root, stub = make_root(tmp_path)
    r = run(tmp_path, root, stub)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'PASS check-env' in r.stdout
    assert 'SKIP validate' in r.stdout and 'site-manifest.json' in r.stdout
    assert 'SKIP replay' in r.stdout and 'scenario.json' in r.stdout
    assert 'SKIP health' in r.stdout
    assert 'make validate' not in (tmp_path / 'log').read_text()


def test_everything_present_passes_and_replay_runs_twice(tmp_path):
    root, stub = make_root(tmp_path, manifest=True, scenario=True)
    h = Health('ok')
    try:
        r = run(tmp_path, root, stub, h.url)
    finally:
        h.close()
    assert r.returncode == 0, r.stdout + r.stderr
    for step in ('check-env', 'validate', 'replay', 'health'):
        assert f'PASS {step}' in r.stdout, r.stdout
    log = (tmp_path / 'log').read_text().splitlines()
    assert log.count('make -s replay') == 2
    assert 'make validate SITE=gale_boxwork' in log


def test_two_replays_that_differ_fail(tmp_path):
    root, stub = make_root(tmp_path, scenario=True)
    r = run(tmp_path, root, stub, fail='replay')
    assert r.returncode == 1
    assert 'FAIL replay' in r.stdout


def test_a_replay_that_prints_no_hash_fails(tmp_path):
    root, stub = make_root(tmp_path, scenario=True)
    stub.write_text(STUB_MAKE.replace('echo "$(printf \'a%.0s\' $(seq 64))"', 'echo not-a-hash'))
    r = run(tmp_path, root, stub)
    assert r.returncode == 1
    assert 'FAIL replay' in r.stdout


def test_a_failing_validate_fails(tmp_path):
    root, stub = make_root(tmp_path, manifest=True)
    r = run(tmp_path, root, stub, fail='validate')
    assert r.returncode == 1
    assert 'FAIL validate' in r.stdout


def test_a_failing_env_check_fails_and_stops(tmp_path):
    root, stub = make_root(tmp_path, manifest=True, scenario=True)
    r = run(tmp_path, root, stub, fail='check-env')
    assert r.returncode == 1
    assert 'FAIL check-env' in r.stdout
    assert 'make validate' not in (tmp_path / 'log').read_text()


def test_a_server_without_a_session_fails_the_health_step(tmp_path):
    root, stub = make_root(tmp_path)
    h = Health('no_session')
    try:
        r = run(tmp_path, root, stub, h.url)
    finally:
        h.close()
    assert r.returncode == 1
    assert 'FAIL health' in r.stdout
