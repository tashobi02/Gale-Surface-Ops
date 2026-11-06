# Fixture for the Marswalk Surface Ops prototype. Shapes follow 05 §C entities and 02 §E messages.
# RULE: every number is {v, unit, prov, src}. src = a spec section or "PLACEHOLDER". No invented figures.
import json
import handoff_data as H

def n(v, unit, prov, src, **k):
    d = {"v": v, "unit": unit, "prov": prov, "src": src}
    if isinstance(v, float): d["disp"] = repr(v)
    d.update(k)
    return d

def ph(unit, prov, unblocks, fmt="##.#"):
    return {"v": None, "unit": unit, "prov": prov, "src": "PLACEHOLDER", "unblocks": unblocks, "fmt": fmt}

S4 = "04 §E.4"; S5 = "04 §E.5"; S6 = "04 §E.6"; E1 = "01 §E.1"; F3 = "05 §F.3"; E2 = "02 §E.2"

nums = {
  # ---- clock / strip (04 §C.3, §E.4) ----
  "sol": n(4190, "sol", "replayed", "01 §E.1 / D-10"),
  "ltst_alert": n("13:05", "LTST", "simulated", "04 §C.3 / §E.4"),
  "ltst_k0": n("13:04", "LTST", "simulated", "04 §E.4 (event log: EV1 arrived stop 2)"),
  "ltst_ph": ph("LTST", "simulated", "TASK-21", "##:##"),
  "plan_rev": n(3, "rev", "derived", "04 §C.3"),
  "plan_rev_new": ph("rev", "derived", "TASK-22", "##"),
  "speed": n(60, "×", "simulated", "04 §C.3 / §E.4"),
  # ---- EV1 margins at the demo moment (04 §E.4/E.5/E.6) ----
  "haven_ev1": n(14, "min", "modelled", S4 + " / " + S5 + " / " + S6),
  "o2_ev1": n(71, "%", "simulated", S4 + "; 02 §E.6 o2_frac 0.71"),
  "o2_left_ev1": n("5:41", "h:mm", "simulated", S5),
  "eva_ev1": n("2:14", "h:mm", "simulated", S5),
  "dose_ev1_0": n(0.0, "mGy", "simulated", S4),
  "dose_ev1_1": n(0.1, "mGy", "simulated", S5),
  "bearing": n("040", "°", "derived", S5 + " / " + S6),
  "dist_next": n(0.42, "km", "derived", S5 + " / " + S6),
  "eta_next": n(9, "min", "modelled", S5),
  "stale_age": n("0:42", "m:ss", "simulated", "04 §C.1 (crew markers)"),
  "link_bars": n(3, "bars", "simulated", S4 + " / " + S5),
  # ---- EV2: no spec example exists → placeholders ----
  "haven_ev2": ph("min", "modelled", "TASK-05b / TASK-22", "##"),
  "o2_ev2": ph("%", "simulated", "TASK-22", "##"),
  "o2_left_ev2": ph("h:mm", "simulated", "TASK-22", "#:##"),
  "dose_ev2": ph("mGy", "simulated", "TASK-22", "#.#"),
  "eva_ev2": ph("h:mm", "simulated", "TASK-22", "#:##"),
  "dist_ev2": ph("km", "derived", "TASK-22", "#.##"),
  "bearing_ev2": ph("°", "derived", "TASK-22", "###"),
  "eta_ev2": ph("min", "modelled", "TASK-22", "##"),
  # ---- options (01 §E.1 illustrative; TASK-21 writes final) ----
  "opt1_eta": n(14, "min", "modelled", E1 + " (illustrative)"),
  "opt2_eta": n(41, "min", "modelled", E1 + " (illustrative)"),
  "opt3_eta": ph("min", "modelled", "TASK-05b / TASK-21", "##"),
  "opt_dose": ph("µGy", "modelled", "TASK-05b / TASK-21", "####"),
  "opt_drops": ph("stops", "modelled", "TASK-05b / TASK-21", "#"),
  "slope_avoid": n(17, "°", "derived", E1 + " (illustrative: rendezvous avoids a 17° slope)"),
  "eta_summon": n(14, "min", "modelled", E1 + " (04 §D.3 example copy says 12; see G-07)"),
  # ---- Earth link (04 §E.4) ----
  "light_time": n("14:02", "mm:ss", "derived", S4),
  "next_pass": n(9, "min", "derived", S4 + " (MRO)"),
  "q_up": n(1, "msg", "simulated", S4),
  "q_down": n(0, "msg", "simulated", S4),
  "earth_sent_ago": n(14, "min", "derived", "04 §D.2 (advisory example text)"),
  "lt_range_min": n(3, "min", "derived", "01 §A.2 (0.37 AU)"),
  "lt_range_max": n(22, "min", "derived", "01 §A.2 (2.68 AU)"),
  "asof_ph": ph("HH:MM", "simulated", "TASK-21", "##:##"),
  # ---- conditions (ops) ----
  "rate_now": ph("µGy/h", "replayed", "U-15 (RAD sol-4190 series)", "####"),
  "rate_bg": ph("µGy/h", "replayed", "U-15 (RAD sol-4190 series)", "###"),
  "sun_elev": ph("°", "modelled", "TASK-06 (Mars24)", "##.#"),
  "event_total": n(8100, "µGy", "replayed", "01 FR-37 (NASA, June 2024; published total next to the rover)"),
  "bg_dose_mSv_day": n(0.64, "mSv/day", "measured", "05 §F.1 env_constants (Hassler 2014; solar max)"),
  "alert_k": n(10, "× background", "assumed", "01 FR-38 / 02 §D.13"),
  # ---- consumables / shielding / limits (02 §D, 05 ParamSet) ----
  "shield_suit": n(1.0, "factor", "assumed", "02 §D.13 (A-11)"),
  "shield_pr": n(0.6, "factor", "assumed", "02 §D.13 (A-11)"),
  "shield_hab": n(0.4, "factor", "assumed", "02 §D.13 (A-11)"),
  "buddy_max": n(200, "m", "assumed", "01 FR-35"),
  "comm_shadow_m": n(120, "m", "derived", "04 §D.2 (alert text example)"),
  "haven_rule": n(30, "min", "assumed", "01 D.1 FR-05 / A-08"),
  "ingress": n(5, "min", "assumed", "02 §D.8"),
  # ---- planner (05 §F.3 plan export; 01 FR-12) ----
  "p_dist": n(6120, "m", "modelled", F3 + " (illustrative)"),
  "p_walk": n(128, "min", "modelled", F3 + " (illustrative)"),
  "p_dwell": n(20, "min", "assumed", F3 + " (illustrative)"),
  "p_total": n(148, "min", "modelled", F3 + " (illustrative)"),
  "p_limit": n(6.0, "h", "assumed", "05 §C.1 MissionScenario default"),
  "p_margin": n(212, "min", "modelled", F3 + " (illustrative)"),
  "p_climb": n(74, "m", "derived", F3 + " (illustrative)"),
  "p_descent": n(74, "m", "derived", F3 + " (illustrative)"),
  "p_maxslope": n(12.6, "°", "derived", F3 + " (illustrative)"),
  "p_walkback": n(3.06, "km", "modelled", F3 + " (illustrative)"),
  "p_walkback_lim": n(5.0, "km", "assumed", "05 §C.1 MissionScenario default"),
  "p_dose": n(0.066, "mSv", "modelled", F3 + " (148 min × 0.64 mSv/day)"),
  "p_dose_lo": n(0.053, "mSv", "modelled", F3),
  "p_dose_hi": n(0.078, "mSv", "modelled", F3),
  "p_dose7": n(0.19, "mSv", "modelled", "01 FR-12 (7 h, solar max; 0.187)"),
  "p_hash": n("3f9a1c07be42", "hash", "derived", F3 + " (illustrative)"),
  "slope_hard": n(15, "°", "assumed", "05 §C.1 MissionScenario default"),
  "slope_hard_new": n(12, "°", "assumed", "01 §E.2 step 6"),
  "slope_caut": n(10, "°", "assumed", "05 §C.1 MissionScenario default"),
  "speed_suit": n(3.3, "km/h", "assumed", "01 A-02 (Apollo 17 planning value)"),
  "dwell_def": n(20, "min", "assumed", "05 §C.1 MissionScenario default"),
  "caut_len": n(80, "m", "derived", F3 + " warning CAUTION_SLOPE 1210–1290 m"),
  "w_from": n(1210, "m", "derived", F3), "w_to": n(1290, "m", "derived", F3),
  "stops_n": n(3, "stops", "assumed", "03 §C.1 / 01 §E.2 (3-stop demo plan)"),
  # partial-route example (02 §E.2)
  "x_dist": n(1184.2, "m", "modelled", E2), "x_walk": n(26.1, "min", "modelled", E2), "x_slope": n(11.4, "°", "derived", E2),
  "x_climb": n(38.0, "m", "derived", E2), "x_desc": n(4.5, "m", "derived", E2),
  "x_near_x": n(2905.0, "m", "derived", E2), "x_near_y": n(-2410.0, "m", "derived", E2),
  "x_t_route": n(412, "ms", "measured", E2 + " (timing diagnostic)"), "x_t_est": n(3, "ms", "measured", E2),
  "x_wf": n(610, "m", "derived", E2), "x_wt": n(690, "m", "derived", E2),
  # point sample (02 §E.2)
  "s_x": n(2990.0, "m", "assumed", E2), "s_y": n(-2595.0, "m", "assumed", E2),
  "s_lat": n(-4.74378, "°", "derived", E2 + " (illustrative)"), "s_lon": n(137.43061, "°E", "derived", E2 + " (illustrative)"),
  "s_elev": n(-3912.4, "m", "derived", E2 + " (illustrative)"), "s_slope": n(21.75, "°", "derived", E2),
  "s_ti": n(312.0, "tiu", "derived", E2), "s_snap": n(19.0, "m", "derived", E2), "snap_r": n(50, "m", "assumed", "02 §E.2 / FR-06"),
  # darkness / timing placeholders
  "p_sunel": ph("°", "modelled", "TASK-06", "##.#"),
  "p_ltst_start": ph("LTST", "modelled", "TASK-06", "##:##"),
  "p_over_a": ph("min", "modelled", "TASK-05", "###"), "p_over_b": ph("min", "assumed", "TASK-05", "###"),
  "p_ls": ph("°", "modelled", "TASK-06", "###.#"), "p_my": ph("MY", "modelled", "TASK-06", "##"),
  "p_t_haven": ph("min", "modelled", "TASK-05b", "##"),
  # report / post-EVA (all placeholder until the scenario exists)
  "r_recv": ph("µGy", "simulated", "TASK-22 / TASK-21", "####"), "r_unsh": ph("µGy", "simulated", "TASK-22 / TASK-21", "####"),
  "r_tshel": ph("mm:ss", "simulated", "TASK-22", "##:##"), "r_stops": ph("stops", "simulated", "TASK-22", "#"),
  "r_resp": ph("mm:ss", "simulated", "TASK-22", "##:##"),
  "log_hash": ph("sha256", "derived", "TASK-22 (NFR-06)", "############"),
  # rover / T2
  "ur_battery": ph("Wh", "simulated", "TASK-29", "####"), "ur_eta": ph("min", "modelled", "TASK-29", "##"),
  "ur_cap": n(5, "kWh", "assumed", "02 §D.9 (utility rover battery)"),
  # boot / link-lost
  "hb_ping": n(2, "s", "assumed", "02 §E.6 (server PING every 2 s)"), "hb_loss": n(3, "s", "assumed", "02 §E.6 / 03 SCR-18 (3 s without PING)"),
  "reconn": ph("s", "simulated", "TASK-24", "#"),
  "seq": n(412, "seq", "simulated", "02 §E.6 SNAPSHOT example"),
  "stat_missions": n(7, "missions", "measured", "04 §E.1 (MRO, Mars Express, MGS, Odyssey, MSL, MAVEN, TGO)"),
  "stat_types": n(3, "types", "assumed", "04 §E.1 / 01 §A.4"),
  "dem_res": n(1, "m", "measured", "05 §F.1 (usgs-gale-dem-1m-v3)"), "ortho_res": n(25, "cm", "measured", "00 Docs index (USGS Gale orthophoto 25 cm)"),
  "grid_cell": n(5, "m", "derived", "05 §F.1 grid.cell_m"), "ti_cell": n(100, "m", "derived", "05 §F.1 grid.ti_cell_m"), "disp_res": n(2, "m", "derived", "05 §F.1 slope layer"),
  "aoi_half": n(3000, "m", "assumed", "05 §F.1 aoi.extent_m (illustrative until TASK-01)"),
  "mast_h": n(10, "m", "assumed", "02 §C.5 L11"), "suit_ant": n(2, "m", "assumed", "02 §D.9"), "rover_ant": n(3, "m", "assumed", "02 §D.9"),
  "horizon_2m": n(3.69, "km", "derived", "02 §D.11 √(2Rh)"), "horizon_10m": n(8.24, "km", "derived", "02 §D.11 √(2Rh)"),
  "pr_speed": n(10, "km/h", "assumed", "02 §D.9 (cited: NASA SEV concept)"), "pr_hard": n(20, "°", "assumed", "02 §D.9"), "pr_caut": n(15, "°", "assumed", "02 §D.9"),
  "ur_speed": n(2, "km/h", "assumed", "02 §D.9"), "ur_hard": n(25, "°", "assumed", "02 §D.9"), "ur_caut": n(20, "°", "assumed", "02 §D.9"),
  "rng_hab": n(10, "km", "assumed", "02 §D.11"), "rng_suit": n(2, "km", "assumed", "02 §D.11"), "rng_rover": n(5, "km", "assumed", "02 §D.11"),
  # ---- EV1 placeholders for states the specs give no numbers for ----
  "haven_ph1": ph("min", "modelled", "TASK-05b / TASK-22", "##"), "o2_ph1": ph("%", "simulated", "TASK-22", "##"), "o2left_ph1": ph("h:mm", "simulated", "TASK-22", "#:##"),
  "eva_ph1": ph("h:mm", "simulated", "TASK-22", "#:##"), "dose_ph1": ph("mGy", "simulated", "TASK-22", "#.#"), "bearing_ph1": ph("°", "derived", "TASK-22", "###"),
  "dist_ph1": ph("km", "derived", "TASK-22", "#.##"), "eta_ph1": ph("min", "modelled", "TASK-22", "##"), "dwell_ph": ph("mm:ss", "simulated", "TASK-22", "##:##"),
  "rdv_eta_ph": ph("min", "modelled", "TASK-05b", "##"), "scale_bar": n(200, "m", "derived", "05 §F.1 grid.cell_m (1 map unit = 5 m; schematic)"),
  "pr_eta": ph("min", "modelled", "TASK-05b", "##"), "pr_bat": ph("Wh", "simulated", "not modelled for PR1 (02 §D.9)", "—"),
  "coord_ph": ph("°", "derived", "TASK-02", "-#.#####"), "coord_ph2": ph("°E", "derived", "TASK-02", "###.#####"),
  "stale1": n("0:42", "m:ss", "simulated", "04 §C.1 (STALE 0:42)"), "ack_t": ph("mm:ss", "simulated", "TASK-22", "##:##"),
  "sev_dist_ph": ph("m", "derived", "TASK-05b", "###"), "rev_ph": ph("rev", "derived", "TASK-22", "##"),
  "ltst_task": ph("LTST", "simulated", "TASK-31", "##:##"), "seq_task": ph("seq", "simulated", "TASK-31", "###"),
  "relay_el": n(10, "°", "assumed", "02 §D.12"), "conj_deg": n(3, "°", "assumed", "02 §D.12"),
}


