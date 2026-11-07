/**
 * Status icons strictly representing operational state (docs/specs/04 §A.3, §C.1; 01 FR-08, FR-10).
 * Implemented by TASK-13 (T13.05, Ridita Alam).
 *
 * Rules (04 §A.3.2, §C.1):
 * - Every status combines four cues: colour + shape + word + fixed position.
 * - Never colour alone (colour-blind and grayscale safe).
 * - ok / nominal:   ✓ circle,   solid pattern,   "OK" / "NOMINAL"
 * - caution:        ▲ triangle, diagonal hatch,  "CAUTION"
 * - blocked / warn: ⬣ octagon,  cross-hatch,     "BLOCKED" / "WARNING"
 * - unknown:        ? diamond,  dotted pattern,  "UNKNOWN"
 * - advisory:       ◆ diamond,  dotted pattern,  "ADVISORY"
 * - The icon glyph is aria-hidden="true" when the status word is shown as text.
 */

import { createElement, type ReactElement } from "react";

/** Operational status kinds from contract C10 / T07.01 stub. */
export type OperationalStatus = "ok" | "caution" | "blocked" | "unknown";

/** Extended status kinds including v2 alert vocabulary (04 §C.1). */
export type ExtendedStatus = OperationalStatus | "nominal" | "warning" | "advisory";

/** Unicode shape glyphs representing each status level (04 §C.1). */
export const STATUS_GLYPHS: Record<ExtendedStatus, string> = {
  ok: "✓",
  nominal: "✓",
  caution: "▲",
  blocked: "⬣",
  warning: "⬣",
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

export interface StatusIconOptions {
  /** Explicit word label override; defaults to STATUS_WORDS[status]. */
  word?: string;
  /** Whether to show the text label beside the icon glyph (defaults to true). */
  showWord?: boolean;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Creates and returns an HTMLElement with icon + pattern + text (04 §C.1).
 * Preserves the exact T07.01 stub signature for consumers.
 */
export function renderStatusIcon(status: OperationalStatus, options?: StatusIconOptions): HTMLElement {
  const normalized = normalizeStatusClass(status);
  const glyph = STATUS_GLYPHS[status] ?? "?";
  const word = options?.word ?? STATUS_WORDS[status] ?? String(status).toUpperCase();
  const showWord = options?.showWord ?? true;
  const extraClass = options?.className ? ` ${options.className}` : "";

  const container = document.createElement("span");
  container.className = `status-indicator status-${status} status-${normalized}${extraClass}`;
  container.setAttribute("role", "status");
  container.setAttribute("data-status", status);

  // Icon glyph: aria-hidden when text word is visible (04 §E)
  const glyphSpan = document.createElement("span");
  glyphSpan.className = "status-glyph";
  glyphSpan.setAttribute("aria-hidden", showWord ? "true" : "false");
  glyphSpan.textContent = glyph;
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
}: StatusIconProps): ReactElement {
  const normalized = normalizeStatusClass(status);
  const glyph = STATUS_GLYPHS[status] ?? "?";
  const displayWord = word ?? STATUS_WORDS[status] ?? String(status).toUpperCase();

  return createElement(
    "span",
    {
      className: `status-indicator status-${status} status-${normalized} ${className}`.trim(),
      role: "status",
      "data-status": status,
      "aria-label": showWord ? undefined : displayWord,
    },
    createElement(
      "span",
      {
        className: "status-glyph",
        "aria-hidden": showWord ? "true" : "false",
      },
      glyph,
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

