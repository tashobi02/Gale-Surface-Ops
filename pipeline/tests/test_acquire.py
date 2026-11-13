"""Source acquisition from a lock file (02 §A.1, §C.2; 05 §E.5; backend package 22; BD-13, BD-14, BD-134).

A local HTTP fixture server stands in for the publishers (no real network in a test). Rules fixed here
(decided by the orchestrator (Claude) under Sadman Shaharier Mahim's authority, 12 Nov 2026, BD-134):
- an entry with a URL and a SHA-256 downloads to ``<work>/[dir/]<filename>`` (``filename`` defaults to the URL's basename,
  ``dir`` is an optional sub-folder such as ``images``); the digest is checked before the file gets its final name, so a
  wrong download never lands in the cache;
- a ``.part`` file from an interrupted download is resumed with an HTTP ``Range`` request; a server that ignores ``Range``
  restarts it;
- a cached file whose digest differs from the lock is an error and is never deleted or replaced;
- ``size`` (bytes), when the entry has one, is checked too;
- ``offline=True`` (CLI ``--offline``) makes no request at all: a file that is present is verified, one that is absent is
  an error that names it;
- ``accessed`` is set to the download date for a file fetched now and left alone for a cached one.
"""
from __future__ import annotations

import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

pytest.importorskip("osgeo")
pytest.importorskip("rasterio")

from marswalk_pipeline import acquire  # noqa: E402
from marswalk_pipeline.acquire import fetch_sources, source_filename  # noqa: E402

BODY = bytes(range(256)) * 400  # 102,400 bytes, every byte value present


class Server:
    """Serves ``files`` (path -> bytes); records every request as (path, Range header)."""

    def __init__(self, files, honour_range=True):
        self.files = files
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.requests.append((self.path, self.headers.get("Range")))
                data = outer.files.get(self.path)
                if data is None:
                    self.send_response(404)
                    self.end_headers()
                    return
                start = 0
                rng = self.headers.get("Range")
                if rng and outer.honour_range:
                    start = int(rng.split("=")[1].rstrip("-"))
                    self.send_response(206)
                    self.send_header("Content-Range", f"bytes {start}-{len(data) - 1}/{len(data)}")
                else:
                    self.send_response(200)
                self.send_header("Content-Length", str(len(data) - start))
                self.end_headers()
                self.wfile.write(data[start:])

            def log_message(self, *args):
                pass

        self.honour_range = honour_range
        self.httpd = HTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def server():
    made = []

    def make(files, **kw):
        s = Server(files, **kw)
        made.append(s)
        return s

    yield make
    for s in made:
        s.close()


def write_lock(path, entries):
    path.write_text(json.dumps({"data_version": None, "tools": {}, "sources": entries}))
    return path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def test_download_lands_at_the_expected_path_with_digest_checked(tmp_path, server):
    s = server({"/a/file.bin": BODY})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/a/file.bin", "sha256": sha(BODY), "size": len(BODY)}])
    fetch_sources(lock, tmp_path / "work", data_version="v1")
    assert (tmp_path / "work" / "file.bin").read_bytes() == BODY
    data = json.loads(lock.read_text())
    assert data["data_version"] == "v1"
    assert data["sources"][0]["sha256"] == sha(BODY)
    assert data["tools"]["gdal"] and data["tools"]["rasterio"]
    assert not list((tmp_path / "work").glob("*.part"))


def test_dir_and_filename_choose_the_cached_path(tmp_path, server):
    s = server({"/some/path/original-name.jpg": BODY})
    entry = {"source_id": "img", "url": f"{s.base}/some/path/original-name.jpg", "dir": "images", "filename": "poi-x.jpg", "sha256": sha(BODY)}
    assert source_filename(entry) == "images/poi-x.jpg"
    lock = write_lock(tmp_path / "lock.json", [entry])
    fetch_sources(lock, tmp_path / "work")
    assert (tmp_path / "work" / "images" / "poi-x.jpg").read_bytes() == BODY


def test_dir_alone_keeps_the_url_basename(tmp_path):
    assert source_filename({"url": "https://example.test/x/MSL_dem.tif", "dir": "dem"}) == "dem/MSL_dem.tif"


