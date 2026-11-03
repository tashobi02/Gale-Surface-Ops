#!/usr/bin/env python3
"""Fail unless this interpreter is the pipeline conda environment with a working geo stack.

Usage: <env python> scripts/check_pipeline_env.py [env_name]   (default: marswalk-pipeline)

The check is on sys.prefix, not on VIRTUAL_ENV: an active .venv does not matter as long as the
interpreter itself belongs to the conda environment. Called by `make check-env`.
Minimums mirror pipeline/environment.yml and docs/specs/02 §B (GDAL >= 3.6, pyproj >= 3.4).
"""
from __future__ import annotations

import os
import re
import sys

ENV_NAME = sys.argv[1] if len(sys.argv) > 1 else "marswalk-pipeline"
PYTHON = (3, 12)  # pinned in pipeline/environment.yml
GDAL_MIN = (3, 6)  # 02 §B
PYPROJ_MIN = (3, 4)  # 02 §B
MARS_CRS = "IAU_2015:49900"
MARS_RADIUS_M = 3396190  # 02 §C.1

problems: list[str] = []


def ok(name: str, detail: str) -> None:
    print(f"ok    {name}: {detail}")


def fail(name: str, detail: str) -> None:
    problems.append(f"{name}: {detail}")
    print(f"FAIL  {name}: {detail}")


def ver(text: str) -> tuple[int, ...]:
    return tuple(int(n) for n in re.findall(r"\d+", text)[:2])


def check_interpreter() -> None:
    prefix = os.path.realpath(sys.prefix)
    if os.path.basename(prefix) == ENV_NAME and os.path.isdir(os.path.join(prefix, "conda-meta")):
        ok("interpreter", f"{sys.executable} (prefix {prefix})")
    else:
        fail("interpreter", f"{sys.executable} has prefix {prefix}, not the conda environment '{ENV_NAME}'")
    if sys.version_info[:2] == PYTHON:
        ok("python", sys.version.split()[0])
    else:
        fail("python", f"{sys.version.split()[0]}, expected {PYTHON[0]}.{PYTHON[1]}.x (pipeline/environment.yml)")


def check_geo_stack() -> None:
    try:
        from osgeo import gdal
    except ImportError as exc:
        fail("gdal", f"osgeo.gdal missing ({exc})")
    else:
        v = gdal.__version__
        (ok if ver(v) >= GDAL_MIN else fail)("gdal", f"{v} (need >= {GDAL_MIN[0]}.{GDAL_MIN[1]})")
    try:
        import rasterio
    except ImportError as exc:
        fail("rasterio", f"missing ({exc})")
    else:
        g = rasterio.__gdal_version__
        (ok if ver(g) >= GDAL_MIN else fail)("rasterio", f"{rasterio.__version__} with GDAL {g} (need GDAL >= {GDAL_MIN[0]}.{GDAL_MIN[1]})")
    try:
        import pyproj
    except ImportError as exc:
        fail("pyproj", f"missing ({exc})")
        return
    (ok if ver(pyproj.__version__) >= PYPROJ_MIN else fail)(
        "pyproj", f"{pyproj.__version__} with PROJ {pyproj.proj_version_str} (need >= {PYPROJ_MIN[0]}.{PYPROJ_MIN[1]})"
    )
    try:
        ellipsoid = pyproj.CRS.from_user_input(MARS_CRS).ellipsoid
    except Exception as exc:  # pyproj raises CRSError; any failure means the Mars CRS is unusable
        fail(MARS_CRS, f"does not resolve ({exc})")
        return
    if ellipsoid is None:
        fail(MARS_CRS, "resolves but has no ellipsoid")
    else:
        radius = ellipsoid.semi_major_metre
        (ok if radius == MARS_RADIUS_M else fail)(MARS_CRS, f"semi-major axis {radius} m (need {MARS_RADIUS_M})")


def check_package() -> None:
    try:
        import marswalk_pipeline
    except ImportError as exc:
        fail("marswalk_pipeline", f"not importable ({exc}); run make setup")
    else:
        ok("marswalk_pipeline", os.path.dirname(marswalk_pipeline.__file__))


if __name__ == "__main__":
    check_interpreter()
    check_geo_stack()
    check_package()
    if problems:
        print(f"\n{len(problems)} problem(s). Fix with `make setup`; run through `make check-env`.", file=sys.stderr)
        sys.exit(1)
