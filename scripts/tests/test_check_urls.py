"""scripts/check_urls.py: reachability of the URLs in DataSource records and Markdown notes (backend package 22; BD-29, BD-134).

Pipeline-stage tool (internet is allowed there, never at runtime). Rules fixed here (decided by the orchestrator (Claude)
under Sadman Shaharier Mahim's authority, 12 Nov 2026, BD-134):
- URLs come from the `url` field of JSON records (those with a `source_id`) and from `<https://...>` and `](https://...)` in
  Markdown; HEAD first, GET when HEAD is refused; redirects are followed; the status printed is the final one;
- 2xx and 3xx are fine; a network failure (no answer) is never recorded as a statement about the page and exits 1;
- a 4xx or 5xx for a record's `url` is recorded with `--record-unreachable`, as the sentence
  "Unreachable on <date>: HTTP <code> at <url>." appended once to its `accuracy_note` (never dropped silently); a record
  that carries that sentence for its URL is handled and exits 0; a bad URL in a Markdown file always exits 1;
- `--report FILE` writes every URL with its status and the date checked as JSON.
"""
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'check_urls.py'


class Site:
    def __init__(self):
        self.hits = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def handle_any(self, method):
                outer.hits.append((method, self.path))
                if self.path == '/ok':
                    code = 200
                elif self.path == '/redirect':
                    self.send_response(302)
                    self.send_header('Location', '/ok')
                    self.end_headers()
                    return
                elif self.path == '/nohead':
                    code = 405 if method == 'HEAD' else 200
                elif self.path == '/gone':
                    code = 404
                elif self.path == '/boom':
                    code = 500
                else:
                    code = 404
                self.send_response(code)
                self.send_header('Content-Length', '2')
                self.end_headers()
                if method != 'HEAD':
                    self.wfile.write(b'ok')

            def do_HEAD(self):
                self.handle_any('HEAD')

            def do_GET(self):
                self.handle_any('GET')

            def log_message(self, *a):
                pass

        self.httpd = HTTPServer(('127.0.0.1', 0), H)
        self.base = f'http://127.0.0.1:{self.httpd.server_port}'
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), '--date', '2026-11-12', *map(str, args)], capture_output=True, text=True, timeout=60)


def record(path, url, **extra):
    path.write_text(json.dumps({'source_id': path.stem, 'title': 't', 'url': url, **extra}, indent=2) + '\n')
    return path


def test_two_xx_and_three_xx_are_fine_and_listed(tmp_path):
    s = Site()
    try:
        record(tmp_path / 'a.json', f'{s.base}/ok')
        record(tmp_path / 'b.json', f'{s.base}/redirect')
        r = run(tmp_path)
    finally:
        s.close()
    assert r.returncode == 0, r.stdout + r.stderr
    assert '200' in r.stdout and '/ok' in r.stdout
    assert 'a.json' in r.stdout


def test_head_refused_falls_back_to_get(tmp_path):
    s = Site()
    try:
        record(tmp_path / 'a.json', f'{s.base}/nohead')
        r = run(tmp_path)
    finally:
        s.close()
    assert r.returncode == 0, r.stdout + r.stderr
    assert [m for m, p in s.hits if p == '/nohead'] == ['HEAD', 'GET']


def test_a_404_in_a_record_exits_1_until_it_is_recorded(tmp_path):
    s = Site()
    try:
        rec = record(tmp_path / 'a.json', f'{s.base}/gone', accuracy_note='Existing note.')
        r = run(tmp_path)
        assert r.returncode == 1
        assert '404' in r.stdout
        assert json.loads(rec.read_text())['accuracy_note'] == 'Existing note.'  # nothing written without the flag
        r = run('--record-unreachable', tmp_path)
        assert r.returncode == 0, r.stdout + r.stderr
        note = json.loads(rec.read_text())['accuracy_note']
        assert note == f'Existing note. Unreachable on 2026-11-12: HTTP 404 at {s.base}/gone.'
        r = run('--record-unreachable', tmp_path)  # idempotent
        assert json.loads(rec.read_text())['accuracy_note'] == note
        r = run(tmp_path)  # a recorded record is handled
        assert r.returncode == 0
    finally:
        s.close()


def test_a_record_without_a_note_gets_one(tmp_path):
    s = Site()
    try:
        rec = record(tmp_path / 'a.json', f'{s.base}/boom')
        r = run('--record-unreachable', tmp_path)
    finally:
        s.close()
    assert r.returncode == 0
    assert json.loads(rec.read_text())['accuracy_note'] == f'Unreachable on 2026-11-12: HTTP 500 at {s.base}/boom.'


def test_a_note_for_another_url_does_not_count(tmp_path):
    s = Site()
    try:
        record(tmp_path / 'a.json', f'{s.base}/gone', accuracy_note='Unreachable on 2026-11-01: HTTP 404 at https://example.test/old.')
        r = run(tmp_path)
    finally:
        s.close()
    assert r.returncode == 1


def test_a_network_failure_is_never_recorded(tmp_path):
    rec = record(tmp_path / 'a.json', 'http://127.0.0.1:9/nothing-listens-here')
    before = rec.read_text()
    r = run('--record-unreachable', tmp_path)
    assert r.returncode == 1
    assert 'no answer' in r.stdout.lower() or 'error' in r.stdout.lower()
    assert rec.read_text() == before


def test_markdown_urls_are_checked_and_a_bad_one_exits_1_even_with_record(tmp_path):
    s = Site()
    try:
        md = tmp_path / 'note.md'
        md.write_text(f'See <{s.base}/ok> and [the page]({s.base}/redirect) and [gone]({s.base}/gone), also `no link here`.\n')
        r = run('--record-unreachable', md)
    finally:
        s.close()
    assert r.returncode == 1
    assert '/gone' in r.stdout and '404' in r.stdout
    assert md.read_text().count('Unreachable') == 0


def test_relative_links_and_non_http_links_are_ignored(tmp_path):
    md = tmp_path / 'note.md'
    md.write_text('[a](other.md) [b](#anchor) <mailto:x@example.test> [c](ftp://example.test/x)\n')
    r = run(md)
    assert r.returncode == 0
    assert '0 URLs' in r.stdout


def test_json_without_a_source_id_is_not_a_record(tmp_path):
    (tmp_path / 'x.json').write_text(json.dumps({'url': 'http://127.0.0.1:9/never'}))
    r = run(tmp_path)
    assert r.returncode == 0
    assert '0 URLs' in r.stdout


def test_report_lists_every_url_once_with_status_and_date(tmp_path):
    s = Site()
    try:
        record(tmp_path / 'a.json', f'{s.base}/ok')
        (tmp_path / 'n.md').write_text(f'<{s.base}/ok> <{s.base}/gone>\n')
        out = tmp_path / 'report.json'
        r = run('--report', out, tmp_path / 'a.json', tmp_path / 'n.md')
    finally:
        s.close()
    assert r.returncode == 1
    report = json.loads(out.read_text())
    by = {e['url']: e for e in report}
    assert set(by) == {f'{s.base}/ok', f'{s.base}/gone'}
    assert by[f'{s.base}/ok']['status'] == 200 and by[f'{s.base}/gone']['status'] == 404
    assert all(e['checked'] == '2026-11-12' for e in report)
    assert sum(1 for m, p in s.hits if p == '/ok') == 1  # one request per unique URL
