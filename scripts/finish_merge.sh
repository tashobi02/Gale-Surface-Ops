#!/bin/bash
# Finish a `git merge` that stopped on conflicts in the mechanical files (docs/plan/README.md §5.1).
# Usage (from the repo root, while the merge is stopped): bash scripts/finish_merge.sh .
#   README.md            -> take the incoming side, regenerate the progress block
#   docs/AI_USE.md       -> union merge (append-only log; both sides' rows kept)
#   docs/tasks/status.md -> row-aware merge (scripts/merge_status.py)
#   anything else        -> stop with UNRESOLVED <path>; resolve by hand (README §5.2), then rerun
set -e
cd "${1:-.}"
SCRIPTS="$(git rev-parse --show-toplevel)/scripts"
for f in $(git diff --name-only --diff-filter=U); do
  case "$f" in
    README.md) git checkout --theirs README.md ;;
    docs/AI_USE.md)
      tmp="$(mktemp -d)"
      git show :1:"$f" > "$tmp/b" 2>/dev/null || : > "$tmp/b"
      git show :2:"$f" > "$tmp/o"; git show :3:"$f" > "$tmp/t"
      git merge-file --union "$tmp/o" "$tmp/b" "$tmp/t"; cp "$tmp/o" "$f" ;;
    docs/tasks/status.md) python3 "$SCRIPTS/merge_status.py" ;;
    *) echo "UNRESOLVED $f"; exit 3 ;;
  esac
  git add "$f"
done
python3 scripts/update_progress.py >/dev/null; git add README.md
git -c core.editor=true commit -q --no-edit
python3 scripts/update_progress.py --check
git push -q origin HEAD
echo "merged: $(git branch --show-current) $(git log -1 --format=%h)"