# ================= FR-50 stop tasks (Proposed, 2026-11-05) =================
# Task text is team-authored PROPOSED copy: imperative, <= 60 chars, no numbers. Task state is "simulated"; text is "assumed" and carries the POI source id.
# COUNTS ARE NEVER COMPUTED IN THE PROTOTYPE: every count shown on screen is a number object looked up from `n`, via tables generated HERE at build time.
TK_STATES = ["TODO", "DONE", "SKIPPED", "DROPPED"]
TK_SRC = {"s1": "themis-ti-100m", "s2": "msl-sulfate-unit", "s3": "msl-places"}
TK_TEXT = {
  "s1": {"EV1": [("t-s1-01", "observe", "Observe the loose-fines patch"), ("t-s1-02", "image", "Image the slope face")],
         "EV2": [("t-s1-11", "measure", "Measure the rock field edge"), ("t-s1-12", "observe", "Observe the surface texture")]},
  "s2": {"EV1": [("t-s2-01", "observe", "Observe the sulfate ledge face"), ("t-s2-02", "sample", "Sample the sulfate-bearing unit"), ("t-s2-03", "image", "Image the sampled spot")],
         "EV2": [("t-s2-11", "image", "Image the ledge in context"), ("t-s2-12", "deploy", "Deploy the marker flag")]},
  "s3": {"EV1": [("t-s3-01", "observe", "Observe the cemented ridge"), ("t-s3-02", "image", "Image the sandy hollow"), ("t-s3-03", "sample", "Sample a ridge fragment")],
         "EV2": [("t-s3-11", "measure", "Measure the ridge crest"), ("t-s3-12", "other", "Note loose rock near the ridge")]},
}
TK_STOP = {"s1": "wp-1", "s2": "wp-2", "s3": "wp-3"}
def _task(sid, crew, t):
    tid, kind, text = t
    return {"task_id": tid, "stop_id": TK_STOP[sid], "stop": sid, "crew_id": crew, "kind": kind, "text": text, "state": "TODO", "reason": None, "origin": "plan",
            "updated_sim_time": None, "updated_by": None, "provenance": {"state": "simulated", "text": "assumed", "source_id": TK_SRC[sid]}, "text_src": "PROPOSED copy (FR-50)"}
