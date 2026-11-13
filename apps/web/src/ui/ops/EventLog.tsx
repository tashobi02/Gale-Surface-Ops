/**
 * Event Log view on ops console (docs/specs/04 §E.4 SCR-11; 05 LogEvent; 01 FR-46).
 * Implemented by TASK-27 (T27.04, Ridita Alam).
 *
 * Rules:
 * - Displays events in monotonic seq order with their sim time (05 §C.2, FR-46).
 * - Research pattern P2: module label [ HAB CORE /// EVENT LOG ] (04 §E.4).
 * - Displays sim time (HH:MM:SS), seq number, actor, kind, event summary, and provenance chip.
 * - A field the event does not carry reads "—" (04 §D.1); the provenance chip shows the classes in the event's own
 *   provenance map, or "—" when it has none. Nothing is filled in from defaults.
 * - Filter by event kind category: ALL, ALERTS, CREW, TASKS, VEHICLES, LINK, SYSTEM.
 * - Copy button allows copying formatted event log to clipboard.
 * - Adheres to OPS dark mode palette (panel, raised, edge, hairline, text-1/2/3); no brand orange.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { LogEvent, LogEventKind, Provenance } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useEvents } from "../../state/habSession";
import { PROVENANCE_GLYPHS, UNAVAILABLE, provAttrs, unavailableOf } from "../components/provenance";

/** A data field as text, or "—" when the event does not carry it. */
function field(v: unknown): string {
  if (v === null || v === undefined) return UNAVAILABLE;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : UNAVAILABLE;
  if (typeof v === "string") return v.trim().length > 0 ? v : UNAVAILABLE;
  return UNAVAILABLE;
}

function readEventProvenance(event: LogEvent, key: string): Provenance | null {
  const map = event.provenance;
  if (!map || !Object.hasOwn(map, key)) return null;
  const prov = map[key];
  return typeof prov === "string" && Object.hasOwn(PROVENANCE_GLYPHS, prov) ? (prov as Provenance) : null;
}

/** Event envelope and metadata cells default to `simulated` unless `event.provenance` overrides the path. */
function eventAttrs(event: LogEvent, path: string, present = true): ReturnType<typeof provAttrs> {
  const source = `event:${event.kind}/${field(event.seq)}/${path}`;
  const prov = readEventProvenance(event, path) ?? "simulated";
  return provAttrs(present ? { prov, src: source } : unavailableOf(prov, source));
}

interface SummaryValue {
  text: string;
  attrs: ReturnType<typeof provAttrs>;
}

interface EventSummary {
  /** The cell names this value; other values retain their own annotations (05 LogEvent: field path → class). */
  primary: SummaryValue;
  parts: (string | SummaryValue)[];
}

export type EventCategory = "ALL" | "ALERTS" | "CREW" | "TASKS" | "VEHICLES" | "LINK" | "SYSTEM";

/** FD-295: an interface paging limit, never a mission/science value. */
export const EVENT_LOG_PAGE_SIZE = 100;

export interface EventLogProps {
  /** Array of LogEvents to display. If omitted and `client` is provided, reads from client. */
  events?: LogEvent[];
  /** Optional HabClient connection; subscribes to store events when `events` prop is omitted. */
  client?: HabClient | null;
  /** Maximum height of the scrollable events list (defaults to 240px). */
  maxHeight?: number | string;
  /** Initial filter category (defaults to "ALL"). */
  initialCategory?: EventCategory;
  /** Additional CSS class names. */
  className?: string;
  /** Optional callback fired when an event row is clicked (e.g. to frame on map). */
  onSelectEvent?: (event: LogEvent) => void;
}

/** Formats an ISO UTC sim_time string into mission time HH:MM:SS. */
export function formatSimTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return UNAVAILABLE;
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return UNAVAILABLE;
  }
}

