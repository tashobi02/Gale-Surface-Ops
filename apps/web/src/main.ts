/**
 * App entry point (docs/specs/03 §A). Hash routes:
 *   #/  SCR-01 · #/join SCR-10 · #/planner SCR-02 (#/map redirects) · #/briefing SCR-08 ·
 *   #/ops SCR-11 · #/eva/EV1|EV2 SCR-12 · #/hud/EV1|EV2 SCR-13 · #/earth SCR-16 · #/report SCR-17 ·
 *   #/sources SCR-09 · #/replay (GitHub Pages, recorded log, no Hab Core).
 * Each route sets <html data-mode="brief|ops|hud|print"> (04 §B.2) before rendering.
 * Router and boot: TASK-07 (planner), TASK-25 (roles).
 */
import "./ui/styles/tokens.css";
