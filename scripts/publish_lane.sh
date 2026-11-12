#!/bin/bash
# Publish your lane branch (core-frontend or core-backend) to merging-core with no hand-off (docs/plan/README.md §5).
# Run from the root of your lane clone, on your lane branch, with a clean working tree:
#   bash scripts/publish_lane.sh
# Loop: merge the latest origin/merging-core into the lane (mechanical conflicts via scripts/finish_merge.sh logic),
# run `make lint typecheck test-web docs-check`, push the lane, then push the same commit to merging-core as a
# FAST-FORWARD only. If the other lane published first, the push is rejected and the loop starts again.
# It never force-pushes and never pushes a commit whose checks failed.
set -euo pipefail

branch="$(git branch --show-current)"
case "$branch" in
  core-frontend|core-backend) ;;
  *) echo "publish_lane: run this on core-frontend or core-backend (you are on '$branch')"; exit 2 ;;
esac
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "publish_lane: commit or stash your changes first"; exit 2
fi

for attempt in 1 2 3 4 5; do
  git fetch -q origin
  if ! git merge -q --no-ff --no-edit origin/merging-core >/dev/null 2>&1; then
    # resolve README / AI_USE / status mechanically; anything else stops here
    unresolved=""
    for f in $(git diff --name-only --diff-filter=U); do
      case "$f" in
        README.md) git checkout --theirs README.md ;;
        docs/AI_USE.md)
          tmp="$(mktemp -d)"
          git show :1:"$f" > "$tmp/b" 2>/dev/null || : > "$tmp/b"
          git show :2:"$f" > "$tmp/o"; git show :3:"$f" > "$tmp/t"
          git merge-file --union "$tmp/o" "$tmp/b" "$tmp/t"; cp "$tmp/o" "$f" ;;
        docs/tasks/status.md) python3 scripts/merge_status.py ;;
        *) unresolved="$unresolved $f"; continue ;;
      esac
      git add "$f"
    done
    if [ -n "$unresolved" ]; then
      echo "publish_lane: UNRESOLVED:$unresolved"
      echo "  resolve them per docs/plan/README.md §5.2, commit the merge, then run publish_lane.sh again"
      exit 3
    fi
    python3 scripts/update_progress.py >/dev/null; git add README.md
    git -c core.editor=true commit -q --no-edit
  fi
  python3 scripts/update_progress.py --check >/dev/null || {
    python3 scripts/update_progress.py >/dev/null; git add README.md
    git commit -q -m "chore: regenerate README progress after merging merging-core"; }

  echo "publish_lane: checking the merged result (attempt $attempt)…"
  if ! make -s lint typecheck test-web docs-check >/tmp/publish_lane_checks.log 2>&1; then
    echo "publish_lane: checks FAILED — nothing pushed to merging-core. See /tmp/publish_lane_checks.log;"
    echo "  fix it on $branch, commit, and run publish_lane.sh again."
    exit 4
  fi

  git push -q origin "$branch"
  if git push -q origin "HEAD:merging-core" 2>/dev/null; then
    echo "publish_lane: published $branch $(git log -1 --format=%h) to merging-core"
    exit 0
  fi
  echo "publish_lane: merging-core moved (the other lane published) — merging again"
done
echo "publish_lane: gave up after 5 attempts; run it again in a minute"; exit 5
