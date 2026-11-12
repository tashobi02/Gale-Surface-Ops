"""Docs: docs/plan/README.md §5.1. Row-aware merge of docs/tasks/status.md during a conflicted `git merge` (run in the worktree).
Start from the incoming side (MERGE_HEAD = main); re-apply rows this branch changed vs the merge base.
Rows both sides changed keep main's version and are printed for review. Exit 2 if any duplicates remain."""
import re, subprocess, sys
f = "docs/tasks/status.md"
def show(rev): return subprocess.run(["git", "show", f"{rev}:{f}"], capture_output=True, text=True).stdout
base_rev = subprocess.run(["git", "merge-base", "HEAD", "MERGE_HEAD"], capture_output=True, text=True).stdout.strip()
def rows(t):
    return {m.group(1): l for l in t.split("\n") if (m := re.match(r"^\| (T\d+\.\d+) \|", l))}
main_t = show("MERGE_HEAD"); base, ours, main = rows(show(base_rev)), rows(show("HEAD")), rows(main_t)
out = main_t.split("\n")
def index(): return {m.group(1): i for i, l in enumerate(out) if (m := re.match(r"^\| (T\d+\.\d+) \|", l))}
for k, line in ours.items():
    if line == base.get(k): continue
    if k in main and main[k] != base.get(k) and main[k] != line:
        print(f"BOTH changed {k}: kept main's"); continue
    idx = index()
    if k in idx: out[idx[k]] = line
    else:
        t = k.split(".")[0]; same = [i for kk, i in idx.items() if kk.startswith(t + ".")]
        out.insert((max(same) if same else max(idx.values())) + 1, line)
open(f, "w").write("\n".join(out))
ids = [m.group(1) for l in out if (m := re.match(r"^\| (T\d+\.\d+) \|", l))]
d = sorted({i for i in ids if ids.count(i) > 1})
if d: print("DUPLICATES", d); sys.exit(2)