TK_LIST = [_task(sid, crew, t) for sid in TK_TEXT for crew in ("EV1", "EV2") for t in TK_TEXT[sid][crew]]
TK_OPS_ADDED = [{"task_id": "t-s2-21", "stop_id": "wp-2", "stop": "s2", "crew_id": "EV1", "kind": "image", "text": "Image the ledge base", "state": "TODO", "reason": None, "origin": "ops",
                 "updated_sim_time": None, "updated_by": "ops", "provenance": {"state": "simulated", "text": "assumed", "source_id": "msl-sulfate-unit"}, "text_src": "PROPOSED copy (FR-50)"}]
def _sc(ev1=None, ev2=None): return {"EV1": ev1 or {}, "EV2": ev2 or {}}
_K0_1 = {"t-s1-01": {"state": "DONE"}, "t-s1-02": {"state": "SKIPPED", "reason": "time"}}
_K0_2 = {"t-s1-11": {"state": "DONE"}, "t-s1-12": {"state": "DONE"}}
TK_SCEN = {
  "start": _sc(),
  "k0": _sc(_K0_1, _K0_2),
  "walking": _sc(_K0_1, _K0_2),
  "atStop": _sc({**_K0_1, "t-s2-01": {"state": "DONE"}, "t-s2-03": {"state": "SKIPPED", "reason": "terrain"}}, _K0_2),
  "k0b": _sc({**_K0_1, "t-s2-02": {"state": "DONE"}}, _K0_2),
  "noLink": _sc({**_K0_1, "t-s2-01": {"state": "DONE"}, "t-s2-02": {"state": "DONE", "unsynced": True}, "t-s2-03": {"state": "SKIPPED", "reason": "terrain"}}, _K0_2),
  "opsTask": _sc({**_K0_1, "t-s2-01": {"state": "DONE"}, "t-s2-03": {"state": "SKIPPED", "reason": "terrain"}}, _K0_2),
  # after the rendezvous plan revision: the current stop is cut short and later stops are dropped (G-39)
  "dropped": _sc({**_K0_1, "t-s2-01": {"state": "DROPPED"}, "t-s2-02": {"state": "DONE"}, "t-s2-03": {"state": "DROPPED"}, "t-s3-01": {"state": "DROPPED"}, "t-s3-02": {"state": "DROPPED"}, "t-s3-03": {"state": "DROPPED"}},
                 {**_K0_2, "t-s2-11": {"state": "DROPPED"}, "t-s2-12": {"state": "DROPPED"}, "t-s3-11": {"state": "DROPPED"}, "t-s3-12": {"state": "DROPPED"}}),
}
TK_SCEN["undo"] = TK_SCEN["k0b"]; TK_SCEN["alerting"] = TK_SCEN["k0b"]; TK_SCEN["final"] = TK_SCEN["dropped"]
TK_N = {str(i): n(i, "tasks", "simulated", "FR-50 (declared in the fixture, looked up, never computed)") for i in range(0, 13)}
import itertools
TK_COUNTS = {}
for L in (2, 3, 4):
    for combo in itertools.product(TK_STATES, repeat=L):
        TK_COUNTS[",".join(combo)] = [str(combo.count("DONE")), str(combo.count("SKIPPED")), str(combo.count("DROPPED")), str(combo.count("TODO")), str(L)]   # build time only
