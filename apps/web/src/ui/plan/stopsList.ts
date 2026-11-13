/**
 * Stops list of the SCR-04 plan panel (T08.05; 03 SCR-04; 04 §D "Stops list", §C.5, §E; 01 FR-06, FR-09, FR-15).
 *
 * One row per waypoint on the plan store: the start first (read-only), then the stops numbered from 1: name (the POI's name, or
 * "Free stop"), coordinates in the 02 §C.1 display format (planetocentric latitude, east-positive longitude, derived from the
 * working-projection metres by inverting the manifest `+proj=eqc` string, never an Earth projection), and the arrival LTST and sun
 * elevation of the latest result. Per row: select, ↑/↓ (immediate recompute), delete, and a drag handle with stable `data-`
 * attributes for the drag module (`ui/map/waypointDrag.ts` attaches by event delegation to `[data-stops-list]`; no drag logic here).
 * "Undo" restores the previous list (C11).
 *
 * Provenance (FR-15, NFR-05; FD-114): a placed coordinate is `assumed`, source `user:waypoint.<id>`; the start, while it is where the
 * manifest put it, is `derived` from `manifest:default_start`. Arrival LTST and sun elevation are `modelled` (Mars24,
 * `mars24-allison-mcewen-2000`) and only ever read from the latest PLAN_RESULT: before one arrives, or after an error, they read
 * "—" (04 §D.1). While a result is computing the previous values stay, dimmed, with `aria-busy` (04 §D; no animation).
 * A stop whose incoming leg has no route is marked with the blocked shape, its word and the reason (04 §D). A selected row says
 * so with `aria-pressed` and a thick edge, not colour (04 §C.5); the row under the pointer or focus sets C11 `hover`.
 *
 * A `.ts` file with `createElement` on purpose (no JSX), like `components/metric.ts`; styles are in `screens/scr04PlanPanel.css`.
 */
