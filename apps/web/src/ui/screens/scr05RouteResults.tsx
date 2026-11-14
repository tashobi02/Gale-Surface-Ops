import { o2LitresPerMinute, WALKING_METABOLIC_W } from "@marswalk/compute";
/**
 * SCR-05 — Route Results panel (docs/specs/03 §B; layout in docs/specs/04 §F; mode OPS, 04 §B.2).
 * Purpose: show whether the plan works and why: status banner, seven headline metrics, the elevation profile and the
 * warnings list; collapsible to the 48 px status strip (04 §B), with a per-leg Details table (04 §D).
 * Requirements: FR-07–FR-12, FR-15, NFR-05. Implemented by T09.03 (Saba Atharique, #179; reworked in the review).
 *
 * Every value carries `data-provenance` and `data-source` through `provAttrs` (04 §A.3 #8). Source ids are the 05 §F.3
 * `provenance_summary` ones: walk time `modelled` from `tobler-1993` + `apollo17-planning`, dose `modelled` from
 * `hassler-2014-rad`, distance and slope `derived` from `usgs-gale-dem-1m-v3`. The limits are the scenario's own
 * inputs (`assumed`, 01 FR-05): a scenario without one shows "—", the panel has no default limit. Totals are hidden for
 * a PARTIAL plan (02 §E.2). The chart (T09.02), the warnings list (T09.04) and the profile link (T09.05) are mounted
 * each behind a boundary so one failing leaves the rest usable.
 *
 * FD-056/FD-057: seven metrics, status strip retained when collapsed.
 * The tiles are the shared `Metric` component (T12.01, FD-058) and its number formats (`format.ts`, FD-124): km two
 * decimals, min integer, ° one decimal, mSv two decimals.
 */
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Leg, NoRouteLeg, PlanResult, Provenance } from "@marswalk/protocol";
import type { PlanState, PlanStore } from "../../state/planStore";
import type { LoadedSite, MapHandle } from "../context";
import { StatusIcon, type ExtendedStatus } from "../components/statusIcon";
import { STATUS_PATTERN, svgPatternDefs } from "../components/patterns";
import { Metric } from "../components/metric";
import { formatNumber, metresToKilometres, type FormatUnit } from "../components/format";
import { UNAVAILABLE, isFiniteNumber, provAttrs, unavailableOf, type Sourced } from "../components/provenance";
import { legStretchExtent } from "../map/routeGeometry";
import { ProfileChart } from "../results/profileChart";
import { useProfileLayout } from "../results/profileLayout";
import { linkProfileToMap } from "../results/profileLink";
import { WarningsList } from "../results/warningsList";
import "./scr05RouteResults.css";

export interface RouteResultsProps {
  planStore: PlanStore;
  /** The shared map: the profile link and click-to-zoom of the warnings use it. Absent: neither is wired. */
  mapHandle?: MapHandle;
  className?: string;
  site?: LoadedSite;
}

/** 05 §F.3 provenance_summary and §F.1 slope layer. */
const SRC_DEM = "usgs-gale-dem-1m-v3";
const SRC_WALK_TIME = "tobler-1993 apollo17-planning";
const SRC_DOSE = "hassler-2014-rad";
/**
 * The planning haven time's sources (T09.09; 02 §D.8). The planning form is a walk-back over the DEM with
 * the suited step cost, plus the 02 §D.8 ingress assumption: `tobler-1993` and `apollo17-planning` carry the
 * suited walking model, `usgs-gale-dem-1m-v3` the terrain it walks over, and "02 §D.8" the ingress assumption
 * the plan quotes. `modelled (approximation)`, never `measured` (02 §D.8 labels the planning form).
 */
const SRC_HAVEN = "tobler-1993 apollo17-planning usgs-gale-dem-1m-v3 02 §D.8";