@pytest.mark.parametrize("bad", ["../x.jpg", "a/b.jpg", "/abs.jpg", "..", ".", "", "a\\b.jpg"])
def test_a_filename_that_leaves_its_folder_is_refused(bad):
    with pytest.raises(ValueError, match="filename"):
        source_filename({"url": "https://example.test/x.jpg", "filename": bad})


@pytest.mark.parametrize("bad", ["../up", "/abs", "a/../../b", ""])
def test_a_dir_that_leaves_the_work_folder_is_refused(bad):
    with pytest.raises(ValueError, match="dir"):
        source_filename({"url": "https://example.test/x.jpg", "dir": bad})


def test_an_interrupted_download_is_resumed_with_a_range_request(tmp_path, server):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    work.mkdir()
    (work / "f.bin.part").write_bytes(BODY[:40_000])
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work)
    assert (work / "f.bin").read_bytes() == BODY
    assert s.requests == [("/f.bin", "bytes=40000-")]
    assert not (work / "f.bin.part").exists()


def test_a_server_that_ignores_range_restarts_the_download(tmp_path, server):
    s = server({"/f.bin": BODY}, honour_range=False)
    work = tmp_path / "work"
    work.mkdir()
    (work / "f.bin.part").write_bytes(b"stale bytes that must not survive")
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work)
    assert (work / "f.bin").read_bytes() == BODY
    assert len(s.requests) == 1  # restarted from the 200 answer, not appended and re-fetched after a failed check


def test_a_part_file_that_already_holds_everything_is_finished_without_a_second_download(tmp_path, server):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    work.mkdir()
    (work / "f.bin.part").write_bytes(BODY)
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work)
    assert (work / "f.bin").read_bytes() == BODY


def test_a_hash_mismatch_is_rejected_and_nothing_is_cached(tmp_path, server):
    s = server({"/f.bin": BODY})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(b"something else")}])
    with pytest.raises(ValueError, match="checksum"):
        fetch_sources(lock, tmp_path / "work")
    assert not (tmp_path / "work" / "f.bin").exists()
    assert not (tmp_path / "work" / "f.bin.part").exists()
    assert json.loads(lock.read_text())["sources"][0]["sha256"] == sha(b"something else")  # the lock is not rewritten


def test_a_size_mismatch_is_rejected(tmp_path, server):
    s = server({"/f.bin": BODY})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY), "size": len(BODY) + 1}])
    with pytest.raises(ValueError, match="size"):
        fetch_sources(lock, tmp_path / "work")
    assert not (tmp_path / "work" / "f.bin").exists()


def test_a_missing_page_is_an_error_naming_the_url(tmp_path, server):
    s = server({})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/gone.bin", "sha256": sha(BODY)}])
    with pytest.raises(Exception, match="gone.bin|404"):
        fetch_sources(lock, tmp_path / "work")
    assert not (tmp_path / "work" / "gone.bin").exists()


def test_a_cached_file_is_not_downloaded_again_and_a_bad_one_is_never_replaced(tmp_path, server):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    work.mkdir()
    (work / "f.bin").write_bytes(BODY)
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work)
    assert s.requests == []
    (work / "f.bin").write_bytes(b"locally edited")
    with pytest.raises(ValueError, match="checksum"):
        fetch_sources(lock, work)
    assert (work / "f.bin").read_bytes() == b"locally edited"
    assert s.requests == []


def test_offline_makes_no_request_and_verifies_what_is_present(tmp_path, server):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    work.mkdir()
    (work / "f.bin").write_bytes(BODY)
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work, offline=True)
    assert s.requests == []


def test_offline_with_an_absent_file_is_an_error_that_names_it(tmp_path, server):
    s = server({"/f.bin": BODY})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "the-source", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    with pytest.raises(acquire.OfflineError, match="the-source") as err:
        fetch_sources(lock, tmp_path / "work", offline=True)
    assert "f.bin" in str(err.value)
    assert s.requests == []
    assert not (tmp_path / "work" / "f.bin").exists()


def test_offline_never_windows_a_remote_raster(tmp_path, server):
    s = server({})
    entry = {"source_id": "ortho", "url": f"{s.base}/c.tif", "proj4": "+proj=eqc +R=3396190", "extent_m": [0, 0, 1, 1], "dir": "ortho", "filename": "aoi.tif"}
    lock = write_lock(tmp_path / "lock.json", [entry])
    with pytest.raises(acquire.OfflineError, match="ortho/aoi.tif"):
        fetch_sources(lock, tmp_path / "work", offline=True)
    assert s.requests == []