import { createElement as h, useCallback, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import type { NoRouteLeg, POIFeature, PlanResult, Waypoint } from "@marswalk/protocol";
import { MAX_STOPS } from "@marswalk/compute";
import type { PlanState, PlanStore } from "../../state/planStore";
import type { LoadedSite } from "../context";
import { formatNumber } from "../components/format";
import { PROVENANCE_GLYPHS, UNAVAILABLE, provAttrs, unavailableOf, type Sourced } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import { ensureMarsProjection, formatLatLonE, projectedToLatLonE } from "../map/projection";

export interface StopsListProps {
  planStore: PlanStore;
  /** The loaded site: POI names, the manifest start and the projection (02 §C.1). */
  site: LoadedSite;
  /** SCR-04 supplies its task editor; the list's existing row and linking contract stays intact. */
  renderStopTasks?: (stopId: string) => ReactNode;
}

/** Source of every LTST and sun elevation (02 §D.3): the Mars24 algorithm. */
export const LTST_SOURCE = "mars24-allison-mcewen-2000";

/** Source of the 02 §E.3 limits shown as numbers (the stop limit). */
export const RANGE_SOURCE = "spec:02-E.3";

type TimelineEntry = PlanResult["stops_timeline"][number];

function usePlan(planStore: PlanStore): PlanState {
  const subscribe = useCallback((onChange: () => void) => planStore.subscribe(() => onChange()), [planStore]);
  const read = useCallback(() => planStore.get(), [planStore]);
  return useSyncExternalStore(subscribe, read, read);
}

/** "disconnected by slope": a NO_ROUTE reason code in words (04 §D "marked with its reason"). */
function reasonWords(code: string): string {
  return code.toLowerCase().split("_").join(" ");
}

/** A shown value: its text, `data-provenance` and `data-source`, and the provenance glyph beside it (04 §C.1). */
function value(slot: string, text: string | null, sourced: Sourced): ReactElement {
  const missing = text === null;
  const s = missing ? unavailableOf(sourced.prov, sourced.src) : sourced;
  return h(
    "span",
    { className: "stops-value", key: slot },
    h("span", { "data-slot": slot, ...provAttrs(s) }, missing ? UNAVAILABLE : text),
    !missing && sourced.prov
      ? h("span", { className: "stops-chip", role: "img", "aria-label": sourced.prov.toUpperCase(), ...provAttrs(sourced) }, PROVENANCE_GLYPHS[sourced.prov])
      : null,
  );
}

function poiOf(site: LoadedSite, wp: Waypoint): POIFeature | undefined {
  return wp.poi_id ? site.pois.get(wp.poi_id) : undefined;
}

function nameOf(site: LoadedSite, wp: Waypoint): string {
  const poi = poiOf(site, wp);
  if (poi) return poi.properties.name;
  if (wp.role === "start") return wp.label ?? "Start";
  return "Free stop";
}

/** The start is `derived` from the manifest while it is where the manifest put it; anything else is the planner's input. */
function coordsSourced(site: LoadedSite, wp: Waypoint): Sourced {
  const start = site.site.default_start;
  if (wp.role === "start" && wp.x_m === start.x_m && wp.y_m === start.y_m) return { prov: "derived", src: "manifest:default_start" };
  return { prov: "assumed", src: `user:waypoint.${wp.id}` };
}

function coordsText(site: LoadedSite, wp: Waypoint): string | null {
  try {
    ensureMarsProjection(site.site);
    const { lat, lon_e } = projectedToLatLonE(site.site, wp.x_m, wp.y_m);
    return Number.isFinite(lat) && Number.isFinite(lon_e) ? formatLatLonE(lat, lon_e) : null;
  } catch {
    return null;
  }
}

interface RowProps {
  plan: PlanState;
  planStore: PlanStore;
  site: LoadedSite;
  wp: Waypoint;
  /** Index in the waypoint list (the timeline's index). */
  index: number;
  /** 1-based stop number, or 0 for the start. */
  stopNumber: number;
  stopCount: number;
  renderStopTasks?: StopsListProps["renderStopTasks"];
}

function blockedLeg(plan: PlanState, wp: Waypoint): NoRouteLeg | undefined {
  return plan.result?.legs.find((l): l is NoRouteLeg => l.status === "NO_ROUTE" && l.to === wp.id);
}

function Row(props: RowProps): ReactElement {
  const { plan, planStore, site, wp, index, stopNumber, stopCount } = props;
  const isStop = wp.role === "stop";
  const selected = plan.selected_waypoint_id === wp.id;
  const hovered = plan.hover?.waypoint_id === wp.id;
  const name = nameOf(site, wp);
  const entry: TimelineEntry | undefined = plan.status === "Error" ? undefined : plan.result?.stops_timeline[index];
  const computing = plan.status === "Computing";
  const blocked = isStop ? blockedLeg(plan, wp) : undefined;
  const coords = coordsText(site, wp);

  const stopIds = plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id);
  const move = (delta: -1 | 1): void => {
    const at = stopIds.indexOf(wp.id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= stopIds.length) return;
    const next = [...stopIds];
    [next[at], next[to]] = [next[to]!, next[at]!];
    planStore.reorderWaypoints(next);
  };
  const enter = (): void => planStore.setHover({ waypoint_id: wp.id });
  const leave = (): void => {
    if (planStore.get().hover?.waypoint_id === wp.id) planStore.setHover(null);
  };

  const button = (action: string, label: string, text: string, onClick: () => void, disabled = false): ReactElement =>
    h("button", { key: action, type: "button", className: "stops-btn", "data-action": action, "aria-label": label, disabled, onClick }, text);

  return h(
    "li",
    {
      className: "stops-row",
      "data-stops-row": "",
      "data-waypoint-id": wp.id,
      "data-role": wp.role,
      ...(isStop ? { "data-stop-index": String(stopNumber) } : {}),
      ...(selected ? { "data-selected": "true" } : {}),
      ...(hovered ? { "data-hover": "true" } : {}),
    },
    h(
      "div",
      { className: "stops-line", key: "line" },
      isStop ? h("span", { key: "handle", className: "stops-handle", "data-drag-handle": "", "aria-hidden": "true" }, "⠿") : null,
      h(
        "button",
        {
          key: "select",
          type: "button",
          className: "stops-select",
          "data-action": "select",
          "aria-pressed": selected,
          "aria-label": isStop ? `Select stop ${stopNumber}, ${name}` : `Select start, ${name}`,
          onClick: () => planStore.selectWaypoint(wp.id),
          onPointerEnter: enter,
          onPointerLeave: leave,
          onFocus: enter,
          onBlur: leave,
        },
        h("b", { className: "stops-number", "data-identifier": "" }, isStop ? String(stopNumber) : "S"),
        h("span", { className: "stops-name", "data-slot": "stop-name" }, name),
      ),
      isStop
        ? h(
            "span",
            { className: "stops-actions", key: "actions" },
            button("move-up", `Move stop ${stopNumber} up`, "↑", () => move(-1), stopNumber === 1),
            button("move-down", `Move stop ${stopNumber} down`, "↓", () => move(1), stopNumber === stopCount),
            button("delete", `Delete stop ${stopNumber}`, "Delete", () => planStore.deleteWaypoint(wp.id)),
          )
        : null,
    ),
    h(
      "div",
      { className: "stops-detail", key: "detail" },
      h("span", { className: "stops-coords", key: "coords" }, value("stop-coords", coords, coordsSourced(site, wp))),
      h(
        "span",
        { className: "stops-arrival", key: "arrival", "data-slot": "stop-arrival", ...(computing ? { "data-computing": "true" } : {}) },
        h("span", { className: "stops-label", key: "l" }, "Arrive"),
        value("stop-ltst", entry ? entry.arrive_ltst : null, { prov: "modelled", src: LTST_SOURCE }),
        h("span", { className: "stops-label", key: "s" }, "Sun"),
        value("stop-sun-elevation", entry && Number.isFinite(entry.sun_elevation_deg) ? formatNumber(entry.sun_elevation_deg, "°") : null, { prov: "modelled", src: LTST_SOURCE }),
      ),
    ),
    blocked
      ? h("p", { className: "stops-blocked", key: "blocked", "data-slot": "stop-blocked" }, h(StatusIcon, { status: "blocked" }), h("span", { key: "r" }, `No route: ${reasonWords(blocked.reason)}`))
      : null,
    isStop ? props.renderStopTasks?.(wp.id) : null,
  );
}

