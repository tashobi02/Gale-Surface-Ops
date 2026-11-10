/**
 * Debug diagnostics overlay (?debug=1) (NFR-11, 02 §F, 05 §E.1).
 * Implemented by T07.13.
 *
 * - When enabled (?debug=1 or options.enabled), displays:
 *     - FPS counter (rendered frame frequency)
 *     - Worker solve timings (timing_ms from the latest PlanResult)
 *     - Grid cell [i, j] under the pointer (using 05 §E.1 addressing on manifest grid)
 *     - Site data_version
 * - When not enabled, renders nothing and registers no timers or event listeners.
 * - Out of print: excluded from printing via @media print { display: none !important; }.
 */

export interface GridMetadata {
  cell_m: number;
  origin_m: [number, number]; // [origin_x, origin_y]
  width: number;
  height: number;
}

export interface GridCell {
  i: number;
  j: number;
}

export interface DebugOverlayOptions {
  enabled?: boolean;
  container?: HTMLElement;
  dataVersion?: string;
  grid?: GridMetadata;
}

export interface DebugOverlayController {
  updateTiming(timing_ms: number): void;
  updateCursor(x_m: number, y_m: number): void;
  destroy(): void;
}

/**
 * Computes grid cell index [i, j] from working-projection metres per 05 §E.1:
 * i = floor((origin_y − y) / cell)
 * j = floor((x − origin_x) / cell)
 *
 * Returns null if (x, y) lies outside grid bounds.
 */
export function computeGridCell(
  x_m: number,
  y_m: number,
  grid: GridMetadata
): GridCell | null {
  const [originX, originY] = grid.origin_m;
  const j = Math.floor((x_m - originX) / grid.cell_m);
  const i = Math.floor((originY - y_m) / grid.cell_m);

  if (i < 0 || i >= grid.height || j < 0 || j >= grid.width) {
    return null;
  }
  return { i, j };
}

/**
 * Checks whether debug diagnostics are enabled via URL parameter (?debug=1).
 */
export function isDebugParamEnabled(): boolean {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Initializes the debug overlay if enabled.
 * If not enabled, registers no timers or DOM nodes and returns null.
 */
export function initDebugOverlay(
  options: DebugOverlayOptions = {}
): DebugOverlayController | null {
  const isEnabled = options.enabled !== undefined ? options.enabled : isDebugParamEnabled();
  if (!isEnabled) {
    return null;
  }

  const container = options.container ?? document.body;
  const dataVersion = options.dataVersion ?? "unknown";
  const grid = options.grid;

  let currentFps = 60;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let rafId: number | null = null;
  let currentTimingMs: number | null = null;
  let currentCellStr = "—";

  // Create overlay element
  const overlay = document.createElement("div");
  overlay.setAttribute("data-testid", "debug-overlay");
  overlay.className = "debug-overlay no-print";
  overlay.style.cssText = [
    "position:fixed",
    "top:8px",
    "left:8px",
    "z-index:9999",
    "background:rgba(10,14,20,0.85)",
    "border:1px solid #2e3846",
    "border-radius:4px",
    "padding:6px 10px",
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
    "font-size:11px",
    "line-height:1.4",
    "color:#e8edf2",
    "pointer-events:none",
    "user-select:none",
    "@media print{display:none !important}",
  ].join(";");

  // Inject print suppression style tag if not present
  if (typeof document !== "undefined" && !document.getElementById("debug-overlay-print-style")) {
    const style = document.createElement("style");
    style.id = "debug-overlay-print-style";
    style.textContent = "@media print { .debug-overlay, [data-testid='debug-overlay'] { display: none !important; } }";
    document.head?.appendChild(style);
  }

  function render(): void {
    const timingStr = currentTimingMs !== null ? `${currentTimingMs.toFixed(1)} ms` : "—";
    overlay.innerHTML = `
      <div style="font-weight:600; color:#4cc9f0; margin-bottom:2px;">[ DIAGNOSTICS /// ?debug=1 ]</div>
      <div>FPS: <span style="font-weight:600;">${currentFps}</span></div>
      <div>Worker: <span style="font-weight:600;">${timingStr}</span></div>
      <div>Cell: <span style="font-weight:600;">${currentCellStr}</span></div>
      <div>Data: <span style="color:#9ca3af;">${dataVersion}</span></div>
    `;
  }

  render();
  container.appendChild(overlay);

  // FPS measurement loop
  function measureFps(now: number): void {
    frameCount++;
    const delta = now - lastFpsTime;
    if (delta >= 1000) {
      currentFps = Math.round((frameCount * 1000) / delta);
      frameCount = 0;
      lastFpsTime = now;
      render();
    }
    rafId = requestAnimationFrame(measureFps);
  }

  if (typeof requestAnimationFrame === "function") {
    rafId = requestAnimationFrame(measureFps);
  }

  return {
    updateTiming(timing_ms: number): void {
      currentTimingMs = timing_ms;
      render();
    },

    updateCursor(x_m: number, y_m: number): void {
      if (grid) {
        const cell = computeGridCell(x_m, y_m, grid);
        currentCellStr = cell ? `[${cell.i}, ${cell.j}]` : "outside grid";
      } else {
        currentCellStr = `${x_m.toFixed(0)}, ${y_m.toFixed(0)}`;
      }
      render();
    },

    destroy(): void {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      overlay.remove();
    },
  };
}
