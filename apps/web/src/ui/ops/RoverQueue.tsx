/**
 * Rover task display on the vehicle card: the current task with its ETA and battery (docs/specs/01 FR-41, NFR-05;
 * 03 SCR-11; 04 §D.1 vehicle card, §E.10 specimen card; 05 Vehicle). Implemented by T29.05 (Saba Atharique, #168;
 * reworked in the review).
 *
 * Shows the one `Vehicle.task` of the snapshot, the ETA (`eta_s`) and the battery (`battery_wh`), each labelled
 * `simulated` with a `snapshot:vehicles.*` source (05 Vehicle: the Hab Core simulates them). The battery is shown
 * whether or not a task is active. A value the snapshot does not carry is the dash with an `unavailable:` source
 * (04 §D.1); nothing is estimated here.
 *
 * Queue (FR-41 "tasks queue and show ETA"; BD-102, N-12; FD-084): the head is `Vehicle.task`; the tasks after it are
 * `Vehicle.queue`, each with the Hab Core's cumulative `eta_s` and `battery_wh_after`, labelled `modelled` with
 * `snapshot:vehicles.queue.*` sources (01-contract provenance map). An empty queue reads "No queued tasks"; a snapshot
 * without the field reads "—". `compact` leaves out the header and battery when the SCR-11 vehicle card shows them.
 *
 * `RoverQueue` renders any vehicle honestly; `UtilityRoverQueues` keeps the utility rovers, because SCR-15 tasks the
 * utility rover (SCOUT, CARRY, RELAY, RETURN) and SUMMON is the pressurized rover's (FR-39). SCR-11 mounts it on the
 * utility-rover card (package 21).
 */
import type { CSSProperties, ReactElement } from "react";
import type { QueuedRoverTask, Vehicle } from "@marswalk/protocol";
import {
  PROVENANCE_GLYPHS,
  UNAVAILABLE,
  fmtDuration,
  fmtInt,
  isFiniteNumber,
  provAttrs,
  unavailableOf,
  type Sourced,
} from "../components/provenance";

export interface RoverQueueProps {
  vehicle: Vehicle;
  /** Leave out the header and battery (the SCR-11 vehicle card shows them). */
  compact?: boolean;
  className?: string;
}

export interface UtilityRoverQueuesProps {
  vehicles: Vehicle[];
  className?: string;
}

/** A vehicle value as it is shown: its text and who says so (the snapshot, `simulated`). */
interface Shown extends Sourced {
  text: string;
}

function simulated(text: string, path: string): Shown {
  return { text, prov: "simulated", src: `snapshot:${path}` };
}
function missing(path: string, prov: "simulated" | "modelled" = "simulated"): Shown {
  return { text: UNAVAILABLE, ...unavailableOf(prov, path) };
}
function modelled(text: string, path: string): Shown {
  return { text, prov: "modelled", src: `snapshot:${path}` };
}

/** One task of `Vehicle.queue`, numbered after the current task (1). */
function QueuedTask({ task, position }: { task: QueuedRoverTask; position: number }): ReactElement {
  const eta = isFiniteNumber(task.eta_s) && task.eta_s >= 0 ? modelled(fmtDuration(task.eta_s), "vehicles.queue.eta_s") : missing("vehicles.queue.eta_s", "modelled");
  const after = isFiniteNumber(task.battery_wh_after) ? modelled(fmtInt(task.battery_wh_after), "vehicles.queue.battery_wh_after") : missing("vehicles.queue.battery_wh_after", "modelled");
  return (
    <li data-queued-task={task.task_id} style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "4px", borderTop: "1px solid var(--line)" }}>
      <Value name="queue-kind" label="Task" p={simulated(`${position}. ${task.kind}`, "vehicles.queue")} />
      {task.item ? <Value name="queue-item" label="Item" p={simulated(task.item, "vehicles.queue")} /> : null}
      <Value name="queue-target" label="Target" p={simulated(task.target ? `X ${fmtInt(task.target.x_m)} m · Y ${fmtInt(task.target.y_m)} m` : "Hab", "vehicles.queue")} />
      <Value name="queue-eta" label="ETA" p={eta} />
      <Value name="queue-battery-after" label="Battery after" p={after} unit="Wh" />
    </li>
  );
}

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pad-sm)",
  padding: "var(--pad-sm)",
  backgroundColor: "var(--surface-2)",
  border: "1px solid var(--control-edge)",
  color: "var(--fg-1)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--text-ui)",
};
const labelStyle: CSSProperties = { color: "var(--fg-3)", fontSize: "var(--text-micro)", textTransform: "uppercase" };
const valueStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums slashed-zero",
};
const chipStyle: CSSProperties = {
  marginLeft: "4px",
  padding: "0 4px",
  border: "1px solid var(--control-edge)",
  color: "var(--fg-2)",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const rowStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: "var(--pad-sm)" };

