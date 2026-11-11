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

/** Epoch ms of an ISO time, or RangeError naming `what`: a NaN must never read as "no row" or "no pass". */
function parseUtc(t_utc: string, what: string): number {
  const v = Date.parse(t_utc);
  if (Number.isNaN(v)) throw new RangeError(`${what} ${JSON.stringify(t_utc)} is not a parseable ISO time`);
  return v;
}

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
 * Throws RangeError when t_utc or a pass time does not parse.
 */
export function activePass(table: EarthLinkTable, t_utc: string): RelayPassFinding | null {
  const t = parseUtc(t_utc, "t_utc");
  for (const pass of table.passes) {
    const s = parseUtc(pass.start_utc, "pass start_utc");
    const e = parseUtc(pass.end_utc, "pass end_utc");
    if (s <= t && t < e) {
      return { start_utc: pass.start_utc, end_utc: pass.end_utc, orbiter: pass.orbiter };
    }
  }
  return null;
}

/**
 * Row at or before t (binary search on 60 s rows). Null before the first row. Throws RangeError when t_utc or an
 * examined row time does not parse. TASK-05b.
 */
export function linkAt(table: EarthLinkTable, t_utc: string): EarthLinkTable["rows"][number] | null {
  const t = parseUtc(t_utc, "t_utc");
  if (!table.rows || table.rows.length === 0) return null;
  const first = parseUtc(table.rows[0].t_utc, "row t_utc");
  if (t < first) return null;

  let low = 0;
  let high = table.rows.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midT = parseUtc(table.rows[mid].t_utc, "row t_utc");
    if (midT <= t) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return table.rows[best];
}

/**
 * Start of the first relay pass at or after t, or null if none in the table. Throws RangeError when t_utc or a
 * pass start does not parse. TASK-05b.
 */
export function nextPassStart(table: EarthLinkTable, t_utc: string): RelayPassFinding | null {
  const t = parseUtc(t_utc, "t_utc");
  let best: { pass: typeof table.passes[number]; start: number } | null = null;
  for (const pass of table.passes) {
    const s = parseUtc(pass.start_utc, "pass start_utc");
    parseUtc(pass.end_utc, "pass end_utc"); // the returned finding carries it
    if (s >= t) {
      if (!best || s < best.start) {
        best = { pass, start: s };
      }
    }
  }
  if (!best) return null;
  return { start_utc: best.pass.start_utc, end_utc: best.pass.end_utc, orbiter: best.pass.orbiter };
}

/**
 * `link.conjunction_deg` in degrees. No fallback (02 §D.12 says 3°, Assumed, and that value lives only in the
 * ParamSet): a missing, non-numeric, non-finite or negative value throws RangeError.
 */
function conjunctionThresholdDeg(params: ParamSet): number {
  const v = params.values?.conjunction_deg;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new RangeError(
      `ParamSet ${params.param_set_id}: conjunction_deg must be a finite non-negative number of degrees, got ${String(v)}`,
    );
  }
  return v;
}

/**
 * True when the Sun–Earth–Mars angle is below `link.conjunction_deg` (strictly below). False before the first
 * table row. Throws RangeError when the ParamSet has no valid `conjunction_deg`. TASK-05b.
 */
export function inConjunction(table: EarthLinkTable, t_utc: string, params: ParamSet): boolean {
  const threshold = conjunctionThresholdDeg(params);
  const row = linkAt(table, t_utc);
  if (!row) return false;
  return row.sep_angle_deg < threshold;
}

/**
 * Delivery needs a usable pass list: not empty, each pass ending at or after its start (the committed storm table has a one-sample pass with start = end at its tail), and sorted by start time.
 * Throws RangeError otherwise (a bad table must not read as "no pass, so wait forever").
 */
function assertPassesUsable(table: EarthLinkTable): void {
  if (!Array.isArray(table.passes) || table.passes.length === 0) {
    throw new RangeError("earth link table has no passes");
  }
  let prevStart = Number.NEGATIVE_INFINITY;
  table.passes.forEach((pass, i) => {
    const start = Date.parse(pass.start_utc);
    const end = Date.parse(pass.end_utc);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new RangeError(`earth link table passes[${i}] has an unparseable start_utc or end_utc`);
    }
    if (end < start) {
      throw new RangeError(`earth link table passes[${i}] ends before it starts`);
    }
    if (start < prevStart) {
      throw new RangeError(`earth link table passes are not sorted by start_utc (passes[${i}])`);
    }
    prevStart = start;
  });
}

/**
 * Delivery time for a message, or null during conjunction blackout or if no pass exists.
 * Simplified DTN model (02 §D.12). Throws RangeError for an empty or unsorted pass list, a missing
 * `conjunction_deg`, an unparseable time, or a send time before the first table row (blackout is null, not an error).
 * A message queued for a later pass is also blocked when that pass starts in conjunction (Proposed; 02 §D.12 is silent, `TODO(decision)`).
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

  assertPassesUsable(table);
  // A send time before the table is an input error, not a blackout: null is reserved for conjunction or no pass.
  if (!table.rows || table.rows.length === 0) throw new RangeError("earth link table has no rows");
  if (sendMs < parseUtc(table.rows[0].t_utc, "row t_utc")) {
    throw new RangeError(`send time ${t_send_utc} is before the first table row ${table.rows[0].t_utc}`);
  }
  const dteEnabled = params.values?.dte_enabled === true;

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
    if (inConjunction(table, next.start_utc, params)) return null;

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
  if (inConjunction(table, next.start_utc, params)) return null;

  return {
    deliver_utc: new Date(Date.parse(next.start_utc)).toISOString(),
    via: next.orbiter,
    light_time_s: lt_s,
  };
}
