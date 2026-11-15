#!/usr/bin/env python3
"""Check bidirectional coverage between git commit history and docs/AI_USE.md.

Implements the mechanical sweep for T30.02:
1. Forward check: every non-merge commit reachable from --rev has a matching entry
   in the `## Log` table, or, if untrailered, an exact SHA in `## Commits with no
   AI assistance`. Uncovered commits are separated by AI trailer.
2. Reverse check: every `## Log` row matches at least one commit in history, any
   explicitly cited commit SHAs exist in `--rev` history, and any explicitly cited
   repo file paths exist in `--rev` or in its git history.

Exits 0 only when both forward and reverse checks find zero gaps. Never modifies
`docs/AI_USE.md` or any repository file.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Callable

DEFAULT_AI_USE = Path("docs/AI_USE.md")
AI_TRAILER_RE = re.compile(
    r"(claude|codex|openai|gemini|puku|anthropic|copilot|cursor|antigravity|gpt-)",
    re.IGNORECASE,
)

# Shared bookkeeping / hub files touched across many unrelated tasks; matching
# one of these alone is too weak to prove a log row describes a commit.
HUB_FILES = {
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "Makefile",
    "package.json",
    "package-lock.json",
    "docs/AI_USE.md",
    "docs/tasks/status.md",
    "docs/tasks/README.md",
    "docs/tasks/_coordination.md",
    "docs/plan/frontend/decisions.md",
    "docs/plan/backend/decisions.md",
    "docs/plan/frontend/01-needs-from-backend.md",
    "docs/plan/frontend/99-audit.md",
    "docs/ops/verification-log.md",
    "docs/ops/submission-checklist.md",
    "apps/web/e2e/playwright.config.ts",
    "apps/web/src/ui/ops/liveProps.ts",
    "packages/compute/src/haven.ts",
    "data/sites/gale_boxwork/site-manifest.json",
    "data/sites/mock_site/site-manifest.json",
}

SPECIFIC_ID_RE = re.compile(
    r"\b(?:T\d{2}\.\d{2}|FD-\d+|BD-\d+|ADR-\d+|SCR-\d+|N-\d+|B-\d+|Package\s+\d+|QoL\s+Q?\d+)\b",
    re.IGNORECASE,
)
COARSE_ID_RE = re.compile(r"\b(?:TASK-\d+|FR-\d+|NFR-\d+|D-\d+|U-\d+|A-\d+)\b", re.IGNORECASE)
RANGE_TASK_RE = re.compile(r"\bT(\d{2})\.(\d{2})\s*[–-]\s*(?:T\1\.)?(\d{2})\b")
SLASH_TASK_RE = re.compile(r"\bT(\d{2})\.(\d{2})((?:/\d{2})+)\b")
RANGE_PREFIX_RE = re.compile(r"\b(FD|BD|ADR|SCR|N|B|TASK)-(\d+)\s*[–-]\s*(?:\1-)?(\d+)\b")
PACKAGE_RANGE_RE = re.compile(r"\bPackages?\s+(\d+)\s*[–-]\s*(\d+)\b", re.IGNORECASE)

SHA_CONTEXT_RE = re.compile(
    r"(?:`([0-9a-f]{7,40})`|commit\s+([0-9a-f]{7,40})|\b([0-9a-f]{7,40})\s*\)|\(([0-9a-f]{7,40})\)|(?:merged|from|at|on|rebased|cherry-picked)\s+([0-9a-f]{7,40}))",
    re.IGNORECASE,
)
NON_COMMIT_HEX_PREFIX_RE = re.compile(
    r"\b(?:conversation|session|plan_hash|log_hash|sha-?256|digest)`?\s*"
    r"(?:[:(=]|against|of|is|was)?\s*(?:`[0-9a-f]{7,40}`\s+against\s+)?`?$",
    re.IGNORECASE,
)
BACKTICK_RE = re.compile(r"`([^`]+)`")
# An explicit supersession phrase must sit immediately before the reference it
# marks, with only short connectors between them, so that the phrase binds to
# that one reference and to no other. The phrases name a form that never
# existed on the main line (a pre-fix path, a renamed file, a commit that was
# dropped or rebased away); a reference the row merely mentions in passing is
# not exempt.
# A marker phrase that says the citation it introduces names something that
# never existed on the main line: a pre-fix path, a renamed file, a commit
# that was dropped or rebased away.
#
# The marker binds to the citation that follows it. The gap between the marker
# and the citation may name the kind of thing being superseded ("the pre-fix
# form of the file"), but it must not introduce a *new action* — "dropped a
# cache and wrote `x`" describes two things, and the marker belongs to the
# first. So the gap allows only short noun phrases and punctuation, and the
# words it may contain are listed rather than arbitrary.
_HISTORICAL_MARKERS = (
    # A restoration or a rename names its source explicitly: "restored ... from
    # <ref>", "renamed from <ref>". The descriptive gap before the source may
    # be long, because the construction itself is unambiguous. The gap may
    # contain periods (in an id, a version or a file name) but stops at a
    # sentence boundary.
    r"\brestored\b(?:(?![.;]\s|\b(?:and|then|but)\s+(?:wrote|implemented|created|added|copied|used|read|reviewed)\b|`).){0,120}?\bfrom\b",
    r"renamed\s+from",
    r"pre-?fix\s+(?:form|version|path|state|name)",
    r"broken\s+link",
    r"the\s+former\s+\S+",
    r"the\s+old\s+(?:path|form|name|file)",
    r"superseded\s+(?:path|form|name|version|file)",
    r"before\s+the\s+fix",
    r"cherry-?picked\s+away",
    r"not\s+(?:in|on)\s+main",
    r"dropped",
    r"rebased\s+(?:off|away)",
)
# A marker that a negation cancels: "not dropped", "never rebased". The
# negation is what the sentence says, so the reference is live after all.
_NEGATED_MARKER_RE = re.compile(
    r"\b(?:not|never|no|neither|nor|without)\s+(?:\w+\s+){0,2}$",
    re.IGNORECASE,
)
# Words the gap between a marker and its citation may contain. A gap that
# contains a verb of its own ("wrote", "implemented", "added", "created")
# introduces a second action, and the marker then belongs to that action's
# subject rather than to the citation.
_MARKER_GAP_WORDS = (
    r"the|a|an|this|that|these|those|its|their|his|her|our|your|old|former|pre-?fix|previous|"
    r"superseded|duplicate|duplicated|original|initial|first|second|third|stale|dead|unused|"
    r"unmerged|dropped|rebased|cherry-?picked|restored|renamed|superseding|wrong|incorrect|"
    r"commit|commits|file|files|path|paths|form|forms|version|versions|name|names|state|"
    r"merge|merged|branch|change|changes|edit|edits|copy|copies|link|links|reference|references|"
    r"sha|hash|revision|build|artifact|report|row|rows|line|lines|step|steps|"
    r"and|handler|T\d{2}\.\d{2}|[0-9a-f]{7,40}"
)
HISTORICAL_MARKER_RE = re.compile(
    r"\b(?:" + "|".join(_HISTORICAL_MARKERS) + r")"
    # The gap may name the kind of thing being superseded, but only with
    # nouns and punctuation — no new action.
    r"(?:[\s,;:()]+(?:" + _MARKER_GAP_WORDS + r")\b)*"
    r"[\s,;:()]*$",
    re.IGNORECASE,
)
REPO_PATH_PREFIXES = (
    "apps/",
    "packages/",
    "scripts/",
    "docs/",
    "pipeline/",
    "scenarios/",
    "schemas/",
    "data/",
    ".github/",
    ".claude/",
)

STOPWORDS = {
    "feat",
    "fix",
    "docs",
    "test",
    "chore",
    "refactor",
    "spec",
    "change",
    "spec-change",
    "with",
    "from",
    "into",
    "that",
    "this",
    "when",
    "over",
    "only",
    "their",
    "each",
    "same",
    "more",
    "than",
    "uses",
    "used",
    "using",
    "make",
    "made",
    "keep",
    "kept",
    "show",
    "shows",
    "check",
    "checks",
    "rows",
    "row",
    "file",
    "files",
    "tests",
    "unit",
    "e2e",
    "web",
    "plan",
    "data",
    "site",
    "status",
    "close",
    "clean",
    "pass",
    "passes",
    "note",
    "notes",
    "work",
    "task",
    "tasks",
    "state",
    "mode",
    "add",
    "adds",
    "added",
    "update",
    "updated",
    "remove",
    "removed",
}


@dataclass
class LogRow:
    index: int
    line_no: int
    date_str: str
    parsed_date: date | None
    tool: str
    what: str
    not_do: str
    human_review: str
    prompts: str
    specific_ids: set[str] = field(default_factory=set)
    coarse_ids: set[str] = field(default_factory=set)
    cited_paths: set[str] = field(default_factory=set)
    cited_shas: set[str] = field(default_factory=set)
    literal_paths: set[str] = field(default_factory=set)
    raw_line: str = ""


@dataclass
class CommitInfo:
    sha: str
    short_sha: str
    commit_date: date
    date_str: str
    author: str
    subject: str
    body: str
    files: list[str]
    co_authors: list[str]
    ai_trailered: bool
    specific_ids: set[str] = field(default_factory=set)
    coarse_ids: set[str] = field(default_factory=set)
    added_log_lines: list[str] = field(default_factory=list)


def _split_markdown_row(line: str) -> list[str]:
    """Split a markdown table row on unescaped `|` outside backtick code spans."""
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|") and not stripped.endswith("\\|"):
        stripped = stripped[:-1]
    cells: list[str] = []
    cur: list[str] = []
    in_ticks = False
    i = 0
    while i < len(stripped):
        ch = stripped[i]
        if ch == "\\" and i + 1 < len(stripped):
            cur.append(stripped[i : i + 2])
            i += 2
            continue
        if ch == "`":
            in_ticks = not in_ticks
            cur.append(ch)
            i += 1
            continue
        if ch == "|" and not in_ticks:
            cells.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    cells.append("".join(cur).strip())
    return cells


def _normalize_id(token: str) -> str:
    token = re.sub(r"\s+", " ", token.strip())
    upper = token.upper()
    if upper.startswith("PACKAGE "):
        return "PACKAGE " + upper.split()[1]
    if upper.startswith("QOL "):
        return upper
    return upper


def _expand_ids(text: str) -> tuple[set[str], set[str]]:
    specific: set[str] = set()
    coarse: set[str] = set()
    for m in RANGE_TASK_RE.finditer(text):
        task, start, end = m.group(1), int(m.group(2)), int(m.group(3))
        if start <= end and (end - start) <= 40:
            for sub in range(start, end + 1):
                specific.add(f"T{task}.{sub:02d}")
    for m in SLASH_TASK_RE.finditer(text):
        task, first, rest = m.group(1), m.group(2), m.group(3)
        specific.add(f"T{task}.{first}")
        for part in rest.strip("/").split("/"):
            specific.add(f"T{task}.{part}")
    for m in RANGE_PREFIX_RE.finditer(text):
        prefix, start, end = m.group(1).upper(), int(m.group(2)), int(m.group(3))
        if start <= end and (end - start) <= 40:
            target = coarse if prefix == "TASK" else specific
            width = max(len(m.group(2)), len(m.group(3))) if prefix in {"TASK", "SCR"} else 0
            for num in range(start, end + 1):
                s = f"{num:0{width}d}" if width else str(num)
                target.add(f"{prefix}-{s}")
    for m in PACKAGE_RANGE_RE.finditer(text):
        start, end = int(m.group(1)), int(m.group(2))
        if start <= end and (end - start) <= 40:
            for num in range(start, end + 1):
                specific.add(f"PACKAGE {num}")
    for m in SPECIFIC_ID_RE.finditer(text):
        specific.add(_normalize_id(m.group(0)))
    for m in COARSE_ID_RE.finditer(text):
        coarse.add(_normalize_id(m.group(0)))
    return specific, coarse


def _expand_braces(path_expr: str) -> list[str]:
    m = re.search(r"\{([^{}]+)\}", path_expr)
    if not m:
        return [path_expr]
    out: list[str] = []
    for part in m.group(1).split(","):
        expanded = path_expr[: m.start()] + part.strip() + path_expr[m.end() :]
        out.extend(_expand_braces(expanded))
    return out


def _normalize_path_candidate(code: str, *, literal: bool = False) -> str:
    """Reduce a backticked citation to the repo-relative path it names.

    A leading "./" or "../../" is a way of writing the same repo-relative
    path. A ":line" suffix is *not* stripped here: a colon and a number are
    legal in a POSIX file name, so "docs/unique.md:123" may name a literal
    file. `_path_variants` returns both readings and the caller accepts the
    citation if either resolves.
    """
    candidate = code.strip() if literal else code.strip().split("#")[0].rstrip(".,;)")
    if candidate.startswith("../../"):
        candidate = candidate[6:]
    elif candidate.startswith("./"):
        candidate = candidate[2:]
    return candidate


def _path_variants(candidate: str) -> list[str]:
    """The readings of a path citation: as written, and without a ":line" suffix."""
    variants = [candidate]
    without_line = re.sub(r":\d+$", "", candidate)
    if without_line != candidate:
        variants.append(without_line)
    return variants


def _extract_paths(text: str, include_historical: bool = False) -> set[str]:
    paths: set[str] = set()
    spans = list(BACKTICK_RE.finditer(text))
    for idx, match in enumerate(spans):
        literal = bool(re.search(r"\bliteral\s+(?:filename|file|path)\s+$", _span_clause(text, spans, idx), re.IGNORECASE))
        candidate = _normalize_path_candidate(match.group(1), literal=literal)
        if not any(candidate.startswith(p) for p in REPO_PATH_PREFIXES):
            continue
        if any(ch in candidate for ch in ("*", "?", "<", ">", " ", "…")):
            continue
        if candidate.endswith("/"):
            continue
        if not include_historical and _span_is_historical(text, spans, idx):
            continue
        for item in _expand_braces(candidate):
            if "{" not in item and "}" not in item and "." in Path(item).name:
                paths.add(item)
    return paths


# A sentence boundary splits the text into clauses; the supersession marker
# must be in the clause that introduces the citation.
#
# A "." or ";" is a boundary when followed by whitespace (or end of text). That keeps the periods inside an id
# ("T05.32"), a decimal ("2.5"), a version ("v2.0.1") and a file name
# ("report.md") from splitting a clause, while "dropped version 2. Implemented
# file `x`" does split. The ";" in "report;v2.md" is followed by a lowercase
# letter without whitespace, so it does not split either.
_CLAUSE_SPLIT_RE = re.compile(r"[.;](?=\s|$)")


def _last_clause(text: str) -> str:
    """Return the last clause of `text`, splitting on real sentence boundaries."""
    parts = [p for p in _CLAUSE_SPLIT_RE.split(text) if p]
    return parts[-1] if parts else text


def _corrections_by_row(rows: list["LogRow"]) -> tuple[dict[int, set[str]], dict[int, set[str]]]:
    """Bind explicit append-only corrections to one earlier row, never globally.

    Supported targets are "Correction to the row above" and "Correction to
    row #N" (one-based Log row index). The correction must explicitly identify
    the target's citation, not merely discuss another dropped reference.
    Only historical occurrences in that correction may amend the target.
    """
    paths: dict[int, set[str]] = {}
    shas: dict[int, set[str]] = {}
    for row in rows:
        target = re.search(r"\bCorrection to (?:the )?(?:row above|row #?(\d+))\s*:", row.what, re.IGNORECASE)
        if not target:
            continue
        target_index = int(target.group(1)) if target.group(1) else row.index - 1
        if not 1 <= target_index < row.index:
            continue
        # A "different one" describes a separate reference, not a correction
        # of the earlier citation. Require explicit citation/form language.
        correction = row.what[target.end():]
        if not re.search(r"\b(?:its|earlier|original|previous)\s+citation\b|\bpre-?fix form\b", correction, re.IGNORECASE):
            continue
        original = rows[target_index - 1]
        historical_paths = _extract_paths(correction, True) - _extract_paths(correction)
        historical_shas = _extract_shas(correction, True) - _extract_shas(correction)
        paths.setdefault(target_index, set()).update(historical_paths & original.cited_paths)
        shas.setdefault(target_index, set()).update(historical_shas & original.cited_shas)
    return paths, shas


def _span_clause(text: str, spans: list[re.Match[str]], idx: int) -> str:
    """The clause that introduces the backticked span at `idx`."""
    match = spans[idx]
    if idx == 0:
        clause = text[: match.start()]
    else:
        clause = text[spans[idx - 1].end() : match.start()]
    return _last_clause(clause)


def _span_is_historical(text: str, spans: list[re.Match[str]], idx: int) -> bool:
    """True when the marker for this particular citation sits in its own clause.

    A marker a negation cancels ("not dropped commit `x`") does not count, and
    a marker that reaches across one intervening citation does count when the
    connector is "from" — "restored `report.md` from `deadbe1`" names the
    commit as the source the report came from.
    """
    clause = _span_clause(text, spans, idx)
    if _marker_in_clause(clause):
        return True
    return _marker_reaches_from(text, spans, idx)


def _marker_in_clause(clause: str) -> bool:
    """True when the clause carries a supersession marker that is not negated."""
    for match in HISTORICAL_MARKER_RE.finditer(clause):
        before = clause[: match.start()]
        if _NEGATED_MARKER_RE.search(before):
            continue
        return True
    return False


def _marker_reaches_from(text: str, spans: list[re.Match[str]], idx: int) -> bool:
    """A restored backticked destination's following source is historical.

    The destination itself is still required. Only an actual restoration
    reaches across "from"; an unrelated historical marker cannot do so.
    """
    if idx == 0:
        return False
    previous = spans[idx - 1]
    between = text[previous.end():spans[idx].start()]
    clause = _span_clause(text, spans, idx - 1)
    restoration = re.search(r"\brestored\s+(?:(?:the|a|an|old|original|report|file)\s+)*$", clause, re.IGNORECASE)
    return bool(
        re.fullmatch(r"\s+from\s+(?:commit\s+)?", between, re.IGNORECASE)
        and restoration
        and not _NEGATED_MARKER_RE.search(clause[:restoration.start()])
    )


def _extract_shas(text: str, include_historical: bool = False) -> set[str]:
    shas: set[str] = set()
    spans = list(BACKTICK_RE.finditer(text))
    backticked = [(m.start(), m.end()) for m in spans]
    for m in SHA_CONTEXT_RE.finditer(text):
        cand, group_idx = next(((g, idx) for idx, g in enumerate(m.groups(), start=1) if g), ("", 0))
        if not cand:
            continue
        cand_start = m.start(group_idx)
        preceding = text[max(0, cand_start - 128) : cand_start]
        # Pure numbers/hex words are ambiguous in ordinary prose, but an
        # explicit "commit" label names a Git ID even without mixed characters.
        explicit_commit = bool(re.search(r"\bcommit\s+`?$", preceding, re.IGNORECASE))
        if not explicit_commit and (cand.isdigit() or cand.isalpha()):
            continue
        # Skip only a digest/session label immediately introducing this occurrence.
        if NON_COMMIT_HEX_PREFIX_RE.search(preceding):
            continue
        # Skip 7-char strings embedded inside longer hex (like SHA-256 digests)
        end = m.end()
        if end < len(text) and text[end].lower() in "0123456789abcdef":
            continue
        if not include_historical:
            # Skip a commit that the row names as dropped, rebased or restored
            # from a side branch: such a commit never joined the main line, so
            # requiring it to resolve in `--rev` would be a false failure. The
            # row says so with a marker immediately before it ("dropped ...
            # commit 5d80664").
            if not _citation_is_historical(text, spans, backticked, cand_start, cand):
                shas.add(cand.lower())
        else:
            shas.add(cand.lower())
    return shas


def _citation_is_historical(
    text: str,
    spans: list[re.Match[str]],
    backticked: list[tuple[int, int]],
    start: int,
    code: str,
) -> bool:
    """True when the citation at `start` is labelled as superseded in its own clause."""
    for idx, match in enumerate(spans):
        if not (match.start() <= start < match.end()):
            continue
        # The span must *be* the citation, not merely contain it: in
        # "renamed from `a.ts.bak` to `a.ts`" the second span is the
        # replacement, and a substring test would find "a.ts" inside the first
        # span and exempt the wrong reference.
        if match.group(1).strip().strip("`").lower() != code.lower():
            continue
        return _span_is_historical(text, spans, idx)
    # Inspect this bare occurrence only. Re-scanning for the same spelling
    # would let an earlier historical occurrence hide a later live one.
    preceding_end = max((end for _begin, end in backticked if end <= start), default=0)
    clause = _last_clause(text[preceding_end:start])
    if _marker_in_clause(clause):
        return True
    # A bare source can follow a backticked restoration destination too.
    if spans and preceding_end:
        previous_idx = next(i for i, span in enumerate(spans) if span.end() == preceding_end)
        previous_clause = _span_clause(text, spans, previous_idx)
        restoration = re.search(r"\brestored\s+(?:(?:the|a|an|old|original|report|file)\s+)*$", previous_clause, re.IGNORECASE)
        if (
            re.fullmatch(r"\s+from\s+(?:commit\s+)?", text[preceding_end:start], re.IGNORECASE)
            and restoration
            and not _NEGATED_MARKER_RE.search(previous_clause[:restoration.start()])
        ):
            return True
    return False


def parse_ai_use_log(ai_use_path: Path) -> list[LogRow]:
    lines = ai_use_path.read_text(encoding="utf-8").splitlines()
    in_log = False
    rows: list[LogRow] = []
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("## "):
            in_log = stripped == "## Log"
            continue
        if not in_log:
            continue
        if not stripped.startswith("|"):
            continue
        cells = _split_markdown_row(stripped)
        if len(cells) < 4:
            continue
        if cells[0].lower() == "date" or all(set(c.replace("-", "").replace(":", "").strip()) == set() for c in cells):
            continue
        while len(cells) < 6:
            cells.append("")
        date_str = cells[0]
        tool = cells[1]
        human_review = cells[-2]
        prompts = cells[-1]
        if len(cells) == 6:
            what, not_do = cells[2], cells[3]
        else:
            # Tolerate rare stray pipes in description columns by folding into `what`
            what = " | ".join(cells[2:-3])
            not_do = cells[-3]
        parsed_date: date | None = None
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str):
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        # Use `what` + `human_review` for coverage matching so "not_do" notes mentioning
        # untouched tasks (e.g. "T24.09 stays wip") do not falsely claim coverage.
        match_text = f"{what} {human_review}"
        specific_ids, coarse_ids = _expand_ids(match_text)
        row = LogRow(
            index=len(rows) + 1,
            line_no=idx,
            date_str=date_str,
            parsed_date=parsed_date,
            tool=tool,
            what=what,
            not_do=not_do,
            human_review=human_review,
            prompts=prompts,
            specific_ids=specific_ids,
            coarse_ids=coarse_ids,
            cited_paths=_extract_paths(what),
            cited_shas=_extract_shas(match_text),
            literal_paths=_literal_paths(what),
            raw_line=stripped,
        )
        rows.append(row)
    return rows


def parse_no_ai_commits(ai_use_path: Path) -> set[str]:
    """Read explicit commit IDs from the separate no-AI table only."""
    in_section = False
    shas: set[str] = set()
    for line in ai_use_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            in_section = stripped == "## Commits with no AI assistance"
        elif in_section and stripped.startswith("|"):
            cells = _split_markdown_row(stripped)
            if len(cells) == 4 and all(cells):
                match = re.fullmatch(r"`([0-9a-f]{7,40})`", cells[0])
                if match:
                    shas.add(match.group(1))
    return shas


def _run_git(repo: Path, args: list[str]) -> str:
    return subprocess.check_output(["git", *args], cwd=repo, text=True)


def _normalize_row_text(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip())


def load_commits(repo: Path, rev: str, ai_use_rel: str) -> list[CommitInfo]:
    sep_commit = "\x1e"
    sep_field = "\x1f"
    fmt = f"{sep_commit}%H{sep_field}%h{sep_field}%ad{sep_field}%an{sep_field}%s{sep_field}%b{sep_field}%(trailers:key=Co-Authored-By,valueonly,separator=;)"
    raw = _run_git(repo, ["log", "--no-merges", "--date=short", f"--format={fmt}", "--name-only", rev])

    # Collect Log rows directly added per commit in ai_use_rel
    added_by_sha: dict[str, list[str]] = {}
    diff_raw = _run_git(
        repo,
        ["log", "--no-merges", "-p", "-U0", f"--format={sep_commit}%H", rev, "--", ai_use_rel],
    )
    for chunk in diff_raw.split(sep_commit):
        lines = chunk.splitlines()
        if not lines:
            continue
        sha = lines[0].strip()
        added: list[str] = []
        for l in lines[1:]:
            if not l.startswith("+") or l.startswith("+++"):
                continue
            content = l[1:].strip()
            if content.startswith("|") and not re.match(r"^\|\s*Date\s*\|", content, re.I) and not re.match(r"^\|\s*---", content):
                cells = _split_markdown_row(content)
                if len(cells) >= 4 and re.fullmatch(r"\d{4}-\d{2}-\d{2}|TODO.*", cells[0]):
                    added.append(_normalize_row_text(content))
        if added:
            added_by_sha[sha] = added

    commits: list[CommitInfo] = []
    for block in raw.split(sep_commit):
        block = block.strip("\n")
        if not block.strip():
            continue
        header_and_files = block.split("\n", 1)
        fields = block.split(sep_field)
        if len(fields) < 7:
            continue
        sha, short_sha, date_str, author, subject = fields[:5]
        # Remainder holds body, last sep_field holds trailers + newline + changed files
        co_and_files = fields[6].split("\n")
        co_raw = co_and_files[0].strip()
        files = [f.strip() for f in co_and_files[1:] if f.strip()]
        body = fields[5].strip()
        co_authors = [c.strip() for c in co_raw.split(";") if c.strip()]
        ai_trailered = any(AI_TRAILER_RE.search(c) for c in co_authors) or bool(
            re.search(r"Generated with|Co-Authored-By:\s*.*(?:Claude|Codex|OpenAI|Gemini|Puku|Anthropic)", body, re.I)
        )
        specific_ids, coarse_ids = _expand_ids(f"{subject}\n{body}")
        commit_date = datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
        commits.append(
            CommitInfo(
                sha=sha.strip(),
                short_sha=short_sha.strip(),
                commit_date=commit_date,
                date_str=date_str.strip(),
                author=author.strip(),
                subject=subject.strip(),
                body=body,
                files=files,
                co_authors=co_authors,
                ai_trailered=ai_trailered,
                specific_ids=specific_ids,
                coarse_ids=coarse_ids,
                added_log_lines=added_by_sha.get(sha.strip(), []),
            )
        )
    return commits


def _keywords(text: str) -> set[str]:
    words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", text)}
    return {w for w in words if w not in STOPWORDS}


def _rows_match_commit(commit: CommitInfo, rows: list[LogRow], row_norm_map: dict[str, LogRow]) -> list[tuple[int, str]]:
    """Return list of `(row.index, reason)` pairs matching `commit`."""
    matches: list[tuple[int, str]] = []
    commit_non_hub = {f for f in commit.files if f not in HUB_FILES}
    subj_kw = _keywords(commit.subject)

    # 1. Commit directly inserted a surviving row in docs/AI_USE.md ## Log
    matched_indices: set[int] = set()
    for added in commit.added_log_lines:
        row = row_norm_map.get(added)
        if row is not None and row.index not in matched_indices:
            matches.append((row.index, "added log row directly"))
            matched_indices.add(row.index)
        else:
            # Row text may have been lint-adjusted in a later commit: match by date + prefix of what
            cells = _split_markdown_row(added)
            if len(cells) >= 3:
                prefix = cells[2][:40]
                for candidate in rows:
                    if candidate.date_str == cells[0] and prefix and prefix in candidate.what and candidate.index not in matched_indices:
                        matches.append((candidate.index, "added log row (formatted later)"))
                        matched_indices.add(candidate.index)

    for row in rows:
        if row.index in matched_indices:
            continue
        date_diff = abs((commit.commit_date - row.parsed_date).days) if row.parsed_date else 999

        # 2. Explicit commit SHA cited in the log row
        if any(commit.sha.startswith(s) for s in row.cited_shas):
            matches.append((row.index, "SHA referenced in row"))
            matched_indices.add(row.index)
            continue

        # 3. Specific ID intersection (task/decision/need/package) with close date window
        shared_spec = commit.specific_ids & row.specific_ids
        if shared_spec and date_diff <= 7:
            matches.append((row.index, f"ID + date match ({', '.join(sorted(shared_spec))})"))
            matched_indices.add(row.index)
            continue

        # 4. Non-hub file cited explicitly in row.what within date window
        shared_paths = commit_non_hub & row.cited_paths
        if shared_paths and date_diff <= 4:
            matches.append((row.index, f"file + date match ({sorted(shared_paths)[0]})"))
            matched_indices.add(row.index)
            continue

        # 5. Tight subject keyword overlap on same or adjacent day
        if date_diff <= 1 and len(subj_kw) >= 2:
            row_kw = _keywords(row.what)
            overlap = subj_kw & row_kw
            if len(overlap) >= 3 or (len(subj_kw) == len(overlap) and len(overlap) >= 2):
                matches.append((row.index, f"subject overlap ({', '.join(sorted(overlap)[:4])})"))
                matched_indices.add(row.index)
                continue

    return matches


def _git_sha_in_rev(repo: Path, sha: str, rev: str) -> tuple[bool, bool]:
    """Return `(exists_in_object_db, ancestor_of_rev)`."""
    proc = subprocess.run(["git", "cat-file", "-t", sha], cwd=repo, text=True, capture_output=True)
    if proc.returncode != 0 or proc.stdout.strip() != "commit":
        return False, False
    anc = subprocess.run(["git", "merge-base", "--is-ancestor", sha, rev], cwd=repo, capture_output=True)
    return True, anc.returncode == 0


def _literal_paths(text: str) -> set[str]:
    """Explicit literal filenames cannot be reinterpreted as path:line citations."""
    return {
        _normalize_path_candidate(match.group(1), literal=True)
        for match in re.finditer(r"\bliteral\s+(?:filename|file|path)\s+`([^`]+)`", text, re.IGNORECASE)
    }


def _git_path_known(
    rel_path: str, head_files: set[str], hist_files: set[str], *, literal: bool = False,
) -> bool:
    variants = [rel_path] if literal else _path_variants(rel_path)
    return any(path in head_files or path in hist_files for path in variants)


def audit(repo: Path, ai_use_path: Path, rev: str = "HEAD") -> dict:
    ai_use_abs = ai_use_path if ai_use_path.is_absolute() else (repo / ai_use_path)
    try:
        ai_use_rel = ai_use_abs.resolve().relative_to(repo.resolve()).as_posix()
    except ValueError:
        ai_use_rel = str(ai_use_path)

    rows = parse_ai_use_log(ai_use_abs)
    no_ai_shas = parse_no_ai_commits(ai_use_abs)
    row_norm_map = {_normalize_row_text(r.raw_line): r for r in rows}
    commits = load_commits(repo, rev, ai_use_rel)

    # A later row may correct an earlier row's citation by naming the earlier
    # citation as a superseded form. The earlier row stays verbatim — the log
    # is append-only — and the correction exempts it from the reverse check.
    corrected_paths, corrected_shas = _corrections_by_row(rows)

    row_hits: dict[int, list[str]] = {r.index: [] for r in rows}
    covered: list[dict] = []
    uncovered_ai: list[dict] = []
    uncovered_untrailered: list[dict] = []

    for c in commits:
        matched = _rows_match_commit(c, rows, row_norm_map)
        if matched:
            covered.append({"sha": c.short_sha, "date": c.date_str, "subject": c.subject, "rows": matched})
            for row_idx, _reason in matched:
                row_hits[row_idx].append(c.short_sha)
        elif not c.ai_trailered and any(c.sha.startswith(sha) for sha in no_ai_shas):
            covered.append({"sha": c.short_sha, "date": c.date_str, "subject": c.subject, "rows": []})
        else:
            entry = {
                "sha": c.short_sha,
                "date": c.date_str,
                "subject": c.subject,
                "ai_trailered": c.ai_trailered,
                "co_authors": c.co_authors,
                "files": c.files[:8],
            }
            if c.ai_trailered:
                uncovered_ai.append(entry)
            else:
                uncovered_untrailered.append(entry)

    # Reverse checks
    head_files = set(_run_git(repo, ["ls-tree", "-r", "--name-only", rev]).splitlines())
    hist_files: set[str] = set(head_files)
    for c in commits:
        hist_files.update(c.files)

    unmatched_rows: list[dict] = []
    missing_sha_refs: list[dict] = []
    phantom_path_refs: list[dict] = []

    for r in rows:
        if not row_hits[r.index]:
            unmatched_rows.append(
                {"row": r.index, "line": r.line_no, "date": r.date_str, "tool": r.tool, "what": r.what[:140]}
            )
        for sha in sorted(r.cited_shas):
            if sha in corrected_shas.get(r.index, set()):
                continue
            exists_obj, in_rev = _git_sha_in_rev(repo, sha, rev)
            if not in_rev:
                missing_sha_refs.append(
                    {
                        "row": r.index,
                        "line": r.line_no,
                        "sha": sha,
                        "in_object_db": exists_obj,
                        "what": r.what[:120],
                    }
                )
        for p in sorted(r.cited_paths):
            # Skip explicitly documented pipeline/work scratch artifacts (git-ignored)
            if p.startswith("pipeline/work/"):
                continue
            if p in corrected_paths.get(r.index, set()):
                continue
            if not _git_path_known(p, head_files, hist_files, literal=p in r.literal_paths):
                phantom_path_refs.append({"row": r.index, "line": r.line_no, "path": p})

    return {
        "rev": rev,
        "ai_use_path": ai_use_rel,
        "total_non_merge_commits": len(commits),
        "total_log_rows": len(rows),
        "covered_commits_count": len(covered),
        "uncovered_ai_trailered": uncovered_ai,
        "uncovered_no_ai_trailer": uncovered_untrailered,
        "unmatched_log_rows": unmatched_rows,
        "missing_sha_refs": missing_sha_refs,
        "phantom_path_refs": phantom_path_refs,
    }


def _print_report(report: dict, max_list: int | None) -> None:
    print(f"AI-use log sweep ({report['ai_use_path']} vs {report['rev']})")
    print(
        f"Commits (non-merge): {report['total_non_merge_commits']} | "
        f"Covered: {report['covered_commits_count']} | "
        f"Log rows: {report['total_log_rows']}"
    )
    ai_miss = report["uncovered_ai_trailered"]
    no_tr_miss = report["uncovered_no_ai_trailer"]
    unmatched = report["unmatched_log_rows"]
    bad_shas = report["missing_sha_refs"]
    bad_paths = report["phantom_path_refs"]

    def _cap(items: list[dict]) -> tuple[list[dict], int]:
        if max_list is None or len(items) <= max_list:
            return items, 0
        return items[:max_list], len(items) - max_list

    print(f"\n[Forward] Uncovered commits WITH AI Co-Authored-By trailer: {len(ai_miss)}")
    shown, rem = _cap(ai_miss)
    for item in shown:
        print(f"  - {item['sha']} ({item['date']}) {item['subject']} [{'; '.join(item['co_authors'])}]")
    if rem:
        print(f"  ... and {rem} more")

    print(f"\n[Forward] Uncovered commits WITHOUT AI trailer (human-only or untrailered): {len(no_tr_miss)}")
    shown, rem = _cap(no_tr_miss)
    for item in shown:
        print(f"  - {item['sha']} ({item['date']}) {item['subject']}")
    if rem:
        print(f"  ... and {rem} more")

    print(f"\n[Reverse] Log rows matching zero commits in {report['rev']}: {len(unmatched)}")
    for item in unmatched:
        print(f"  - line {item['line']} (row #{item['row']}, {item['date']}, {item['tool']}): {item['what']}")

    print(f"\n[Reverse] Commit SHAs cited in Log not in {report['rev']} history: {len(bad_shas)}")
    for item in bad_shas:
        note = "exists only outside HEAD (e.g. rebased/dropped branch)" if item["in_object_db"] else "unknown object"
        print(f"  - line {item['line']} (row #{item['row']}): `{item['sha']}` ({note})")

    print(f"\n[Reverse] Cited repo paths missing from {report['rev']} and git history: {len(bad_paths)}")
    for item in bad_paths:
        print(f"  - line {item['line']} (row #{item['row']}): `{item['path']}`")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify bidirectional coverage between git commits and docs/AI_USE.md.")
    parser.add_argument("--repo", type=Path, default=Path("."), help="Path to git repository root (default: .)")
    parser.add_argument("--ai-use", type=Path, default=DEFAULT_AI_USE, help="Path to AI_USE.md (default: docs/AI_USE.md)")
    parser.add_argument("--rev", default="HEAD", help="Git revision to inspect (default: HEAD)")
    parser.add_argument("--json", action="store_true", help="Print JSON output instead of human text")
    parser.add_argument("--max-list", type=int, default=None, help="Cap printed items per section")
    args = parser.parse_args(argv)

    repo = args.repo.resolve()
    report = audit(repo, args.ai_use, args.rev)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_report(report, args.max_list)

    has_issues = any(
        [
            report["uncovered_ai_trailered"],
            report["uncovered_no_ai_trailer"],
            report["unmatched_log_rows"],
            report["missing_sha_refs"],
            report["phantom_path_refs"],
        ]
    )
    return 1 if has_issues else 0


if __name__ == "__main__":
    sys.exit(main())
