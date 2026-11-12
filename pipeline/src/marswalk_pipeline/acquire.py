"""Fetch source products into pipeline/work/ (02 §A.1, §C.2; 05 §E.5; BD-14, BD-134).

Internet is used here and only here, in the pipeline stage before the event (CLAUDE.md §2). ``offline=True`` (CLI
``--offline``) makes no request at all: files that are present are verified against the lock, a file that is absent is an
error that names it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

BLOCK = 1024 * 1024


class OfflineError(RuntimeError):
    """``--offline`` was asked for and a locked source is not in the work folder."""


def _plain_component(value: object, what: str) -> str:
    if not isinstance(value, str) or value in ("", ".", "..") or "/" in value or "\\" in value:
        raise ValueError(f"A source {what} must be one plain file name, got {value!r}")
    return value


def source_filename(entry: dict) -> str:
    """Return the same cache path (relative to the work folder) for acquisition and clipping.

    ``filename`` (one plain name) replaces the URL's basename; ``dir`` (relative, no ``..``) is a sub-folder such as
    ``images`` or ``dem``. Without either, a plain URL gives its basename and a windowed one ``<stem>.<hash>.tif``.
    """
    url = entry["url"]
    parsed = urlparse(url)
    name = Path(unquote(parsed.path)).name
    if "filename" in entry:
        name = _plain_component(entry["filename"], "filename")
    elif not name or name in (".", ".."):
        raise ValueError(f"Source URL has no filename: {url}")
    projection, extent = entry.get("proj4"), entry.get("extent_m")
    if (projection is None) != (extent is None):
        raise ValueError("A source window requires both proj4 and extent_m")
    if projection is not None and "filename" not in entry:
        key = json.dumps([url, projection, extent], separators=(",", ":"))
        suffix = hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
        name = f"{Path(name).stem}.{suffix}.tif"
    if "dir" in entry:
        folder = entry["dir"]
        parts = PurePosixPath(folder).parts if isinstance(folder, str) else ()
        if not parts or folder.startswith("/") or "\\" in folder or any(p in ("..", ".") for p in parts):
            raise ValueError(f"A source dir must be a relative folder inside the work folder, got {folder!r}")
        return str(PurePosixPath(*parts) / name)
    return name


def _sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(BLOCK), b""):
            digest.update(block)
    return digest.hexdigest()


def _check(path: Path, entry: dict, what: str) -> str:
    """The digest of ``path``; raises when the entry's ``size`` or ``sha256`` differs."""
    size = entry.get("size")
    if size is not None and path.stat().st_size != size:
        raise ValueError(f"{what}: size {path.stat().st_size} differs from the lock's {size}: {path}")
    checksum = _sha256_of(path)
    if entry.get("sha256") not in (None, checksum):
        raise ValueError(f"{what}: checksum {checksum} differs from the lock's {entry['sha256']}: {path}")
    return checksum


def _download(url: str, part: Path, entry: dict) -> str:
    """Fetch ``url`` into ``part``, resuming it with a Range request; the finished file is verified (its digest is returned), a wrong one removed."""
    for attempt in (0, 1):
        have = part.stat().st_size if part.exists() else 0
        headers = {"Range": f"bytes={have}-"} if have else {}
        mode, finished = "wb", False
        try:
            response = urlopen(Request(url, headers=headers), timeout=60)
        except HTTPError as err:
            if err.code != 416 or not have:
                raise
            response, finished = None, True  # the server has nothing past what the part holds
        if response is not None:
            with response:
                if response.status == 206 and response.headers.get("Content-Range", "").startswith(f"bytes {have}-"):
                    mode = "ab"
                length = response.headers.get("Content-Length")
                before = have if mode == "ab" else 0
                with part.open(mode) as dest:
                    shutil.copyfileobj(response, dest, BLOCK)
                if length is not None and part.stat().st_size - before != int(length):
                    raise ValueError(f"Download is shorter than the server announced (kept for a resume): {url}")
        try:
            return _check(part, entry, entry.get("source_id") or url)
        except ValueError:
            part.unlink(missing_ok=True)
            if not have or attempt == 1 or not (finished or mode == "ab"):
                raise
            # a resumed file that does not verify: one clean download from byte 0


