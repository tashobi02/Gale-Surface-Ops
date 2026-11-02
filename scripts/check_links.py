#!/usr/bin/env python3
"""Check that relative Markdown links and #anchors resolve.

Usage: python3 scripts/check_links.py [PATH ...]   (default: docs README.md)
Exits 1 and lists each broken link if any target file or heading anchor is missing.
External (http/https/mailto) links are not fetched; the docs must work offline.
"""
import re
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", "graphify-out", ".git", ".venv", "skills"}
LINK = re.compile(r"\]\(<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


def slug(text: str) -> str:
    """GitHub-style heading anchor: drop link targets, code ticks and punctuation."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[^\w\- ]", "", text.lower())
    return text.replace(" ", "-")


def lines_outside_fences(path: Path):
    fenced = False
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
            continue
        if not fenced:
            yield n, line


def anchors(path: Path, cache: dict) -> set:
    if path not in cache:
        seen, found = {}, set()
        for _, line in lines_outside_fences(path):
            m = HEADING.match(line)
            if m:
                s = slug(m.group(2))
                k = seen.get(s, 0)
                seen[s] = k + 1
                found.add(s if k == 0 else f"{s}-{k}")
        cache[path] = found
    return cache[path]


def markdown_files(args):
    for arg in args:
        p = Path(arg)
        if p.is_file():
            yield p
        else:
            for f in sorted(p.rglob("*.md")):
                if not SKIP_DIRS & set(f.parts):
                    yield f


def main(args) -> int:
    cache, broken, checked = {}, 0, 0
    for f in markdown_files(args or ["docs", "README.md"]):
        for n, line in lines_outside_fences(f):
            for target in LINK.findall(line):
                if re.match(r"[a-z]+:", target):
                    continue
                checked += 1
                path, _, frag = target.partition("#")
                dest = (f.parent / path).resolve() if path else f.resolve()
                if not dest.exists():
                    print(f"{f}:{n}: missing file -> {target}")
                    broken += 1
                elif frag and dest.suffix == ".md" and frag not in anchors(dest, cache):
                    print(f"{f}:{n}: missing anchor -> {target}")
                    broken += 1
    print(f"{checked} relative links checked, {broken} broken")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
