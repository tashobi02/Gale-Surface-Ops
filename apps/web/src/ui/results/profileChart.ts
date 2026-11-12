/** SVG elevation profile from worker samples only (FR-08; FD-082, FD-123). */
import { createElement as h, useId, useMemo, useState, type ReactElement } from "react";
import type { PlanHoverPosition } from "../../state/planStore";
import type { PlanResult } from "@marswalk/protocol";
import { svgPatternDefs } from "../components/patterns";
import { provAttrs } from "../components/provenance";
import { formatNumber } from "../components/format";
import { pointAlongTrack } from "../map/routeGeometry";

export interface ProfileChartProps { result: PlanResult; hover?: PlanHoverPosition | null }
export const PROFILE_AXIS = { width: 720, left: 230, span: 460 } as const;
const source = { prov: "derived", src: "usgs-gale-dem-1m-v3" } as const;

export function ProfileChart({ result, hover }: ProfileChartProps): ReactElement {
  const id = `profile-${useId().replace(/:/g, "")}-`;
  const data = useMemo(() => {
    const samples: { distance: number; elevation: number; slope: string; leg: number; coord: [number, number] | null }[][] = [];
    const stops: { id: string; distance: number }[] = [];
    let offset = 0;
    let min = Infinity, max = -Infinity;
    for (const [index, leg] of result.legs.entries()) {
      if (leg.status !== "OK") continue;
      if (!stops.length) stops.push({ id: leg.from, distance: offset });
      const points = leg.profile.dist_m.flatMap((distance, i) => {
        const elevation = leg.profile.elev_m[i];
        if (!Number.isFinite(distance) || !Number.isFinite(elevation)) return [];
        min = Math.min(min, elevation!); max = Math.max(max, elevation!);
        return [{ distance: offset + distance, elevation: elevation!, slope: leg.profile.slope_class[i] ?? "unknown", leg: index, coord: pointAlongTrack(leg.geometry, distance) }];
      });
      samples.push(points);
      offset += leg.distance_m;
      stops.push({ id: leg.to, distance: offset });
    }
    return { samples, stops, distance: offset, min, max };
  }, [result]);
  const points = data.samples.flat();
  const [local, setLocal] = useState<(typeof points)[number] | null>(null);
  const delta = (p: (typeof points)[number]) => hover?.distance_m !== undefined ? Math.abs(p.distance - hover.distance_m) : hover?.coord && p.coord ? Math.hypot(p.coord[0] - hover.coord[0], p.coord[1] - hover.coord[1]) : Infinity;
  const active = hover ? points.filter(p => hover.leg_index === undefined || p.leg === hover.leg_index).reduce<(typeof points)[number] | null>((best, p) => Number.isFinite(delta(p)) && (!best || delta(p) < delta(best)) ? p : best, null) : local;
  const x = (d: number) => PROFILE_AXIS.left + d / Math.max(1, data.distance) * PROFILE_AXIS.span;
  const y = (e: number) => 78 - (e - data.min) / Math.max(1, data.max - data.min) * 58;
  const pattern = (slope: string) => slope === "caution" ? "hatch" : slope === "over_limit" ? "crosshatch" : "dots";
  const totals = result.status === "PARTIAL" ? null : result.totals;
  return h("div", { className: "profile-chart", "data-profile": true },
    points.length ? h("svg", { viewBox: "0 0 720 106", role: "group", "aria-label": "Elevation (m) by cumulative distance (m)", preserveAspectRatio: "none", ...provAttrs(source) },
      h("g", { dangerouslySetInnerHTML: { __html: svgPatternDefs("currentColor").replaceAll("pattern-", id) } }),
      ...data.samples.flatMap((legPoints, n) => legPoints.map((p, i) => {
        const next = legPoints[i + 1];
        return h("g", { key: `${n}:${i}` },
          h("rect", { "data-slope-class": p.slope, fill: p.slope === "ok" ? "none" : `url(#${id}${pattern(p.slope)})`, x: x(p.distance), y: 18, width: next ? Math.max(1, x(next.distance) - x(p.distance)) : 2, height: 62 }, h("title", null, p.slope.replaceAll("_", " "))),
          next ? h("path", { d: `M${x(p.distance)},${y(p.elevation)} L${x(next.distance)},${y(next.elevation)}`, fill: "none", stroke: "currentColor", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }) : null,
          h("circle", { cx: x(p.distance), cy: y(p.elevation), r: 3, tabIndex: n === 0 && i === 0 ? 0 : -1, role: "button", "aria-label": `${formatNumber(p.distance, "m")} m, ${formatNumber(p.elevation, "m")} m elevation, ${p.slope.replaceAll("_", " ")}`, "data-profile-sample": true, "data-distance-m": p.distance, "data-leg-index": p.leg, "data-x-m": p.coord?.[0], "data-y-m": p.coord?.[1], onFocus: () => setLocal(p), onBlur: () => setLocal(null), onPointerEnter: () => setLocal(p), onPointerLeave: () => setLocal(null), ...provAttrs(source) }, h("title", null, `${formatNumber(p.distance, "m")} m · ${formatNumber(p.elevation, "m")} m`)),
        );
      })),
      ...data.stops.map((stop, i) => h("g", { key: i, "data-stop": stop.id, "data-distance-m": stop.distance, ...provAttrs(source) },
        h("path", { d: `M${x(stop.distance)},15 V82`, stroke: "var(--fg-3)", strokeDasharray: "2 3" }),
        h("text", { x: x(stop.distance), y: 12, textAnchor: "middle" }, stop.id),
        h("text", { x: x(stop.distance), y: 99, textAnchor: "middle" }, `${formatNumber(stop.distance, "m")} m`))),
      h("text", { x: 170, y: 25, ...provAttrs(source) }, `${formatNumber(data.max, "m")} m`),
      h("text", { x: 170, y: 78, ...provAttrs(source) }, `${formatNumber(data.min, "m")} m`),
    ) : h("div", { className: "scr05-placeholder", ...provAttrs({ prov: "derived", src: "unavailable:result.legs.profile" }) }, "— No elevation samples supplied"),
    ...result.legs.filter(leg => leg.status === "NO_ROUTE").map((leg, i) => h("div", { key: i, className: "profile-no-route", ...provAttrs({ prov: "derived", src: "rule:NO_ROUTE" }) }, `? NO ROUTE · ${leg.from} → ${leg.to}`)),
    h("output", { "data-profile-tooltip": true, ...provAttrs(source) }, active ? `${formatNumber(active.distance, "m")} m · ${formatNumber(active.elevation, "m")} m elevation · ${active.slope.replaceAll("_", " ")}` : "Hover or focus the profile; ← / → move the cursor"),
    h("div", { className: "profile-caption", ...provAttrs(totals ? source : { prov: "derived", src: "unavailable:result.totals" }) }, `Climb / descent: ${totals ? `${formatNumber(totals.climb_m, "m")} / ${formatNumber(totals.descent_m, "m")} m` : "—"} · Slope: ○ OK / ▧ caution / ▩ over limit`),
  );
}
