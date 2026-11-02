"""Package traverse and POIs as GeoJSON in working-projection metres (docs/specs/02 §C.2 L6; 05 §C POI, TraversePoint).

FR-04, FR-17. Traverse source is Unresolved (U-04: PDS PLACES vs. MMGIS).
"""
from __future__ import annotations

from pathlib import Path


def package_traverse(src: Path, proj4: str, out: Path) -> None:
    """Write vectors/traverse.geojson (Points with sol, source_id + one LineString). TASK-04."""
    raise NotImplementedError("TASK-04")


def package_pois(curated: Path, proj4: str, out: Path) -> None:
    """Write vectors/pois.geojson; every POI keeps credit and position source (01 FR-04). TASK-04."""
    raise NotImplementedError("TASK-04")
