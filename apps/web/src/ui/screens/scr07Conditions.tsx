/** SCR-07 renders worker conditions; no solar/radiation calculations in the UI (FR-11–FR-13, FD-126–FD-130). */
import { useCallback, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import type { Provenance } from "@marswalk/protocol";
import type { ScreenProps } from "../context";
import { StatusIcon } from "../components/statusIcon";
import { Metric } from "../components/metric";
import { isUsableValue, provAttrs } from "../components/provenance";
import { WarningsList, formatUtc } from "../results/warningsList";
import { LTST_SOURCE } from "../plan/stopsList";
import "./scr07Conditions.css";

const MARS24 = LTST_SOURCE;
function Value({ value, prov = "modelled", src, path }: { value: string | number | undefined | null; prov?: Provenance; src: string; path: string }): ReactElement {
  const present = isUsableValue(value);
  return <span {...provAttrs({ prov, src: present ? src : `unavailable:${path}`, unavailable: !present })}>{present ? value : "—"}</span>;
}
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }): ReactElement {
  return <div className="scr07-field" data-condition={id}><dt>{label}</dt><dd>{children}</dd></div>;
}

export function Conditions({ ctx }: ScreenProps): ReactElement {
  const subscribe = useCallback((notify: () => void) => ctx.planStore.subscribe(notify), [ctx.planStore]);
  const state = useSyncExternalStore(subscribe, ctx.planStore.get, ctx.planStore.get);
  const result = state.status === "Error" ? null : state.result;
  const c = result?.conditions, radiation = result?.radiation;
  const timeline = result?.stops_timeline ?? [];
  const first = timeline[0], last = timeline[timeline.length - 1];
  const constant = ctx.site.site.env_constants.find(entry => entry.const_id === radiation?.const_id);
  const doseSource = constant?.source_id;
  const darkness = result?.warnings.filter(w => w.code === "DARKNESS") ?? [];
  const text = (value: string | number | undefined, path: string) => <Value value={value} src={MARS24} path={path} />;
  const sunTime = (kind: "sunrise" | "sunset") => {
    const ltst = c?.[`${kind}_ltst`];
    const utc = c?.[`${kind}_utc`];
    const formattedUtc = utc ? formatUtc(utc) : "—";
    const hasLtst = isUsableValue(ltst);
    const hasUtc = formattedUtc !== "—";
    return <>{text(hasLtst ? `${ltst} LTST` : undefined, `result.conditions.${kind}_ltst`)}{hasLtst && hasUtc ? " · " : " "}<span data-condition-utc={hasUtc ? utc : undefined}>{text(formattedUtc, `result.conditions.${kind}_utc`)}</span></>;
  };
  return <section className="scr07-conditions" data-conditions aria-label="Conditions" aria-busy={state.status === "Computing"} data-computing={state.status === "Computing"}>
    <h2>Conditions</h2>
    {state.status === "Computing" ? <p role="status">Computing conditions… Previous values are shown.</p> : state.status === "Error" ? <p role="status"><StatusIcon status="unknown" word="Conditions unavailable" /> Plan computation failed (<Value value={state.last_error_code} prov="derived" src="plan.last_error_code" path="plan.last_error_code" />). Retry the plan to refresh conditions.</p> : null}
    {darkness.length ? <section role="alert" aria-label="Daylight warning"><h3>Daylight warning</h3><WarningsList warnings={darkness} site={ctx.site} /></section> : null}
    <h3>Mars date and sun</h3>
    <dl>
      <Field id="mars-year" label="Mars Year">{text(c?.mars_year, "result.conditions.mars_year")}</Field>
      <Field id="ls" label="L_s"><Metric value={c?.ls_deg ?? null} unit="°" prov="modelled" src={Number.isFinite(c?.ls_deg) ? MARS24 : "result.conditions.ls_deg"} /></Field>
      {c?.sol !== undefined ? <Field id="sol" label="MSL sol"><Value value={c.sol} prov="derived" src={MARS24} path="result.conditions.sol" /></Field> : null}
      <Field id="ltst-start" label="LTST at start">{text(first?.arrive_ltst, "result.stops_timeline[0].arrive_ltst")}</Field>
      <Field id="ltst-return" label="LTST at return">{text(last?.arrive_ltst, "result.stops_timeline.return.arrive_ltst")}</Field>
      <Field id="sunrise" label="Sunrise · flat horizon">{sunTime("sunrise")}</Field>
      <Field id="sunset" label="Sunset · flat horizon">{sunTime("sunset")}</Field>
    </dl>
    <h3>Sun elevation per stop</h3>
    {timeline.length ? <ul className="scr07-stop-sun">{timeline.map((entry, i) => {
      const waypointId = i === 0 ? result?.legs[0]?.from : result?.legs[i - 1]?.to;
      const waypoint = state.waypoints.find(w => w.id === waypointId);
      return <li key={i} data-sun-waypoint={waypointId}><Value value={waypoint?.label || waypoint?.id || waypointId} prov={waypoint ? "assumed" : "derived"} src={waypoint ? "plan.waypoints" : "result.legs"} path={`result.stops_timeline[${i}].waypoint`} /> <Metric value={entry.sun_elevation_deg} unit="°" prov="modelled" src={MARS24} /></li>;
    })}</ul> : <p {...provAttrs({ prov: "modelled", src: "unavailable:result.stops_timeline", unavailable: true })}>— Sun elevations not supplied</p>}
    <p className="scr07-note">Terrain shadowing, atmospheric refraction and dust opacity are not modelled.</p>
    <section data-condition="radiation" aria-label="Radiation estimate"><h3>Radiation estimate</h3>
      <p>measured background rate × planned duration (simplified)</p>
      <div className="scr07-dose"><Metric value={radiation?.dose_mSv ?? null} unit="mSv" prov="modelled" src={doseSource ?? (radiation ? radiation.const_id : "result.radiation.dose_mSv")} /></div>
      <p>Range: <Metric value={radiation?.dose_low_mSv ?? null} unit="mSv" prov="modelled" src={doseSource ?? "result.radiation.dose_low_mSv"} /> – <Metric value={radiation?.dose_high_mSv ?? null} unit="mSv" prov="modelled" src={doseSource ?? "result.radiation.dose_high_mSv"} /></p>
      <p>Solar phase: <Value value={radiation?.solar_phase} prov="assumed" src={radiation?.const_id ?? "result.radiation"} path="result.radiation.solar_phase" /></p>
      <p>Rate source: <Value value={doseSource ? ctx.site.sources.get(doseSource)?.title ?? doseSource : undefined} prov="measured" src={doseSource ?? "result.radiation.const_id"} path="result.radiation.source" /></p>
      <p>Background rate: <Metric value={constant?.value ?? null} unit={constant?.unit ?? "mSv/day"} prov={constant?.provenance ?? "measured"} src={constant?.source_id ?? "result.radiation.const_id"} /></p>
      <p className="scr07-note">Excluded: solar energetic particle events, suit/habitat shielding, terrain sky-blocking, altitude differences within AOI.</p>
    </section>
    <section data-condition="seasonal-weather"><h3>Seasonal weather</h3><p>Not included in this build</p></section>
  </section>;
}
