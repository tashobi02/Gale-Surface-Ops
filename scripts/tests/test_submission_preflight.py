"""Tests for scripts/submission_preflight.py (T16.07, T30.03)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import submission_preflight as preflight  # noqa: E402


def _make_minimal_dist(repo: Path, html: str, recording_bytes: bytes | None = None) -> None:
    dist = repo / "apps/web/dist"
    (dist / "assets").mkdir(parents=True, exist_ok=True)
    (dist / "assets/app.js").write_text("console.log('ok');\n", encoding="utf-8")
    (dist / "index.html").write_text(html, encoding="utf-8")
    (repo / "scenarios/storm-sol4190").mkdir(parents=True, exist_ok=True)
    payload = recording_bytes if recording_bytes is not None else json.dumps(
        {"log_hash": "a" * 64, "messages": [{"type": "EVENT", "event": {"seq": 1, "kind": "EVA_ENDED"}}]}
    ).encode("utf-8")
    (repo / "scenarios/storm-sol4190/recording.json").write_bytes(payload)
    (dist / "replay").mkdir(parents=True, exist_ok=True)
    (dist / "replay/recording.json").write_bytes(payload)


def test_built_app_links_detects_missing_asset_and_unknown_route(tmp_path: Path) -> None:
    _make_minimal_dist(tmp_path, '<html><script src="./assets/missing.js"></script></html>')
    (tmp_path / "apps/web/src/ui").mkdir(parents=True, exist_ok=True)
    (tmp_path / "apps/web/src/ui/router.ts").write_text('export const ROUTES = [{ path: "planner" }];\n', encoding="utf-8")
    (tmp_path / "apps/web/src/ui/Page.tsx").write_text('<a href="#/nonexistent">bad</a>\n', encoding="utf-8")

    res = preflight.check_built_app_links(tmp_path)
    assert res.status == "FAIL"
    assert "./assets/missing.js" in res.detail
    assert "#/nonexistent" in res.detail


def test_built_app_links_passes_when_assets_and_routes_resolve(tmp_path: Path) -> None:
    _make_minimal_dist(tmp_path, '<html><script src="./assets/app.js"></script></html>')
    (tmp_path / "apps/web/src/ui").mkdir(parents=True, exist_ok=True)
    (tmp_path / "apps/web/src/ui/router.ts").write_text('export const ROUTES = [{ path: "" }, { path: "planner" }];\n', encoding="utf-8")
    (tmp_path / "apps/web/src/ui/Page.tsx").write_text('<a href="#/planner">ok</a>\n', encoding="utf-8")

    res = preflight.check_built_app_links(tmp_path)
    assert res.status == "PASS", res.detail


def test_pages_build_fails_when_dist_recording_mismatches_scenario(tmp_path: Path) -> None:
    _make_minimal_dist(tmp_path, "<html></html>")
    (tmp_path / "apps/web/dist/replay/recording.json").write_text('{"log_hash":"' + "b" * 64 + '","messages":[]}', encoding="utf-8")

    res = preflight.check_pages_build(tmp_path, skip_build=True)
    assert res.status == "FAIL"
    assert "differs" in res.detail


def test_submission_urls_form_flags_malformed_http_url_and_allows_localhost(tmp_path: Path) -> None:
    (tmp_path / "LICENSE").write_text("Apache License 2.0\n", encoding="utf-8")
    (tmp_path / "docs/ops").mkdir(parents=True, exist_ok=True)
    (tmp_path / "README.md").write_text(
        "http://localhost:8080/#/ http://insecure.example.com https://www.youtube.com/watch?v=abc https://github.com/tashobi02/CheesySpace-NasaSpaceAppChallenge\n",
        encoding="utf-8",
    )
    (tmp_path / "docs/ops/submission-checklist.md").write_text("https://www.spaceappschallenge.org/\n", encoding="utf-8")

    res = preflight.check_submission_urls_form(tmp_path)
    assert res.status == "FAIL"
    assert "http://insecure.example.com" in res.detail
    assert "localhost" not in res.detail
