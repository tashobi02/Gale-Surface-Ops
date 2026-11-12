/**
 * SCR-01 — Mission Briefing (docs/specs/03 SCR-01; layout in docs/specs/04 §E.1; 01 §F.1, FR-01, FR-15).
 * Purpose: Set context in < 30 s: site, science objective, what the tool does, prototype disclaimer.
 * Implemented by T07.05; the demo-plan button is T07.14 (FD-041).
 *
 * BRIEF mode. The screen shows the site the bundle names, a context thumbnail (the coarsest tile of the manifest's
 * basemap layer, FD-109 and FD-245), the objective and "what this tool does" from `content/briefing.json` (no numbers
 * in the copy, FD-109), one data badge per manifest source (the badges are the manifest's own `sources`; each carries
 * its provenance class and source id, FD-143), and the 01 §F.1 disclaimer verbatim.
 *
 * The three actions: **Start planning** opens the planner route with the default scenario, **Open demo plan** loads
 * `demoPlan.json` into the plan store and opens the planner (FD-246, FD-247) and **Run demo** opens the join screen
 * (SCR-10). **Sources & methods** opens SCR-09. The screen owns no navigation: it calls `onNavigate` with a route hash.
 *
 * Every displayed value carries `data-provenance` and `data-source` (FR-15, NFR-05); a value the bundle does not have
 * renders "—". The copy and the site name are identifiers, not measurements, and carry `data-identifier`.
 */
import type { ReactElement } from "react";
import type { MissionScenario, Waypoint } from "@marswalk/protocol";
import type { LoadedSite } from "../context";
import type { PlanStore } from "../../state/planStore";
import { Metric } from "../components/metric";
import { UNAVAILABLE } from "../components/provenance";
import briefingCopy from "../content/briefing.json";
import demoPlan from "../demoPlan.json";
import "./scr01MissionBriefing.css";

/** The 01 §F.1 prototype boundary, verbatim (FR-52: it must appear in the app). */
export const DISCLAIMER =
  "Marswalk Surface Ops is an exploratory hackathon prototype. It is not astronaut operations software. Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.";

export interface MissionBriefingProps {
  /** The loaded site bundle (the manifest, its layers, sources, assets and POIs). */
  site: LoadedSite;
  /** The plan store the demo plan is loaded into (C11). */
  planStore: PlanStore;
  /** Navigate to a route hash, e.g. "#/planner" (03 §A). */
  onNavigate: (hash: string) => void;
}

/** The shape of `demoPlan.json` (the file carries its own notes; only these fields are read). */
interface DemoPlanFile {
  start: string;
  stops: string[];
  scenario: Omit<MissionScenario, "eva_start_utc">;
}

/** The demo plan as the file writes it. */
const DEMO = demoPlan as DemoPlanFile;

/**
 * The thumbnail URL: the coarsest tile of the manifest's basemap layer (the raster-tile layer with `optional: false`;
 * the real site names `ortho`). A manifest with no such layer (the F4 fixture has only optional layers) falls back to the
 * coarsest tile of the first raster-tile layer the manifest names; a manifest with no raster-tile layer at all has no
 * thumbnail (FD-245). The tile is always a file of the site bundle, never an invented or remote image (NFR-01).
 *
 * The tile grid is XYZ with the coarsest level at z = 0 (`resolutions_m[0]` is the coarsest, as `rasterLayers.ts` uses
 * it), so the coarsest tile is `0/0/0.<format>`.
 */
export function thumbnailUrl(site: LoadedSite): string | null {
  const raster = site.site.layers.filter((layer) => layer.kind === "raster_tiles");
  const basemap = raster.find((layer) => layer.optional === false) ?? raster[0];
  if (!basemap) return null;
  const asset = site.assets.get(basemap.asset_id);
  if (!asset) return null;
  const format = basemap.tile_grid?.format ?? "png";
  return `${asset.url}/0/0/0.${format}`;
}

/**
 * The demo plan's waypoints against the site bundle: the site's `default_start` and the demo stops the bundle can
 * resolve (the POI id is in the bundle). A stop the bundle does not have is left out and named in the notice; no
 * coordinate is invented (FD-246). The demo plan names no start time, so the store sends nothing and the planner opens
 * in its Empty state until the planner or the Hab Core supplies one (FD-042, FD-247).
 */
