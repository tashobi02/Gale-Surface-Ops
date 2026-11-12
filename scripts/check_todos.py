#!/usr/bin/env python3
"""List every open-choice marker in the backend scope (docs/plan/backend/decisions-index.md).

Usage: python3 scripts/check_todos.py [--root DIR] [--allow FILE ...]
Exit 1 and list each marker as <file>:<line>: <kind> when any is found; exit 0 when none. `--allow` skips a file
(repeatable). Used by backend packages 30 and 99. Scope globs are the ones the index was generated with: the backend
task files and the backend source, test and data folders. Binary files and symbolic links (the SSD folders) are skipped.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

MARKER = re.compile(r"TODO\((decision|verify)\)")
TASK_IDS = ("01", "03", "04", "05", "05b", "06", "14", "20", "21", "22", "23", "26", "27", "28", "29", "31", "32")
SCOPE_DIRS = (
    "apps/hab-core/src", "apps/hab-core/tests", "apps/hab-core/scripts",
    "packages/compute/src", "packages/compute/tests", "packages/protocol/src", "packages/protocol/tests",
    "pipeline/src", "pipeline/tests", "pipeline/sites", "pipeline/spice", "pipeline/cache",
    "scenarios", "schemas", "data/sites",
)
SKIP_DIRS = {"node_modules", "__pycache__", ".pytest_cache", "dist", ".git"}


def scoped_files(root: Path):
    tasks = root / "docs" / "tasks"
    if tasks.is_dir():
        for p in sorted(tasks.glob("TASK-*.md")):
            m = re.match(r"TASK-(\d+b?)_", p.name)
            if m and m.group(1) in TASK_IDS:
                yield p
    for d in SCOPE_DIRS:
        base = root / d
        if not base.is_dir() or base.is_symlink():
            continue
        for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
            dirnames[:] = sorted(n for n in dirnames if n not in SKIP_DIRS and not (Path(dirpath) / n).is_symlink())
            for n in sorted(filenames):
                p = Path(dirpath) / n
                if not p.is_symlink():
                    yield p


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    ap.add_argument("--allow", action="append", default=[], metavar="FILE", help="repo-relative file to skip")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    allowed = {a.replace("\\", "/") for a in args.allow}
    found: list[str] = []
    for p in scoped_files(root):
        rel = p.relative_to(root).as_posix()
        if rel in allowed:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            for m in MARKER.finditer(line):
                found.append(f"{rel}:{i}: {m.group(1)}")
    for f in found:
        print(f)
    print(f"{len(found)} markers")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
