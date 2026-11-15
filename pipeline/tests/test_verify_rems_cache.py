"""T18.08: fail closed on incomplete, corrupt or undocumented raw-source caches."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/verify_rems_cache.py"


@pytest.fixture
def cache(tmp_path: Path) -> Path:
    work = tmp_path / "rems"
    work.mkdir()
    files = []
    old_rows = []
    for sol in range(4182, 4196):
        stem = f"RME_769855113RNV{sol}0000000_______P1"
        for suffix in (".TAB", ".LBL", ".xml"):
            name = stem + suffix
            content = f"cached {name}\n".encode()
            (work / name).write_bytes(content)
            entry = {"filename": name, "sol": sol, "url": f"https://example.org/{name}",
                     "version": "1.0", "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
            files.append(entry)
            if suffix == ".TAB":
                old_rows.append(f"| {sol} | {stem} | start | stop | {len(content)} | {entry['sha256']} |")
    (work / "SOURCES.json").write_text(json.dumps({"files": files}))
    # Retain the old checker input to demonstrate its false success before fixing it.
    (work / "SOURCES.md").write_text("\n".join(old_rows))
    return work


def _run(work: Path, crism: Path | None = None) -> subprocess.CompletedProcess[str]:
    # Integrity checks do not need to parse scientific rows. This stub records the
    # number of inputs; actual cache acceptance also runs the real REMS builder.
    args = [str(SCRIPT), "--work", str(work)]
    if crism is not None:
        args.extend(["--crism", str(crism)])
    driver = (
        "import runpy,sys,types; "
        "stub=types.ModuleType('marswalk_pipeline.rems'); "
        "stub.build_rems_context=lambda work: "
        "{'bins':[{}], 'source_files':[p.name for p in work.glob('*.TAB')]}; "
        "sys.modules['marswalk_pipeline.rems']=stub; "
        f"sys.argv={args!r}; "
        f"runpy.run_path({str(SCRIPT)!r},run_name='__main__')"
    )
    return subprocess.run([sys.executable, "-c", driver],
                          capture_output=True, text=True, check=False)


def _edit_index(work: Path, transform) -> None:
    index = work / "SOURCES.json"
    data = json.loads(index.read_text())
    transform(data)
    index.write_text(json.dumps(data))


def test_complete_recorded_cache_passes(cache: Path) -> None:
    result = _run(cache)
    assert result.returncode == 0, result.stdout + result.stderr


def test_missing_sol_is_rejected_even_when_removed_from_inventory(cache: Path) -> None:
    for path in cache.glob("*RNV419500*"):
        path.unlink()
    _edit_index(cache, lambda data: data.update(files=[f for f in data["files"] if f["sol"] != 4195]))
    old = cache / "SOURCES.md"
    old.write_text("\n".join(l for l in old.read_text().splitlines() if "4195" not in l))
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "4195" in result.stdout + result.stderr


@pytest.mark.parametrize("suffix", [".LBL", ".xml"])
def test_missing_companion_label_is_rejected(cache: Path, suffix: str) -> None:
    next(cache.glob("*" + suffix)).unlink()
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "missing" in (result.stdout + result.stderr).lower()


@pytest.mark.parametrize("suffix", [".LBL", ".xml"])
def test_tampered_companion_label_is_rejected(cache: Path, suffix: str) -> None:
    next(cache.glob("*" + suffix)).write_text("tampered label")
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "SHA-256" in result.stdout + result.stderr


def test_unrecorded_companion_is_rejected(cache: Path) -> None:
    (cache / "stray.xml").write_text("unrecorded")
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "unrecorded" in (result.stdout + result.stderr).lower()


def test_missing_source_url_is_rejected(cache: Path) -> None:
    _edit_index(cache, lambda data: data["files"][0].pop("url"))
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "url" in (result.stdout + result.stderr).lower()


def test_duplicate_index_entries_are_rejected(cache: Path) -> None:
    _edit_index(cache, lambda data: data["files"].append(dict(data["files"][0])))
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "duplicate" in (result.stdout + result.stderr).lower()


def test_inventory_cannot_read_outside_cache(cache: Path) -> None:
    _edit_index(cache, lambda data: data["files"][0].update(filename="../outside.TAB"))
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "filename" in (result.stdout + result.stderr).lower()


def test_partial_download_cannot_be_claimed_complete(cache: Path) -> None:
    (cache / "incomplete.TAB.part").write_text("partial")
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "incomplete.TAB.part" in result.stdout


def test_absent_inventory_cannot_be_claimed_complete(cache: Path) -> None:
    (cache / "SOURCES.json").unlink()
    result = _run(cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "SOURCES.json" in result.stdout


@pytest.fixture
def crism_cache(tmp_path: Path) -> Path:
    rasterio = pytest.importorskip("rasterio")
    import numpy as np

    work = tmp_path / "crism"
    work.mkdir()
    stem = "frt0000b6f1_07_su165j_mtr3"
    with rasterio.Env(GDAL_PAM_ENABLED="NO"):
        with rasterio.open(work / (stem + ".img"), "w", driver="ENVI", height=2, width=3,
                           count=1, dtype="float32", transform=rasterio.Affine(1, 0, 2, 0, -1, 3)) as dataset:
            dataset.write(np.arange(6, dtype="float32").reshape(2, 3), 1)
    for suffix in (".lbl", ".xml"):
        (work / (stem + suffix)).write_text("label checked by SHA-256")
    entries = [{"filename": p.name, "url": "https://example.org/" + p.name,
                "version": "3", "bytes": p.stat().st_size,
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(work.iterdir())]
    (work / "SOURCES.json").write_text(json.dumps({"files": entries}))
    return work


def test_crism_band_data_is_opened_after_integrity_passes(cache: Path, crism_cache: Path) -> None:
    result = _run(cache, crism_cache)
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads(result.stdout)
    assert report["crism"]["width"] == 3
    assert report["crism"]["height"] == 2
    assert len(report["crism"]["band_checksums"]) == 1


def test_crism_missing_header_is_rejected(cache: Path, crism_cache: Path) -> None:
    next(crism_cache.glob("*.hdr")).unlink()
    result = _run(cache, crism_cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert ".hdr: missing" in result.stdout


def test_crism_image_corruption_is_rejected(cache: Path, crism_cache: Path) -> None:
    next(crism_cache.glob("*.img")).write_bytes(b"bad raster")
    result = _run(cache, crism_cache)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "SHA-256 differs" in result.stdout
