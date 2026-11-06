"""Fetch source products into pipeline/work/ (02 §A.1, §C.2; 05 §E.5)."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse


def fetch_sources(lock_path: Path, work_dir: Path) -> None:
    """Acquire sources and record checksums and tool versions in the lock file.

    Entries may supply ``proj4`` and ``extent_m`` for a GDAL window in the
    working projection. Without both, the source is copied whole and cached
    under the URL's basename.
    """
    lock_path = Path(lock_path)
    work_dir = Path(work_dir)
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    entries = [entry for entry in lock["sources"] if entry.get("url") is not None]
    if not entries:
        return

    # Import only when acquisition is requested, never at module import time.
    from osgeo import gdal
    import rasterio

    work_dir.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        url = entry["url"]
        parsed = urlparse(url)
        if parsed.scheme not in ("", "file", "http", "https"):
            raise ValueError(f"Unsupported source URL scheme: {parsed.scheme}")
        name = Path(unquote(parsed.path)).name
        if not name or name in (".", ".."):
            raise ValueError(f"Source URL has no filename: {url}")
        projection = entry.get("proj4")
        extent = entry.get("extent_m")
        if (projection is None) != (extent is None):
            raise ValueError("A source window requires both proj4 and extent_m")
        if projection is not None:
            key = json.dumps([url, projection, extent], separators=(",", ":"))
            suffix = hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
            name = f"{Path(name).stem}.{suffix}.tif"
        target = work_dir / name
        cached = target.exists()
        if not cached:
            temporary = target.with_name(target.name + ".part")
            try:
                if projection is not None:
                    minx, miny, maxx, maxy = extent
                    source = f"/vsicurl/{url}" if parsed.scheme in ("http", "https") else (
                        unquote(parsed.path) if parsed.scheme == "file" else url
                    )
                    previous_mask = gdal.GetConfigOption("GDAL_TIFF_INTERNAL_MASK")
                    gdal.SetConfigOption("GDAL_TIFF_INTERNAL_MASK", "YES")
                    try:
                        result = gdal.Translate(
                            str(temporary), source,
                            format="GTiff", projWin=[minx, maxy, maxx, miny],
                            projWinSRS=projection,
                        )
                        if result is None:
                            raise RuntimeError(f"GDAL could not window source: {url}")
                        result = None
                    finally:
                        gdal.SetConfigOption("GDAL_TIFF_INTERNAL_MASK", previous_mask)
                elif parsed.scheme in ("http", "https"):
                    from urllib.request import urlopen

                    with urlopen(url, timeout=60) as source, temporary.open("wb") as dest:
                        shutil.copyfileobj(source, dest)
                        length = source.headers.get("Content-Length")
                        if length is not None and dest.tell() != int(length):
                            raise ValueError(f"Download size mismatch: {url}")
                else:
                    source = unquote(parsed.path) if parsed.scheme == "file" else url
                    shutil.copyfile(source, temporary)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
                for sidecar in temporary.parent.iterdir():
                    if sidecar.name.startswith(temporary.name + "."):
                        sidecar.unlink(missing_ok=True)
        digest = hashlib.sha256()
        with target.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        checksum = digest.hexdigest()
        if (cached or projection is None) and entry.get("sha256") not in (None, checksum):
            raise ValueError(f"Cached source checksum mismatch: {target}")
        entry["sha256"] = checksum

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