/** The SCR-04 stops list (React, ADR-012). */
export function StopsList({ planStore, site, renderStopTasks }: StopsListProps): ReactElement {
  const plan = usePlan(planStore);
  const stops = plan.waypoints.filter((w) => w.role === "stop");
  let stopNumber = 0;

  return h(
    "section",
    { className: "stops", "data-slot": "stops-list", "data-stops-list": "", "aria-busy": plan.status === "Computing" },
    h(
      "div",
      { className: "stops-head", key: "head" },
      h("span", { className: "mod", key: "t" }, "[ PLAN /// STOPS ]"),
      h("button", { key: "undo", type: "button", className: "stops-btn", "data-action": "undo", disabled: !plan.can_undo, onClick: () => planStore.undo() }, "Undo"),
    ),
    stops.length === 0 ? h("p", { className: "stops-empty", key: "empty", "data-slot": "stops-empty" }, "Add a stop: click a POI or press A") : null,
    h(
      "ol",
      { className: "stops-rows", key: "rows", "aria-label": "Stops" },
      plan.waypoints.map((wp, index) => {
        if (wp.role === "stop") stopNumber += 1;
        return h(Row, { key: wp.id, plan, planStore, site, wp, index, stopNumber: wp.role === "stop" ? stopNumber : 0, stopCount: stops.length, renderStopTasks });
      }),
    ),
    stops.length >= MAX_STOPS
      ? h(
          "p",
          { className: "stops-limit", key: "limit", "data-slot": "stops-limit" },
          "Stop limit reached (",
          h("span", { key: "n", ...provAttrs({ prov: "assumed", src: RANGE_SOURCE }) }, String(MAX_STOPS)),
          " stops): delete one to add another.",
        )
      : null,
  );
}