/** Maps LogEvent kinds into high-level categories for filtering. */
export function categorizeEvent(kind: LogEventKind): EventCategory {
  switch (kind) {
    case "ALERT_RAISED":
    case "ALERT_ACKED":
    case "ALERT_CLEARED":
    case "OPTIONS_PROPOSED":
      return "ALERTS";
    case "EVA_STARTED":
    case "ARRIVED_STOP":
    case "LEFT_STOP":
    case "CREW_SHELTERED":
    case "CREW_MOTION_SET":
    case "EVA_ENDED":
      return "CREW";
    case "TASK_ADDED":
    case "TASK_UPDATED":
    case "TASK_DROPPED":
      return "TASKS";
    case "VEHICLE_DISPATCHED":
    case "VEHICLE_ARRIVED":
      return "VEHICLES";
    case "LINK_LOST":
    case "LINK_RESTORED":
    case "EARTH_MSG_QUEUED":
    case "EARTH_MSG_DELIVERED":
      return "LINK";
    case "SESSION_LOADED":
    case "CLOCK_CHANGED":
    case "PLAN_REVISED":
    case "COMMAND_REJECTED":
    default:
      return "SYSTEM";
  }
}

/** A sim-time field as HH:MM:SS, or "—" when absent or not a valid time. */
function simClock(v: unknown): string {
  return typeof v === "string" ? formatSimTime(v) : UNAVAILABLE;
}

