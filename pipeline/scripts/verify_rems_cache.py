#!/usr/bin/env python3
"""T18.08: verify the selected raw-source cache without Python network access.

SOURCES.json, kept alongside the git-ignored downloads, records each filename,
source URL, product version, byte count and SHA-256. REMS must contain one TAB,
LBL and XML per BD-167 sol (4182–4195), independently of what the inventory lists.
An optional CRISM directory must contain the four selected FRT0000B6F1 files.
The REMS builder and all CRISM raster bands are read only after integrity passes.

    python pipeline/scripts/verify_rems_cache.py --work pipeline/work/rems \
        --crism pipeline/work/crism --report /tmp/cache-verification.json

The socket guard covers Python networking, not an operating-system firewall.
The script never downloads data or rewrites the inventory or shipped site bundle.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import re
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit


REMS_SOLS = set(range(4182, 4196))
REMS_TAB_RE = re.compile(r"RME_\d+RNV(\d{4})\d+_+P\d+\.TAB")
CRISM_STEM = "frt0000b6f1_07_su165j_mtr3"


def _deny_network(*args, **kwargs):
    raise OSError("network access is blocked for this offline verification")


@contextmanager
def _network_blocked():
    originals = {name: getattr(socket, name) for name in ("socket", "create_connection", "getaddrinfo")}
    try:
        for name in originals:
            setattr(socket, name, _deny_network)
        yield
    finally:
        for name, original in originals.items():
            setattr(socket, name, original)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_inventory(work: Path, suffixes: set[str]) -> tuple[dict, list[str]]:
    """Check every source file and reject missing, extra or unsafe records."""
    failures: list[str] = []
    entries: dict[str, dict] = {}
    try:
        data = json.loads((work / "SOURCES.json").read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("files"), list) or not data["files"]:
            raise ValueError("inventory requires a nonempty files list")
    except (OSError, ValueError) as exc:
        return {}, [f"{work}/SOURCES.json: {exc}"]

    for entry in data["files"]:
        if not isinstance(entry, dict):
            failures.append("inventory entry must be an object")
            continue
        name = entry.get("filename")
        if not isinstance(name, str) or not name or Path(name).name != name or "\\" in name or name in (".", ".."):
            failures.append(f"invalid inventory filename: {name!r}")
            continue
        if name in entries:
            failures.append(f"duplicate inventory filename: {name}")
            continue
        entries[name] = entry
        url = entry.get("url")
        try:
            parsed = urlsplit(url) if isinstance(url, str) else None
            valid_url = parsed is not None and parsed.scheme in ("https", "http") and bool(parsed.hostname)
        except ValueError:
            valid_url = False
        if not valid_url:
            failures.append(f"{name}: missing or invalid source url")
        if not isinstance(entry.get("version"), str) or not entry["version"].strip():
            failures.append(f"{name}: missing product version")
        if type(entry.get("bytes")) is not int or entry["bytes"] <= 0:
            failures.append(f"{name}: invalid recorded byte count")
        if not isinstance(entry.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
            failures.append(f"{name}: invalid recorded SHA-256")
        path = work / name
        if path.is_symlink() or not path.is_file():
            failures.append(f"{name}: missing source file or unsupported symlink")
            continue
        if path.stat().st_size != entry.get("bytes"):
            failures.append(f"{name}: byte count differs from inventory")
        if _sha256(path) != entry.get("sha256"):
            failures.append(f"{name}: SHA-256 differs from inventory")

    actual = {path.name for path in work.iterdir() if path.suffix.lower() in suffixes or path.suffix == ".part"}
    for name in sorted(actual - entries.keys()):
        failures.append(f"{name}: unrecorded cached source file")
    for name in sorted(entries.keys() - actual):
        failures.append(f"{name}: missing or unsupported cached source file")
    return entries, failures


def verify_rems(work: Path) -> dict:
    entries, failures = _verify_inventory(work, {".tab", ".lbl", ".xml"})
    sols: dict[int, str] = {}
    for name, entry in entries.items():
        if not name.endswith(".TAB"):
            continue
        match = REMS_TAB_RE.fullmatch(name)
        if not match:
            failures.append(f"{name}: unrecognized REMS product filename")
            continue
        sol = int(match.group(1))
        if sol in sols:
            failures.append(f"sol {sol}: duplicate TAB products")
        sols[sol] = name
        if entry.get("sol") != sol:
            failures.append(f"{name}: inventory sol differs from product filename")
        for suffix in (".LBL", ".xml"):
            companion = str(Path(name).with_suffix(suffix))
            if companion not in entries:
                failures.append(f"{companion}: missing companion label in inventory")
    for sol in sorted(REMS_SOLS - sols.keys()):
        failures.append(f"sol {sol}: missing selected BD-167 product")
    for sol in sorted(sols.keys() - REMS_SOLS):
        failures.append(f"sol {sol}: outside selected BD-167 set")
    result = {"directory": str(work), "files": len(entries), "sols": sorted(sols), "failures": failures}
    if not failures:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
        from marswalk_pipeline.rems import build_rems_context

        context = build_rems_context(work)
        if set(context["source_files"]) != set(sols.values()):
            failures.append("REMS builder did not consume every selected TAB")
        result.update(bins=len(context["bins"]), source_files=len(context["source_files"]))
    return result


def verify_crism(work: Path) -> dict:
    entries, failures = _verify_inventory(work, {".img", ".hdr", ".lbl", ".xml"})
    expected = {CRISM_STEM + suffix for suffix in (".img", ".hdr", ".lbl", ".xml")}
    if set(entries) != expected:
        failures.append("CRISM cache must contain the selected IMG/HDR/LBL/XML product set")
    result = {"directory": str(work), "files": len(entries), "failures": failures}
    if not failures:
        import rasterio

        # Read the local ENVI image through its companion header. Disable PAM so
        # verification does not create an auxiliary metadata file in the cache.
        with rasterio.Env(GDAL_PAM_ENABLED="NO"):
            with rasterio.open(work / (CRISM_STEM + ".img")) as dataset:
                result.update(width=dataset.width, height=dataset.height, bands=dataset.count,
                              band_checksums=[dataset.checksum(band) for band in dataset.indexes])
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, default=Path("work/rems"))
    parser.add_argument("--crism", type=Path, help="Also verify the selected CRISM summary product.")
    parser.add_argument("--report", type=Path, help="Write verification evidence as JSON outside the cache.")
    args = parser.parse_args(argv)
    report = {"python_network_blocked": True}
    try:
        with _network_blocked():
            report["rems"] = verify_rems(args.work)
            if args.crism is not None:
                report["crism"] = verify_crism(args.crism)
    except (OSError, ValueError, KeyError, ImportError) as exc:
        report["error"] = str(exc)
    failures = [failure for key in ("rems", "crism") for failure in report.get(key, {}).get("failures", [])]
    if "error" in report:
        failures.append(report["error"])
    report["ok"] = not failures
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
