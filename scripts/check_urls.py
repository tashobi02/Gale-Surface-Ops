#!/usr/bin/env python3
"""Check that the URLs in DataSource records and Markdown notes still resolve (backend package 22; BD-29, BD-134).

Usage: python3 scripts/check_urls.py PATH... [--record-unreachable] [--report FILE] [--date YYYY-MM-DD] [--timeout SECONDS]

PATH is a file or a folder. URLs come from the `url` field of JSON files that have a `source_id` (DataSource records) and,
in Markdown files, from `<https://...>` and `](https://...)`; relative and non-http(s) links are ignored. Each distinct URL
is requested once: HEAD, then GET when HEAD is refused; redirects are followed and the final status is the one reported.

2xx and 3xx pass. A network failure (no answer) is reported and exits 1; it is never written into a record, because it says
nothing about the page. A 4xx or 5xx for a record's `url` exits 1 unless the record already carries the sentence
"Unreachable on <date>: HTTP <code> at <url>." for that URL; `--record-unreachable` appends that sentence to the record's
`accuracy_note`, so the finding is kept and never dropped silently. A bad URL in a Markdown file always exits 1.

Pipeline-stage tool: it makes requests, so it runs before the event and never at runtime (CLAUDE.md §2).
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MD_URL = re.compile(r"<(https?://[^>\s]+)>|\]\((https?://[^)\s]+)\)")

def _tls_context() -> ssl.SSLContext:
    """The default TLS context, with certifi's CA bundle when it is installed (a python.org build on macOS ships no CA file)."""
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


TLS = _tls_context()
UA = "marswalk-pipeline-url-check (pipeline stage; contact via repository)"


def status_of(url: str, timeout: float) -> tuple[int, str]:
    """(HTTP status, error text); status 0 means no answer."""
    last = ""
    for attempt in range(3):
        try:
            for method in ("HEAD", "GET"):
                req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
                try:
                    with urllib.request.urlopen(req, timeout=timeout, context=TLS) as resp:
                        return resp.status, ""
                except urllib.error.HTTPError as err:
                    if method == "HEAD":
                        continue  # some servers refuse HEAD; GET decides
                    return err.code, ""
        except (urllib.error.URLError, OSError, ValueError) as err:
            last = str(getattr(err, "reason", err))
            if attempt < 2:
                time.sleep(0.5)
    return 0, last


def collect(paths: list[Path]) -> tuple[dict[str, list[Path]], dict[Path, dict]]:
    """URL -> files using it, and the DataSource records by path."""
    urls: dict[str, list[Path]] = {}
    records: dict[Path, dict] = {}

    def add(url: str, path: Path) -> None:
        urls.setdefault(url.rstrip(".,;"), []).append(path)

    files: list[Path] = []
    for p in paths:
        files.extend(sorted(q for q in p.rglob("*") if q.is_file()) if p.is_dir() else [p])
    for f in files:
        if f.suffix == ".json":
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(data, dict) and "source_id" in data and isinstance(data.get("url"), str):
                records[f] = data
                add(data["url"], f)
        elif f.suffix == ".md":
            for m in MD_URL.finditer(f.read_text(encoding="utf-8")):
                add(m.group(1) or m.group(2), f)
    return urls, records


def note_for(url: str, status: int, date: str) -> str:
    return f"Unreachable on {date}: HTTP {status} at {url}."


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--record-unreachable", action="store_true", help="append the unreachable sentence to a record's accuracy_note")
    ap.add_argument("--report", type=Path, help="write every URL with its status and date as JSON")
    ap.add_argument("--date", default=datetime.now(timezone.utc).date().isoformat())
    ap.add_argument("--timeout", type=float, default=30.0)
    args = ap.parse_args(argv)

    urls, records = collect(args.paths)
    results = []
    failed = False
    for url, files in urls.items():
        status, error = status_of(url, args.timeout)
        results.append({"url": url, "status": status, "checked": args.date, "files": sorted({str(f) for f in files})})
        shown = ", ".join(sorted({f.name for f in files}))
        if status == 0:
            print(f"ERROR no answer {url} ({error}) [{shown}]")
            failed = True
            continue
        print(f"{status} {url} [{shown}]")
        if status < 400:
            continue
        for f in sorted(set(files)):
            rec = records.get(f)
            if rec is None or rec["url"].rstrip(".,;") != url:
                failed = True  # a bad link in a note, or a record cited by another file
                continue
            sentence = note_for(url, status, args.date)
            note = rec.get("accuracy_note", "")
            handled = re.search(r"Unreachable on \d{4}-\d{2}-\d{2}: HTTP \d{3} at " + re.escape(url) + r"\.", note) is not None
            if handled:
                continue
            if args.record_unreachable:
                rec["accuracy_note"] = f"{note} {sentence}".strip()
                f.write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                print(f"  recorded in {f.name}: {sentence}")
            else:
                failed = True
    print(f"{len(urls)} URLs checked on {args.date}; {sum(1 for r in results if r['status'] == 0 or r['status'] >= 400)} not reachable")
    if args.report:
        args.report.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