/** Text and DOM rendering share these parts, so each displayed value names its own field (FR-15, NFR-05). */
function eventSummary(event: LogEvent): EventSummary {
  const d = (event.data ?? {}) as Record<string, unknown>;
  const value = (key: string, text = field(d[key]), fallback: Provenance = "simulated", missingFallback: Provenance | null = fallback): SummaryValue => {
    const path = `data.${key}`;
    const source = `event:${event.kind}/${field(event.seq)}/${path}`;
    const fromMap = readEventProvenance(event, path);
    const attrs = text === UNAVAILABLE
      ? provAttrs(unavailableOf(fromMap ?? missingFallback, source))
      : provAttrs({ prov: fromMap ?? fallback, src: source });
    return { text, attrs };
  };
  const summary = (primary: SummaryValue, ...parts: (string | SummaryValue)[]): EventSummary => ({ primary, parts });

  switch (event.kind) {
    case "SESSION_LOADED": {
      const scenario = value("scenario_id");
      return summary(scenario, "Session loaded: ", scenario);
    }
    case "CLOCK_CHANGED": {
      const speed = value("speed", typeof d.speed === "number" && Number.isFinite(d.speed) ? `${d.speed}x` : UNAVAILABLE);
      return summary(speed, "Clock speed ", speed, ...(d.paused === true ? [value("paused", " (paused)")] : []));
    }
    case "EVA_STARTED": {
      const crew = value("crew_ids", Array.isArray(d.crew_ids) && d.crew_ids.length > 0 ? d.crew_ids.map(String).join(", ") : UNAVAILABLE);
      return summary(crew, "EVA started with crew ", crew);
    }
    case "ARRIVED_STOP":
    case "LEFT_STOP": {
      const stop = value("stop_id");
      return summary(stop, value("crew_id"), event.kind === "ARRIVED_STOP" ? " arrived " : " departed ", stop);
    }
    case "ALERT_RAISED": {
      const message = value(field(d.message) !== UNAVAILABLE ? "message" : "code");
      return summary(message, message);
    }
    case "ALERT_ACKED": {
      const alert = value("alert_id");
      const actor = d.acked_by == null ? { text: field(event.actor), attrs: eventAttrs(event, "actor", field(event.actor) !== UNAVAILABLE) } : value("acked_by");
      return summary(alert, "Alert ", alert, " acknowledged by ", actor);
    }
    case "ALERT_CLEARED": {
      const alert = value("alert_id");
      return summary(alert, "Alert ", alert, " cleared");
    }
    case "OPTIONS_PROPOSED": {
      // This displays the number of session objects, not their modelled ETA/dose/rendezvous contents.
      // Treat it like the simulated session event count; no option-content class can reclassify it.
      // TODO(decision): 05 LogEvent specifies `options`, but no class for its count. Confirm this session-count convention.
      const text = Array.isArray(d.options) ? String(d.options.length) : UNAVAILABLE;
      const source = `event:${event.kind}/${field(event.seq)}/data.options`;
      const count = { text, attrs: provAttrs(text === UNAVAILABLE ? unavailableOf("simulated", source) : { prov: "simulated", src: source }) };
      return summary(count, count, " contingency options proposed");
    }
    case "PLAN_REVISED": {
      const revision = value("plan_revision");
      return summary(revision, "Plan revised to Rev ", revision);
    }
    case "VEHICLE_DISPATCHED":
    case "VEHICLE_ARRIVED": {
      const vehicle = value("vehicle_id");
      return summary(vehicle, "Vehicle ", vehicle, event.kind === "VEHICLE_DISPATCHED" ? " dispatched" : " arrived at destination");
    }
    case "CREW_SHELTERED": {
      const haven = value("haven_kind");
      return summary(haven, value("crew_id"), " sheltered in ", haven);
    }
    case "CREW_MOTION_SET": {
      const motion = value("motion", d.motion === "HOLD" ? "held" : "resumed");
      return summary(motion, value("crew_id"), " ", motion, " (simulation control)");
    }
    case "TASK_ADDED": {
      // 05 StopTask: task text is team-authored (`assumed`); an id fallback is a session identifier.
      const task = field(d.text) !== UNAVAILABLE ? value("text", field(d.text), "assumed", null)
        : field(d.task_id) !== UNAVAILABLE ? value("task_id") : value("text", UNAVAILABLE, "assumed", null);
      return summary(task, "Task added: ", task);
    }
    case "TASK_UPDATED": {
      const state = value("state");
      return summary(state, "Task ", value("task_id"), " marked ", state, ...(d.reason ? [" (", value("reason", String(d.reason)), ")"] : []));
    }
    case "TASK_DROPPED": {
      // 05 TASK_DROPPED carries the plan revision that dropped it, not a free-text reason.
      const revision = value("plan_revision");
      return summary(revision, "Task ", value("task_id"), " dropped at plan revision ", revision);
    }
    case "LINK_LOST":
    case "LINK_RESTORED": {
      const node = value("node_id");
      return summary(node, event.kind === "LINK_LOST" ? "Link lost: " : "Link restored: ", node);
    }
    case "COMMAND_REJECTED": {
      const code = value("code");
      return summary(code, "Command rejected: ", code, " (", value("message"), ")");
    }
    case "EARTH_MSG_QUEUED":
    case "EARTH_MSG_DELIVERED": {
      const message = value("message_id");
      return summary(message, event.kind === "EARTH_MSG_QUEUED" ? "Earth message queued: " : "Earth message delivered: ", message);
    }
    case "EVA_ENDED": {
      const ended = { text: "EVA completed / ended", attrs: eventAttrs(event, "kind") };
      return summary(ended, ended);
    }
    case "ROLE_TAKEN_OVER": {
      const role = value("role");
      return summary(role, "Role ", role, " connection replaced");
    }
    case "CLOCK_JUMPED": {
      const to = value("to_sim_time", simClock(d.to_sim_time));
      const reason = value("reason", d.reason === "next_stop" ? "next stop" : field(d.reason));
      return summary(to, "Clock jumped to ", reason, " ", value("stop_id"), ": ", value("from_sim_time", simClock(d.from_sim_time)), " → ", to, ", ended by ", value("ended_by"));
    }
    case "EVENT_STARTED": {
      // 01 FR-52 / 05 EventLibraryEntry: the press is simulated; the historical series metadata is replayed.
      const press = value("t0_sim_time", simClock(d.t0_sim_time));
      return summary(press, "Event ", value("event_id"), " started at ", press, " (series from ",
        value("series_start_utc", field(d.series_start_utc), "replayed", null), ", source ", value("source_id", field(d.source_id), "replayed", null), ")");
    }
    case "SESSION_RESET": {
      const session = value("session_id");
      return summary(session, "Session ", session, " reset; next session ", value("next_session_id"));
    }
    case "SITE_SELECTED": {
      const candidate = value("candidate_id");
      return summary(candidate, "Site candidate ", candidate, " selected");
    }
    case "MISSION_SETUP_SET": {
      // 01 provenance classes: assumed = a parameter we chose; 05 MissionScenario: all defaults are assumed (SCR-20).
      // Partial<MissionSetup>: only the keys set, in event order; null vehicle_param_set means none.
      const settings = Object.entries(d).map(([key, v]) => {
        const setting = value(key, typeof v === "boolean" ? (v ? "yes" : "no") : v === null && key === "vehicle_param_set" ? "none" : field(v), "assumed", null);
        return { ...setting, text: `${key} ${setting.text}` };
      });
      if (settings.length === 0) {
        const missing = value("crew_count", UNAVAILABLE, "assumed", null);
        return summary(missing, "Mission setup set: ", missing);
      }
      return summary(settings[0]!, "Mission setup set: ", ...settings.flatMap((setting, index) => index === 0 ? [setting] : [", ", setting]));
    }
    default: {
      const kind = { text: `${event.kind}`, attrs: eventAttrs(event, "kind") };
      return summary(kind, kind);
    }
  }
}

