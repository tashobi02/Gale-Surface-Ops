#!/bin/bash
# Link the git-ignored data folders to the data SSD (BD-12, BD-126; docs/ops/ssd.md).
#   make ssd-link SSD="/Volumes/<name>/<folder>"      or      bash scripts/ssd-link.sh "$SSD"
# Layout on the SSD:
#   $SSD/work/<name>/                   -> pipeline/work/<name>             (inputs and intermediates)
#   $SSD/sites/gale_boxwork/<name>/     -> data/sites/gale_boxwork/<name>   (tiles, grid, images)
# pipeline/work and data/sites/gale_boxwork stay real directories because they hold tracked files
# (.gitkeep, README.md, the manifest). Idempotent. Never deletes a link target or a non-empty folder:
# it removes only symbolic links and empty directories, and reports anything else on stderr (exit 1).
set -euo pipefail

ssd="${1:-}"
if [ -z "$ssd" ]; then
  echo "ssd-link: the SSD argument is empty. Usage: scripts/ssd-link.sh <SSD data folder> (make ssd-link SSD=...)" >&2
  exit 2
fi
if [ ! -d "$ssd" ]; then
  echo "ssd-link: the SSD folder '$ssd' is not a directory (is the drive mounted?)" >&2
  exit 2
fi
case "$ssd" in /*) ;; *) ssd="$PWD/$ssd" ;; esac
ssd="${ssd%/}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0

# Folders the pipeline writes (BD-12); created on the SSD when missing. Any other folder under $SSD/work is linked too.
pipeline_dirs="dem ortho ti images spice rad donki traverse runs"
site_dirs="tiles grid images"

# link_dir <path in the repo> <target on the SSD>
link_dir() {
  local link="$1" target="$2" rel="${1#"$root"/}"
  mkdir -p "$target"
  if [ -L "$link" ]; then
    local current; current="$(readlink "$link")"
    if [ "${current%/}" = "$target" ]; then
      echo "ok   $rel"
      return
    fi
    rm "$link"
  elif [ -d "$link" ]; then
    if [ -n "$(find "$link" -mindepth 1 -print -quit)" ]; then
      echo "ssd-link: $rel is a real folder with files in it; move them to $target and run again" >&2
      status=1
      return
    fi
    rmdir "$link"
  elif [ -e "$link" ]; then
    echo "ssd-link: $rel exists and is not a folder; left alone" >&2
    status=1
    return
  fi
  ln -s "$target" "$link"
  echo "link $rel -> $target"
}

# pipeline/work must be a real directory (a linked worktree may have it as a link to another clone: replace the link only).
work="$root/pipeline/work"
if [ -L "$work" ]; then
  rm "$work"
  echo "unlink pipeline/work (was a link; its target is untouched)"
fi
mkdir -p "$work"
[ -e "$work/.gitkeep" ] || : > "$work/.gitkeep"

names="$pipeline_dirs"
if [ -d "$ssd/work" ]; then
  for d in "$ssd"/work/*/; do
    [ -d "$d" ] || continue
    n="$(basename "$d")"
    case " $names " in *" $n "*) ;; *) names="$names $n" ;; esac
  done
fi
for n in $names; do
  link_dir "$work/$n" "$ssd/work/$n"
done

site="$root/data/sites/gale_boxwork"
mkdir -p "$site"
for n in $site_dirs; do
  link_dir "$site/$n" "$ssd/sites/gale_boxwork/$n"
done

exit "$status"
