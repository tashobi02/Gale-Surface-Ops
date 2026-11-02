"""Referential-integrity checks for a site bundle (docs/specs/05 §E.3).

05 names this `pipeline/validate_manifest.py`; it lives in the package here and is exposed as
the `validate-manifest` console script.
"""
from __future__ import annotations

from pathlib import Path


def validate(site_dir: Path) -> list[str]:
    """Return a list of problems (empty = valid): schema, asset files + SHA-256, source ids,
    shared grid dimensions, POIs/default start inside AOI and passable, crs.proj4 byte-identical
    to the pipeline constant. TASK-03.
    """
    raise NotImplementedError("TASK-03")


def main() -> int:
    """CLI entry: `validate-manifest <site_dir>`; exit 1 on any problem. TASK-03."""
    raise NotImplementedError("TASK-03")
