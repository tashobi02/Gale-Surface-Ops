"""Fetch source products into pipeline/work/ (docs/specs/02 §A.1, §C.2; 06 TASK-01, TASK-03).

Never run before TASK-00/TASK-01. Prefer GDAL `/vsicurl/` window reads over full downloads
(02 §C.2 L1). Records URLs and checksums in sources.lock.json (05 §E.5).
"""
from __future__ import annotations

from pathlib import Path


def fetch_sources(lock_path: Path, work_dir: Path) -> None:
    """Download or window-read every source listed in the lock file into `work_dir`.

    Inputs: sources.lock.json path; work directory (git-ignored).
    Outputs: files under work_dir; updated sha256 entries. FR-01–FR-03. TASK-03.
    """
    raise NotImplementedError("TASK-03")