/** Converts the same individually attributed parts to plain text for the clipboard. */
export function summarizeEvent(event: LogEvent): string {
  return eventSummary(event).parts.map((part) => typeof part === "string" ? part : part.text).join("");
}

/** Glyph for a provenance class (04 §C.1); "—" for a class that is not known (never another class's glyph). */
export function provenanceGlyph(prov?: Provenance | string): string {
  return prov !== undefined && Object.hasOwn(PROVENANCE_GLYPHS, prov) ? PROVENANCE_GLYPHS[prov as Provenance] : UNAVAILABLE;
}

/** Severity shape + word for an alert row (04 §A.3 #2); only ALERT_RAISED carries a level. */
function severityOf(ev: LogEvent): { shape: string; word: string } | null {
  if (ev.kind !== "ALERT_RAISED") return null;
  const level = (ev.data as { level?: string } | undefined)?.level;
  if (level === "warning") return { shape: "⬣", word: "WARNING" };
  if (level === "caution") return { shape: "▲", word: "CAUTION" };
  if (level === "advisory") return { shape: "◆", word: "ADVISORY" };
  return null;
}

/** The distinct classes in an event's provenance map, with the field paths that carry each. */
function provenanceClasses(ev: LogEvent): { prov: Provenance; fields: string[] }[] {
  const byClass = new Map<Provenance, string[]>();
  for (const [path, prov] of Object.entries(ev.provenance ?? {})) {
    if (typeof prov !== "string" || !Object.hasOwn(PROVENANCE_GLYPHS, prov)) continue;
    byClass.set(prov, [...(byClass.get(prov) ?? []), path]);
  }
  return [...byClass].map(([prov, fields]) => ({ prov, fields }));
}

