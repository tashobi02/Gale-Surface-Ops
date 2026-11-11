/**
 * App entry point (docs/specs/03 §A). Hash routes (ui/router.ts is the one table):
 *   #/  SCR-01 · #/join SCR-10 · #/planner SCR-02 (#/map redirects) · #/briefing SCR-08 · #/ops SCR-11 ·
 *   #/eva/EV1|EV2 SCR-12 · #/hud/EV1|EV2 SCR-13 · #/earth SCR-16 · #/report SCR-17 · #/sources SCR-09 ·
 *   #/presenter SCR-19 · #/setup SCR-20 · #/replay (GitHub Pages, recorded log, no Hab Core).
 * Each route sets <html data-mode="brief|ops|hud|print"> (04 §B.2) before rendering. Boot and mounting: boot/app.ts.
 */
import "./ui/styles/tokens.css";
import { startApp } from "./boot/app";

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element");
startApp({ root }).catch((err: unknown) => {
  // Last resort: never a blank page (03 SCR-00). Plain text, no markup built from the error.
  root.textContent = `The app could not start: ${err instanceof Error ? err.message : "unknown error"}`;
});
