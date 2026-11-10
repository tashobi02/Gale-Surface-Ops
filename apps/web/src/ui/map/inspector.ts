/**
 * Point inspector popover (01 FR-03, FR-15, NFR-05, 02 §D.1, 02 §E.2, 03 §D, 04 §E).
 * Implemented by T07.12.
 *
 * - Sends SAMPLE_POINT requests (snap_radius_m: 50) via the worker client.
 * - Displays planetocentric latitude and east-positive longitude (°, 5 decimals).
 * - Displays elevation (m relative to MOLA datum), slope (°), and thermal inertia (tiu or "no data").
 * - Each displayed value carries data-provenance and data-source-id (FR-15, NFR-05).
 * - Outside the AOI, displays "Outside mapped area" and no value fields (01 FR-03, 03 §D).
 * - Exposes inspectAt(x_m, y_m) for keyboard crosshair use (T13.06).
 * - Dismisses on Escape or map move.
 *
 * CRS GUARD: Working-projection metres only (+proj=eqc).
 * Never uses EPSG:3857, WGS84, or ol/sphere (02 §C.4.2).
 */

import type { SamplePointRequest, SampleResult } from "@marswalk/protocol";

export interface InspectorSampleClient {
  samplePoint(req: Omit<SamplePointRequest, "type">): Promise<SampleResult>;
}

export interface InspectorSourceIds {
  elevation?: string;
  slope?: string;
  ti?: string;
}

export interface PointInspectorOptions {
  container?: HTMLElement;
  sources?: InspectorSourceIds;
  onClose?: () => void;
}

export interface PointInspector {
  inspectAt(x_m: number, y_m: number): Promise<void>;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

let nextRequestId = 1;

/**
 * Creates the point inspector popover controller (T07.12).
 *
 * @param client Worker client interface capable of sampling points.
 * @param options Container element and data source IDs.
 */
export function createPointInspector(
  client: InspectorSampleClient,
  options: PointInspectorOptions = {}
): PointInspector {
  const container = options.container ?? document.body;
  const sources = options.sources ?? {
    elevation: "usgs-gale-dem-1m-v3",
    slope: "usgs-gale-dem-1m-v3",
    ti: "themis-ti-100m",
  };

  let popoverEl: HTMLElement | null = null;
  let isCurrentlyOpen = false;

  function close(): void {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }
    isCurrentlyOpen = false;
    if (options.onClose) {
      options.onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape" && isCurrentlyOpen) {
      close();
    }
  }

  document.addEventListener("keydown", handleKeydown);

  async function inspectAt(x_m: number, y_m: number): Promise<void> {
    const requestId = `inspector-sample-${nextRequestId++}`;
    const result = await client.samplePoint({
      request_id: requestId,
      x_m,
      y_m,
      snap_radius_m: 50,
    });

    renderPopover(result, x_m, y_m);
  }

  function renderPopover(result: SampleResult, x_m: number, y_m: number): void {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
    }

    popoverEl = document.createElement("div");
    popoverEl.setAttribute("data-testid", "inspector-popover");
    popoverEl.className = "inspector-popover";
    popoverEl.setAttribute("role", "dialog");
    popoverEl.setAttribute("aria-label", "Point Inspector");

    popoverEl.style.cssText = [
      "position:absolute",
      "z-index:300",
      "background:var(--color-bg-surface,#11161d)",
      "border:1px solid var(--color-edge,#2e3846)",
      "border-radius:4px",
      "padding:12px",
      "font-family:var(--font-mono,'ui-monospace',monospace)",
      "font-size:12px",
      "color:var(--color-fg,#e8edf2)",
      "min-width:240px",
      "box-shadow:0 4px 16px rgba(0,0,0,0.5)",
    ].join(";");

    if (!result.inside_aoi) {
      // Outside AOI case per 01 FR-03 & 03 §D
      popoverEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:600; color:var(--color-warning,#ffb020);">[ POINT INSPECTION ]</span>
          <button type="button" aria-label="Close" class="inspector-close-btn" style="background:none; border:none; color:#e8edf2; cursor:pointer; font-size:14px;">✕</button>
        </div>
        <div data-testid="outside-aoi-msg" style="color:var(--color-text-secondary,#9ca3af); padding:6px 0;">
          Outside mapped area
        </div>
        <div style="font-size:11px; color:var(--color-text-muted,#6b7280); margin-top:4px;">
          Local coordinates: ${x_m.toFixed(0)} m, ${y_m.toFixed(0)} m
        </div>
      `;
    } else {
      const latStr = result.lat !== null
        ? `${result.lat >= 0 ? "+" : ""}${result.lat.toFixed(5)}°`
        : "—";
      const lonStr = result.lon_e !== null
        ? `${result.lon_e.toFixed(5)}°E`
        : "—";
      const elevStr = result.elevation_m !== null
        ? `${result.elevation_m >= 0 ? "+" : ""}${result.elevation_m.toFixed(1)} m`
        : "—";
      const slopeStr = result.slope_p90_deg !== null
        ? `${result.slope_p90_deg.toFixed(1)}°`
        : "—";
      const tiStr = result.ti_tiu !== null
        ? `${result.ti_tiu.toFixed(0)} tiu`
        : "no data";

      const elevSource = sources.elevation ?? "usgs-gale-dem-1m-v3";
      const slopeSource = sources.slope ?? "usgs-gale-dem-1m-v3";
      const tiSource = sources.ti ?? "themis-ti-100m";

      popoverEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2e3846; padding-bottom:6px;">
          <span style="font-weight:600; color:var(--color-accent,#4cc9f0);">[ POINT INSPECTION ]</span>
          <button type="button" aria-label="Close" class="inspector-close-btn" style="background:none; border:none; color:#e8edf2; cursor:pointer; font-size:14px;">✕</button>
        </div>
        <div style="margin-bottom:8px; font-size:11px; color:#9ca3af;">
          ${latStr}, ${lonStr}
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">ELEVATION</span>
            <span data-provenance="modelled" data-source-id="${elevSource}" style="font-weight:600;">${elevStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">SLOPE (P90)</span>
            <span data-provenance="derived" data-source-id="${slopeSource}" style="font-weight:600;">${slopeStr}</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#9ca3af;">THERMAL INERTIA</span>
            <span data-provenance="derived" data-source-id="${tiSource}" style="font-weight:600;">${tiStr}</span>
          </div>
        </div>
        ${
          !result.passable && result.reason
            ? `<div style="margin-top:8px; padding:4px 6px; background:rgba(255,77,77,0.15); border:1px solid #ff4d4d; color:#ff4d4d; border-radius:3px; font-size:11px;">
                HAZARD: ${result.reason}
              </div>`
            : ""
        }
      `;
    }

    const closeBtn = popoverEl.querySelector(".inspector-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
    }

    container.appendChild(popoverEl);
    isCurrentlyOpen = true;
  }

  return {
    inspectAt,

    close,

    isOpen(): boolean {
      return isCurrentlyOpen;
    },

    destroy(): void {
      document.removeEventListener("keydown", handleKeydown);
      close();
    },
  };
}