/** "WALKBACK_EXCEEDED" -> "Walkback exceeded". */
function words(code: string): string {
  const w = code.toLowerCase().replace(/_/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

interface Banner {
  status: ExtendedStatus;
  word: string;
  reason: string;
}

function isPartial(state: PlanState): boolean {
  return state.status === "Partial" || state.result?.status === "PARTIAL";
}
function isOverLimits(state: PlanState): boolean {
  return state.status === "OverLimits" || state.result?.status === "OVER_LIMITS";
}
function isEmpty(state: PlanState): boolean {
  return state.status === "Empty" || (state.status !== "Error" && state.status !== "Computing" && !state.result);
}

function bannerOf(state: PlanState): Banner {
  if (state.status === "Error") {
    return { status: "warning", word: "Computation failed", reason: state.last_error_code ? `Error ${state.last_error_code}` : "Worker error" };
  }
  if (state.status === "Computing") {
    return { status: "advisory", word: "Computing…", reason: "Evaluating terrain and route constraints" };
  }
  if (isEmpty(state)) return { status: "unknown", word: "No plan yet", reason: "Add at least one stop" };
  if (isPartial(state)) {
    const leg = state.result?.legs.find((l): l is NoRouteLeg => l.status === "NO_ROUTE");
    return {
      status: "warning",
      word: "Partial",
      reason: leg ? `No route ${leg.from} → ${leg.to}: ${leg.reason}` : "Some legs could not be routed",
    };
  }
  if (isOverLimits(state)) {
    const exceeded = (state.result?.warnings ?? []).filter((w) => w.code.endsWith("_EXCEEDED")).map((w) => words(w.code));
    return { status: "warning", word: "Over limits", reason: exceeded.length > 0 ? [...new Set(exceeded)].join(", ") : "See the warnings" };
  }
  return { status: "nominal", word: "OK", reason: "All legs routed, within limits" };
}

/** The live-region text; the warning count is a shown value, so it carries its own label (FR-15) and the words around it do not. */
function announcementOf(state: PlanState, banner: Banner): ReactNode {
  if (state.status === "Error") return `Plan computation failed: ${state.last_error_code ?? "error"}`;
  if (state.status === "Computing") return "Plan computing…";
  if (isEmpty(state)) return "Plan empty: add at least one stop";
  if (isPartial(state)) return "Plan updated: Partial route, unroutable legs";
  const count = state.result?.warnings.length ?? 0;
  return (
    <>
      {`Plan updated: ${banner.word}, `}
      <span {...provAttrs({ prov: "derived", src: "result.warnings" })}>{count}</span>
      {count === 1 ? " warning" : " warnings"}
    </>
  );
}

// ---------------------------------------------------------------------------
// Metric tiles
// ---------------------------------------------------------------------------

/** A shown value: its text, and who says so. A missing value is the dash with an `unavailable:` source (04 §D.1). */
interface Shown extends Sourced {
  text: string;
}

function shown(text: string, prov: Provenance, src: string): Shown {
  return { text, prov, src };
}
function missing(prov: Provenance, path: string): Shown {
  return { text: UNAVAILABLE, ...unavailableOf(prov, path) };
}
/** `value` formatted when it is a finite number, else the dash. */
function numeric(v: unknown, format: (n: number) => string, prov: Provenance, src: string, path: string): Shown {
  return isFiniteNumber(v) ? shown(format(v), prov, src) : missing(prov, path);
}

/** One value of a tile: a number in the unit it is formatted by, and who says so (`path` names it when it is missing). */
interface TilePart {
  value: number | null;
  prov: Provenance;
  src: string;
}

interface MetricTileProps {
  label: string;
  /** One value, or a value and its limit. */
  parts: TilePart[];
  unit: FormatUnit;
  hint?: string;
}

function MetricTile({ label, parts, unit, hint }: MetricTileProps): ReactElement {
  // The plan-derived value is the first part; a limit that follows is the scenario's own input and stays shown.
  const first = parts[0];
  return (
    <div className="scr05-metric" title={first && first.value === null ? hint : undefined}>
      <div className="scr05-metric-label">{label}</div>
      <div className="scr05-metric-line">
        {parts.map((p, i) => (
          <span key={i} className="scr05-metric-part">
            {i > 0 ? <span className="scr05-metric-sep"> / </span> : null}
            <Metric value={p.value} unit={unit} prov={p.prov} src={p.src} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** A tile part: the value when it is a finite number, else missing with the `unavailable:<path>` source. */
function part(value: number | null | undefined, prov: Provenance, src: string, path: string): TilePart {
  return isFiniteNumber(value) ? { value, prov, src } : { value: null, prov, src: path };
}

function metricsOf(state: PlanState, hide: boolean): MetricTileProps[] {
  const t = hide ? null : (state.result?.totals ?? null);
  const radiation = hide ? undefined : state.result?.radiation;
  const sc = state.scenario;
  const hint = "Needs a plan";
  const evaLimitMin = isFiniteNumber(sc?.max_eva_duration_h) ? sc.max_eva_duration_h * 60 : undefined;
  return [
    { label: "Distance", unit: "km", hint, parts: [part(metresToKilometres(t?.distance_m), "derived", SRC_DEM, "result.totals.distance_m")] },
    { label: "Walk time", unit: "min", hint, parts: [part(t?.walk_time_min, "modelled", SRC_WALK_TIME, "result.totals.walk_time_min")] },
    {
      label: "EVA total",
      unit: "min",
      hint,
      parts: [
        part(t?.eva_total_min, "modelled", SRC_WALK_TIME, "result.totals.eva_total_min"),
        part(evaLimitMin, "assumed", "scenario.max_eva_duration_h", "scenario.max_eva_duration_h"),
      ],
    },
    { label: "Max slope", unit: "°", hint, parts: [part(t?.max_slope_deg, "derived", SRC_DEM, "result.totals.max_slope_deg")] },
    {
      label: "Max walkback",
      unit: "km",
      hint,
      parts: [
        part(t?.max_walkback_km, "derived", SRC_DEM, "result.totals.max_walkback_km"),
        part(sc?.walkback_limit_km, "assumed", "scenario.walkback_limit_km", "scenario.walkback_limit_km"),
      ],
    },
    { label: "Climb / descent", unit: "m", hint, parts: [part(t?.climb_m, "derived", SRC_DEM, "result.totals.climb_m"), part(t?.descent_m, "derived", SRC_DEM, "result.totals.descent_m")] },
    { label: "Dose", unit: "mSv", hint, parts: [part(radiation?.dose_mSv, "modelled", SRC_DOSE, "result.radiation.dose_mSv")] },
  ];
}

// ---------------------------------------------------------------------------
// Boundary: one failing child must not take the panel down
// ---------------------------------------------------------------------------

interface IsolatedProps {
  label: string;
  /** The boundary clears its error when this changes (a new result may render). */
  resetKey: unknown;
  children: ReactNode;
}
interface IsolatedState {
  error: string | null;
  resetKey: unknown;
}

class Isolated extends Component<IsolatedProps, IsolatedState> {
  state: IsolatedState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<IsolatedState> {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  static getDerivedStateFromProps(props: IsolatedProps, state: IsolatedState): Partial<IsolatedState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="scr05-unavailable" role="status">
        {this.props.label} unavailable: {this.state.error}
      </div>
    );
  }
}

/** Keys from a leg's endpoints; a repeated pair gets a counter so the keys stay unique and stable. */
function legKeys(legs: readonly Leg[]): string[] {
  const seen = new Map<string, number>();
  return legs.map((l) => {
    const base = `${l.from}>${l.to}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

function Cell({ p }: { p: Shown }): ReactElement {
  return (
    <td>
      <span {...provAttrs(p)}>{p.text}</span>
    </td>
  );
}

function LegTable({ result }: { result: PlanResult }): ReactElement {
  const keys = useMemo(() => legKeys(result.legs), [result.legs]);
  return (
    <div className="scr05-details-table-wrap" role="group" aria-label="Leg details" tabIndex={0}>
      <table className="scr05-details-table">
        <thead>
          <tr>
            <th scope="col">Leg</th>
            <th scope="col">From → To</th>
            <th scope="col">Status</th>
            <th scope="col">Distance (km)</th>
            <th scope="col">Walk time (min)</th>
            <th scope="col">Max slope (°)</th>
            <th scope="col">Climb / descent (m)</th>
          </tr>
        </thead>
        <tbody>
          {result.legs.map((leg, i) => {
            const path = `result.legs[${i}]`;
            const okLeg = leg.status === "OK" ? leg : null;
            return (
              <tr key={keys[i]}>
                <td {...provAttrs({ prov: "derived", src: path })}>{i + 1}</td>
                <td {...provAttrs({ prov: "derived", src: path })}>
                  {leg.from} → {leg.to}
                </td>
                <td>
                  {okLeg ? <StatusIcon status="nominal" word="OK" /> : <StatusIcon status="warning" word="NO ROUTE" />}
                </td>
                <Cell p={numeric(okLeg?.distance_m, (n) => formatNumber(metresToKilometres(n), "km"), "derived", SRC_DEM, `${path}.distance_m`)} />
                <Cell p={numeric(okLeg?.walk_time_min, (n) => formatNumber(n, "min"), "modelled", SRC_WALK_TIME, `${path}.walk_time_min`)} />
                <Cell p={numeric(okLeg?.max_slope_deg, (n) => formatNumber(n, "°"), "derived", SRC_DEM, `${path}.max_slope_deg`)} />
                <Cell
                  p={
                    okLeg && isFiniteNumber(okLeg.climb_m) && isFiniteNumber(okLeg.descent_m)
                      ? shown(`+${formatNumber(okLeg.climb_m, "m")} / −${formatNumber(okLeg.descent_m, "m")}`, "derived", SRC_DEM)
                      : missing("derived", `${path}.climb_m`)
                  }
                />
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="scr05-consumables-note micro">
        <span>O₂ rate (illustrative): </span>
        <Metric value={o2LitresPerMinute(WALKING_METABOLIC_W)} prov="modelled" src="compute.o2LitresPerMinute" unit="L/min" />
      </div>
    </div>
  );
}

/** Worker samples and warning statuses only; no UI haven threshold (FR-39, FR-42, FD-247). */
function ProfileBands({ result }: { result: PlanResult }): ReactElement {
  const patternId = `band-${useId().replace(/:/g, "")}`;
  const layout = useProfileLayout(result.legs);
  return <div className="profile-bands" ref={layout.ref}>{(["haven", "comm"] as const).map(kind => {
    const prov = "modelled";
    const label = kind === "haven" ? "Haven · modelled (approximation)" : "Comm · line of sight only";
    const src = kind === "haven" ? SRC_HAVEN : SRC_DEM;
    const segments = layout.entries.flatMap(({ leg, index: legIndex, start, gap }) => {
      if (leg.status !== "OK") return [];
      const values = kind === "haven" ? leg.profile.haven_min : leg.profile.comm;
      return leg.profile.dist_m.slice(0, -1).flatMap((distance, i) => {
        const end = leg.profile.dist_m[i + 1]!;
        if (!isFiniteNumber(distance) || !isFiniteNumber(end) || end < distance) return [];
        const value = values?.[i];
        const valid = isFiniteNumber(value) && (kind === "haven" ? value >= 0 : value === 0 || value === 1);
        const flag = result?.warnings.find(w => w.code === "HAVEN_TIME_EXCEEDED" && w.leg === legIndex && isFiniteNumber(w.from_m) && isFiniteNumber(w.to_m) && w.from_m < end && w.to_m > distance);
        const status: "neutral" | "nominal" | keyof typeof STATUS_PATTERN = !valid ? "unknown" : kind === "comm" ? value === 0 ? "caution" : "nominal" : flag ? flag.severity === "blocked" ? "warning" : flag.severity : "neutral";
        const word = !valid ? "? — Not supplied" : kind === "comm" ? value === 0 ? "▲ NO SIGNAL" : "○ SIGNAL" : `${status === "caution" ? "▲" : status === "warning" ? "⬣" : "○"} ${formatNumber(value, "min")} min · ${flag ? "over haven rule (worker warning)" : "not classified"}`;
        const path = `result.legs[${legIndex}].profile.${kind === "haven" ? "haven_min" : "comm"}`;
        // A supplied value carries its provenance class, its real source ids and the path it came from; a
        // missing one is "—" with an `unavailable:<path>` source (04 §D.1).
        const sourced = valid ? { prov, src: `${src} ${path}` } as const : unavailableOf(prov, `result.legs[${legIndex}].profile.${kind}`);
        return [{ key: `${legIndex}:${i}`, legIndex, distance, end, status, word, sourced, x: layout.x(start + distance, gap), width: Math.max(0, layout.x(start + end, gap) - layout.x(start + distance, gap)) }];
      });
    });
    return <div key={kind} className="profile-band" data-band={kind}>
      <div className="profile-band-track"><span className="profile-band-label">{label}</span>
        {segments.length ? <svg viewBox={`0 0 ${layout.width} 24`} role="img" aria-label={label} preserveAspectRatio="xMinYMid meet">
          <g dangerouslySetInnerHTML={{ __html: svgPatternDefs("var(--surface-0)").replaceAll("pattern-", `${patternId}-${kind}-`) }} />
          {segments.map(segment => <g key={segment.key}>
            <rect data-band-status={segment.status} x={segment.x} y={6} width={segment.width} height={12} fill={segment.status === "neutral" ? "var(--fg-2)" : `var(--${segment.status})`} stroke="var(--surface-0)" strokeDasharray={segment.status === "unknown" ? "2 2" : undefined} {...provAttrs(segment.sourced)}>
              <title {...provAttrs(segment.sourced)}>{segment.word}</title>
            </rect>
            {segment.status !== "neutral" && segment.status !== "nominal" ? <rect x={segment.x} y={6} width={segment.width} height={12} fill={`url(#${patternId}-${kind}-${STATUS_PATTERN[segment.status]})`} aria-hidden="true" pointerEvents="none" /> : null}
          </g>)}
        </svg> : <span {...provAttrs(unavailableOf(prov, `result.legs.profile.${kind}`))}>— {kind === "haven" ? "Haven samples" : "Comm samples"} not supplied by worker</span>}
      </div>
      {segments.length ? <ul className="profile-band-summary" data-band-summary tabIndex={0} aria-label={`${label} segment values`}>{segments.map(segment => <li key={segment.key} {...provAttrs(segment.sourced)}>Leg {segment.legIndex + 1} · {formatNumber(segment.distance, "m")}–{formatNumber(segment.end, "m")} m · {segment.word}</li>)}</ul> : null}
    </div>;
  })}<div className="profile-caption">○ SIGNAL / ▲ NO SIGNAL · Haven status from worker warnings; unflagged samples are neutral</div></div>;
}

/** SCR-05 Route Results (React, ADR-012). */
export function RouteResults({ planStore, mapHandle, className = "", site }: RouteResultsProps): ReactElement {
  const subscribe = useCallback((onChange: () => void) => planStore.subscribe(() => onChange()), [planStore]);
  const read = useCallback(() => planStore.get(), [planStore]);
  const state = useSyncExternalStore(subscribe, read, read);
  const [collapsed, setCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const { result } = state;
  const banner = bannerOf(state);
  const computing = state.status === "Computing";
  const empty = isEmpty(state);
  const hideTotals = empty || isPartial(state) || !result?.totals;
  const hasResult = result !== null && !empty;

  // Profile <-> map linking (FR-08): wiring, so it runs from an effect and returns its own cleanup. A failure is
  // shown in the panel, not swallowed.
  useEffect(() => {
    const element = profileRef.current;
    if (!mapHandle || !element || !hasResult) {
      setLinkError(null);
      return undefined;
    }
    try {
      const unlink = linkProfileToMap(mapHandle, element, planStore);
      setLinkError(null);
      return unlink;
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }, [mapHandle, hasResult, collapsed, result, planStore]);

  const getLegExtent = useCallback(
    (leg: number, from_m: number, to_m: number) => (result ? legStretchExtent(result.legs, leg, from_m, to_m) : null),
    [result],
  );

  const metrics = metricsOf(state, hideTotals);
  const warnings = result?.warnings ?? [];

  return (
    <section
      className={`scr05-results-panel ${className}`.trim()}
      data-collapsed={collapsed}
      data-computing={computing}
      aria-label="Route results"
    >
      <div className="scr05-sr-only" aria-live="polite" aria-atomic="true">
        {announcementOf(state, banner)}
      </div>

      <div className="scr05-status-strip" data-results-banner {...provAttrs({ prov: "derived", src: "result.status" })}>
        <div className="scr05-banner-status">
          <StatusIcon status={banner.status} word={banner.word} />
          <span className="scr05-banner-reason">{banner.reason}</span>
          {state.status === "Error" ? (
            <button type="button" className="scr05-retry-btn" onClick={() => planStore.retry()}>
              Retry
            </button>
          ) : null}
        </div>
        <div className="scr05-strip-actions">
          {!collapsed && hasResult ? (
            <button
              type="button"
              className="scr05-details-toggle"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              {showDetails ? "Hide details" : "Details"}
            </button>
          ) : null}
          <button
            type="button"
            className="scr05-collapse-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand results panel" : "Collapse results panel"}
          >
            {collapsed ? "▲ Expand" : "▼ Collapse"}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="scr05-body">
          <div className="scr05-middle-col" role="group" aria-label="Route profile and bands" tabIndex={0}>
            <div className="scr05-metrics-row" role="group" aria-label="Route metrics" tabIndex={0} data-totals-hidden={hideTotals} style={{ opacity: computing ? 0.5 : 1 }}>
              {metrics.map((m) => (
                <MetricTile key={m.label} {...m} />
              ))}
            </div>

            <div className="scr05-profile-container" ref={profileRef}>
              {hasResult && result ? (
                <Isolated label="Profile" resetKey={result}>
                  <ProfileChart result={result} hover={state.hover} />
                </Isolated>
              ) : (
                <div className="scr05-placeholder">{empty ? "Profile appears after stops are added" : "Profile loading…"}</div>
              )}
              {linkError ? (
                <div className="scr05-link-note" role="status">
                  Profile ↔ map link unavailable: {linkError}
                </div>
              ) : null}
            </div>
            {hasResult && result ? <Isolated label="Profile bands" resetKey={result}><ProfileBands result={result} /></Isolated> : null}
          </div>

          <div className="scr05-right-col" role="region" aria-label="Route warnings" tabIndex={0}>
            <div className="scr05-warnings-header">Warnings</div>
            <Isolated label="Warnings" resetKey={warnings}>
              <WarningsList warnings={warnings} mapHandle={mapHandle} getLegExtent={getLegExtent} site={site} />
            </Isolated>
          </div>
        </div>
      )}

      {!collapsed && showDetails && hasResult && result ? <LegTable result={result} /> : null}
    </section>
  );
}
