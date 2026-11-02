"""Write site-manifest.json with provenance and checksums (docs/specs/05 §C Site, §F.1). FR-01, FR-15, NFR-06."""
from __future__ import annotations

from pathlib import Path


def sha256_file(path: Path) -> str:
    """Hex SHA-256 of a file (05 §C Asset.sha256). TASK-03."""
    raise NotImplementedError("TASK-03")


def write_manifest(site_dir: Path, data_version: str, proj4: str) -> Path:
    """Assemble and write site-manifest.json (schema: schemas/site-manifest.schema.json). TASK-03."""
    raise NotImplementedError("TASK-03")
