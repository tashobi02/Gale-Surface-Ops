#!/usr/bin/env python3
"""Rebuild the generated part of docs/ops/credits.md from the DataSource records (backend package 22; T04.06, BD-13, BD-134).

Usage: python3 scripts/build_credits.py [--root DIR] [--check]

The block between `<!-- credits:generated:begin -->` and `<!-- credits:generated:end -->` is written from
pipeline/sites/gale_boxwork/{sources,layers,env_constants,pois}/*.json, scenarios/*/param_sets/*.json and pipeline/sources.lock.json; no credit, licence or
URL in it is typed by hand. Everything outside the markers is left alone. `--check` writes nothing and exits 1 when the
block is stale. A record with an empty credit, licence, publisher or URL, or an open-choice marker in a field, is an error
(BD-13: no open licence field), and so is a POI image with no entry in the lock file (BD-14).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BEGIN = "<!-- credits:generated:begin -->"
END = "<!-- credits:generated:end -->"
MARKER = re.compile(r"TODO\((?:decision|verify)\)")
REQUIRED = ("credit", "licence", "publisher", "url")
SITE = "gale_boxwork"


class CreditsError(Exception):
    pass


def _read(folder: Path) -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))] if folder.is_dir() else []


BARE_URL = re.compile(r"(?<![<(\[])\b(https?://[^\s<>|)]*[^\s<>|).,;])|(?<=\()(https?://[^\s<>|)]*[^\s<>|).,;])")


def _cell(value: object) -> str:
    """One table cell: whitespace collapsed, `|` escaped, and every bare URL wrapped in <...> (markdown lint)."""
    text = re.sub(r"\s+", " ", str(value)).strip()
    text = BARE_URL.sub(lambda m: f"<{m.group(1) or m.group(2)}>", text)
    return text.replace("|", "\\|")


def render(root: Path) -> str:
    site = root / "pipeline" / "sites" / SITE
    records = sorted(_read(site / "sources"), key=lambda r: r["source_id"])
    layers, constants, pois = _read(site / "layers"), _read(site / "env_constants"), _read(site / "pois")
    lock_file = root / "pipeline" / "sources.lock.json"
    lock = {e["source_id"]: e for e in json.loads(lock_file.read_text(encoding="utf-8"))["sources"]} if lock_file.exists() else {}

    problems = []
    for r in records:
        for field, value in r.items():
            if isinstance(value, str) and MARKER.search(value):
                problems.append(f"{r['source_id']}: field {field} holds an open-choice marker")
        for field in REQUIRED:
            if not str(r.get(field, "")).strip():
                problems.append(f"{r['source_id']}: field {field} is empty")
    if problems:
        raise CreditsError("; ".join(problems))

    users: dict[str, list[str]] = {r["source_id"]: [] for r in records}
    for layer in layers:
        for sid in layer.get("source_ids", []):
            users.setdefault(sid, []).append(f"layer `{layer['layer_id']}`")
    for const in constants:
        if const.get("source_id"):
            users.setdefault(const["source_id"], []).append(f"env constant `{const['const_id']}`")
    for params in sorted((root / "scenarios").glob("*/param_sets/*.json")) if (root / "scenarios").is_dir() else []:
        ps = json.loads(params.read_text(encoding="utf-8"))
        for sid in ps.get("source_ids", []):
            users.setdefault(sid, []).append(f"param set `{ps['param_set_id']}`")
    for p in pois:
        for sid in sorted({e["source_id"] for e in p.get("evidence", [])}):
            users.setdefault(sid, []).append(f"poi `{p['poi_id']}`")

    out = [
        "## Sources (generated)",
        "",
        "Written by `scripts/build_credits.py` from the records in `pipeline/sites/gale_boxwork/sources/`. Credit, licence and URL are the record's own words; \"Used by\" lists the layers, environment constants, scenario ParamSets and POIs that cite the record.",
        "",
        "| source_id | Title | Publisher | Authors | Credit | Licence | URL | Used by |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in records:
        used = ", ".join(sorted(set(users.get(r["source_id"], [])))) or "none"
        out.append(
            f"| `{r['source_id']}` | {_cell(r['title'])} | {_cell(r['publisher'])} | {_cell(r.get('authors', ''))} | {_cell(r['credit'])} | {_cell(r['licence'])} | <{r['url']}> | {_cell(used)} |"
        )
    out += ["", "## POI images (generated)", "",
            "Each image is credited exactly as the POI record's `image_credit`; the file, size and SHA-256 are those of its entry in `pipeline/sources.lock.json`. The files are fetched by the pipeline into `pipeline/work/images/` and are not committed.",
            "",
            "| POI id | Camera | Sol | Date | Credit | Page | Image asset | File | Bytes | SHA-256 |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for p in sorted(pois, key=lambda x: x["poi_id"]):
        if not p.get("image_asset"):
            continue
        entry = lock.get(p["image_asset"])
        if entry is None:
            raise CreditsError(f"{p['poi_id']}: image {p['image_asset']} has no entry in pipeline/sources.lock.json")
        path = f"{entry.get('dir', '')}/{entry.get('filename', '')}".strip("/")
        out.append(
            f"| `{p['poi_id']}` | {_cell(p.get('image_camera', ''))} | {p.get('image_sol', '')} | {p.get('image_date', '')} | {_cell(p['image_credit'])} | <{p['image_source_url']}> | `{p['image_asset']}` | {path} | {entry.get('size', '')} | `{entry.get('sha256', '')}` |"
        )
    return "\n".join(out) + "\n"


def splice(text: str, block: str) -> str:
    if BEGIN not in text or END not in text or text.index(BEGIN) > text.index(END):
        raise CreditsError(f"credits.md needs the markers {BEGIN} and {END} (credits:generated)")
    head, rest = text.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    return f"{head}{BEGIN}\n{block}{END}{tail}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 when the generated block is stale")
    args = ap.parse_args(argv)
    path = args.root / "docs" / "ops" / "credits.md"
    try:
        new = splice(path.read_text(encoding="utf-8"), render(args.root))
    except CreditsError as err:
        print(f"build_credits: {err}", file=sys.stderr)
        return 1
    if args.check:
        if new != path.read_text(encoding="utf-8"):
            print("build_credits: the generated block of docs/ops/credits.md is stale; run python3 scripts/build_credits.py", file=sys.stderr)
            return 1
        return 0
    path.write_text(new, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