export function resolveDemoWaypoints(site: LoadedSite): { waypoints: Waypoint[]; missing: string[] } {
  const start = site.site.default_start;
  const waypoints: Waypoint[] = [
    { id: "wp-0", role: "start", x_m: start.x_m, y_m: start.y_m, label: start.label.slice(0, 40) },
  ];
  const missing: string[] = [];
  DEMO.stops.forEach((poiId, index) => {
    const poi = site.pois.get(poiId);
    if (!poi) {
      missing.push(poiId);
      return;
    }
    const [x, y] = poi.geometry.coordinates;
    waypoints.push({ id: `wp-${index + 1}`, role: "stop", x_m: x, y_m: y, label: poi.properties.name.slice(0, 40), poi_id: poiId });
  });
  return { waypoints, missing };
}

/** SCR-01 mission briefing (React, ADR-012). */
export function MissionBriefing({ site, planStore, onNavigate }: MissionBriefingProps): ReactElement {
  const thumbnail = thumbnailUrl(site);
  const demo = resolveDemoWaypoints(site);

  function openDemoPlan(): void {
    // The demo plan names no start time (FD-042): the start time the store already holds (from the Hab Core's scenario,
    // or the empty default) is kept, so nothing is invented and the planner opens in its Empty state when it is empty.
    const current = planStore.get().scenario;
    const scenario: MissionScenario = { ...DEMO.scenario, eva_start_utc: current.eva_start_utc };
    planStore.loadPlan(scenario, demo.waypoints);
    onNavigate("#/planner");
  }

  return (
    <main className="scr01" data-screen="SCR-01" data-surface="brief">
      <header className="scr01-bar">
        <span className="scr01-mark" aria-hidden="true">
          ⬢
        </span>
        <span className="scr01-wordmark">Marswalk</span>
        <nav className="scr01-nav" aria-label="Mission briefing">
          <a className="scr01-link" href="#/join" data-slot="join-as">
            Join as ▸
          </a>
          <a className="scr01-link" href="#/sources" data-slot="sources-link">
            Sources →
          </a>
        </nav>
      </header>

      <section className="scr01-hero">
        <div className="scr01-slab">
          {thumbnail ? (
            <img className="scr01-thumb" src={thumbnail} alt={`Site context, ${site.site.name}`} data-slot="thumbnail" />
          ) : (
            <p className="scr01-thumb scr01-thumb-empty" data-slot="thumbnail" data-unavailable="true">
              {UNAVAILABLE}
            </p>
          )}
        </div>

        <div className="scr01-intro">
          <p className="scr01-kicker" data-identifier>
            Exploration zone 01-A
          </p>
          <h1 className="scr01-headline display">
            Plan the walk.
            <br />
            Survive the storm.
          </h1>
          <p className="scr01-site">
            <span className="scr01-site-name" data-slot="site-name" data-identifier>
              {site.site.name}
            </span>
          </p>
          <p className="scr01-objective prose" data-slot="objective">
            {briefingCopy.objective}
          </p>
          <p className="scr01-what prose" data-slot="what-this-tool-does">
            {briefingCopy.what_this_tool_does}
          </p>
        </div>
      </section>

      <section className="scr01-badges" aria-label="Data sources">
        <p className="module-label">Data</p>
        <ul className="scr01-badge-list">
          {site.site.sources.map((source) => (
            <li key={source.source_id}>
              <span
                className="scr01-badge"
                data-slot="data-badge"
                data-provenance="measured"
                data-source={source.source_id}
                data-identifier={source.source_id}
              >
                {source.title}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="scr01-actions">
        <button type="button" className="scr01-button scr01-button-primary" data-slot="start-planning" data-action="start-planning" onClick={() => onNavigate("#/planner")}>
          Start planning ▸
        </button>
        <button type="button" className="scr01-button" data-slot="open-demo-plan" data-action="open-demo-plan" onClick={openDemoPlan}>
          Open demo plan
        </button>
        <button type="button" className="scr01-button" data-slot="run-demo" data-action="run-demo" onClick={() => onNavigate("#/join")}>
          Run demo
        </button>
        <button type="button" className="scr01-button" data-slot="open-sources" data-action="open-sources" onClick={() => onNavigate("#/sources")}>
          Sources &amp; methods
        </button>
      </div>

      {demo.missing.length > 0 && (
        <p className="scr01-notice" role="status" data-slot="demo-unresolved">
          <Metric value={demo.missing.length} label="demo stops not in this site bundle" prov="derived" src="demoPlan.stops" chip="glyph" />
          {demo.missing.length === 1 ? " was" : " were"} left out:{" "}
          {demo.missing.map((id) => (
            <span key={id} data-identifier>
              {id}
            </span>
          ))}
        </p>
      )}

      <footer className="scr01-disclaimer" data-slot="disclaimer">
        <p className="scr01-disclaimer-text">{DISCLAIMER}</p>
      </footer>
    </main>
  );
}
