/**
 * Hazard and constraint warnings list (FR-10, SCR-05, 04 §C.1, 04 §E, 04 §F).
 * Implemented by T09.04 (Saba Atharique).
 */

import type { Warning } from "@marswalk/protocol";
import type { MapHandle } from "../context";
import { renderStatusIcon, type OperationalStatus } from "../components/statusIcon";

export interface WarningsListOptions {
  mapHandle?: MapHandle;
  onZoom?: (warning: Warning) => void;
  getLegExtent?: (
    legIndex: number,
    from_m: number,
    to_m: number
  ) => [number, number, number, number] | null;
}

/** Severity rank for sorting "newest-severity first" (04 §F). */
const SEVERITY_RANK: Record<string, number> = {
  blocked: 0,
  warning: 1,
  caution: 2,
  advisory: 3,
  unknown: 4,
  nominal: 5,
};

/**
 * Sort warnings newest-severity first per 04 §F.
 */
export function sortWarnings(warnings: Warning[]): Warning[] {
  return [...warnings].sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity] ?? 99;
    const rankB = SEVERITY_RANK[b.severity] ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    // Stable sub-ordering by leg index and along-track distance
    const legA = a.leg ?? -1;
    const legB = b.leg ?? -1;
    if (legA !== legB) return legA - legB;

    const fromA = a.from_m ?? -1;
    const fromB = b.from_m ?? -1;
    return fromA - fromB;
  });
}

/**
 * Format the location string of a warning (leg + along-track stretch or time).
 */
export function formatWarningLocation(warning: Warning): string {
  if (
    warning.leg !== null &&
    warning.leg !== undefined &&
    warning.from_m !== null &&
    warning.from_m !== undefined &&
    warning.to_m !== null &&
    warning.to_m !== undefined
  ) {
    const legNum = warning.leg + 1;
    const from = Math.round(warning.from_m);
    const to = Math.round(warning.to_m);
    return `Leg #${legNum} (${from} m – ${to} m)`;
  }

  if (warning.at_utc) {
    return `At ${warning.at_utc}`;
  }

  return "";
}

/**
 * Render the warnings list into a DOM container with severity icons, messages,
 * and keyboard-reachable click-to-zoom buttons for located warnings.
 *
 * Preserves the exact T07.01 stub signature for SCR-05 and SCR-08 consumers.
 */
export function renderWarningsList(
  container: HTMLElement,
  warnings: Warning[],
  options?: WarningsListOptions
): void {
  container.innerHTML = "";

  if (!warnings || warnings.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "warnings-empty";
    emptyDiv.textContent = "No active warnings";
    container.appendChild(emptyDiv);
    return;
  }

  const sorted = sortWarnings(warnings);
  const list = document.createElement("ul");
  list.className = "warnings-list";
  list.setAttribute("role", "list");

  for (const w of sorted) {
    const item = document.createElement("li");
    item.className = `warning-item warning-${w.severity}`;
    item.setAttribute("data-severity", w.severity);

    // 4-cue accessible status indicator (04 §C.1, 04 §E)
    const statusKind: OperationalStatus = w.severity === "blocked" ? "blocked" : "caution";
    const statusElem = renderStatusIcon(statusKind, {
      word: w.severity.toUpperCase(),
      showWord: true,
      className: "warning-status",
    });
    item.appendChild(statusElem);

    const contentWrap = document.createElement("div");
    contentWrap.className = "warning-content";

    const msgSpan = document.createElement("span");
    msgSpan.className = "warning-message";
    msgSpan.textContent = w.message;
    contentWrap.appendChild(msgSpan);

    const locationText = formatWarningLocation(w);
    if (locationText) {
      const locSpan = document.createElement("span");
      locSpan.className = "warning-location";
      locSpan.textContent = locationText;
      contentWrap.appendChild(locSpan);
    }

    item.appendChild(contentWrap);

    // If warning has a location along the route, make it a keyboard-reachable zoom button
    const isLocated =
      w.leg !== null &&
      w.leg !== undefined &&
      w.from_m !== null &&
      w.from_m !== undefined &&
      w.to_m !== null &&
      w.to_m !== undefined;

    if (isLocated) {
      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "warning-zoom-btn";
      zoomBtn.setAttribute("aria-label", `Zoom to warning at ${locationText}: ${w.message}`);
      zoomBtn.textContent = "Zoom";

      const handleZoom = (e: Event) => {
        if (e && typeof e.preventDefault === "function") {
          e.preventDefault();
        }
        if (options?.onZoom) {
          options.onZoom(w);
        }
        if (options?.mapHandle && options?.getLegExtent && w.leg !== null && w.from_m !== null && w.to_m !== null) {
          const extent = options.getLegExtent(w.leg, w.from_m, w.to_m);
          if (extent) {
            options.mapHandle.fitExtent(extent);
          }
        }
      };

      zoomBtn.addEventListener("click", handleZoom);
      item.appendChild(zoomBtn);
    }

    list.appendChild(item);
  }

  container.appendChild(list);
}
