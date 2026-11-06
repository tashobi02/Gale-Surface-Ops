#!/usr/bin/env python3
"""Check the atomized task plans in docs/tasks/ against their template and the coordination map.

Usage: python3 scripts/check_tasks.py [DIR] [--file TASK_FILE] [--summary]   (default DIR: docs/tasks)

Exits 1 and prints one line per problem: a duplicate subtask id; an id, title, Type, Tag or Window
that differs from the register in DIR/_coordination.md; a missing template field or section; an
estimate over 3 h; a dependency on an unknown id or without (hard)/(soft); a dependency cycle; two
subtasks owning the same path outside the annotations of _coordination.md §c.1; an FR-01…FR-17,
FR-30…FR-50 or SCR-00…SCR-18 id cited by no subtask. Task codes are two digits with an optional
letter (TASK-05b, ids T05b.01). --file checks one task file alone (no cross-file rules).
--summary prints Markdown tables: per task, hours per lane and window, start-here list, cross-task
edges. Standard library only.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

FIELDS = ["Owner", "Type", "Tag", "Window", "Estimate", "Owns (writes)", "Reads", "Depends on", "Parallel with",
          "Steps", "Acceptance", "Verify", "Agent brief", "Conflict notes"]
TASK_ROWS = ["Objective", "Requirements", "Lane / owner role", "Milestone", "Window", "Effort (doc 06)",
             "Done when (doc 06)", "Main risk → fallback", "Spec sections"]
SECTIONS = ["Inputs this task consumes", "Outputs this task provides", "Subtasks", "Internal dependency graph",
            "Definition of done (task level)", "Spec questions"]
CHANGE_TITLES = ("contract-change:", "spec-change:", "follow-up:")
WINDOWS = ["pre-event-allowed", "pre-event-if-permitted", "event-only"]

SUB = re.compile(r"^### (T\d\d[a-z]?\.\d\d) — (.+)$")
FIELD = re.compile(r"^- \*\*(.+?):\*\*\s*(.*)$")
ROW = re.compile(r"^\| (.+?) \| (.*) \|$")
ID_RANGE = re.compile(r"\b(T\d\d[a-z]?)\.(\d\d)(?:\s*[–-]\s*(?:\1\.)?(\d\d)\b)?")
REQ_RANGE = re.compile(r"\b(FR|NFR|SCR)-(\d\d)(?:\s*[–-]\s*(?:\1-)?(\d\d)\b)?")
DEP = re.compile(r"(T\d\d[a-z]?\.\d\d(?:\s*[–-]\s*(?:T\d\d[a-z]?\.)?\d\d)?)\s*\(((hard|soft)\b[^)]*)\)")
PATH = re.compile(r"`([^`]+)`(?:\s*\(([^)]*)\))?")


LANES = ["data", "compute", "frontend", "design", "story", "integration", "hab-core"]
TASK_CODE = re.compile(r"TASK-(\d\d[a-z]?)_")


def code_of_file(path):
    """'05b' for TASK-05b_compute-v2.md."""
    m = TASK_CODE.match(path.name)
    return m[1] if m else path.name[5:7]


def code_of_id(i):
    """'05b' for T05b.01."""
    return i[1:].split(".")[0]


def ids(text, pattern=ID_RANGE, sep="."):
    """Ids in text, with ranges such as T05.16–T05.27 or FR-07–FR-10 expanded."""
    out = []
    for head, lo, hi in pattern.findall(text):
        out += [f"{head}{sep}{n:02d}" for n in range(int(lo), int(hi or lo) + 1)]
    return out


def norm(text):
    return " ".join(text.replace("`", "").split())


def register(coord):
    """Rows of the §a.3 register: id → title, lane, type, tag, window, m, reqs."""
    reg = {}
    for line in coord.split("\n## b. ")[0].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 8 and re.fullmatch(r"T\d\d[a-z]?\.\d\d", cells[0]):
            reg[cells[0]] = dict(zip(("title", "lane", "type", "tag", "window", "m", "reqs"), cells[1:]))
    return reg


def append_only(coord):
    """Paths whose §c rule says append-only."""
    part = coord.split("## c. Path ownership")[1].split("\n## d. ")[0]
    paths = set()
    for line in part.splitlines():
        cells = line.strip().strip("|").split("|")
        if len(cells) == 3 and "append-only" in cells[2].lower():
            paths |= set(re.findall(r"`([^`]+)`", cells[0]))
    return paths


def parse(path):
    task = {"path": path, "h1": "", "rows": {}, "sections": set(), "subtasks": []}
    cur, last = None, None
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("# "):
            task["h1"] = line[2:].strip()
        elif m := SUB.match(line):
            cur, last = {"id": m[1], "title": m[2].strip(), "file": path, "line": n, "fields": {}, "text": line}, None
            task["subtasks"].append(cur)
        elif line.startswith("## "):
            task["sections"].add(line[3:].strip())
            cur = None
        elif cur:
            cur["text"] += "\n" + line
            if (m := FIELD.match(line)) and m[1] in FIELDS:
                last = m[1]
                cur["fields"][last] = m[2].strip()
            elif last and line.strip():
                cur["fields"][last] = (cur["fields"][last] + " " + line.strip()).strip()
        elif m := ROW.match(line):
            task["rows"][m[1].strip()] = m[2].strip()
    return task


def annotation(text):
    """(kind, ref) for an Owns annotation; kind None when unknown."""
    if not text:
        return "own", None
    if text in ("append-only", "spec-change"):
        return text, None
    m = re.fullmatch(r"(stub →|after|replaces) (T\d\d[a-z]?\.\d\d)", text)
    return (m[1].split()[0], m[2]) if m else (None, None)


def check_task(t, problems):
    where = str(t["path"])
    if not re.fullmatch(r"TASK-\d\d[a-z]?_[a-z0-9-]+\.md", t["path"].name):
        problems.append(f"{where}: file name must be TASK-NN_<kebab-title>.md (NN may end in one letter)")
    head = "TASK-" + code_of_file(t["path"])
    if not t["h1"].startswith(head + " — "):
        problems.append(f"{where}: H1 must be '# {head} — <title>'")
    problems += [f"{where}: header table lacks '{r}'" for r in TASK_ROWS if r not in t["rows"]]
    problems += [f"{where}: missing section '## {s}'" for s in SECTIONS if s not in t["sections"]]
    if not t["subtasks"]:
        problems.append(f"{where}: no subtasks")
    for s in t["subtasks"]:
        if code_of_id(s["id"]) != code_of_file(t["path"]):
            problems.append(f"{where}:{s['line']}: {s['id']} belongs to another task file")


def check_subtask(s, reg, known, problems):
    where, f = f"{s['file']}:{s['line']}: {s['id']}", s["fields"]
    problems += [f"{where}: missing field '{name}'" for name in FIELDS if not f.get(name)]
    r = reg.get(s["id"])
    if r is None:
        problems.append(f"{where}: not in the register")
    else:
        pairs = [("title", s["title"], r["title"]), ("Tag", f.get("Tag", ""), r["tag"]),
                 ("Type", (f.get("Type", "") + " ?").split()[0], r["type"]),
                 ("Window", (f.get("Window", "") + " ?").split()[0], r["window"])]
        problems += [f"{where}: {k} '{got}' differs from the register '{want}'"
                     for k, got, want in pairs if norm(got) != norm(want)]
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", f.get("Estimate", ""))]
    if f.get("Estimate") and (not nums or max(nums) > 3):
        problems.append(f"{where}: estimate '{f['Estimate']}' must be at most 3 h")
    s["est"] = (min(nums), max(nums)) if nums else (0.0, 0.0)

    dep = f.get("Depends on", "")
    s["deps"], s["why"] = {}, {}
    if not dep.lower().startswith("none"):
        for expr, why, kind in DEP.findall(dep):
            for i in ids(expr):
                s["deps"][i], s["why"][i] = kind, why
        problems += [f"{where}: dependency {i} lacks (hard) or (soft)" for i in set(ids(dep)) - set(s["deps"])]
    if s["id"] in s["deps"]:
        problems.append(f"{where}: depends on itself")
    for i in sorted(set(s["deps"]) | set(ids(f.get("Parallel with", "")))):
        if i not in known:
            problems.append(f"{where}: unknown id {i}")

    s["owns"] = []
    own = f.get("Owns (writes)", "")
    if own and not own.lower().startswith("none"):
        for p, ann in PATH.findall(own):
            kind, ref = annotation(ann.strip())
            if kind is None:
                problems.append(f"{where}: unknown annotation '({ann})' on {p}")
            s["owns"].append((p.strip(), kind, ref))
        if not s["owns"]:
            problems.append(f"{where}: Owns lists no backticked path")


def cycle(by_id):
    """One dependency cycle as a list of ids, or None."""
    state = {}

    def visit(i, trail):
        state[i] = "open"
        for d in by_id[i]["deps"]:
            if d in by_id and state.get(d) == "open":
                return trail + [i, d]
            if d in by_id and d not in state and (found := visit(d, trail + [i])):
                return found
        state[i] = "done"
        return None

    for i in by_id:
        if i not in state and (found := visit(i, [])):
            return found
    return None


def check_all(subs, reg, aonly, problems):
    by_id = {}
    for s in subs:
        if s["id"] in by_id:
            problems.append(f"{s['file']}:{s['line']}: duplicate id {s['id']} (also {by_id[s['id']]['file']})")
        by_id.setdefault(s["id"], s)
    problems += [f"{i}: in the register but in no task file" for i in reg if i not in by_id]

    owner = {}
    for s in subs:
        for p, kind, _ in s["owns"]:
            if kind == "own" and p in owner:
                problems.append(f"{s['file']}:{s['line']}: {s['id']} owns {p}, already owned by {owner[p]}")
            elif kind == "own":
                owner[p] = s["id"]
    for s in subs:
        typ = (s["fields"].get("Type", "") + " ?").split()[0]
        for p, kind, ref in s["owns"]:
            w = f"{s['file']}:{s['line']}: {s['id']}: {p}"
            if kind in ("stub", "after", "replaces") and owner.get(p) != ref:
                problems.append(f"{w}: ({kind}) names {ref}, but the owner is {owner.get(p, 'nobody')}")
            if kind == "stub" and typ != "contract":
                problems.append(f"{w}: only contract subtasks create stubs")
            if kind == "stub" and ref in by_id and s["id"] not in by_id[ref]["deps"]:
                problems.append(f"{w}: {ref} must depend on {s['id']}")
            if kind == "after" and not s["title"].startswith(CHANGE_TITLES):
                problems.append(f"{w}: (after) needs a contract-change:, spec-change: or follow-up: title")
            if kind == "after" and s["deps"].get(ref) != "hard":
                problems.append(f"{w}: (after) needs a hard dependency on {ref}")
            if kind == "replaces" and typ != "fallback":
                problems.append(f"{w}: (replaces) is for fallback subtasks only")
            if kind == "append-only" and p not in aonly:
                problems.append(f"{w}: not an append-only path in _coordination.md §c")
            if kind == "spec-change" and not (p.startswith("docs/specs/") and
                                              (typ == "fallback" or s["title"].startswith("spec-change:"))):
                problems.append(f"{w}: (spec-change) is for docs/specs/ in spec-change or fallback subtasks")

    if found := cycle(by_id):
        problems.append("dependency cycle: " + " → ".join(found))
    cited = {r for s in subs for r in ids(s["text"], REQ_RANGE, "-")}
    wanted = ([f"FR-{n:02d}" for n in range(1, 18)] + [f"FR-{n:02d}" for n in range(30, 51)]
              + [f"SCR-{n:02d}" for n in range(19)])
    problems += [f"{r}: cited by no subtask" for r in wanted if r not in cited]
    return by_id


def hours(items):
    lo, hi = sum(s["est"][0] for s in items), sum(s["est"][1] for s in items)
    return f"{lo:g}–{hi:g}" if items else "—"


def summary(tasks, reg, by_id):
    print("| Task | Title | Lane | Milestone | Window | Subtasks | Estimate (h) |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    for t in tasks:
        r = t["rows"]
        title = t["h1"].split(" — ", 1)[-1]
        print(f"| TASK-{code_of_file(t['path'])} | [{title}]({t['path'].name}) | {r.get('Lane / owner role', '')} "
              f"| {r.get('Milestone', '')} | {r.get('Window', '')} | {len(t['subtasks'])} | {hours(t['subtasks'])} |")

    def kind(s):
        typ = reg.get(s["id"], {})
        if typ.get("type") == "fallback":
            return "fallback"
        return "desirable" if "desirable" in typ.get("tag", "") else typ.get("window", "?")

    cols = WINDOWS + ["fallback", "desirable"]
    groups = defaultdict(list)
    for s in by_id.values():
        groups[(reg.get(s["id"], {}).get("lane", "?"), kind(s))].append(s)
    print("\n| Lane | " + " | ".join(cols) + " | All |")
    print("| --- | " + " | ".join("---" for _ in cols) + " | --- |")
    for lane in LANES:
        cells = [hours(groups[(lane, c)]) for c in cols]
        everything = [s for c in cols for s in groups[(lane, c)]]
        print(f"| {lane} | " + " | ".join(cells) + f" | {hours(everything)} |")
    print(f"| all | " + " | ".join(hours([s for (_, c), g in groups.items() if c == col for s in g]) for col in cols)
          + f" | {hours(list(by_id.values()))} |")

    print("\nStart here (no hard dependency; fallbacks excluded):")
    first = defaultdict(list)
    for s in by_id.values():
        r = reg.get(s["id"], {})
        if r.get("type") != "fallback" and "hard" not in s["deps"].values():
            first[r.get("lane", "?")].append(s["id"])
    for lane, items in first.items():
        print(f"- {lane}: {', '.join(sorted(items))}")
    print("\nFirst wave today (no dependency at all, pre-event-allowed, not test/implement, not a fallback):")
    today = defaultdict(list)
    for s in by_id.values():
        r = reg.get(s["id"], {})
        if not s["deps"] and r.get("window") == "pre-event-allowed" and r.get("type") not in ("test", "implement", "fallback"):
            today[r.get("lane", "?")].append(s["id"])
    for lane, items in today.items():
        print(f"- {lane}: {', '.join(sorted(items))}")

    edges = [(s["id"], d, k, s["why"][d]) for s in by_id.values() for d, k in s["deps"].items()
             if code_of_id(d) != code_of_id(s["id"])]
    print(f"\nCross-task dependencies: {sum(k == 'hard' for *_, k, _ in edges)} hard, "
          f"{sum(k == 'soft' for *_, k, _ in edges)} soft. Hard ones:")
    for i, d, k, why in sorted(edges):
        if k == "hard":
            print(f"- {i} → {d}: {why}")


def main(argv):
    want_summary = "--summary" in argv
    rest = [a for a in argv if a != "--summary"]
    only = None
    if "--file" in rest:
        i = rest.index("--file")
        only = Path(rest[i + 1])
        del rest[i:i + 2]
    root = only.parent if only else Path(rest[0] if rest else "docs/tasks")
    coord = (root / "_coordination.md").read_text(encoding="utf-8")
    reg, aonly = register(coord), append_only(coord)
    tasks = [parse(p) for p in ([only] if only else sorted(root.glob("TASK-*.md")))]
    subs = [s for t in tasks for s in t["subtasks"]]
    known = set(reg) if only else {s["id"] for s in subs}

    problems = []
    for t in tasks:
        check_task(t, problems)
    for s in subs:
        check_subtask(s, reg, known, problems)
    if not only:
        missing = sorted({code_of_id(i) for i in reg} - {code_of_file(t["path"]) for t in tasks})
        problems += [f"TASK-{n}: no task file" for n in missing]
        by_id = check_all(subs, reg, aonly, problems)
        if want_summary:
            summary(tasks, reg, by_id)
    for p in problems:
        print(p)
    print(f"{len(tasks)} task files, {len(subs)} subtasks, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
