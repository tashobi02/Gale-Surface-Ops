import { o2LitresPerMinute, WALKING_METABOLIC_W } from "@marswalk/compute";
/** SCR-08 printable PlanExport view (FR-14, FR-15, FR-50; T11.03/04/08). */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";
import type { ScreenProps } from "../context";
import { exportFileName, exportPlan, exportPlanJson } from "../../export/planExport";
import { captureBriefingMap, createBriefingFallback } from "../briefing/mapSnapshot";
import { publishPlan, type PublishOutcome } from "../briefing/publishPlan";
import { Metric } from "../components/metric";
import { provAttrs } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import { ProfileChart } from "../results/profileChart";
import "./scr08BriefingCard.css";

export function BriefingCard({ ctx }: ScreenProps): ReactElement {
  const state = useSyncExternalStore(ctx.planStore.subscribe, ctx.planStore.get, ctx.planStore.get);
  const plan = useMemo(() => state.result && ["OK", "OverLimits", "Partial"].includes(state.status)
    ? exportPlan(ctx.site.site, state) : null, [ctx.site, state.result, state.status, state.scenario, state.waypoints]);
  const target = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<{ plan: typeof plan; drawn?: boolean; error?: string } | null>(null);
  const [published, setPublished] = useState<{ plan: typeof plan; tasks: typeof state.stop_tasks; outcome: PublishOutcome } | null>(null);
  useEffect(() => {
    if (!plan || !target.current) return;
    let live = true;
    captureBriefingMap(target.current, ctx.site, ctx.planStore).then(
      () => live && setMap({ plan, drawn: true }),
      (error: unknown) => live && setMap({ plan, error: error instanceof Error ? error.message : String(error) }),
    );
    return () => { live = false; };
  }, [plan, ctx.site, ctx.planStore]);
  const back = () => { window.location.hash = "#/planner"; };
  if (!plan) return <main className="scr08-card" data-slot="briefing-card"><h1>Briefing card</h1><p role="status" data-slot="empty-banner">Add at least one stop</p><button data-action="back-to-map" onClick={back}>Back to map</button></main>;

  const { result, scenario } = plan;
  const partial = result.status === "PARTIAL";
  const over = result.status === "OVER_LIMITS";
  const status = partial ? "warning" : over ? "caution" : "nominal";
  const outcome = published?.plan === plan && published.tasks === state.stop_tasks ? published.outcome : null;
  const snapshot = map?.plan === plan ? map : null;
  // T11.06: the canvas capture failed, so the card shows the thumbnail with the route as SVG, and says so (FD-137, FD-442).
  const fallback = useMemo(() => snapshot?.error ? createBriefingFallback(ctx.site, state) : null, [snapshot?.error, ctx.site, state.waypoints, state.result]);
  const value = (v: string | number | null | undefined, path: string, prov: Provenance = "derived", unit?: string) => {
    const entry = plan.provenance_summary.find(e => e.value_path === path);
    return <Metric value={v ?? null} prov={entry?.provenance ?? prov} src={entry?.source_ids.join(" ") || `plan-export:${path}`} unit={unit} />;
  };
  const attrs = (path: string, prov: Provenance = "derived") => provAttrs({ prov, src: `plan-export:${path}` });
  const tasks = state.stop_tasks;
  const publish = async () => {
    setPublished({ plan, tasks, outcome: { status: "pending" } });
    const response = await publishPlan({ plan, stop_tasks: ctx.planStore.get().stop_tasks });
    setPublished({ plan, tasks, outcome: response });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportPlanJson(plan)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = exportFileName(ctx.site.site);
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const stops = plan.waypoints;
  return <main className="scr08-card" data-slot="briefing-card">
    <nav className="scr08-actions" aria-label="Briefing actions">
      <button onClick={() => window.print()} disabled={!snapshot?.drawn && !snapshot?.error}>Print</button>
      <button onClick={download}>Export plan JSON</button>
      <button data-action="publish" disabled={partial || outcome?.status === "pending"} onClick={() => { void publish(); }}>Publish to Hab Core</button>
      <button data-action="back-to-map" onClick={back}>Back to map</button>
    </nav>
    {outcome && <p className="scr08-publish" role="status" {...attrs("publish", "simulated")}>
      {outcome.status === "pending" ? "Publishing…" : outcome.status === "accepted" ? `Published · ${outcome.planHash}` : `Publish rejected: ${outcome.reason}`}
    </p>}
    <header className="scr08-header">
      <h1 className="scr08-title" {...attrs("scenario.eva_start_utc", "assumed")}>Plan for {ctx.site.site.name} — <span className="scr08-date">{scenario.eva_start_utc.slice(0, 10)}</span></h1>
      <div className="scr08-meta">
        <span>Site {value(ctx.site.site.name, "site.name")}</span>
        <span>Data {value(plan.data_version, "data_version")}</span>
        <span data-plan-hash>Hash {value(plan.plan_hash, "plan_hash")}</span>
        <span data-slot="generated-time">Generated {value(result.computed_utc, "result.computed_utc")}</span>
      </div>
    </header>
    <div className={`scr08-banner status-${status}`} data-slot="banner" data-status={status} {...attrs("result.status")}>
      <StatusIcon status={status} word={partial ? "Plan incomplete — not valid for use" : over ? "OVER LIMITS" : "OK"} />
      {over && <ul>{result.warnings.filter(w => w.severity === "blocked").map((warning, i) => <li key={i} {...attrs(`result.warnings.${i}`)}>{warning.message}</li>)}</ul>}
    </div>
    <div className="scr08-summary">
      <figure className="scr08-map">
        {fallback
          ? <FallbackMap element={fallback} />
          : <>
            {/* A canvas, not an `<img src="data:...">`: the CSP is `default-src 'self'` and refuses a data image source (FD-363). */}
            <canvas ref={target} className="scr08-map-canvas" width={860} height={470} role="img"
              aria-label="Whole planned route over the local Mars basemap, with numbered stops"
              {...attrs("result.legs.geometry")} />
            {!snapshot?.drawn && <p role="status" data-slot="map-pending">Preparing local map snapshot…</p>}
          </>}
        <figcaption>Route in projected metres · north up</figcaption>
        {snapshot?.error && <p role="status" data-slot="map-error" className="scr08-map-notice">
          <StatusIcon status="caution" word="MAP SNAPSHOT UNAVAILABLE" /> Map snapshot unavailable: {snapshot.error}. Showing the site thumbnail with the route drawn as SVG.
        </p>}
      </figure>
      <div className="scr08-metrics">
        {!partial && <div data-slot="totals">
          {([ ["Distance", "distance_m", "m"], ["Walk", "walk_time_min", "min"], ["EVA total", "eva_total_min", "min"], ["EVA margin", "eva_margin_min", "min"], ["Max slope", "max_slope_deg", "°"], ["Climb", "climb_m", "m"], ["Descent", "descent_m", "m"], ["Max walkback", "max_walkback_km", "km"] ] as const).map(([label, field, unit]) => <div key={field}>{label} {value(result.totals?.[field], `result.totals.${field}`, field.includes("time") || field === "eva_total_min" ? "modelled" : "derived", unit)}</div>)}
        </div>}
        {!partial && <div data-slot="radiation">Dose {value(result.radiation?.dose_mSv, "result.radiation.dose_mSv", "modelled", "mSv")}<br />Range {value(result.radiation?.dose_low_mSv, "result.radiation.dose_low_mSv", "modelled")}–{value(result.radiation?.dose_high_mSv, "result.radiation.dose_high_mSv", "modelled", "mSv")}</div>}
        {partial && <p>Totals omitted for an incomplete route.</p>}
      </div>
    </div>
    {/* The table scrolls sideways on a narrow screen, so the region is focusable: a scrollable region must be
        keyboard reachable (axe `scrollable-region-focusable`, FD-365). */}
    <section aria-label="Stops and tasks" className="scr08-stops" tabIndex={0}>
      <h2>Stops / timeline / tasks</h2>
      <table data-slot="stops-table"><thead><tr><th scope="col">Stop</th><th scope="col">Arrival UTC / LTST</th><th scope="col">Dwell</th><th scope="col">Sun</th><th scope="col">Notes / tasks</th></tr></thead>
        <tbody data-slot="stop-tasks">{stops.map((stop, i) => {
          const timeline = result.stops_timeline[i];
          const stopTasks = tasks.filter(t => t.stop_id === stop.id);
          const poi = stop.poi_id ? ctx.site.pois.get(stop.poi_id) : undefined;
          return <tr key={stop.id}>
            <th scope="row" {...attrs(`waypoints.${i}`, "assumed")}>{stop.role === "start" ? "Start" : i} · {stop.label || stop.id}</th>
            <td>{value(timeline?.arrive_utc, `result.stops_timeline.${i}.arrive_utc`, "modelled")}<br />{value(timeline?.arrive_ltst, `result.stops_timeline.${i}.arrive_ltst`, "modelled")}</td>
            <td>{value(stop.role === "stop" ? scenario.dwell_min_per_stop : null, "scenario.dwell_min_per_stop", "assumed", "min")}</td>
            <td>{value(timeline?.sun_elevation_deg, `result.stops_timeline.${i}.sun_elevation_deg`, "modelled", "°")}</td>
            <td><span {...attrs(`waypoints.${i}.poi_id`, "assumed")}>{poi?.properties.name ?? "—"} · {stopTasks.length} {stopTasks.length === 1 ? "task" : "tasks"}</span>
              {stopTasks.map(task => <div className="scr08-task" key={task.task_id} {...provAttrs({ prov: "assumed", src: `plan-store:stop_tasks.${task.task_id}` })}>{task.kind} · {task.text} · {task.crew_id ?? "Shared"}</div>)}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <section className="scr08-profile" aria-label="Elevation profile"><h2>Elevation profile</h2><ProfileChart result={result} print /><p className="scr08-profile-legend">Slope: ○ OK / ▧ caution / ▩ over limit{partial ? " · Gaps mark NO ROUTE; distances sum routed legs only." : ""}</p></section>
    <div className="scr08-details">
      <section aria-label="Warnings"><h2>Warnings</h2>{result.warnings.length ? <ul>{result.warnings.map((w, i) => <li key={i} {...attrs(`result.warnings.${i}`)}><StatusIcon status={w.severity === "blocked" ? "warning" : w.severity} /> {w.message}</li>)}</ul> : <p>No warnings supplied.</p>}</section>
      <section aria-label="Conditions and assumptions"><h2>Conditions / assumptions</h2>
        <p>Sunrise {value(result.conditions?.sunrise_ltst, "result.conditions", "modelled")} · Sunset {value(result.conditions?.sunset_ltst, "result.conditions", "modelled")} LTST</p>
        <p>Mars year {value(result.conditions?.mars_year, "result.conditions", "modelled")} · Ls {value(result.conditions?.ls_deg, "result.conditions", "modelled", "°")}</p>
        <p>EVA limit {value(scenario.max_eva_duration_h, "scenario.max_eva_duration_h", "assumed", "h")} · Walkback {value(scenario.walkback_limit_km, "scenario.walkback_limit_km", "assumed", "km")}</p>
        <p>Slope hard / caution {value(scenario.hard_slope_limit_deg, "scenario.hard_slope_limit_deg", "assumed", "°")} / {value(scenario.caution_slope_deg, "scenario.caution_slope_deg", "assumed", "°")}</p>
        <p>Haven limit {value(scenario.max_haven_min, "scenario.max_haven_min", "assumed", "min")} · Crew {value(scenario.crew_count, "scenario.crew_count", "assumed")}</p>
        <p>Vehicle {value(scenario.vehicle_available === undefined ? null : scenario.vehicle_available ? "available" : "none", "scenario.vehicle_available", "assumed")} · ParamSet {value(scenario.vehicle_param_set, "scenario.vehicle_param_set", "assumed")}</p>
        <p>Dwell per stop {value(scenario.dwell_min_per_stop, "scenario.dwell_min_per_stop", "assumed", "min")} · Loop {value(scenario.loop ? "yes" : "no", "scenario.loop", "assumed")}</p>
        <p>Speed {value(scenario.suited_flat_speed_kmh, "scenario.suited_flat_speed_kmh", "assumed", "km/h")} · Solar phase {value(scenario.solar_phase, "scenario.solar_phase", "assumed")}</p>
        <p>O₂ rate (illustrative) <Metric value={o2LitresPerMinute(WALKING_METABOLIC_W)} prov="modelled" src="compute.o2LitresPerMinute" unit="L/min" /></p>
      </section>
    </div>
    <footer className="scr08-footer">
      <p>Radiation excludes solar energetic particle events, suit/habitat shielding, terrain sky-blocking and altitude differences within the AOI. Flat-horizon sunlight; illustrative operating assumptions.</p>
      <p>Sources: {ctx.site.site.sources.map((source, i) => <span key={source.source_id} {...provAttrs({ prov: "derived", src: source.source_id })}>{i > 0 ? "; " : ""}<a href={`#/sources#source-${source.source_id}`} title={source.credit || source.title}>{source.source_id}</a></span>)}. <a href="#/sources">Sources &amp; methods</a></p>
      <p data-slot="disclaimer">{plan.disclaimer}</p>
    </footer>
  </main>;
}

function FallbackMap({ element }: { element: HTMLElement }): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { host.current?.replaceChildren(element); return () => element.remove(); }, [element]);
  return <div ref={host} />;
}