TK_DONE_TOTAL = {f"{a},{b},{c}": str(a + b + c) for a in range(5) for b in range(5) for c in range(5)}
TK_TOTAL_ALL = {f"{a},{b},{c}": str(a + b + c) for a in (2, 3, 4) for b in (2, 3, 4) for c in (2, 3, 4)}
TASKS = {"note": "FR-50 stop tasks (Proposed 2026-11-05). Counts are looked up from `n` through the generated tables `counts`, `done_total`, `total_all`; the prototype never adds or counts.",
         "kinds": ["observe", "image", "sample", "measure", "deploy", "other"], "reasons": ["time", "terrain", "alert", "other"], "states": TK_STATES,
         "list": TK_LIST, "ops_added": TK_OPS_ADDED, "scenarios": TK_SCEN, "n": TK_N, "counts": TK_COUNTS, "count_cols": ["done", "skipped", "dropped", "todo", "total"],
         "done_total": TK_DONE_TOTAL, "total_all": TK_TOTAL_ALL, "undo_ms": n(5000, "ms", "assumed", "FR-50 (5-s undo)"), "stop_names": {"s1": "EZ—ENG 01", "s2": "EZ—RES 02", "s3": "EZ—SCI 01"}}

SRC_STAMP = "PROTOTYPE — illustrative values"