def fetch_sources(lock_path: Path, work_dir: Path, *, data_version: str | None = None, offline: bool = False) -> None:
    """Acquire sources and record checksums and tool versions in the lock file.

    Entries may supply ``proj4`` and ``extent_m`` for a GDAL window in the working projection. Without both, the source is
    copied whole and cached at ``source_filename(entry)``. A cached file is verified against ``sha256`` and ``size`` and is
    never replaced or deleted. With ``offline`` nothing is requested and a missing file raises ``OfflineError``.
    """
    lock_path = Path(lock_path)
    work_dir = Path(work_dir)
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    entries = [entry for entry in lock["sources"] if entry.get("url") is not None]
    if data_version is not None:
        lock["data_version"] = data_version
    if offline:
        missing = [f"{entry.get('source_id')} ({source_filename(entry)})" for entry in entries if not (work_dir / source_filename(entry)).exists()]
        if missing:
            raise OfflineError(f"--offline: not in {work_dir}: " + ", ".join(missing))
    if entries:
        # Import only when acquisition is requested, never at module import time.
        from osgeo import gdal
        import rasterio

    work_dir.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        url = entry["url"]
        parsed = urlparse(url)
        if parsed.scheme not in ("", "file", "http", "https"):
            raise ValueError(f"Unsupported source URL scheme: {parsed.scheme}")
        target = work_dir / source_filename(entry)
        projection = entry.get("proj4")
        extent = entry.get("extent_m")
        cached = target.exists()
        digest = None
        if not cached:
            target.parent.mkdir(parents=True, exist_ok=True)
            part = target.with_name(target.name + ".part")
            if projection is not None:
                try:
                    minx, miny, maxx, maxy = extent
                    source = f"/vsicurl/{url}" if parsed.scheme in ("http", "https") else (
                        unquote(parsed.path) if parsed.scheme == "file" else url
                    )
                    previous_mask = gdal.GetConfigOption("GDAL_TIFF_INTERNAL_MASK")
                    gdal.SetConfigOption("GDAL_TIFF_INTERNAL_MASK", "YES")
                    try:
                        result = gdal.Translate(
                            str(part), source,
                            format="GTiff", projWin=[minx, maxy, maxx, miny],
                            projWinSRS=projection,
                        )
                        if result is None:
                            raise RuntimeError(f"GDAL could not window source: {url}")
                        result = None
                    finally:
                        gdal.SetConfigOption("GDAL_TIFF_INTERNAL_MASK", previous_mask)
                    part.replace(target)
                finally:
                    part.unlink(missing_ok=True)
                    for sidecar in part.parent.iterdir():
                        if sidecar.name.startswith(part.name + "."):
                            sidecar.unlink(missing_ok=True)
            elif parsed.scheme in ("http", "https"):
                digest = _download(url, part, entry)
                part.replace(target)
            else:
                source = unquote(parsed.path) if parsed.scheme == "file" else url
                try:
                    shutil.copyfile(source, part)
                    digest = _check(part, entry, entry.get("source_id") or url)
                    part.replace(target)
                finally:
                    part.unlink(missing_ok=True)
            entry["accessed"] = datetime.now(timezone.utc).date().isoformat()
        if cached:
            digest = _check(target, entry, entry.get("source_id") or url)
        elif digest is None:
            # A fresh GDAL window is not byte-stable across tool versions: its digest is recorded, not compared.
            digest = _sha256_of(target)
        entry["sha256"] = digest

    if entries:
        lock.setdefault("tools", {}).update(gdal=gdal.VersionInfo("RELEASE_NAME"), rasterio=rasterio.__version__)
    temporary_lock = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=lock_path.parent, delete=False) as dest:
            temporary_lock = Path(dest.name)
            dest.write(json.dumps(lock, indent=2) + "\n")
        os.replace(temporary_lock, lock_path)
    finally:
        if temporary_lock is not None:
            temporary_lock.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    """``python -m marswalk_pipeline.acquire --lock <file> --work <dir> [--offline]``: the acquire step alone."""
    parser = argparse.ArgumentParser(prog="python -m marswalk_pipeline.acquire", description="Fetch (or, with --offline, only verify) the sources of a lock file.")
    root = Path(__file__).resolve().parents[3]
    parser.add_argument("--lock", type=Path, default=root / "pipeline" / "sources.lock.json")
    parser.add_argument("--work", type=Path, default=root / "pipeline" / "work")
    parser.add_argument("--data-version", default=None)
    parser.add_argument("--offline", action="store_true", help="make no request: verify present files, fail on absent ones")
    args = parser.parse_args(argv)
    try:
        fetch_sources(args.lock, args.work, data_version=args.data_version, offline=args.offline)
    except (OfflineError, ValueError, OSError) as exc:
        print(f"acquire failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