export function EventLog({
  events: propEvents,
  client,
  maxHeight = "240px",
  initialCategory = "ALL",
  className = "",
  onSelectEvent,
}: EventLogProps): ReactElement {
  const clientEvents = useEvents(client);

  const rawEvents = propEvents ?? clientEvents;

  // Always keep in monotonic seq order (Acceptance criteria)
  const sortedEvents = useMemo(() => {
    return [...rawEvents].sort((a, b) => a.seq - b.seq);
  }, [rawEvents]);

  const [filter, setFilter] = useState<EventCategory>(initialCategory);
  const [visibleCount, setVisibleCount] = useState(EVENT_LOG_PAGE_SIZE);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const filteredEvents = useMemo(() => {
    if (filter === "ALL") return sortedEvents;
    return sortedEvents.filter((e) => categorizeEvent(e.kind) === filter);
  }, [sortedEvents, filter]);
  const visibleEvents = filteredEvents.slice(-visibleCount);

  const handleCopyLog = async (): Promise<void> => {
    const text = filteredEvents
      .map(
        (e) =>
          `[${formatSimTime(e.sim_time)}] #${e.seq} (${e.actor}) ${e.kind}: ${summarizeEvent(e)}`,
      )
      .join("\n");
    // Report what happened: "copied" only after the write resolved, "failed" when there is no clipboard or it refused.
    let next: "copied" | "failed" = "copied";
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setCopyState(next);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2000);
  };

  const categories: EventCategory[] = ["ALL", "ALERTS", "CREW", "TASKS", "VEHICLES", "LINK", "SYSTEM"];

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    backgroundColor: "var(--panel, #14181D)",
    border: "1px solid var(--hairline, #2A313A)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    color: "var(--text-1, #ECEFF2)",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    backgroundColor: "var(--raised, #1C2128)",
    borderBottom: "1px solid var(--hairline, #2A313A)",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "11px",
    letterSpacing: "0.04em",
  };

  const filterBarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px 12px",
    backgroundColor: "var(--void, #0B0D10)",
    borderBottom: "1px solid var(--hairline, #2A313A)",
    overflowX: "auto",
  };

  const listStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    maxHeight,
    padding: "4px 0",
    backgroundColor: "var(--panel, #14181D)",
  };

  return (
    <section
      role="region"
      aria-label="Event log"
      data-slot="event-log"
      style={containerStyle}
      className={`panel cut cut-m event-log ${className}`}
    >
      {/* Livery stripe (04 §C.3) */}
      <div
        aria-hidden="true"
        style={{
          height: "4px",
          width: "100%",
          background: "linear-gradient(90deg, var(--text-1, #ECEFF2) 0 33%, var(--text-3, #8592A0) 33% 66%, var(--hairline, #2A313A) 66% 100%)",
        }}
      />

      {/* Header with P2 Module code and event counter */}
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="code" style={{ fontWeight: 600, color: "var(--text-1, #ECEFF2)" }}>
            [ HAB CORE /// EVENT LOG ]
          </span>
          <span data-provenance="simulated" data-source="session:events.count" style={{ color: "var(--text-3, #8592A0)" }}>
            {filteredEvents.length} / {sortedEvents.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => void handleCopyLog()}
            style={{
              padding: "2px 8px",
              background: "transparent",
              border: "1px solid var(--edge, #5C6670)",
              color: copyState === "idle" ? "var(--text-2, #A9B3BE)" : "var(--text-1, #ECEFF2)",
              fontSize: "11px",
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
            title="Copy filtered log lines to clipboard"
          >
            {copyState === "copied" ? "COPIED ✓" : copyState === "failed" ? "COPY FAILED ✕" : "COPY LOG"}
          </button>
        </div>
      </header>

      {/* Filter Category Tabs */}
      <nav aria-label="Event log filters" style={filterBarStyle}>
        {categories.map((cat) => {
          const isActive = filter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => { setFilter(cat); setVisibleCount(EVENT_LOG_PAGE_SIZE); }}
              style={{
                padding: "2px 8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--void, #0B0D10)" : "var(--text-2, #A9B3BE)",
                backgroundColor: isActive ? "var(--text-1, #ECEFF2)" : "transparent",
                border: isActive ? "1px solid var(--text-1, #ECEFF2)" : "1px solid var(--edge, #5C6670)",
                cursor: "pointer",
                borderRadius: "0px",
              }}
              aria-pressed={isActive}
            >
              {cat}
            </button>
          );
        })}
      </nav>

      {/* Scrollable event list in seq order */}
      <div style={listStyle} role="region" tabIndex={0} aria-label="Event rows">
        {filteredEvents.length > visibleCount && <button type="button" aria-label="Show earlier events" onClick={() => setVisibleCount((count) => count + EVENT_LOG_PAGE_SIZE)} style={{ minHeight: "32px", color: "var(--text-1)", background: "var(--raised)", border: "1px solid var(--edge)" }}>Show earlier events</button>}
        {filteredEvents.length === 0 ? (
          <div style={{ padding: "12px", color: "var(--text-3, #8592A0)", fontSize: "12px", textAlign: "center" }}>
            No events logged yet
          </div>
        ) : (
          visibleEvents.map((ev) => {
            const isAlert = ev.kind.startsWith("ALERT");
            const isWarning = isAlert && (ev.data as { level?: string })?.level === "warning";
            const isCaution = isAlert && (ev.data as { level?: string })?.level === "caution";
            const isAdvisory = isAlert && (ev.data as { level?: string })?.level === "advisory";
            const rowColor = isWarning
              ? "var(--warning, #FF4D4D)"
              : isCaution
                ? "var(--caution, #FFB020)"
                : isAdvisory
                  ? "var(--status-advisory, var(--advisory, #4CC9F0))"
                  : "var(--text-1, #ECEFF2)";

            // Provenance classes come from the event's own map; none = unknown (shown as "—", never a guessed class).
            const classes = provenanceClasses(ev);
            const severity = severityOf(ev);
            const summary = eventSummary(ev);
            const summaryText = summary.parts.map((part) => typeof part === "string" ? part : part.text).join("");

            return (
              <div
                key={ev.seq}
                data-seq={field(ev.seq)}
                data-kind={ev.kind}
                data-actor={ev.actor}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEvent?.(ev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectEvent?.(ev);
                  }
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "50px 72px 70px 1fr minmax(28px, auto)",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 12px",
                  borderBottom: "1px solid rgba(42, 49, 58, 0.4)",
                  fontSize: "12px",
                  fontFamily: "var(--font-ui, Inter, sans-serif)",
                  cursor: onSelectEvent ? "pointer" : "default",
                  userSelect: "text",
                }}
                className="event-row"
              >
                {/* Monotonic sequence number */}
                <span
                  {...eventAttrs(ev, "seq", field(ev.seq) !== UNAVAILABLE)}
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: "var(--text-3, #8592A0)",
                    fontSize: "11px",
                  }}
                >
                  {field(ev.seq) === UNAVAILABLE ? UNAVAILABLE : `#${ev.seq}`}
                </span>

                {/* Mission sim time */}
                <span
                  {...eventAttrs(ev, "sim_time", formatSimTime(ev.sim_time) !== UNAVAILABLE)}
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: "var(--text-2, #A9B3BE)",
                    fontSize: "11px",
                  }}
                  title={ev.sim_time}
                >
                  {formatSimTime(ev.sim_time)}
                </span>

                {/* Actor */}
                <span
                  {...eventAttrs(ev, "actor", field(ev.actor) !== UNAVAILABLE)}
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: ev.actor === "system" ? "var(--text-3, #8592A0)" : "var(--text-1, #ECEFF2)",
                    fontSize: "11px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={ev.actor}
                >
                  {field(ev.actor)}
                </span>

                {/* Event Summary */}
                <span
                  {...summary.primary.attrs}
                  style={{
                    color: rowColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.3,
                  }}
                  title={summaryText}
                >
                  {severity && <span {...eventAttrs(ev, "data.level")} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "11px" }}>{severity.shape} {severity.word} </span>}
                  {summary.parts.map((part, index) => typeof part === "string" ? part : <span key={index} {...part.attrs}>{part.text}</span>)}
                </span>

                {/* Provenance chip: one glyph per class in the event's provenance map, or "—" */}
                <span
                  data-slot="event-provenance"
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: "var(--text-3, #8592A0)",
                    fontSize: "12px",
                    textAlign: "right",
                    display: "inline-flex",
                    justifyContent: "flex-end",
                    gap: "4px",
                  }}
                >
                  {classes.length === 0 ? (
                    <span {...provAttrs(unavailableOf(null, "event_log.provenance"))}>{UNAVAILABLE}</span>
                  ) : (
                    classes.map(({ prov, fields }) => (
                      <span key={prov} {...provAttrs({ prov, src: `event:${ev.seq}:${fields.join(",")}` })}>
                        {provenanceGlyph(prov)}
                      </span>
                    ))
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