def test_accessed_is_set_for_a_fresh_download_and_kept_for_a_cached_file(tmp_path, server):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    fetch_sources(lock, work)
    stamp = json.loads(lock.read_text())["sources"][0]["accessed"]
    assert len(stamp) == 10 and stamp[4] == "-" and stamp[7] == "-"
    data = json.loads(lock.read_text())
    data["sources"][0]["accessed"] = "2026-11-01"
    lock.write_text(json.dumps(data))
    fetch_sources(lock, work)
    assert json.loads(lock.read_text())["sources"][0]["accessed"] == "2026-11-01"


def test_a_digest_is_recorded_for_an_entry_that_had_none(tmp_path, server):
    s = server({"/f.bin": BODY})
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": None}])
    fetch_sources(lock, tmp_path / "work")
    assert json.loads(lock.read_text())["sources"][0]["sha256"] == sha(BODY)


def test_command_line_offline_exit_codes(tmp_path, server, capsys):
    s = server({"/f.bin": BODY})
    work = tmp_path / "work"
    lock = write_lock(tmp_path / "lock.json", [{"source_id": "x", "url": f"{s.base}/f.bin", "sha256": sha(BODY)}])
    assert acquire.main(["--lock", str(lock), "--work", str(work), "--offline"]) == 1
    assert "x" in capsys.readouterr().err
    assert acquire.main(["--lock", str(lock), "--work", str(work)]) == 0
    assert acquire.main(["--lock", str(lock), "--work", str(work), "--offline"]) == 0
    assert len(s.requests) == 1


# ---- the committed lock (pipeline/sources.lock.json; BD-134) --------------------------------------------------------------

LOCK = __import__("pathlib").Path(__file__).resolve().parents[1] / "sources.lock.json"
WINDOW_KEYS = {"proj4", "extent_m"}


def committed_entries():
    return json.loads(LOCK.read_text(encoding="utf-8"))["sources"]


def test_every_locked_source_is_complete():
    import re
    entries = committed_entries()
    assert len(entries) >= 25
    for e in entries:
        who = e.get("source_id")
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", who or ""), who
        assert e["url"].startswith("https://"), who
        assert re.fullmatch(r"[0-9a-f]{64}", e["sha256"] or ""), who
        assert e["version"], who
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", e["accessed"]), who
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", e["verified"]), who
        if not WINDOW_KEYS & e.keys():
            assert isinstance(e["size"], int) and e["size"] > 0, who  # a window is not byte-stable, so it has no size
        else:
            assert WINDOW_KEYS <= e.keys(), who
            assert "size" not in e, who


def test_locked_source_ids_are_unique():
    ids = [e["source_id"] for e in committed_entries()]
    assert len(ids) == len(set(ids))


def test_locked_sources_have_unique_safe_cache_paths():
    paths = [source_filename(e) for e in committed_entries()]  # raises for an unsafe dir or filename
    assert len(paths) == len(set(paths))
    assert all(not p.startswith("/") and ".." not in p.split("/") for p in paths)


def test_the_three_rasters_sit_where_the_clip_step_looks():
    by_id = {e["source_id"]: source_filename(e) for e in committed_entries()}
    assert by_id["usgs-gale-dem-1m-v3"] == "dem/MSL_Gale_DEM_Mosaic_1m_v3.tif"
    assert by_id["usgs-gale-ortho-25cm-v3"] == "ortho/hirise_lrgb_aoi.tif"
    assert by_id["usgs-themis-ti-30s120e"] == "ti/themis_ti_aoi_pad1km.tif"


def test_every_poi_image_is_locked_under_the_name_its_poi_gives():
    import pathlib
    pois = pathlib.Path(__file__).resolve().parents[1] / "sites" / "gale_boxwork" / "pois"
    wanted = {json.loads(p.read_text(encoding="utf-8"))["poi_id"] for p in pois.glob("*.json")}
    locked = {source_filename(e) for e in committed_entries() if e["source_id"].startswith("img-")}
    assert locked == {f"images/{poi}.jpg" for poi in wanted}