function Value({ name, label, p, unit }: { name: string; label: string; p: Shown; unit?: string }): ReactElement {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span data-field={name} style={valueStyle} {...provAttrs(p)}>
        {p.text}
      </span>
      {unit && !p.unavailable ? <span style={labelStyle}>{unit}</span> : null}
      {p.prov && !p.unavailable ? (
        <span className="rover-chip" style={chipStyle} {...provAttrs(p)}>
          {PROVENANCE_GLYPHS[p.prov]} {p.prov.toUpperCase()}
        </span>
      ) : null}
    </div>
  );
}

/** One vehicle's state, current task, ETA and battery. */
export function RoverQueue({ vehicle, compact = false, className = "" }: RoverQueueProps): ReactElement {
  const { vehicle_id, kind, state, task, eta_s, battery_wh, queue } = vehicle;
  const eta = isFiniteNumber(eta_s) && eta_s >= 0 ? simulated(fmtDuration(eta_s), "vehicles.eta_s") : missing("vehicles.eta_s");
  // 05 Vehicle: the battery is the utility rover's consumable; a pressurized rover reports none.
  const battery =
    kind === "utility_rover" && isFiniteNumber(battery_wh) ? simulated(fmtInt(battery_wh), "vehicles.battery_wh") : missing("vehicles.battery_wh");

  return (
    <article className={`rover-queue-card ${className}`.trim()} data-vehicle-id={vehicle_id} style={compact ? { ...cardStyle, padding: 0, border: "none", backgroundColor: "transparent" } : cardStyle}>
      {compact ? null : <header style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>
          <span data-identifier>[{vehicle_id}]</span> {kind === "pressurized_rover" ? "Pressurised rover" : "Utility rover"}
        </span>
        <span data-field="state" style={{ ...valueStyle, color: "var(--fg-2)", fontSize: "var(--text-micro)" }} {...provAttrs(simulated("", "vehicles.state"))}>
          {state}
        </span>
      </header>}

      <section aria-label={`${vehicle_id} current task`}>
        <div style={labelStyle}>Current task</div>
        {task ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <Value name="task-kind" label="Task" p={simulated(task.kind, "vehicles.task")} />
            {task.item ? <Value name="task-item" label="Item" p={simulated(task.item, "vehicles.task")} /> : null}
            <Value
              name="task-target"
              label="Target"
              p={simulated(`X ${fmtInt(task.target.x_m)} m · Y ${fmtInt(task.target.y_m)} m`, "vehicles.task")}
            />
          </div>
        ) : (
          <div>No active task</div>
        )}
        <Value name="eta" label="ETA" p={eta} />
        {compact ? null : <Value name="battery" label="Battery" p={battery} unit="Wh" />}
      </section>

      <section aria-label={`${vehicle_id} queued tasks`}>
        {queue === undefined ? (
          <Value name="queued" label="Queued" p={missing("vehicles.queue")} />
        ) : queue.length === 0 ? (
          <Value name="queued" label="Queued" p={simulated("No queued tasks", "vehicles.queue")} />
        ) : (
          <>
            <Value name="queued" label="Queued" p={simulated(String(queue.length), "vehicles.queue")} />
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
              {queue.map((t, i) => (
                <QueuedTask key={t.task_id} task={t} position={i + 2} />
              ))}
            </ol>
          </>
        )}
      </section>
    </article>
  );
}

/** The cards of the utility rovers of a snapshot's vehicle list. */
export function UtilityRoverQueues({ vehicles, className = "" }: UtilityRoverQueuesProps): ReactElement {
  const rovers = vehicles.filter((v) => v.kind === "utility_rover");
  if (rovers.length === 0) return <div className={className}>No utility rover</div>;
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--pad-sm)" }}>
      {rovers.map((v) => (
        <RoverQueue key={v.vehicle_id} vehicle={v} />
      ))}
    </div>
  );
}
