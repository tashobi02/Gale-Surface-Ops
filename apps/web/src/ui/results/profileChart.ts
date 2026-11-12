/** SVG elevation profile from worker samples only (FR-08; FD-082, FD-123, FD-247). */
import { createElement as h, useId, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";
import type { PlanHoverPosition } from "../../state/planStore";
import type { PlanResult } from "@marswalk/protocol";
import { STATUS_PATTERN, svgPatternDefs } from "../components/patterns";
import { provAttrs } from "../components/provenance";
import { formatNumber } from "../components/format";
import { pointAlongTrack } from "../map/routeGeometry";
import { useProfileLayout } from "./profileLayout";

export interface ProfileChartProps { result: PlanResult; hover?: PlanHoverPosition | null; print?: boolean }
const source = { prov: "derived", src: "usgs-gale-dem-1m-v3" } as const;

export function ProfileChart({ result, hover, print = false }: ProfileChartProps): ReactElement {
  const id = `profile-${useId().replace(/:/g, "")}-`;
  const layout = useProfileLayout(result.legs);
  const plot = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    const samples: { distance: number; gap: number; elevation: number; slope: string; leg: number; coord: [number, number] | null }[][] = [];
    const stops: { id: string; distance: number; gap: number }[] = [];
    let min = Infinity, max = -Infinity;
    for (const { leg, index, start, gap } of layout.entries) {
      if (leg.status !== "OK") continue;
      if (!stops.length || result.legs[index - 1]?.status !== "OK") stops.push({ id: leg.from, distance: start, gap });
      const points = leg.profile.dist_m.flatMap((distance, i) => {
        const elevation = leg.profile.elev_m[i];
        if (!Number.isFinite(distance) || !Number.isFinite(elevation)) return [];
        min = Math.min(min, elevation!); max = Math.max(max, elevation!);
        return [{ distance: start + distance, gap, elevation: elevation!, slope: leg.profile.slope_class[i] ?? "unknown", leg: index, coord: pointAlongTrack(leg.geometry, distance) }];
      });
      samples.push(points);
      stops.push({ id: leg.to, distance: start + leg.distance_m, gap });
    }
    return { samples, stops, min, max };
  }, [layout.entries, result.legs]);
  const points = data.samples.flat();
  const [local, setLocal] = useState<(typeof points)[number] | null>(null);
  const [roving, setRoving] = useState(0);
  const delta = (p: (typeof points)[number]) => hover?.distance_m !== undefined ? Math.abs(p.distance - hover.distance_m) : hover?.coord && p.coord ? Math.hypot(p.coord[0] - hover.coord[0], p.coord[1] - hover.coord[1]) : Infinity;
  const active = hover ? points.filter(p => hover.leg_index === undefined || p.leg === hover.leg_index).reduce<(typeof points)[number] | null>((best, p) => Number.isFinite(delta(p)) && (!best || delta(p) < delta(best)) ? p : best, null) : local && points.includes(local) ? local : null;
  const x = (p: { distance: number; gap: number }) => layout.x(p.distance, p.gap);
  const bottom = print ? 40 : 78;
  const y = (e: number) => bottom - (e - data.min) / Math.max(1, data.max - data.min) * (print ? 22 : 58);
  const pattern = (slope: string) => slope === "caution" ? STATUS_PATTERN.caution : slope === "over_limit" ? STATUS_PATTERN.warning : STATUS_PATTERN.unknown;
  const totals = result.status === "PARTIAL" ? null : result.totals;
  const select = (index: number) => {
    setRoving(index); setLocal(points[index] ?? null);
    plot.current?.querySelectorAll<HTMLElement>("[data-profile-sample]")[index]?.focus({ preventScroll: true });
  };
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const svg = plot.current?.querySelector("svg");
    const rect = svg?.getBoundingClientRect();
    if (!rect?.width) return;
    const cursor = (event.clientX - rect.left) * layout.width / rect.width;
    const index = points.reduce((best, p, i) => Math.abs(x(p) - cursor) < Math.abs(x(points[best]!) - cursor) ? i : best, 0);
    if (points.length) select(index);
  };
  return h("div", { className: "profile-chart", "data-profile": true, ref: layout.ref },
    points.length ? h("div", { className: "profile-plot", ref: plot, onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); scrub(event); }, onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (event.buttons & 1) scrub(event); } },
      h("svg", { viewBox: `0 0 ${layout.width} ${print ? 56 : 106}`, height: print ? 56 : 106, role: "group", "aria-label": "Elevation (m) by cumulative distance (m)", preserveAspectRatio: "xMinYMid meet", ...provAttrs(source) },
        h("g", { dangerouslySetInnerHTML: { __html: svgPatternDefs("currentColor").replaceAll("pattern-", id) } }),
        ...data.samples.flatMap((legPoints, n) => legPoints.map((p, i) => {
          const next = legPoints[i + 1];
          return h("g", { key: `${n}:${i}` },
            h("rect", { "data-slope-class": p.slope, fill: p.slope === "ok" ? "none" : `url(#${id}${pattern(p.slope)})`, x: x(p), y: 18, width: next ? Math.max(1, x(next) - x(p)) : 2, height: print ? 24 : 62 }, h("title", null, p.slope.replaceAll("_", " "))),
            next ? h("path", { d: `M${x(p)},${y(p.elevation)} L${x(next)},${y(next.elevation)}`, fill: "none", stroke: "currentColor", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }) : null,
          );
        })),
        ...data.stops.map((stop, i) => h("g", { key: i, "data-stop": stop.id, "data-distance-m": stop.distance, ...provAttrs(source) },
          h("path", { d: `M${x(stop)},15 V${print ? 43 : 82}`, stroke: "var(--fg-3)", strokeDasharray: "2 3" }),
          h("text", { x: x(stop), y: 12, textAnchor: "middle" }, stop.id),
          h("text", { x: x(stop), y: print ? 55 : 99, textAnchor: "middle" }, `${formatNumber(stop.distance, "m")} m`))),
        h("text", { x: layout.left - 60, y: print ? 20 : 25, ...provAttrs(source) }, `${formatNumber(data.max, "m")} m`),
        h("text", { x: layout.left - 60, y: bottom, ...provAttrs(source) }, `${formatNumber(data.min, "m")} m`),
      ),
      ...points.map((p, i) => h("span", {
        key: `${p.leg}:${i}`, className: "profile-sample", style: { left: x(p), top: y(p.elevation) },
        tabIndex: i === Math.min(roving, points.length - 1) ? 0 : -1, role: "img",
        "aria-label": `${formatNumber(p.distance, "m")} m, ${formatNumber(p.elevation, "m")} m elevation, ${p.slope.replaceAll("_", " ")}`,
        "data-profile-sample": true, "data-distance-m": p.distance, "data-leg-index": p.leg, "data-x-m": p.coord?.[0], "data-y-m": p.coord?.[1],
        onFocus: () => { setRoving(i); setLocal(p); }, onBlur: () => setLocal(null), onPointerEnter: () => setLocal(p), onPointerLeave: () => setLocal(null),
        onKeyDown: (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          select(event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, i + (event.key === "ArrowRight" ? 1 : -1))));
        }, ...provAttrs(source),
      })),
    ) : h("div", { className: "scr05-placeholder", ...provAttrs({ prov: "derived", src: "unavailable:result.legs.profile", unavailable: true }) }, "— No elevation samples supplied"),
    ...result.legs.filter(leg => leg.status === "NO_ROUTE").map((leg, i) => h("div", { key: i, className: "profile-no-route", ...provAttrs({ prov: "derived", src: "rule:NO_ROUTE" }) }, `? NO ROUTE · ${leg.from} → ${leg.to}`)),
    result.status === "PARTIAL" ? h("p", { className: "profile-caption" }, "Gaps mark NO ROUTE; distances sum routed legs only.") : null,
    h("output", { "data-profile-tooltip": true, ...provAttrs(source) }, active ? `${formatNumber(active.distance, "m")} m · ${formatNumber(active.elevation, "m")} m elevation · ${active.slope.replaceAll("_", " ")}` : "Hover or focus the profile; ← / → move the cursor"),
    h("div", { className: "profile-caption", ...provAttrs(totals ? source : { prov: "derived", src: "unavailable:result.totals", unavailable: true }) }, `Climb / descent: ${totals ? `${formatNumber(totals.climb_m, "m")} / ${formatNumber(totals.descent_m, "m")} m` : "—"} · Slope: ○ OK / ▧ caution / ▩ over limit`),
  );
}
