#!/usr/bin/env python3
"""Single pre-flight verification script for T16.07, T30.02, T30.03 (and T16.04 readiness).

Runs all local, mechanical submission checks without publishing, pushing, uploading,
or claiming any score, and prints a single PASS / FAIL / NOT_VERIFIED table.

Usage:
  python3 scripts/submission_preflight.py [--port 8373] [--skip-build] [--skip-e2e] [--require-online] [--json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

SUBMISSION_DOCS = (
    Path("README.md"),
    Path("docs/ops/submission-checklist.md"),
    Path("docs/ops/submit-now.md"),
    Path("docs/ops/project-page.md"),
    Path("docs/ops/hosting.md"),
)

URL_RE = re.compile(r"https?://[^\s<>)\"`']+")
HASH_HREF_RE = re.compile(r'href\s*=\s*["\'](#/[^"\'${}]+)["\']')
ROUTER_PATH_RE = re.compile(r'path:\s*"([^"]*)"')
SECRET_PATTERNS = (
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("github_pat", re.compile(r"\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
)


@dataclass
class CheckResult:
    check: str
    status: str  # PASS | FAIL | NOT_VERIFIED
    detail: str


class _HtmlAssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, val in attrs:
            if key in {"src", "href"} and val:
                self.assets.append(val)


def _run(cmd: list[str], cwd: Path, env: dict[str, str] | None = None, timeout: int = 240) -> subprocess.CompletedProcess[str]:
    merged_env = {**os.environ, **(env or {})}
    return subprocess.run(cmd, cwd=cwd, env=merged_env, text=True, capture_output=True, timeout=timeout)


def check_docs_links(repo: Path) -> CheckResult:
    proc = _run([sys.executable, "scripts/check_links.py", "docs", "README.md", "CLAUDE.md", "AGENTS.md"], repo)
    readme = (repo / "README.md").read_text(encoding="utf-8") if (repo / "README.md").exists() else ""
    todos = len(re.findall(r"\bTODO\b", readme))
    summary = (proc.stdout.strip().splitlines() or ["no output"])[-1]
    if proc.returncode != 0 or todos > 0:
        return CheckResult("docs-links", "FAIL", f"{summary}; README TODO markers: {todos}")
    return CheckResult("docs-links", "PASS", f"{summary}; README TODO markers: 0")


def check_pages_build(repo: Path, skip_build: bool) -> CheckResult:
    workflows = sorted(p.name for p in (repo / ".github/workflows").glob("*.y*ml")) if (repo / ".github/workflows").exists() else []
    has_pages_wf = any("page" in w.lower() for w in workflows)
    wf_note = f"workflows={workflows or 'none'} (no dedicated Pages workflow; static build uses vite base='./')"
    if has_pages_wf:
        wf_note = f"workflows={workflows}"

    if not skip_build:
        build = _run(["npm", "run", "-s", "build"], repo)
        if build.returncode != 0:
            err = (build.stderr or build.stdout).strip().splitlines()[-1:] or ["build failed"]
            return CheckResult("pages-build", "FAIL", f"{err[0]}; {wf_note}")

    dist_dir = repo / "apps/web/dist"
    index_html = dist_dir / "index.html"
    dist_rec = dist_dir / "replay/recording.json"
    src_rec = repo / "scenarios/storm-sol4190/recording.json"
    if not index_html.exists():
        return CheckResult("pages-build", "FAIL", f"missing {index_html.relative_to(repo)}; {wf_note}")
    if not dist_rec.exists() or not src_rec.exists():
        return CheckResult("pages-build", "FAIL", f"missing recording.json in dist or scenarios; {wf_note}")

    dist_bytes = dist_rec.read_bytes()
    src_bytes = src_rec.read_bytes()
    if dist_bytes != src_bytes:
        return CheckResult("pages-build", "FAIL", f"dist/replay/recording.json differs from scenarios/storm-sol4190/recording.json; {wf_note}")

    rec = json.loads(dist_bytes.decode("utf-8"))
    events = [m["event"] for m in rec.get("messages", []) if m.get("type") == "EVENT" and "event" in m]
    log_hash = rec.get("log_hash", "")
    has_ended = any(e.get("kind") == "EVA_ENDED" for e in events)
    if not events or not re.fullmatch(r"[0-9a-f]{64}", log_hash) or not has_ended:
        return CheckResult("pages-build", "FAIL", f"invalid recording payload (events={len(events)}, ended={has_ended}); {wf_note}")

    sha = hashlib.sha256(dist_bytes).hexdigest()[:12]
    return CheckResult("pages-build", "PASS", f"dist built; recording.json matches ({len(events)} events, sha256:{sha}); {wf_note}")


def check_built_app_links(repo: Path) -> CheckResult:
    dist_dir = repo / "apps/web/dist"
    index_html = dist_dir / "index.html"
    if not index_html.exists():
        return CheckResult("built-app-links", "FAIL", "apps/web/dist/index.html missing (run build first)")

    parser = _HtmlAssetParser()
    html_text = index_html.read_text(encoding="utf-8")
    parser.feed(html_text)
    broken_assets: list[str] = []
    external_assets: list[str] = []
    for asset in parser.assets:
        if asset.startswith(("http://", "https://", "//")):
            external_assets.append(asset)
            continue
        clean = asset.split("?", 1)[0].split("#", 1)[0]
        rel = clean.lstrip("./") if clean.startswith("./") else clean.lstrip("/")
        if rel and not (dist_dir / rel).exists():
            broken_assets.append(asset)

    router_file = repo / "apps/web/src/ui/router.ts"
    known_paths = set(ROUTER_PATH_RE.findall(router_file.read_text(encoding="utf-8"))) | {"map"} if router_file.exists() else {""}
    invalid_routes: list[str] = []
    checked_routes = 0
    src_dir = repo / "apps/web/src"
    if src_dir.exists():
        for f in sorted(src_dir.rglob("*.tsx")):
            text = f.read_text(encoding="utf-8")
            for href in HASH_HREF_RE.findall(text):
                checked_routes += 1
                body = href[2:].split("?", 1)[0].split("#", 1)[0].strip("/")
                first_seg = body.split("/", 1)[0] if body else ""
                if first_seg not in known_paths:
                    invalid_routes.append(f"{f.relative_to(repo)}:{href}")

    if broken_assets or external_assets or invalid_routes:
        return CheckResult(
            "built-app-links",
            "FAIL",
            f"broken_assets={broken_assets}, external_assets={external_assets}, invalid_routes={invalid_routes}",
        )
    return CheckResult("built-app-links", "PASS", f"{len(parser.assets)} built HTML assets local & present; {checked_routes} static #/ routes valid")


def check_replay_e2e(repo: Path, port: int) -> CheckResult:
    env = {"E2E_SKIP_BUILD": "1", "E2E_PORT": str(port)}
    proc = _run(["npx", "playwright", "test", "-c", "apps/web/e2e/playwright.config.ts", "checks/replay.spec"], repo, env=env)
    out = proc.stdout + "\n" + proc.stderr
    summary = next((line.strip() for line in reversed(out.splitlines()) if "passed" in line or "failed" in line or "Error" in line), f"exit {proc.returncode}")
    if proc.returncode != 0:
        return CheckResult("pages-replay-e2e", "FAIL", summary)
    return CheckResult("pages-replay-e2e", "PASS", f"{summary} (port {port})")


def check_credits_unit(repo: Path) -> CheckResult:
    proc = _run(["npx", "vitest", "run", "tests/submission/credits.test.ts"], repo / "apps/web")
    credits_md = (repo / "docs/ops/credits.md").read_text(encoding="utf-8") if (repo / "docs/ops/credits.md").exists() else ""
    missing_agencies = [name for name in ("DONKI", "NAIF", "ESA SPICE") if name not in credits_md]
    summary = next((line.strip() for line in reversed(proc.stdout.splitlines()) if "Tests" in line or "passed" in line or "failed" in line), f"exit {proc.returncode}")
    if proc.returncode != 0 or missing_agencies:
        return CheckResult("credits-unit", "FAIL", f"{summary}; missing in credits.md: {missing_agencies}")
    return CheckResult("credits-unit", "PASS", f"{summary}; DONKI/NAIF/ESA SPICE verified in docs/ops/credits.md")


def check_credits_e2e(repo: Path, site: str, port: int) -> CheckResult:
    name = f"credits-e2e-{site}"
    site_dir = repo / "data/sites" / site
    required = [site_dir / "site-manifest.json", site_dir / "tiles", site_dir / "grid"]
    if not all(p.exists() for p in required):
        return CheckResult(name, "FAIL", f"bundle incomplete at {site_dir.relative_to(repo)}")
    env = {"E2E_SKIP_BUILD": "1", "E2E_SITE": site, "E2E_PORT": str(port)}
    proc = _run(["npx", "playwright", "test", "-c", "apps/web/e2e/playwright.config.ts", "checks/credits.spec"], repo, env=env)
    out = proc.stdout + "\n" + proc.stderr
    summary = next((line.strip() for line in reversed(out.splitlines()) if "passed" in line or "failed" in line or "skipped" in line), f"exit {proc.returncode}")
    if proc.returncode != 0 or "skipped" in summary.lower():
        return CheckResult(name, "FAIL", f"{summary} (site={site}, port={port})")
    return CheckResult(name, "PASS", f"{summary} (site={site}, port={port})")


def collect_submission_urls(repo: Path) -> tuple[list[str], list[str]]:
    urls: list[str] = []
    placeholders: list[str] = []
    for rel in SUBMISSION_DOCS:
        p = repo / rel
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        for m in URL_RE.findall(text):
            cleaned = m.rstrip(".,;:)")
            if cleaned not in urls:
                urls.append(cleaned)
        for line_no, line in enumerate(text.splitlines(), start=1):
            if "TO BE FILLED BY THE TEAM" in line:
                placeholders.append(f"{rel}:{line_no}")
    return urls, placeholders


def _tls_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def check_submission_urls_form(repo: Path) -> CheckResult:
    urls, placeholders = collect_submission_urls(repo)
    license_ok = (repo / "LICENSE").exists() and "Apache License" in (repo / "LICENSE").read_text(encoding="utf-8")
    malformed: list[str] = []
    external_urls: list[str] = []
    for u in urls:
        parsed = urlparse(u)
        if parsed.hostname in {"localhost", "127.0.0.1"}:
            continue
        external_urls.append(u)
        if parsed.scheme != "https" or not parsed.netloc or "." not in parsed.netloc:
            malformed.append(u)
    has_video = any("youtube.com/watch?v=" in u or "youtu.be/" in u for u in external_urls)
    has_repo = any("github.com/tashobi02/CheesySpace-NasaSpaceAppChallenge" in u for u in external_urls)
    has_portal = any("spaceappschallenge.org" in u for u in external_urls)
    if malformed or not license_ok or not (has_video and has_repo and has_portal):
        return CheckResult(
            "submission-urls-form",
            "FAIL",
            f"malformed={malformed}, license_ok={license_ok}, video={has_video}, repo={has_repo}, portal={has_portal}",
        )
    return CheckResult(
        "submission-urls-form",
        "PASS",
        f"{len(external_urls)} external HTTPS URLs well-formed (portal/repo/video present; Apache-2.0 ok; {len(placeholders)} team placeholders open)",
    )


def check_submission_urls_live(repo: Path, timeout: float = 5.0) -> CheckResult:
    urls, _ = collect_submission_urls(repo)
    targets = [u for u in urls if any(h in u for h in ("spaceappschallenge.org", "github.com/tashobi02/CheesySpace-NasaSpaceAppChallenge", "youtube.com/watch"))]
    ctx = _tls_context()
    bad_http: list[str] = []
    unreachable: list[str] = []
    ok_urls: list[str] = []
    for u in targets:
        req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": "gale-surface-ops-preflight"})
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                if resp.status < 400:
                    ok_urls.append(f"{resp.status} {u}")
                else:
                    bad_http.append(f"{resp.status} {u}")
        except urllib.error.HTTPError as err:
            if err.code == 405:
                try:
                    with urllib.request.urlopen(urllib.request.Request(u, method="GET", headers={"User-Agent": "gale-surface-ops-preflight"}), timeout=timeout, context=ctx) as resp2:
                        if resp2.status < 400:
                            ok_urls.append(f"{resp2.status} {u}")
                        else:
                            bad_http.append(f"{resp2.status} {u}")
                except urllib.error.HTTPError as err2:
                    bad_http.append(f"{err2.code} {u}")
                except Exception as err2:
                    unreachable.append(f"{u} ({getattr(err2, 'reason', err2)})")
            else:
                bad_http.append(f"{err.code} {u}")
        except Exception as err:
            unreachable.append(f"{u} ({getattr(err, 'reason', err)})")
    if bad_http:
        parts = [f"http_error={bad_http}"]
        if ok_urls:
            parts.append(f"ok={ok_urls}")
        if unreachable:
            parts.append(f"not_verified={unreachable}")
        return CheckResult("submission-urls-live", "FAIL", "; ".join(parts))
    if unreachable:
        parts = [f"not_verified={unreachable}"]
        if ok_urls:
            parts.append(f"ok={ok_urls}")
        return CheckResult("submission-urls-live", "NOT_VERIFIED", "; ".join(parts))
    return CheckResult("submission-urls-live", "PASS", f"{len(ok_urls)}/{len(targets)} submission URLs answered 2xx/3xx")


def check_secrets(repo: Path) -> CheckResult:
    gitleaks = shutil.which("gitleaks")
    if gitleaks:
        proc = _run([gitleaks, "detect", "--source", ".", "--no-git", "--exit-code", "1"], repo)
        if proc.returncode != 0:
            return CheckResult("secrets-scan", "FAIL", f"gitleaks found potential secrets (exit {proc.returncode})")
        return CheckResult("secrets-scan", "PASS", "gitleaks detect clean")

    tracked = _run(["git", "ls-files"], repo)
    if tracked.returncode != 0:
        return CheckResult("secrets-scan", "FAIL", "git ls-files failed")
    hits: list[str] = []
    for rel in tracked.stdout.splitlines():
        p = repo / rel
        if not p.is_file() or p.stat().st_size > 2_000_000:
            continue
        if rel == "scripts/submission_preflight.py" or rel.startswith("scripts/tests/"):
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pat in SECRET_PATTERNS:
            if pat.search(text):
                hits.append(f"{rel}:{label}")
    if hits:
        return CheckResult("secrets-scan", "FAIL", f"secret pattern matches: {hits[:5]}")
    return CheckResult("secrets-scan", "PASS", "regex scan over tracked files clean (gitleaks binary not installed)")


def check_ai_use_sweep(repo: Path) -> CheckResult:
    proc = _run([sys.executable, "scripts/check_ai_use_log.py", "--json"], repo)
    try:
        data = json.loads(proc.stdout)
    except ValueError:
        return CheckResult("ai-use-sweep", "FAIL", f"check_ai_use_log.py failed: {proc.stderr.strip()}")
    ai_miss = len(data["uncovered_ai_trailered"])
    no_tr = len(data["uncovered_no_ai_trailer"])
    unmatched = len(data["unmatched_log_rows"])
    bad_sha = len(data["missing_sha_refs"])
    bad_path = len(data["phantom_path_refs"])
    detail = f"uncovered_ai={ai_miss}, uncovered_untrailered={no_tr}, unmatched_rows={unmatched}, non_head_shas={bad_sha}, missing_paths={bad_path}"
    if proc.returncode != 0:
        return CheckResult("ai-use-sweep", "FAIL", detail)
    return CheckResult("ai-use-sweep", "PASS", detail)


def run_preflight(
    repo: Path,
    port: int = 8373,
    skip_build: bool = False,
    skip_e2e: bool = False,
    require_online: bool = False,
) -> list[CheckResult]:
    results = [
        check_docs_links(repo),
        check_pages_build(repo, skip_build=skip_build),
        check_built_app_links(repo),
    ]
    if not skip_e2e:
        results.append(check_replay_e2e(repo, port=port))
    results.append(check_credits_unit(repo))
    if not skip_e2e:
        results.append(check_credits_e2e(repo, site="mock_site", port=port + 1))
        results.append(check_credits_e2e(repo, site="gale_boxwork", port=port + 2))
    results.extend([
        check_submission_urls_form(repo),
        check_submission_urls_live(repo),
        check_secrets(repo),
        check_ai_use_sweep(repo),
    ])
    if require_online:
        for r in results:
            if r.check == "submission-urls-live" and r.status == "NOT_VERIFIED":
                r.status = "FAIL"
    return results


def _print_table(results: list[CheckResult]) -> None:
    w_check = max(len("Check"), *(len(r.check) for r in results))
    w_status = max(len("Status"), *(len(r.status) for r in results))
    print(f"| {'Check':<{w_check}} | {'Status':<{w_status}} | Detail |")
    print(f"| {'-' * w_check} | {'-' * w_status} | ------ |")
    for r in results:
        print(f"| {r.check:<{w_check}} | {r.status:<{w_status}} | {r.detail} |")
    passed = sum(1 for r in results if r.status == "PASS")
    failed = sum(1 for r in results if r.status == "FAIL")
    not_ver = sum(1 for r in results if r.status == "NOT_VERIFIED")
    print(f"\nSummary: {passed} PASS, {failed} FAIL, {not_ver} NOT_VERIFIED")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pre-flight checks for T16.07, T30.02, T30.03 (no publish/push).")
    ap.add_argument("--repo", type=Path, default=Path("."), help="Repository root (default: .)")
    ap.add_argument("--port", type=int, default=8373, help="Base port for E2E Hab Core instances (default: 8373)")
    ap.add_argument("--skip-build", action="store_true", help="Reuse existing apps/web/dist")
    ap.add_argument("--skip-e2e", action="store_true", help="Skip Playwright browser checks (fast mode)")
    ap.add_argument("--require-online", action="store_true", help="Fail if external submission URLs cannot be reached")
    ap.add_argument("--json", action="store_true", help="Print JSON instead of table")
    args = ap.parse_args(argv)

    repo = args.repo.resolve()
    results = run_preflight(
        repo,
        port=args.port,
        skip_build=args.skip_build,
        skip_e2e=args.skip_e2e,
        require_online=args.require_online,
    )
    if args.json:
        print(json.dumps([asdict(r) for r in results], indent=2))
    else:
        _print_table(results)
    return 1 if any(r.status == "FAIL" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
