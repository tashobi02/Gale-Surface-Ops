/**
 * Event Log view on ops console (docs/specs/04 §E.4 SCR-11; 05 LogEvent; 01 FR-46).
 * Implemented by TASK-27 (T27.04, Ridita Alam).
 *
 * Rules:
 * - Displays events in monotonic seq order with their sim time (05 §C.2, FR-46).
 * - Research pattern P2: module label [ HAB CORE /// EVENT LOG ] (04 §E.4).
 * - Displays sim time (HH:MM:SS), seq number, actor, kind, event summary, and provenance chip.
 * - Filter by event kind category: ALL, ALERTS, CREW, TASKS, VEHICLES, LINK, SYSTEM.
 * - Copy button allows copying formatted event log to clipboard.
 * - Adheres to OPS dark mode palette (panel, raised, edge, hairline, text-1/2/3); no brand orange.
 */

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { LogEvent, LogEventKind, Provenance } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";

export type EventCategory = "ALL" | "ALERTS" | "CREW" | "TASKS" | "VEHICLES" | "LINK" | "SYSTEM";

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
    if (isNaN(d.getTime())) return iso;
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return iso;
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

/** Converts event data into human-readable text description. */
export function summarizeEvent(event: LogEvent): string {
  const d = (event.data ?? {}) as Record<string, unknown>;

  switch (event.kind) {
    case "SESSION_LOADED":
      return `Session loaded: ${d.scenario_id ?? "scenario"}`;
    case "CLOCK_CHANGED":
      return `Clock speed ${d.speed ?? 1}x${d.paused ? " (paused)" : ""}`;
    case "EVA_STARTED":
      return `EVA started with crew ${(d.crew_ids as string[] | undefined)?.join(", ") ?? "EV1, EV2"}`;
    case "ARRIVED_STOP":
      return `${d.crew_id ?? "Crew"} arrived ${d.stop_id ?? "stop"}`;
    case "LEFT_STOP":
      return `${d.crew_id ?? "Crew"} departed ${d.stop_id ?? "stop"}`;
    case "ALERT_RAISED":
      return `${String(d.message ?? d.code ?? "Alert raised")}`;
    case "ALERT_ACKED":
      return `Alert ${d.alert_id ?? ""} acknowledged by ${d.acked_by ?? event.actor}`;
    case "ALERT_CLEARED":
      return `Alert ${d.alert_id ?? ""} cleared`;
    case "OPTIONS_PROPOSED":
      return `${(d.options as unknown[] | undefined)?.length ?? 0} contingency options proposed`;
    case "PLAN_REVISED":
      return `Plan revised to Rev ${d.plan_revision ?? 2}`;
    case "VEHICLE_DISPATCHED":
      return `Vehicle ${d.vehicle_id ?? "PR1"} dispatched`;
    case "VEHICLE_ARRIVED":
      return `Vehicle ${d.vehicle_id ?? "PR1"} arrived at destination`;
    case "CREW_SHELTERED":
      return `${d.crew_id ?? "Crew"} sheltered in ${d.haven_kind ?? "shelter"}`;
    case "TASK_ADDED":
      return `Task added: ${String(d.text ?? d.task_id ?? "")}`;
    case "TASK_UPDATED":
      return `Task ${d.task_id ?? ""} marked ${d.state ?? ""}${d.reason ? ` (${String(d.reason)})` : ""}`;
    case "TASK_DROPPED":
      return `Task ${d.task_id ?? ""} dropped: ${d.reason ?? "plan cut"}`;
    case "LINK_LOST":
      return `Link lost: ${d.node_id ?? "suit"}`;
    case "LINK_RESTORED":
      return `Link restored: ${d.node_id ?? "suit"}`;
    case "COMMAND_REJECTED":
      return `Command rejected: ${d.code ?? ""} (${d.message ?? ""})`;
    case "EARTH_MSG_QUEUED":
      return `Earth message queued: ${d.msg_id ?? ""}`;
    case "EARTH_MSG_DELIVERED":
      return `Earth message delivered: ${d.msg_id ?? ""}`;
    case "EVA_ENDED":
      return "EVA completed / ended";
    default:
      return `${event.kind}`;
  }
}

/** Visual glyph for provenance level (04 §C.1). */
export function provenanceGlyph(prov?: Provenance | string): string {
  switch (prov) {
    case "measured":
      return "■";
    case "derived":
      return "◆";
    case "modelled":
      return "○";
    case "assumed":
      return "△";
    case "replayed":
      return "▶";
    case "simulated":
      return "◇";
    default:
      return "◇";
  }
}

