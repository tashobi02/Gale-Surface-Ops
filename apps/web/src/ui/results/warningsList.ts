/**
 * Hazard and constraint warnings list (docs/specs/01 FR-10; 04 §C.1 status, §E accessibility, §F SCR-05).
 * Each warning shows a status shape, its word, the message and the affected stretch or time; a located warning is a
 * keyboard-reachable button that zooms the map to its stretch (T09.04). Implemented by T09.04 (Saba Atharique, #180;
 * reworked in the review as a React component: React owns its DOM, nothing here writes into a parent's nodes).
 *
 * The list is also the text alternative for the warnings drawn on the map (04 §E) and is reusable by the briefing card
 * (T11.03). Status is never colour alone: StatusIcon draws shape, pattern and word (04 §A.3 #2).
 *
 * FD-062: severity, route position, leg. FD-063: reduced-motion fits are instant.
 */
import { createElement, useMemo, type ReactElement } from "react";
import type { Warning } from "@marswalk/protocol";
import type { MapHandle } from "../context";
import type { Extent } from "../map/routeGeometry";
import { StatusIcon, type OperationalStatus } from "../components/statusIcon";
import { UNAVAILABLE, provAttrs } from "../components/provenance";

export interface WarningsListProps {
  warnings: Warning[];
  /** Zoomed on a click of a located warning. */
  mapHandle?: MapHandle;
  /** Extent of a warning's stretch in working-projection metres, or null when it cannot be drawn. */
  getLegExtent?: (legIndex: number, from_m: number, to_m: number) => Extent | null;
  /** Called with the warning that was clicked, before the map zooms. */
  onZoom?: (warning: Warning) => void;
  className?: string;
}

/** A located warning has a leg and an along-leg stretch (05 Warning). */
function isLocated(w: Warning): w is Warning & { leg: number; from_m: number; to_m: number } {
  return w.leg !== null && w.from_m !== null && w.to_m !== null;
}

/** Severity shown by StatusIcon: `blocked` ⬣, `caution` ▲, and `unknown` (also any value outside 05) ?. */
function statusOf(severity: Warning["severity"]): OperationalStatus {
  if (severity === "blocked") return "blocked";
  if (severity === "caution") return "caution";
  return "unknown";
}

const RANK: Record<OperationalStatus, number> = { blocked: 0, caution: 1, unknown: 2, ok: 3 };

/** Most severe first; inside a severity by leg and along-leg distance, unlocated last (see the header). */
export function sortWarnings(warnings: readonly Warning[]): Warning[] {
  return [...warnings].sort(
    (a, b) =>
      RANK[statusOf(a.severity)] - RANK[statusOf(b.severity)] ||
      (a.leg ?? Infinity) - (b.leg ?? Infinity) ||
      (a.from_m ?? Infinity) - (b.from_m ?? Infinity),
  );
}

/** "YYYY-MM-DD HH:MM UTC" from an ISO-8601 instant; "—" when it is not a date (04 §D.4: UTC stated, no seconds). */
export function formatUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return UNAVAILABLE;
  const s = new Date(ms).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

/** Where a warning applies: the leg (1-based) and stretch in metres, or its time; "" when it has neither. */
export function formatWarningLocation(w: Warning): string {
  if (isLocated(w)) return `Leg ${w.leg + 1} · ${Math.round(w.from_m)}–${Math.round(w.to_m)} m`;
  if (w.at_utc) return `At ${formatUtc(w.at_utc)}`;
  return "";
}

/** Keys from the warning's own content; a repeat gets a counter so keys stay unique and stable. */
function keysOf(warnings: readonly Warning[]): string[] {
  const seen = new Map<string, number>();
  return warnings.map((w) => {
    const base = [w.code, w.leg, w.from_m, w.to_m, w.at_utc ?? ""].join("|");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

export function WarningsList({ warnings, mapHandle, getLegExtent, onZoom, className = "" }: WarningsListProps): ReactElement {
  const sorted = useMemo(() => sortWarnings(warnings), [warnings]);
  const keys = useMemo(() => keysOf(sorted), [sorted]);

  if (sorted.length === 0) {
    return createElement("div", { className: `warnings-empty ${className}`.trim() }, "No active warnings");
  }

  const zoomTo = (w: Warning & { leg: number; from_m: number; to_m: number }): void => {
    onZoom?.(w);
    const extent = getLegExtent?.(w.leg, w.from_m, w.to_m) ?? null;
    if (extent && mapHandle) mapHandle.fitExtent(extent, { animate: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches });
  };

  return createElement(
    "ul",
    { className: `warnings-list ${className}`.trim(), "aria-label": "Warnings" },
    sorted.map((w, i) => {
      const status = statusOf(w.severity);
      const location = formatWarningLocation(w);
      return createElement(
        "li",
        {
          key: keys[i],
          className: `warning-item warning-${status}`,
          "data-severity": w.severity,
          // The message is computed by the route worker from the plan and the grid: derived (05 PlanResult).
          // FD-064: rule id and the source layers it reads.
          ...provAttrs({ prov: "derived", src: `rule:${w.code} ${warningSources(w.code)}`.trim() }),
        },
        createElement(StatusIcon, { status, word: status.toUpperCase(), className: "warning-status" }),
        createElement(
          "div",
          { className: "warning-content" },
          createElement("span", { className: "warning-message" }, w.message),
          location ? createElement("span", { className: "warning-location" }, location) : null,
        ),
        isLocated(w)
          ? createElement(
              "button",
              {
                type: "button",
                className: "warning-zoom-btn",
                "aria-label": `Zoom to ${location}: ${w.message}`,
                onClick: () => zoomTo(w),
              },
              "Zoom",
            )
          : null,
      );
    }),
  );
}

/** Existing layer/model source ids read by each warning rule (05 §F.3; FD-064). */
function warningSources(code: Warning["code"]): string {
  if (code === "LOW_TI" || code === "TI_UNKNOWN") return "grid.ti_asset";
  if (code === "DARKNESS") return "mars24-allison-mccewen-2000";
  if (code === "EVA_DURATION_EXCEEDED" || code === "HAVEN_TIME_EXCEEDED" || code === "CONSUMABLES_LOW") return "tobler-1993 apollo17-planning";
  if (code === "RADIATION_ALERT") return "hassler-2014-rad";
  if (code === "COMM_SHADOW") return "grid.comm_hab_asset";
  return "usgs-gale-dem-1m-v3";
}
