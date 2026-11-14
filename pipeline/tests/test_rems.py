"""T18.02 (N-24): REMS L_s-bin environmental context from cached PDS4/PDS3 RDR files."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import pytest

from marswalk_pipeline.rems import DEFAULT_LS_BIN_WIDTH_DEG, build_rems_context, mars_ls_from_utc, write_rems_context


PDS4_XML_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Product_Observational xmlns="http://pds.nasa.gov/pds4/pds/v1">
  <Observation_Area>
    <Time_Coordinates>
      <start_date_time>{start_utc}</start_date_time>
      <stop_date_time>{stop_utc}</stop_date_time>
    </Time_Coordinates>
  </Observation_Area>
</Product_Observational>
"""


def _make_row(
    sclk: int,
    *,
    t_gnd: float = 210.0,
    t_air1: float = 220.0,
    t_air2: float = 221.0,
    p1: float = 885.0,
    p2: float = 886.0,
) -> str:
    cols = ["-999.00"] * 71
    cols[0] = f"{sclk}"
    cols[1] = '"04190M00:00:00.000"'
    cols[2] = '"04189 23:59:53"'
    cols[9] = '"  100111"'
    cols[16] = '" XXXXXXX"'
    cols[17] = f"{t_gnd:7.2f}"
    cols[26] = '"  100111"'
    cols[27] = f"{t_air1:7.2f}"
    cols[33] = '"   001XX1111"'
    cols[34] = f"{t_air2:7.2f}"
    cols[40] = '"   001XX1110"'
    cols[54] = '"10111110"'
    cols[62] = '"    XXXX"'
    cols[63] = '"2H"'
    cols[66] = f"{p1:7.2f}"
    cols[67] = f"{p2:7.2f}"
    cols[70] = '"     101"'
    return ",".join(cols)


def _write_rems_sol(directory: Path, stem: str, start_utc: str, stop_utc: str, rows: list[str]) -> Path:
    xml_path = directory / f"{stem}.xml"
    tab_path = directory / f"{stem}.TAB"
    xml_path.write_text(PDS4_XML_TEMPLATE.format(start_utc=start_utc, stop_utc=stop_utc), encoding="utf-8")
    tab_path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return tab_path


def test_mars_ls_from_utc_matches_mars24_reference_fixture() -> None:
    ref_path = Path(__file__).resolve().parents[2] / "apps/web/tests/fixtures/mars24-reference.json"
    ref = json.loads(ref_path.read_text(encoding="utf-8"))
    for entry in ref["records"]:
        got = mars_ls_from_utc(entry["utc"])
        expected = entry["ls_deg"]
        diff = abs((got - expected + 180.0) % 360.0 - 180.0)
        assert diff < 0.005, f"{entry['utc']}: got {got}, expected {expected}"


def test_bins_rems_temperatures_and_pressure_by_ls_and_records_source_files(tmp_path: Path) -> None:
    rems_dir = tmp_path / "rems"
    rems_dir.mkdir()
    # Two sols near L_s ~ 258 deg (May 2024, MY 37), falling into the 255..260 deg L_s bin.
    _write_rems_sol(
        rems_dir,
        "RME_769411240RNV41900000000_______P1",
        "2024-05-19T18:21:21.570Z",
        "2024-05-20T19:00:56.411Z",
        [
            _make_row(100, t_air1=200.0, t_gnd=180.0, p1=850.0),
            _make_row(200, t_air1=220.0, t_gnd=200.0, p1=860.0),
            _make_row(300, t_air1=-999.0, t_air2=240.0, t_gnd=220.0, p1=-999.0, p2=870.0),
            _make_row(400, t_air1=math.nan, t_air2=-999.0, t_gnd=-999.0, p1=-999.0, p2=-999.0),
        ],
    )
    _write_rems_sol(
        rems_dir,
        "RME_769500015RNV41910000000_______P1",
        "2024-05-20T19:00:57.411Z",
        "2024-05-21T18:44:47.219Z",
        [
            _make_row(500, t_air1=260.0, t_gnd=240.0, p1=880.0),
            _make_row(600, t_air1=280.0, t_gnd=260.0, p1=890.0),
        ],
    )

    out_a = tmp_path / "out_a" / "rems_context.json"
    out_b = tmp_path / "out_b" / "rems_context.json"
    context = write_rems_context(rems_dir, out_a)
    write_rems_context(rems_dir, out_b)

    # Byte-identical determinism across two runs (NFR-06)
    assert hashlib.sha256(out_a.read_bytes()).hexdigest() == hashlib.sha256(out_b.read_bytes()).hexdigest()
    assert context["ls_bin_width_deg"] == DEFAULT_LS_BIN_WIDTH_DEG == 5.0
    assert context["provenance"] == "measured"
    assert context["source_id"] == "pds-atmos-msl-rems"
    assert context["source_files"] == [
        "RME_769411240RNV41900000000_______P1.TAB",
        "RME_769500015RNV41910000000_______P1.TAB",
    ]
    assert len(context["bins"]) == 1
    b = context["bins"][0]
    assert b["ls_bin_start_deg"] == 255.0
    assert b["ls_bin_end_deg"] == 260.0
    assert b["sols"] == [4190, 4191]
    assert b["source_files"] == context["source_files"]

    air = b["air_temp_k"]
    assert air["count"] == 5
    assert air["min"] == pytest.approx(200.0)
    assert air["median"] == pytest.approx(240.0)
    assert air["max"] == pytest.approx(280.0)
    assert air["unit"] == "K"
    assert air["provenance"] == "measured"
    assert air["source_files"] == context["source_files"]

    gnd = b["ground_temp_k"]
    assert gnd["count"] == 5
    assert gnd["min"] == pytest.approx(180.0)
    assert gnd["median"] == pytest.approx(220.0)
    assert gnd["max"] == pytest.approx(260.0)

    press = b["pressure_pa"]
    assert press["count"] == 5
    assert press["min"] == pytest.approx(850.0)
    assert press["median"] == pytest.approx(870.0)
    assert press["max"] == pytest.approx(890.0)
    assert press["unit"] == "Pa"


def test_every_bin_metric_requires_source_file_traceability(tmp_path: Path) -> None:
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    with pytest.raises(FileNotFoundError):
        build_rems_context(empty_dir)