F = {
  "meta": {
    "fixture_version": "0.1.0-proto", "date": "2026-11-05", "banner": SRC_STAMP,
    "title": "Marswalk Surface Ops (working title)", "team": "CheesySpace",
    "challenge": "Interplanetary Survival Guide: Martian Map",
    "disclaimer": "Marswalk Surface Ops is an exploratory hackathon prototype. It is not astronaut operations software. Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.",
    "disclaimer_src": "01 §F.1",
    "data_version": "gale_boxwork-2026.11.08", "data_version_src": "04 §C.3 / 05 §F.4",
    "crs": "IAU_2015:49900 sphere, east-positive, local eqc projection",
    "crs_proj4": "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
    "schematic": "SCHEMATIC — not real terrain",
    "ai_use": "No AI computes or generates values in this app.",
  },
  "nums": nums,
  "tasks": TASKS,
  "site": {  # 05 §C.1 Site (abridged)
    "schema_version": "1.0.0", "site_id": "gale_boxwork", "name": "Mount Sharp boxwork, Gale crater", "body": "mars",
    "data_version": "gale_boxwork-2026.11.05",
    "crs": {"base": "IAU_2015:49900", "proj4": "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"},
    "aoi": {"extent_m": [-3000, -3000, 3000, 3000], "src": "05 §F.1 (illustrative until TASK-01)"},
    "default_start": {"x_m": n(-1800, "m", "assumed", "05 §F.1"), "y_m": n(-1500, "m", "assumed", "05 §F.1"), "label": "Habitat / rover"},
    "hab_mast": {"x_m": n(-1800, "m", "assumed", "05 §F.1"), "y_m": n(-1500, "m", "assumed", "05 §F.1"), "height_m": n(10, "m", "assumed", "05 §F.1")},
    "layers": [
      {"layer_id": "ortho", "title": "Orthoimage", "category": "optical", "provenance": "measured", "units": "—", "res": "ortho_res", "default_visible": True,
       "src_ids": ["usgs-gale-ortho-25cm"], "limitations": "Prototype draws a schematic, not imagery (real basemap after TASK-01/03).", "legend": {"type": "none"}},
      {"layer_id": "hillshade", "title": "Hillshade", "category": "topographic", "provenance": "derived", "units": "—", "res": "dem_res", "default_visible": True,
       "src_ids": ["usgs-gale-dem-1m-v3"], "derived_from": ["elevation"], "limitations": "Neutral relief; sun azimuth is cosmetic.", "legend": {"type": "none"}},
      {"layer_id": "elevation", "title": "Elevation", "category": "topographic", "provenance": "measured", "units": "m", "res": "dem_res", "default_visible": False,
       "src_ids": ["usgs-gale-dem-1m-v3"], "limitations": "Referenced to MOLA areoid (assumed — verify U-02).", "legend": {"type": "ramp", "lo": ph("m", "measured", "TASK-01", "####"), "hi": ph("m", "measured", "TASK-01", "####")}},
      {"layer_id": "slope", "title": "Slope", "category": "topographic", "provenance": "derived", "units": "°", "res": "dem_res", "default_visible": False,
       "src_ids": ["usgs-gale-dem-1m-v3"], "derived_from": ["elevation"], "limitations": "Horn slope on 1 m posts; effective DTM resolution is coarser; artifacts possible.",
       "legend": {"type": "classes", "breaks_follow_scenario": True, "classes": [[0, 5, "flat"], [5, 10, "gentle"], [10, 15, "caution"], [15, 25, "over limit"], [25, 90, "steep"]]}, "src": "05 §F.1"},
      {"layer_id": "ti", "title": "Thermal inertia", "category": "thermal", "provenance": "derived", "units": "tiu", "res": "ti_cell", "default_visible": False,
       "src_ids": ["themis-ti-100m"], "limitations": "Low TI read as 'possible loose fines' (assumed interpretation A-05; threshold U-03).",
       "legend": {"type": "ramp", "lo": ph("tiu", "derived", "U-03", "###"), "hi": ph("tiu", "derived", "U-03", "###")}},
      {"layer_id": "comm", "title": "Comm coverage", "category": "hazard", "provenance": "derived", "units": "LOS 0/1", "res": "grid_cell", "default_visible": False,
       "src_ids": ["usgs-gale-dem-1m-v3"], "limitations": "Binary line of sight only: no Fresnel zone, diffraction, multipath or link budget (02 §C.5 L11).",
       "legend": {"type": "hatch", "text": "NO SIGNAL — line of sight only"}},
      {"layer_id": "haven", "title": "Haven isochrones", "category": "hazard", "provenance": "modelled", "units": "min", "res": "grid_cell", "default_visible": False,
       "src_ids": ["usgs-gale-dem-1m-v3"], "limitations": "Planning approximation every 50 m (02 §D.8).", "legend": {"type": "bands", "bands": ["10", "20", "30"]}},
      {"layer_id": "traverse", "title": "Curiosity traverse", "category": "mission", "provenance": "measured", "units": "sol", "res": "dem_res", "default_visible": True,
       "src_ids": ["msl-places"], "limitations": "Source and tolerance Unresolved (U-04).", "legend": {"type": "line"}},
      {"layer_id": "pois", "title": "Exploration Zone POIs", "category": "mission", "provenance": "assumed", "units": "—", "res": "grid_cell", "default_visible": True,
       "src_ids": ["msl-sulfate-unit"], "limitations": "Curated positions ±15 m (assumed).", "legend": {"type": "poi"}},
    ],
    "env_constants": [{"const_id": "rad-gale-dose-eq-solar-max", "quantity": "surface dose equivalent rate", "value": nums["bg_dose_mSv_day"],
                       "low": n(0.52, "mSv/day", "measured", "05 §F.1"), "high": n(0.76, "mSv/day", "measured", "05 §F.1"),
                       "conditions": {"solar_phase": "max", "location": "Gale crater floor", "period": "2012-2013"}, "source_id": "hassler-2014-rad"}],
  },
  "pois": [
    {"poi_id": "poi-boxwork-ridge", "code": "EZ—SCI 01", "name": "Boxwork ridge", "stop_type": "science", "ez_theme": "Boxwork — groundwater history", "stop_no": 3,
     "science_objective": "Examine a mineral-cemented ridge and the sandy hollow beside it.", "obj_src": "05 §F.2",
     "why_it_matters": "Ridges record groundwater moving through fractures as Mars dried.", "why_src": "05 §F.2",
     "image": {"credit": "NASA/JPL-Caltech", "sol": n(4611, "sol", "measured", "05 §F.2"), "date": "2025-07-27", "camera": "Navcam", "counter": "01 / 01", "src": "05 §F.2"},
     "lat": n(-4.6945, "°", "assumed", "05 §F.2 (illustrative)"), "lon_e": n(137.3869, "°E", "assumed", "05 §F.2 (illustrative)"),
     "position_source": "Nearest Curiosity waypoint to the imaged ridge (to be confirmed in TASK-04)", "uncertainty": n(15, "m", "assumed", "05 §F.2"),
     "provenance": "assumed", "evidence": [{"text": "Curiosity 2025 boxwork campaign images", "source_id": "msl-places", "src": "01 §A.4"}]},
    {"poi_id": "poi-sulfate-ledge", "code": "EZ—RES 02", "name": "Hydrated sulfate ledge", "stop_type": "resource", "ez_theme": "Hydrated sulfates — ISRU water", "stop_no": 2,
     "science_objective": "Sample sulfate-bearing unit", "obj_src": "04 §E.10",
     "why_it_matters": "Water for life support and propellant is the first resource a base needs. Hydrated minerals yield less than ice, but Gale has no shallow ice.", "why_src": "01 §A.4",
     "image": {"credit": "NASA/JPL-Caltech", "sol": n(4171, "sol", "measured", "04 §E.10 (illustrative)"), "date": "TODO(verify)", "camera": "Mastcam", "counter": "03 / 08", "src": "04 §E.10"},
     "lat": ph("°", "assumed", "TASK-04", "-#.####"), "lon_e": ph("°E", "assumed", "TASK-04", "###.####"),
     "position_source": "TODO(verify) — TASK-04", "uncertainty": n(15, "m", "assumed", "04 §E.10"),
     "provenance": "assumed", "evidence": [{"text": "Sulfate-bearing unit identified by Curiosity", "source_id": "msl-sulfate-unit", "src": "05 §C.1 POI example"},
                                           {"text": "CRISM summary parameters, if covered (indicative, not a mineral identification)", "source_id": "crism-mtrdr", "src": "01 FR-18"}]},
    {"poi_id": "poi-eng-01", "code": "EZ—ENG 01", "name": None, "name_ph": "Name set in TASK-04", "stop_type": "engineering", "ez_theme": "Terrain — loose fines and slopes", "stop_no": 1,
     "science_objective": "Sand/loose-fines patches, slopes, rock fields near the hab", "obj_src": "01 §A.4",
     "why_it_matters": "Trafficability for future vehicles and construction.", "why_src": "01 §A.4",
     "image": None, "lat": ph("°", "assumed", "TASK-04", "-#.####"), "lon_e": ph("°E", "assumed", "TASK-04", "###.####"),
     "position_source": "TODO(verify) — TASK-04", "uncertainty": ph("m", "assumed", "TASK-04", "##"), "provenance": "assumed",
     "evidence": [{"text": "Thermal inertia, slope, rover scout images", "source_id": "themis-ti-100m", "src": "01 §A.4"}]},
  ],
  "stops_note": "Stop 2 = resource and stop 3 = Boxwork ridge are fixed by 01 §E.1 and 04 §E.5. Stop 1 = EZ—ENG 01 is Proposed (G-12).",
  "param_sets": [
    {"param_set_id": "suit-assumed", "kind": "suit", "title": "EVA suit (assumed)", "provenance": "assumed", "note": "02 §D.9; O₂ 8 h nominal is A-10",
     "values": [["Flat speed", "speed_suit"], ["Hard slope", "slope_hard"], ["Caution slope", "slope_caut"], ["Antenna height", "suit_ant"]]},
    {"param_set_id": "pr1-assumed", "kind": "pressurized_rover", "title": "Pressurized rover (SEV-class concept)", "provenance": "assumed", "source_ids": ["nasa-sev-factsheet-2011"],
     "note": "Speed and capacity from the NASA SEV concept; slope limit and ingress are assumptions (02 §D.9, U-20)",
     "values": [["Flat speed", "pr_speed"], ["Hard slope", "pr_hard"], ["Caution slope", "pr_caut"], ["Ingress", "ingress"], ["Antenna height", "rover_ant"]]},
    {"param_set_id": "ur1-assumed", "kind": "utility_rover", "title": "Robotic utility rover (T2)", "provenance": "assumed", "note": "02 §D.9",
     "values": [["Flat speed", "ur_speed"], ["Hard slope", "ur_hard"], ["Caution slope", "ur_caut"], ["Battery", "ur_cap"]]},
    {"param_set_id": "link-assumed", "kind": "link", "title": "Surface link (assumed)", "provenance": "assumed", "note": "02 §D.11–D.12; U-19",
     "values": [["Hab–suit range", "rng_hab"], ["Suit–suit range", "rng_suit"], ["Rover–any range", "rng_rover"], ["Hab mast", "mast_h"], ["Relay min. elevation", "relay_el"], ["Conjunction angle", "conj_deg"]]},
    {"param_set_id": "alert-assumed", "kind": "alert", "title": "Alert thresholds (assumed)", "provenance": "assumed", "note": "02 §D.13–D.14; U-19",
     "values": [["Trigger", "alert_k"], ["Buddy max", "buddy_max"], ["Haven rule", "haven_rule"]]},
    {"param_set_id": "shielding-assumed", "kind": "shielding", "title": "Shielding factors (assumed)", "provenance": "assumed", "note": "A-11: physical shielding is not modelled",
     "values": [["EVA suit", "shield_suit"], ["Pressurized rover", "shield_pr"], ["Hab", "shield_hab"]]},
  ],
  "scenario": {  # 05 §F.4
    "scenario_schema_version": "1.0.0", "scenario_id": "storm-sol4190", "title": "Storm at sol 4190", "site_id": "gale_boxwork",
    "data_version": "gale_boxwork-2026.11.08", "seed": n(4190, "seed", "assumed", "05 §F.4"), "start_utc": "2024-05-20T00:00:00Z", "start_src": "05 §F.4 (illustrative until TASK-21)",
    "crew": [{"crew_id": "EV1", "suit_param_set": "suit-assumed", "start_offset_s": n(0, "s", "assumed", "05 §F.4")}, {"crew_id": "EV2", "suit_param_set": "suit-assumed", "start_offset_s": n(0, "s", "assumed", "05 §F.4")}],
    "vehicles": [{"vehicle_id": "PR1", "kind": "pressurized_rover", "param_set": "pr1-assumed", "start_x_m": n(-1800, "m", "assumed", "05 §F.4"), "start_y_m": n(-1500, "m", "assumed", "05 §F.4")}],
    "events": [
      {"event_id": "e1", "t_utc": "2024-05-20T…Z", "kind": "DONKI_RECORD", "provenance": "replayed", "source_id": "donki-2024-05",
       "payload": {"donki_type": "FLR", "summary": "X-class flare (far side from Earth; class estimated from Solar Orbiter)"}, "src": "05 §F.4"},
      {"event_id": "e2", "t_utc": "2024-05-20T…Z", "kind": "EARTH_MESSAGE", "provenance": "simulated", "payload": {"body": "SEP event in progress. Recommend shelter."}, "src": "05 §F.4"}],
    "source_ids": ["rad-sol4190", "donki-2024-05", "naif-de440s", "esa-tgo-spk"],
  },
  "dose_series": {"series_id": "rad-sol4190", "quantity": "surface absorbed dose rate", "unit": "µGy/h", "samples": None, "samples_src": "PLACEHOLDER (U-15)",
                  "method": "TBD: archive | digitised | template_scaled (02 §C.5 L9)", "provenance": "replayed", "source_id": "rad-sol4190",
                  "label": "replayed — Curiosity RAD, 20 May 2024", "shape_note": "Shape is a placeholder until U-15 is resolved.",
                  "integral_check": {"expected_ugy": nums["event_total"], "computed_ugy": ph("µGy", "replayed", "U-15", "####")}},
  "earth_link": {"step_s": n(60, "s", "derived", "05 §C.2 EarthLinkTable"), "rows": None, "rows_src": "PLACEHOLDER (U-18 / TASK-21)",
                 "kernels": ["naif0012.tls", "de440s.bsp", "pck00011.tpc", "mro_psp*.bsp (TODO verify)", "maven_orb_rec_*.bsp (TODO verify)", "em16_tgo_* (ESA, TODO verify)"], "kernels_src": "02 §C.5 L10 — names unverified (U-18)",
                 "passes": [{"orbiter": "mro", "start_utc": "…", "end_utc": "…", "max_elev_deg": ph("°", "derived", "U-18", "##")}]},
  "options": [
    {"option_id": "o1", "kind": "VEHICLE_RENDEZVOUS", "label": "Rendezvous with PR1", "rank": 1, "crew_ids": ["EV1", "EV2"], "eta": "opt1_eta", "dose": "opt_dose", "drops": "opt_drops", "violations": [], "approval": False, "note": "Rendezvous point avoids a 17° slope.", "note_src": E1},
    {"option_id": "o2", "kind": "ABORT_TO_HAB", "label": "Abort to hab", "rank": 2, "crew_ids": ["EV1", "EV2"], "eta": "opt2_eta", "dose": "opt_dose", "drops": "opt_drops", "violations": [], "approval": False, "note": "On foot to the hab; no vehicle needed.", "note_src": "02 §D.8"},
    {"option_id": "o3", "kind": "CONTINUE_SKIP", "label": "Continue — skip stops", "rank": 3, "crew_ids": ["EV1", "EV2"], "eta": "opt3_eta", "dose": "opt_dose", "drops": "opt_drops", "violations": ["HAVEN_TIME_EXCEEDED?"], "approval": True, "note": "Needs ops approval (03 SCR-14).", "note_src": "03 SCR-14"},
  ],
  "alerts": {
    "RADIATION_ALERT": {"level": "warning", "text": "Shelter now — radiation surge", "src": "04 §D.2"},
    "COMM_SHADOW": {"level": "caution", "text": "Comm shadow in 120 m — stay with EV2", "src": "04 §D.2"},
    "LINK_LOST": {"level": "caution", "text": "No hab link — operating on cached plan", "src": "03 §D / 04 §D.5"},
    "EARTH_FORECAST": {"level": "advisory", "text": "Earth forecast received (sent 14 min ago)", "src": "04 §D.2"},
    "RELAY_PASS": {"level": "advisory", "text": "Relay pass starting", "src": "04 §D.2"},
    "CONSUMABLES_LOW": {"level": "caution", "text": "Return to hab soon — oxygen low", "src": "PROPOSED copy (04 §D.4 grammar)"},
    "BUDDY_SEPARATION": {"level": "caution", "text": "Rejoin EV2 — buddy separation", "src": "PROPOSED copy"},
    "HAVEN_TIME_EXCEEDED": {"level": "warning", "text": "Head to hab now — haven time exceeded", "src": "PROPOSED copy"},
  },
  "reject": {  # 03 §D command rejected reasons
    "FORBIDDEN_ROLE": "Not allowed for this role — ask ops",
    "NO_LINK": "Queued — sends when link returns",
    "INVALID": "Command not valid now — check the option",
    "NO_RENDEZVOUS": "Rover can't reach you here — moving rendezvous to ridge foot",
    "BUSY": "Rover is busy — wait for the current task",
  },
  "log": [  # 05 §C.2 LogEvent; seq values from 05 §F.6; times from 04 §E.4 where given
    {"seq": nums["seq"], "t": "ltst_k0", "kind": "ARRIVED_STOP", "actor": "system", "text": "EV1 arrived stop 2", "prov": "simulated", "src": S4},
    {"seq": nums["seq_task"], "t": "ltst_task", "kind": "TASK_UPDATED", "actor": "eva:EV1", "text": "EV1 marked a stop 2 task done", "prov": "simulated", "src": "FR-50 / 05 StopTask (new log event)"},
    {"seq": n(420, "seq", "simulated", "05 §F.6"), "t": "ltst_alert", "kind": "ALERT_RAISED", "actor": "system", "text": "Radiation alert", "prov": "replayed", "src": S4 + " / 05 §F.6"},
    {"seq": n(421, "seq", "simulated", "05 §F.6"), "t": "ltst_ph", "kind": "OPTIONS_PROPOSED", "actor": "system", "text": "Options proposed (rendezvous, abort)", "prov": "modelled", "src": "05 §F.6"},
    {"seq": n(422, "seq", "simulated", "05 §F.6"), "t": "ltst_ph", "kind": "VEHICLE_DISPATCHED", "actor": "eva:EV1", "text": "PR1 dispatched", "prov": "modelled", "src": "05 §F.6"},
    {"seq": nums["seq_task"], "t": "ltst_task", "kind": "TASK_DROPPED", "actor": "system", "text": "Open tasks dropped — plan revised", "prov": "simulated", "src": "FR-50 / 05 StopTask (new log event)"},
    {"seq": ph("seq", "simulated", "TASK-22", "###"), "t": "ltst_ph", "kind": "ALERT_RAISED", "actor": "system", "text": "Comm shadow ahead", "prov": "derived", "src": "03 §C.6 step 7"},
    {"seq": ph("seq", "simulated", "TASK-22", "###"), "t": "ltst_ph", "kind": "EARTH_MSG_DELIVERED", "actor": "system", "text": "Earth forecast delivered", "prov": "simulated", "src": "03 §C.6 step 8"},
    {"seq": ph("seq", "simulated", "TASK-22", "###"), "t": "ltst_ph", "kind": "CREW_SHELTERED", "actor": "system", "text": "EV1, EV2 sheltered — PR1", "prov": "simulated", "src": "03 §C.6 step 9"},
    {"seq": ph("seq", "simulated", "TASK-22", "###"), "t": "ltst_ph", "kind": "EVA_ENDED", "actor": "ops", "text": "EVA ended", "prov": "simulated", "src": "03 §C.6 step 10"},
  ],
  "snapshot_example": {  # 02 §E.6 SNAPSHOT shape; numbers wrapped for the audit (wire messages carry raw numbers + a provenance map)
    "v": 1, "type": "SNAPSHOT", "seq": nums["seq"], "sim_time": "2024-05-20T13:05:00Z", "sim_time_src": "02 §E.6 (UTC; NOT the LTST in 04 §C.3 — G-14)",
    "session": {"session_id": "s-0007", "scenario_id": "storm-sol4190", "data_version": "gale_boxwork-2026.11.08", "clock": {"speed": nums["speed"], "paused": False}},
    "plan": {"plan_revision": nums["plan_rev"]},
    "crew": [{"crew_id": "EV1", "x_m": n(2410.5, "m", "simulated", "02 §E.6"), "y_m": n(-1875.0, "m", "simulated", "02 §E.6"), "o2_frac": n(0.71, "fraction", "simulated", "02 §E.6"),
              "dose_event_ugy": n(0, "µGy", "simulated", "02 §E.6"), "linked": True, "haven_min": n(18.4, "min", "modelled", "02 §E.6 (04 §E.4 shows 14: G-14)"), "haven_kind": "vehicle"}],
    "vehicles": [{"vehicle_id": "PR1", "kind": "pressurized_rover", "x_m": n(-1800, "m", "simulated", "02 §E.6"), "y_m": n(-1500, "m", "simulated", "02 §E.6"), "state": "PARKED"}],
    "alerts": [], "link": {"earth": {"light_time_s": ph("s", "derived", "U-18", "###"), "blackout": False}},
    "provenance": {"crew.o2_frac": "simulated", "crew.haven_min": "modelled", "link.earth.light_time_s": "derived"},
  },
  "sources": [
    {"id": "usgs-gale-dem-1m-v3", "code": "DS—01", "title": "Mars MSL Gale Merged DEM 1m", "publisher": "USGS Astrogeology Science Center", "authors": "Parker, T.; Calef III, F. J.", "missions": "MRO, Mars Express (ESA), MGS", "instr": "HiRISE, CTX, HRSC, MOLA", "version": "v3", "res": "dem_res", "credit": "Please credit authors", "licence": "Use constraints: none", "url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m", "acc": "2026-11-02", "note": "HRSC controlled to MOLA (~100 m horizontal, ~1 m vertical)", "layer": "elevation", "src": "05 §F.1"},
    {"id": "usgs-gale-ortho-25cm", "code": "DS—02", "title": "Mars MSL Gale Merged Orthophoto Mosaic 25 cm", "publisher": "USGS Astrogeology Science Center", "missions": "MRO", "instr": "HiRISE", "version": "TODO(verify)", "res": "ortho_res", "credit": "NASA/JPL/UArizona/USGS (TODO verify wording)", "licence": "TODO(verify)", "url": "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm", "acc": "2026-11-02", "layer": "ortho", "src": "02 Sources"},
    {"id": "themis-ti-100m", "code": "DS—03", "title": "THEMIS Thermal Inertia Mosaic (quantitative, 100 m)", "publisher": "USGS Astrogeology / ASU", "missions": "Mars Odyssey", "instr": "THEMIS", "version": "TODO(verify)", "res": "ti_cell", "credit": "TODO(verify)", "licence": "TODO(verify)", "url": "https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s060e_100mpp", "acc": "2026-11-02", "layer": "ti", "src": "02 Sources"},
    {"id": "hassler-2014-rad", "code": "DS—04", "title": "Hassler et al. 2014 — MSL RAD surface radiation (background dose equivalent)", "publisher": "Science (journal)", "missions": "MSL", "instr": "RAD", "version": "—", "credit": "Hassler et al. 2014; Simonsen et al. 2024", "licence": "—", "url": "", "acc": "2026-11-02", "note": "Via Mars Scientific Context §9; add DOI in TASK-04", "layer": "", "src": "02 Sources"},
    {"id": "rad-sol4190", "code": "DS—05", "title": "MSL RAD dose rate, sol 4190 (20 May 2024 solar particle event)", "publisher": "NASA PDS PPI (availability Unresolved U-15)", "missions": "MSL", "instr": "RAD", "version": "PLACEHOLDER", "credit": "NASA/JPL-Caltech/SwRI (TODO verify)", "licence": "TODO(verify)", "url": "", "acc": "2026-11-04", "note": "Event total about 8,100 µGy (NASA, June 2024; replace secondary URL with nasa.gov in TASK-04)", "layer": "", "src": "01 FR-37"},
    {"id": "donki-2024-05", "code": "DS—06", "title": "NASA CCMC DONKI — FLR, CME, SEP, WSA-ENLIL records (May 2024)", "publisher": "NASA CCMC", "missions": "—", "instr": "—", "version": "experimental research information (CCMC label)", "credit": "NASA CCMC DONKI", "licence": "TODO(verify)", "url": "https://webtools.ccmc.gsfc.nasa.gov/DONKI/", "acc": "2026-11-04", "layer": "", "src": "02 §C.5 L8"},
    {"id": "naif-de440s", "code": "DS—07", "title": "NAIF SPICE generic kernels (de440s, naif0012, pck00011)", "publisher": "NASA NAIF / JPL", "missions": "—", "instr": "—", "version": "TODO(verify)", "credit": "NASA NAIF", "licence": "TODO(verify)", "url": "https://naif.jpl.nasa.gov/naif/", "acc": "2026-11-04", "layer": "", "src": "02 §C.5 L10"},
    {"id": "esa-tgo-spk", "code": "DS—08", "title": "ESA SPICE service — ExoMars TGO trajectory kernels", "publisher": "ESA", "missions": "TGO (ESA)", "instr": "—", "version": "TODO(verify) — U-18", "credit": "ESA SPICE service", "licence": "TODO(verify)", "url": "https://www.cosmos.esa.int/web/spice", "acc": "2026-11-04", "layer": "", "src": "02 §C.5 L10"},
    {"id": "nasa-sev-factsheet-2011", "code": "DS—09", "title": "NASA Space Exploration Vehicle concept fact sheet FS-2011-08-045-JSC", "publisher": "NASA JSC", "missions": "—", "instr": "—", "version": "2011", "credit": "NASA", "licence": "—", "url": "https://www.nasa.gov/wp-content/uploads/2015/08/464826main_sev_factsheet_508.pdf", "acc": "2026-11-04", "layer": "", "src": "02 Sources v2"},
    {"id": "msl-places", "code": "DS—10", "title": "PDS MSL Analyst's Notebook / PLACES traverse", "publisher": "NASA PDS Geosciences", "missions": "MSL", "instr": "—", "version": "TODO(verify) — U-04", "credit": "NASA/JPL-Caltech", "licence": "TODO(verify)", "url": "https://pds-geosciences.wustl.edu/workshops/LPSC2023/2166.pdf", "acc": "2026-11-02", "layer": "traverse", "src": "02 Sources"},
  ],
  "team": [  # 08_Team — names only; no photos (no under-18 likeness)
    {"name": "Obidit Islam", "role": "Team lead · data"}, {"name": "Sadman Shaharier Mahim", "role": "Product & systems lead · Hab Core"},
    {"name": "Saba Atharique", "role": "Frontend · design"}, {"name": "Mishkat Ahmed Khan", "role": "Compute · data"},
    {"name": "Anjim Hossain", "role": "Compute · integration"}, {"name": "Ridita Alam", "role": "Design · frontend"}],
  "handoff": {"gaps": H.GAPS, "deviations": H.DEVIATIONS, "unresolved": H.UNRESOLVED, "components": H.COMPONENTS, "interactions": H.INTERACTIONS, "a11y": H.A11Y, "fixture_map": H.FIXTURE_MAP, "usability": H.USABILITY, "patch_f": H.PATCH_F, "patch_fr32": H.PATCH_FR32},
  "provenance_classes": [
    {"k": "measured", "label": "MEASURED", "meaning": "Instrument value from a NASA/partner archive", "ex": "RAD background dose rate"},
    {"k": "derived", "label": "DERIVED", "meaning": "Deterministically computed from measured data", "ex": "Slope from the DEM; comm coverage"},
    {"k": "modelled", "label": "MODELLED", "meaning": "Output of a published model with our parameters", "ex": "Tobler walking speed; Mars24 sun elevation"},
    {"k": "assumed", "label": "ASSUMED", "meaning": "A parameter we chose", "ex": "15° hard slope limit; rover speed"},
    {"k": "replayed", "label": "REPLAYED", "meaning": "Real measured history played back on the mission clock", "ex": "The 20 May 2024 solar particle event"},
    {"k": "simulated", "label": "SIMULATED", "meaning": "Generated by our simulation engine; not a measurement", "ex": "Crew position, O₂, rover battery"}],
}

if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "fixture.json"
    s = json.dumps(F, ensure_ascii=False, indent=1)
    open(out, "w", encoding="utf-8").write(s)
    # self-check: every dict that looks like a number carries src
    bad = []
    def walk(o, path=""):
        if isinstance(o, dict):
            if "v" in o and "unit" in o:
                if "src" not in o or "prov" not in o: bad.append(path)
            for k, v in o.items(): walk(v, path + "/" + k)
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, path + f"[{i}]")
    walk(F)
    ph_count = sum(1 for v in nums.values() if v["src"] == "PLACEHOLDER")
    print("fixture ok; nums:", len(nums), "placeholders in nums:", ph_count, "bad:", bad)
