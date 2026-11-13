"""Build F4 / T03.02, a small synthetic site, using only the standard library.

Run from the worktree root with $(make -s pipeline-python). Spec examples are
read locally, never fetched. No fixture value represents a new measurement.
Tile layout follows C9 v1.1 §3.2 (top-left origin, eastward x, southward y).
The tiles-root index format is the one `docs/contracts/tile-grid.md` (C9) names (decided, BD-22).
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import zlib


ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "data/sites/mock_site"
SPEC_05 = ROOT / "docs/specs/05_Backend_and_Database_Schema.md"
SPEC_02 = ROOT / "docs/specs/02_Technical_Requirements_Document.md"

# Declared synthetic shape parameters, not measurements (map §e):
# coarse routing cell size reuses F.1's TI cell size; bounds determine dimensions.
# A central single-column wall has one central gap; no-data is a 2×2 corner patch.
# A single opposite-corner hazard and a quarter-grid TI gap are separate features.
# Every tile_grid level is populated (T03.36); grayscale 0/255 stripes are decorative.
PATCH_SIDE_CELLS = 2
TI_GAP_DIVISOR = 4
PNG_SAMPLE_BITS = 8
U8_NODATA = 255  # 05 §C Asset / RoutingGrid
SLOPE_SCALE = 4  # 05 §C RoutingGrid: degrees × 4
NO_DATA = 1 << 0  # 05 §C Flag bits
HARD_HAZARD = 1 << 1
TI_UNKNOWN = 1 << 3


def example(text: str, heading: str) -> dict:
    section = text.split(heading, 1)[1]
    return json.loads(section.split("```json\n", 1)[1].split("```", 1)[0])


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


def png(size: int) -> bytes:
    """Fixed grayscale stripes: valid PNG, no timestamp or external encoder."""
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload)))

    # PNG filter 0 (none), one grayscale byte per pixel.
    raw = b"".join(b"\x00" + bytes([U8_NODATA if y % 2 else 0]) * size
                   for y in range(size))
    # Fixed Huffman strategy avoids compressor heuristics; PNG has no metadata.
    compressor = zlib.compressobj(level=9, strategy=zlib.Z_FIXED)
    compressed = compressor.compress(raw) + compressor.flush()
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, PNG_SAMPLE_BITS, 0, 0, 0, 0))
            + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def build() -> dict[str, bytes]:
    spec = SPEC_05.read_text()
    technical = SPEC_02.read_text()
    manifest = example(spec, "### F.1 ")
    poi = example(spec, "### F.2 ")
    files: dict[str, bytes] = {}
    assets: list[dict] = []

    def asset(asset_id: str, path: str, fmt: str, payload: bytes, **metadata: object) -> None:
        files[path] = payload
        assets.append({"asset_id": asset_id, "path": path, "format": fmt,
                       "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(),
                       **metadata})

    # 05 §F.1 has illustrated hab_candidates (null positions) since 2026-11-10. F4 stays
    # the single-site case (decided, BD-31: F4 has no hab candidates; the Hab Core keeps its own two-candidate fixture).
    manifest.pop("hab_candidates", None)
    manifest["site_id"] = "mock_site"
    manifest["name"] = "Mock site (synthetic fixture F4)"
    # Keep the example release date fixed, following 05 §C Site's pattern.
    manifest["data_version"] = manifest["data_version"].replace("gale_boxwork", "mock_site")
    grid = manifest["grid"]
    minx, miny, maxx, maxy = manifest["aoi"]["extent_m"]
    cell = grid["ti_cell_m"]  # declared synthetic coarse routing resolution
    width = int((maxx - minx) / cell)
    height = int((maxy - miny) / cell)
    assert width * cell == maxx - minx and height * cell == maxy - miny
    grid.update(cell_m=cell, width=width, height=height, origin_m=[minx, maxy],
                comm_hab_asset="grid-comm-hab")
    mast_example = re.search(r'`(\{"x_m":.*?"height_m":.*?\})`', spec)
    assert mast_example is not None
    grid["hab_mast"] = json.loads(mast_example[1])

    wall_col, gap_row = width // 2, height // 2
    slope_case = re.search(r"Uniform (\d+)° ramp", technical)
    assert slope_case is not None
    wall_slope = int(slope_case[1]) * SLOPE_SCALE
    elevation, slopes, flags, ti, comm = [], [], [], [], []
    for row in range(height):
        for col in range(width):
            missing = row < PATCH_SIDE_CELLS and col < PATCH_SIDE_CELLS
            wall = col == wall_col and row != gap_row
            hazard = (row, col) == (height - PATCH_SIDE_CELLS, width - PATCH_SIDE_CELLS)
            ti_gap = (row, col) == (height // TI_GAP_DIVISOR, width // TI_GAP_DIVISOR)
            elevation.append(math.nan if missing else 0.0)  # typed flat placeholder
            slopes.append(U8_NODATA if missing else wall_slope if wall else 0)
            flags.append((NO_DATA if missing else 0) | (HARD_HAZARD if hazard else 0)
                         | (TI_UNKNOWN if ti_gap or missing else 0))
            # Zero is a typed placeholder, never a measured TI or threshold.
            ti.append(math.nan if ti_gap or missing else 0.0)
            # Declared synthetic binary mask, not a computed viewshed.
            comm.append(U8_NODATA if missing else int(col < wall_col or row == gap_row))

    for asset_id, path, values, fmt in [
        (grid["elevation_asset"], "grid/elevation.f32", elevation, "f32"),
        (grid["slope_p90_asset"], "grid/slope_p90.u8", slopes, "u8"),
        (grid["slope_max_asset"], "grid/slope_max.u8", slopes, "u8"),
        (grid["flags_asset"], "grid/flags.u8", flags, "u8"),
        (grid["ti_asset"], "grid/ti_100m.f32", ti, "f32"),
        (grid["comm_hab_asset"], "grid/comm_hab.u8", comm, "u8"),
    ]:
        payload = struct.pack(f"<{len(values)}f", *values) if fmt == "f32" else bytes(values)
        asset(asset_id, path, fmt, payload, width=width, height=height,
              nodata=None if fmt == "f32" else U8_NODATA, byte_order="little")

    # Preserve the slope record verbatim. Resolve its derived_from elevation FK
    # with an explicitly assumed placeholder display layer, not a real DEM.
    slope = manifest["layers"][0]
    tile_grid = slope["tile_grid"]
    elevation_layer = copy.deepcopy(slope)
    elevation_layer.update(layer_id="elevation", title="Elevation (placeholder)",
                           provenance="assumed", derived_from=[], units="m",
                           legend={"type": "none"}, asset_id="tiles-elevation",
                           limitations="Synthetic flat placeholder; not a downloaded DEM.")
    manifest["layers"].append(elevation_layer)
    tile_payload = png(tile_grid["tile_size_px"])
    for layer in manifest["layers"]:
        entries = []
        for zoom, resolution in enumerate(tile_grid["resolutions_m"]):
            span = tile_grid["tile_size_px"] * resolution
            ox, oy = tile_grid["origin_m"]
            # C9 v1.1 §3.2: tile (z, x, y) spans x·span east and y·span south of origin_m.
            for x in range(math.floor((minx - ox) / span), math.ceil((maxx - ox) / span)):
                for y in range(math.floor((oy - maxy) / span), math.ceil((oy - miny) / span)):
                    relative = f"{zoom}/{x}/{y}.png"
                    path = f"tiles/{layer['layer_id']}/{relative}"
                    files[path] = tile_payload
                    entries.append({"path": relative, "sha256": hashlib.sha256(tile_payload).hexdigest(),
                                    "bytes": len(tile_payload)})
        index = json_bytes({"tiles": sorted(entries, key=lambda item: item["path"])})
        root = f"tiles/{layer['layer_id']}"
        files[f"{root}/index.json"] = index
        assets.append({"asset_id": layer["asset_id"], "path": root, "format": "tiles",
                       "sha256": hashlib.sha256(index).hexdigest()})

    # The solar-min source id was confirmed by the data lead (map open point 12).
    # Bibliographic URLs are already present in the repository, never invented.
    reference = (ROOT / "docs/reference/mars-scientific-context.md").read_text()
    solar_max = manifest["env_constants"][0]
    solar_min_text = spec.split("Second record: `", 1)[1].split("\n", 1)[0]
    minimum = re.search(r"value `([^`]+)`.*low `([^`]+)`, high `([^`]+)`", solar_min_text)
    assert minimum is not None
    solar_min = copy.deepcopy(solar_max)
    solar_min.update(const_id=solar_min_text.split("`", 1)[0],
                     value=float(minimum[1]), low=float(minimum[2]), high=float(minimum[3]),
                     conditions={"solar_phase": "min", "location": solar_max["conditions"]["location"]},
                     source_id="simonsen-2024-rad", note="reported range, Simonsen et al. 2024")
    manifest["env_constants"].append(solar_min)
    for source_id, label in [(solar_max["source_id"], "Hassler et al., 2014"),
                             (solar_min["source_id"], "Simonsen et al., 2024")]:
        url = re.search(r"\[" + re.escape(label) + r"\]\((https://[^)]+)\)", reference)
        assert url is not None
        manifest["sources"].append({
            "source_id": source_id, "title": label, "publisher": "", "missions": [],
            "instruments": [], "version": "", "url": url[1], "credit": label,
            "licence": "fixture — not a real source", "accessed": manifest["sources"][0]["accessed"],
            "accuracy_note": "Fixture bibliography from local reference §9; accessed date copied "
                             "from F.1, not a retrieval. Metadata fields read 'fixture — not a real source' (BD-31)."})

    poi_sol = poi["properties"]["image_sol"]
    poi["properties"] = {key: value for key, value in poi["properties"].items()
                         if not key.startswith("image_")}
    poi["properties"].update(stop_type="science", ez_theme="", evidence=[{
        "text": "", "source_id": slope["source_ids"][0]}])
    asset(manifest["pois_asset"], "vectors/pois.geojson", "geojson",
          json_bytes({"type": "FeatureCollection", "features": [poi]}))

    sols = re.search(r"sols ≈ ([\d,]+)–([\d,]+)", technical)
    assert sols is not None
    sols = [int(sols[1].replace(",", "")), poi_sol, int(sols[2].replace(",", ""))]
    start = manifest["default_start"]
    end = poi["geometry"]["coordinates"]
    points = []
    for ordinal, sol in enumerate(sols):
        fraction = ordinal / (len(sols) - 1)
        coordinates = [start["x_m"] + fraction * (end[0] - start["x_m"]),
                       start["y_m"] + fraction * (end[1] - start["y_m"])]
        points.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": coordinates},
                       "properties": {"sol": sol, "source_id": slope["source_ids"][0],
                                      "provenance": "assumed", "note": "Synthetic interpolation; not rover localization."}})
    line = {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [
        point["geometry"]["coordinates"] for point in points]},
        "properties": {"source_id": slope["source_ids"][0], "provenance": "assumed",
                       "note": "Synthetic traverse; not a planned passable route."}}
    asset(manifest["traverse_asset"], "vectors/traverse.geojson", "geojson",
          json_bytes({"type": "FeatureCollection", "features": [*points, line]}))
    manifest["assets"] = sorted(assets, key=lambda item: item["asset_id"])
    files["site-manifest.json"] = json_bytes(manifest)
    return files


def main() -> None:
    if Path.cwd().resolve() != ROOT:
        raise SystemExit("Run from the worktree root.")
    files = build()
    SITE.mkdir(parents=True, exist_ok=True)
    for relative, payload in sorted(files.items()):
        destination = SITE / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or destination.read_bytes() != payload:
            destination.write_bytes(payload)
    # Reconcile stale generated output only inside this subtask's owned bundle.
    for existing in sorted(SITE.rglob("*"), reverse=True):
        if existing.is_file() and existing.relative_to(SITE).as_posix() not in files:
            existing.unlink()
        elif existing.is_dir() and not any(existing.iterdir()):
            existing.rmdir()
    print(f"F4: {len(files)} files, {sum(map(len, files.values()))} bytes in data/sites/mock_site")


if __name__ == "__main__":
    main()
