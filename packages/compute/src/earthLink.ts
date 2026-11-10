/**
 * Earth link delivery rule from precomputed SPICE tables (docs/specs/02 §D.12; FR-43).
 * Simplified DTN model: store-and-forward at the hab or orbiter relay.
 * Mars → Earth: t_deliver = next_pass_start(t_send) + light_time.
 * Earth → Mars: t_deliver = next_pass_start(t_send_earth + light_time).
 * TASK-05b.
 */
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";

/** Minimum Earth elevation in degrees for Direct-to-Earth communication (02 §D.12). */
export const DTE_MIN_ELEV_DEG = 10;

export interface RelayPassFinding {
  start_utc: string;
  end_utc: string;
  orbiter: "mro" | "maven" | "tgo";
}

export interface EarthDeliveryResult {
  deliver_utc: string;
  via: "mro" | "maven" | "tgo" | "dte";
  light_time_s: number;
}

/**
 * Returns the currently active pass at t_utc (start_utc <= t < end_utc), or null if between passes.
 */
export function activePass(table: EarthLinkTable, t_utc: string): RelayPassFinding | null {
  const t = Date.parse(t_utc);
  for (const pass of table.passes) {
    const s = Date.parse(pass.start_utc);
    const e = Date.parse(pass.end_utc);
    if (s <= t && t < e) {
      return { start_utc: pass.start_utc, end_utc: pass.end_utc, orbiter: pass.orbiter };
    }
  }
  return null;
}

/** Row at or before t (binary search on 60 s rows). Null before the first row. TASK-05b. */
export function linkAt(table: EarthLinkTable, t_utc: string): EarthLinkTable["rows"][number] | null {
  if (!table.rows || table.rows.length === 0) return null;
  const t = Date.parse(t_utc);
  const first = Date.parse(table.rows[0].t_utc);
  if (t < first) return null;

  let low = 0;
  let high = table.rows.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midT = Date.parse(table.rows[mid].t_utc);
    if (midT <= t) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return table.rows[best];
}

/** Start of the first relay pass at or after t, or null if none in the table. TASK-05b. */
export function nextPassStart(table: EarthLinkTable, t_utc: string): RelayPassFinding | null {
  const t = Date.parse(t_utc);
  let best: { pass: typeof table.passes[number]; start: number } | null = null;
  for (const pass of table.passes) {
    const s = Date.parse(pass.start_utc);
    if (s >= t) {
      if (!best || s < best.start) {
        best = { pass, start: s };
      }
    }
  }
  if (!best) return null;
  return { start_utc: best.pass.start_utc, end_utc: best.pass.end_utc, orbiter: best.pass.orbiter };
}

/** True when the Sun–Earth–Mars angle is below `link.conjunction_deg`. TASK-05b. */
export function inConjunction(table: EarthLinkTable, t_utc: string, params: ParamSet): boolean {
  const row = linkAt(table, t_utc);
  if (!row) return false;
  const threshold = Number(params.values?.conjunction_deg ?? 3);
  return row.sep_angle_deg < threshold;
}

/**
 * Delivery time for a message, or null during conjunction blackout or if no pass exists.
 * Simplified DTN model (02 §D.12).
 * For "to_mars", `t_send_utc` is the Earth send time (sent_earth_utc).
 * TASK-05b.
 */
export function deliveryTime(
  table: EarthLinkTable,
  direction: "to_earth" | "to_mars",
  t_send_utc: string,
  params: ParamSet,
): EarthDeliveryResult | null {
  const sendMs = Date.parse(t_send_utc);
  if (Number.isNaN(sendMs)) {
    throw new RangeError(`Invalid send time: ${t_send_utc}`);
  }

  const dteEnabled = Boolean(params.values?.dte_enabled);

  if (direction === "to_earth") {
    if (inConjunction(table, t_send_utc, params)) return null;
    const sendRow = linkAt(table, t_send_utc);
    if (!sendRow) return null;

    const lt_s = sendRow.light_time_s;

    if (dteEnabled && sendRow.earth_elev_deg >= DTE_MIN_ELEV_DEG) {
      const deliverMs = sendMs + Math.round(lt_s * 1000);
      return {
        deliver_utc: new Date(deliverMs).toISOString(),
        via: "dte",
        light_time_s: lt_s,
      };
    }

    const active = activePass(table, t_send_utc);
    if (active) {
      const deliverMs = sendMs + Math.round(lt_s * 1000);
      return {
        deliver_utc: new Date(deliverMs).toISOString(),
        via: active.orbiter,
        light_time_s: lt_s,
      };
    }

    const next = nextPassStart(table, t_send_utc);
    if (!next) return null;

    const nextRow = linkAt(table, next.start_utc);
    const passLt_s = nextRow ? nextRow.light_time_s : lt_s;
    const deliverMs = Date.parse(next.start_utc) + Math.round(passLt_s * 1000);
    return {
      deliver_utc: new Date(deliverMs).toISOString(),
      via: next.orbiter,
      light_time_s: passLt_s,
    };
  }

  // direction === "to_mars"
  // For to_mars, t_send_utc is the Earth send time (sent_earth_utc).
  const sendRow = linkAt(table, t_send_utc);
  if (!sendRow) return null;
  const lt_s = sendRow.light_time_s;

  const arriveMarsMs = sendMs + Math.round(lt_s * 1000);
  const arriveMarsUtc = new Date(arriveMarsMs).toISOString();

  if (inConjunction(table, arriveMarsUtc, params)) return null;

  const arriveRow = linkAt(table, arriveMarsUtc) ?? sendRow;

  if (dteEnabled && arriveRow.earth_elev_deg >= DTE_MIN_ELEV_DEG) {
    return {
      deliver_utc: arriveMarsUtc,
      via: "dte",
      light_time_s: lt_s,
    };
  }

  const active = activePass(table, arriveMarsUtc);
  if (active) {
    return {
      deliver_utc: arriveMarsUtc,
      via: active.orbiter,
      light_time_s: lt_s,
    };
  }

  const next = nextPassStart(table, arriveMarsUtc);
  if (!next) return null;

  return {
    deliver_utc: new Date(Date.parse(next.start_utc)).toISOString(),
    via: next.orbiter,
    light_time_s: lt_s,
  };
}
