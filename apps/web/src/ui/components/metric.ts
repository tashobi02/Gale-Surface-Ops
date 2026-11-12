/**
 * Standard metric display with the provenance label and source id on the value (FR-15, NFR-05; 04 §A.3 #8, §C.1, §D.1).
 * Implemented by T12.01 (React component, C10 v2; FD-058 moves SCR-05's tiles onto it, FD-106 names the attribute).
 *
 * The value element always carries `data-provenance` (the field's class, when known) and `data-source`, through
 * `provAttrs`. A value we do not have renders "—" with `data-unavailable="true"` and an `unavailable:<source>` source
 * (04 §D.1), keeps the field's own class, and shows no unit and no chip beside the dash. A number is formatted by its
 * unit with `format.ts` (FD-124); a string is shown as given. The chip is the glyph and class word, or the glyph alone on
 * EVA and HUD (04 §C.1, `chip="glyph"`). It is a `.ts` file on purpose (no JSX), so the C10 stub path stays valid.
 */
import { createElement, type ReactElement } from "react";
import { DASH, THIN_SPACE, formatNumber, isFormatUnit } from "./format";
import { PROVENANCE_GLYPHS, isUsableValue, provAttrs, unavailableOf, type Sourced } from "./provenance";
import "./metric.css";

export interface MetricProps extends Sourced {
  /** `null` = no value: rendered "—" and flagged unavailable. */
  value: number | string | null;
  /** Shown beside the value, attached with a thin space; a number is formatted by it when it is in `format.ts`. */
  unit?: string;
  label?: string;
  /** `full` (default): glyph and class word; `glyph`: the glyph alone, for EVA and HUD (04 §C.1). */
  chip?: "full" | "glyph";
  className?: string;
}

/** What to show for `value`, and whether it is a value at all. */
function shownText(value: MetricProps["value"], unit: string | undefined): string | null {
  if (!isUsableValue(value)) return null;
  if (typeof value === "number") return unit !== undefined && isFormatUnit(unit) ? formatNumber(value, unit) : String(value);
  return value;
}

export function Metric(props: MetricProps): ReactElement {
  const { value, unit, label, chip = "full", className, prov, src } = props;
  const text = shownText(value, unit);
  const missing = text === null || props.unavailable === true;
  const sourced: Sourced = missing
    ? props.unavailable && src.startsWith("unavailable:")
      ? { prov, src, unavailable: true }
      : unavailableOf(prov, src)
    : { prov, src };

  const line = createElement(
    "span",
    { key: "line", className: "metric-line" },
    createElement("span", { key: "value", className: "metric-value", ...provAttrs(sourced) }, missing ? DASH : text),
    !missing && unit ? createElement("span", { key: "unit", className: "metric-unit" }, `${THIN_SPACE}${unit}`) : null,
    !missing && prov
      ? createElement(
          "span",
          {
            key: "chip",
            className: "metric-chip",
            ...provAttrs(sourced),
            ...(chip === "glyph" ? { role: "img", "aria-label": prov.toUpperCase() } : {}),
          },
          chip === "glyph" ? PROVENANCE_GLYPHS[prov] : `${PROVENANCE_GLYPHS[prov]} ${prov.toUpperCase()}`,
        )
      : null,
  );

  return createElement(
    "span",
    { className: `metric${className ? ` ${className}` : ""}`, ...(missing ? { "data-unavailable": "true" } : {}) },
    label ? createElement("span", { key: "label", className: "metric-label" }, label) : null,
    line,
  );
}