export function EventLog({
  events: propEvents,
  client,
  maxHeight = "240px",
  initialCategory = "ALL",
  className = "",
  onSelectEvent,
}: EventLogProps): ReactElement {
  // Sync with client if events prop is not passed directly
  const clientEvents = useSyncExternalStore(
    useCallback((onStoreChange) => client?.subscribe(onStoreChange) ?? (() => {}), [client]),
    useCallback(() => client?.events() ?? [], [client]),
  );

  const rawEvents = propEvents ?? clientEvents;

  // Always keep in monotonic seq order (Acceptance criteria)
  const sortedEvents = useMemo(() => {
    return [...rawEvents].sort((a, b) => a.seq - b.seq);
  }, [rawEvents]);

  const [filter, setFilter] = useState<EventCategory>(initialCategory);
  const [copied, setCopied] = useState<boolean>(false);

  const filteredEvents = useMemo(() => {
    if (filter === "ALL") return sortedEvents;
    return sortedEvents.filter((e) => categorizeEvent(e.kind) === filter);
  }, [sortedEvents, filter]);

  const handleCopyLog = () => {
    const text = filteredEvents
      .map(
        (e) =>
          `[${formatSimTime(e.sim_time)}] #${e.seq} (${e.actor}) ${e.kind}: ${summarizeEvent(e)}`,
      )
      .join("\n");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          height: "2px",
          width: "100%",
          background: "linear-gradient(90deg, var(--route, #4CC9F0) 0%, var(--hairline, #2A313A) 100%)",
        }}
      />

      {/* Header with P2 Module code and event counter */}
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="code" style={{ fontWeight: 600, color: "var(--text-1, #ECEFF2)" }}>
            [ HAB CORE /// EVENT LOG ]
          </span>
          <span style={{ color: "var(--text-3, #8592A0)" }}>
            {filteredEvents.length} / {sortedEvents.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleCopyLog}
            style={{
              padding: "2px 8px",
              background: "transparent",
              border: "1px solid var(--edge, #5C6670)",
              color: copied ? "var(--nominal, #3DDC84)" : "var(--text-2, #A9B3BE)",
              fontSize: "11px",
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
            title="Copy visible log lines to clipboard"
          >
            {copied ? "COPIED ✓" : "COPY LOG"}
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
              onClick={() => setFilter(cat)}
              style={{
                padding: "2px 8px",
                fontSize: "11px",
                fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--ink, #1A1A1A)" : "var(--text-2, #A9B3BE)",
                backgroundColor: isActive ? "var(--route, #4CC9F0)" : "transparent",
                border: isActive ? "1px solid var(--route, #4CC9F0)" : "1px solid var(--hairline, #2A313A)",
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
      <div style={listStyle} tabIndex={0} aria-label="Event rows">
        {filteredEvents.length === 0 ? (
          <div style={{ padding: "12px", color: "var(--text-3, #8592A0)", fontSize: "12px", textAlign: "center" }}>
            No events logged yet
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const isAlert = ev.kind.startsWith("ALERT");
            const isWarning = isAlert && (ev.data as { level?: string })?.level === "warning";
            const isCaution = isAlert && (ev.data as { level?: string })?.level === "caution";
            const rowColor = isWarning
              ? "var(--warning, #FF4D4D)"
              : isCaution
                ? "var(--caution, #FFB020)"
                : "var(--text-1, #ECEFF2)";

            // Derive primary provenance glyph from event or provenance map
            const provMap = ev.provenance ?? {};
            const provType = Object.values(provMap)[0] ?? (isAlert ? "replayed" : "simulated");
            const glyph = provenanceGlyph(provType);

            return (
              <div
                key={ev.seq}
                data-seq={ev.seq}
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
                  gridTemplateColumns: "50px 72px 70px 1fr 28px",
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
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: "var(--text-3, #8592A0)",
                    fontSize: "11px",
                  }}
                >
                  #{ev.seq}
                </span>

                {/* Mission sim time */}
                <span
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
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: ev.actor === "system" ? "var(--text-3, #8592A0)" : "var(--route, #4CC9F0)",
                    fontSize: "11px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={ev.actor}
                >
                  {ev.actor}
                </span>

                {/* Event Summary */}
                <span
                  style={{
                    color: rowColor,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.3,
                  }}
                  title={summarizeEvent(ev)}
                >
                  {summarizeEvent(ev)}
                </span>

                {/* Provenance Chip Glyph */}
                <span
                  style={{
                    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
                    color: "var(--text-3, #8592A0)",
                    fontSize: "12px",
                    textAlign: "right",
                  }}
                  title={`Provenance: ${provType}`}
                  data-provenance={provType}
                >
                  {glyph}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

