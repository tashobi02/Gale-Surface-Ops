"""Run the offline preprocessing pipeline for one configured site."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


STEPS = (
    "acquire",
    "clip_reproject",
    "derive",
    "flags",
    "grid",
    "comm_grid",
    "tiles",
    "vectors",
    "manifest",
    "validate",
)


def _paths(site_id: str) -> tuple[Path, Path, Path, Path]:
    """Return repo root, site inputs, shared work area, and output bundle."""
    root = Path(__file__).resolve().parents[3]
    return (
        root,
        root / "pipeline" / "sites" / site_id,
        root / "pipeline" / "work",
        root / "data" / "sites" / site_id,
    )


def _run_step(name: str, root: Path, site_dir: Path, work_dir: Path, bundle_dir: Path) -> None:
    """Import and invoke one step only when the pipeline reaches it."""
    if name == "acquire":
        from .acquire import fetch_sources

        fetch_sources(root / "pipeline" / "sources.lock.json", work_dir)
        return

    if name == "clip_reproject":
        from . import clip_reproject  # noqa: F401

        raise RuntimeError(
            "TODO(verify): T03.19 must wire the site source ids, AOI extent, projection, "
            "and resolutions to clip_reproject"
        )

    if name == "derive":
        from . import derive  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire the clipped DEM and derived raster paths")

    if name == "flags":
        from . import flags  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire the routing-grid arrays and site masks")

    if name == "grid":
        from . import grid  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire the routing-grid arrays and output directory")

    if name == "comm_grid":
        try:
            from . import comm_grid  # type: ignore[attr-defined]  # noqa: F401
        except ModuleNotFoundError as exc:
            if exc.name == f"{__package__}.comm_grid":
                raise RuntimeError("step module is not implemented (T03.29)") from exc
            raise
        raise RuntimeError("TODO(verify): T03.19 must wire the hab mast, grid, and comm_hab output")

    if name == "tiles":
        from . import tiles  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire raster paths and tile-grid settings")

    if name == "vectors":
        from . import vectors  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire the curated traverse and POI inputs")

    if name == "manifest":
        from . import manifest  # noqa: F401

        raise RuntimeError("TODO(verify): T03.19 must wire site version and working projection")

    if name == "validate":
        from .validate_manifest import validate

        problems = validate(bundle_dir)
        if problems:
            raise RuntimeError("; ".join(problems))
        return

    raise AssertionError(f"unrecognized pipeline step: {name}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m marswalk_pipeline",
        description="Build one offline Marswalk site bundle.",
        epilog="Steps (in execution order): " + " → ".join(STEPS),
    )
    parser.add_argument("site_id", nargs="?", help="site folder under pipeline/sites/")
    args = parser.parse_args(argv)
    if not args.site_id:
        parser.error("site_id is required (see --help for the pipeline steps)")

    root, site_dir, work_dir, bundle_dir = _paths(args.site_id)
    if not site_dir.is_dir():
        print(f"Unknown site_id {args.site_id!r}: no input folder at {site_dir}", file=sys.stderr)
        return 2

    work_dir.mkdir(parents=True, exist_ok=True)
    bundle_dir.mkdir(parents=True, exist_ok=True)
    for step in STEPS:
        try:
            _run_step(step, root, site_dir, work_dir, bundle_dir)
        except Exception as exc:
            print(f"Pipeline step '{step}' failed: {exc}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
