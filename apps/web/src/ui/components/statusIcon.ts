/**
 * Status icons strictly representing operational state (docs/specs/04 §A.3, §C.1; 01 FR-08, FR-10).
 * Implemented by TASK-13 (T13.05, Ridita Alam).
 *
 * Rules (04 §A.3.2, §C.1):
 * - Every status combines four cues: colour + shape + word + fixed position.
 * - Never colour alone (colour-blind and grayscale safe).
 * - ok / nominal:   ✓ circle,   solid pattern,   "OK" / "NOMINAL"
 * - caution:        ▲ triangle, diagonal hatch,  "CAUTION"
 * - blocked / warn: octagon,    cross-hatch,     "BLOCKED" / "WARNING" (drawn as an SVG polygon: U+2B23 is a hexagon, FD-208)
 * - unknown:        ? diamond,  dotted pattern,  "UNKNOWN"
 * - advisory:       ◆ diamond,  dotted pattern,  "ADVISORY" (Proposed)
 * - The icon glyph is aria-hidden="true" when the status word is shown as text.
 * - role="status" is placed ONLY on live indicators (options.live === true), not on static icons.
 * - Icon-only (showWord=false) static indicators carry role="img" with the word as aria-label.
 */

import { createElement, type ReactElement } from "react";
import { octagonPointsAttr } from "./patterns";

/** Operational status kinds from contract C10 / T07.01 stub. */
export type OperationalStatus = "ok" | "caution" | "blocked" | "unknown";

/** Extended status kinds including v2 alert vocabulary (04 §C.1). */
export type ExtendedStatus = OperationalStatus | "nominal" | "warning" | "advisory";

/**
 * Text shape tokens for each status level (04 §C.1), for text-only contexts. Warning and blocked are drawn as an SVG octagon
 * by `StatusIcon` and `renderStatusIcon` (FD-208); U+2BC3 is the octagon codepoint, not the hexagon U+2B23.
 */
export const STATUS_GLYPHS: Record<ExtendedStatus, string> = {
  ok: "✓",
  nominal: "✓",
  caution: "▲",
  blocked: "⯃",
  warning: "⯃",
  unknown: "?",
  advisory: "◆",
};

/** Canonical uppercase status words (04 §A.3 #2, §C.1). */
export const STATUS_WORDS: Record<ExtendedStatus, string> = {
  ok: "OK",
  nominal: "NOMINAL",
  caution: "CAUTION",
  blocked: "BLOCKED",
  warning: "WARNING",
  unknown: "UNKNOWN",
  advisory: "ADVISORY",
};

/** Normalized CSS status class suffix for pattern classes (.status-*). */
export function normalizeStatusClass(status: ExtendedStatus): "nominal" | "caution" | "warning" | "unknown" | "advisory" {
  switch (status) {
    case "ok":
    case "nominal":
      return "nominal";
    case "caution":
      return "caution";
    case "blocked":
    case "warning":
      return "warning";
    case "advisory":
      return "advisory";
    case "unknown":
    default:
      return "unknown";
  }
}

/** Statuses whose shape is a drawn octagon instead of a text character (04 §C.1, FD-208). */
export function hasDrawnShape(status: ExtendedStatus): boolean {
  return normalizeStatusClass(status) === "warning";
}

const SVG_NS = "http://www.w3.org/2000/svg";
const OCTAGON_VIEWBOX = `0 0 100 100`;

/** The octagon as a DOM node; its box comes from the glyph's token-sized box (patterns.css `.status-glyph svg`). */
function octagonElement(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", OCTAGON_VIEWBOX);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute("points", octagonPointsAttr());
  svg.appendChild(polygon);
  return svg;
}

/** The octagon as a React element; same markup as `octagonElement`. */
function octagonReact(): ReactElement {
  return createElement(
    "svg",
    { viewBox: OCTAGON_VIEWBOX, "aria-hidden": "true", focusable: "false" },
    createElement("polygon", { points: octagonPointsAttr() }),
  );
}

export interface StatusIconOptions {
  /** Explicit word label override; defaults to STATUS_WORDS[status]. */
  word?: string;
  /** Whether to show the text label beside the icon glyph (defaults to true). */
  showWord?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /** Whether this is a live dynamic indicator (sets role="status" only when true). */
  live?: boolean;
}

/**
 * Creates and returns an HTMLElement with icon + pattern + text (04 §C.1).
 * Preserves the exact T07.01 stub signature for consumers.
 */
export function renderStatusIcon(status: ExtendedStatus, options?: StatusIconOptions): HTMLElement {
  const normalized = normalizeStatusClass(status);
  const glyph = STATUS_GLYPHS[status] ?? "?";
  const word = options?.word ?? STATUS_WORDS[status] ?? String(status).toUpperCase();
  const showWord = options?.showWord ?? true;
  const extraClass = options?.className ? ` ${options.className}` : "";
  const live = options?.live ?? false;

  if (typeof document === "undefined") {
    // No hand-written stand-in: tests use jsdom (tests/ui/domHarness.ts) so the real branch below is what runs.
    throw new Error("renderStatusIcon needs a DOM document; use the StatusIcon React component for server rendering");
  }

  const container = document.createElement("span");
  container.className = `status-indicator status-${status} status-${normalized}${extraClass}`;
  if (live) {
    container.setAttribute("role", "status");
  } else if (!showWord) {
    // An aria-label on a role-less span is not reliably announced; icon-only is an image with a name.
    container.setAttribute("role", "img");
  }
  container.setAttribute("data-status", status);

  // Icon glyph: aria-hidden when text word is visible (04 §E)
  const glyphSpan = document.createElement("span");
  glyphSpan.className = "status-glyph";
  glyphSpan.setAttribute("aria-hidden", showWord ? "true" : "false");
  if (hasDrawnShape(status)) glyphSpan.appendChild(octagonElement());
  else glyphSpan.textContent = glyph;
  container.appendChild(glyphSpan);

  // Status word text
  if (showWord) {
    const labelSpan = document.createElement("span");
    labelSpan.className = "status-label";
    labelSpan.textContent = word;
    container.appendChild(labelSpan);
  } else {
    container.setAttribute("aria-label", word);
  }

  return container;
}

export interface StatusIconProps {
  status: ExtendedStatus;
  showWord?: boolean;
  word?: string;
  className?: string;
  /** Whether this is a live dynamic indicator (sets role="status" only when true). */
  live?: boolean;
}

/**
 * React StatusIcon component (ADR-012, 04 §C.1, §G).
 * Renders the 4-cue accessible indicator (colour + shape + word + fixed pattern).
 */
export function StatusIcon({
  status,
  showWord = true,
  word,
  className = "",
  live = false,
}: StatusIconProps): ReactElement {
  const normalized = normalizeStatusClass(status);
  const glyph = STATUS_GLYPHS[status] ?? "?";
  const displayWord = word ?? STATUS_WORDS[status] ?? String(status).toUpperCase();

  return createElement(
    "span",
    {
      className: `status-indicator status-${status} status-${normalized} ${className}`.trim(),
      role: live ? "status" : showWord ? undefined : "img",
      "data-status": status,
      "aria-label": showWord ? undefined : displayWord,
    },
    createElement(
      "span",
      {
        className: "status-glyph",
        "aria-hidden": showWord ? "true" : "false",
      },
      hasDrawnShape(status) ? octagonReact() : glyph,
    ),
    showWord
      ? createElement(
          "span",
          {
            className: "status-label",
          },
          displayWord,
        )
      : null,
  );
}
