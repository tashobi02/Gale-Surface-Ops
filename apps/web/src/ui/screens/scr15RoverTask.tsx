/**
 * SCR-15 — Rover tasking (Tier 1 since 2026-11-05) (docs/specs/03 §B, §C.7; layout in docs/specs/04 §E; mode OPS, 04 §B.2).
 * Purpose: send the utility rover to scout, carry, relay or return (FR-41). Implemented by T29.04 (Saba Atharique,
 * #189; reworked in the review).
 *
 * States (03 SCR-15): Choosing · Confirm (a valid choice, Confirm enabled) · Queued · En route · Done · Failed, plus
 * Placing while the map module collects the target. The dialog sends `TASK_ROVER` through the Hab Core client and shows
 * what the Hab Core answers: it is Queued only when `CommandResult.ok` is true, and Failed with the reject code and the
 * server's reason otherwise (a missing connection is a rejection too, `useCommand`). En route and Done follow the
 * vehicle's `task` in the snapshot; Done is never shown before the task was seen running. It is opened from the EVA
 * tablet (gloves), so every control is at least 56 px (04 §C.3).
 *
 * The vehicle has no default: the caller passes the utility rover that was tapped. A target is a working-projection
 * position in metres (IAU_2015:49900). One the operator picked is `assumed` with the pick as its source (`ui:map-pick`);
 * a suggestion carries the provenance and source of whoever computed it. ETA and battery after the task are "—":
 * the Hab Core gives no preview estimate before a task is accepted, and none is invented here.
 *
 * TODO(decision): a rover-task preview (ETA, battery after) needs a Hab Core or compute estimate and a contract
 * (05 Vehicle has the live `eta_s` and `battery_wh` only). The `eta` row shows the snapshot's live ETA once the task runs.
 * TODO(verify): whether the Hab Core requires `item` for CARRY (FR-41 writes CARRY(item, to); 05 Vehicle calls it a
 * free-text label). A blank label is left out of the command, not sent empty.
 */
import { useEffect, useId, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { Provenance, RejectCode, RoverTaskKind, TaskRoverArgs, Vehicle } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useSnapshot } from "../../state/habSession";
import { StatusIcon } from "../components/statusIcon";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtDuration, fmtInt, isFiniteNumber, provAttrs, unavailableOf, type Sourced } from "../components/provenance";

/** A suggested target (for example the nearest ridge that closes a comm shadow), with who computed it. */
export interface SuggestedTarget extends Sourced {
  x_m: number;
  y_m: number;
  name?: string;
  /** The supplier's class; a suggestion without one cannot be shown as a labelled value. */
  prov: Provenance;
}

export interface RoverTaskProps {
  /** The utility rover to task. No default: without one the dialog says so and cannot send. */
  vehicleId?: string;
  /** Hab Core client: `undefined` is the tab's session, `null` none (a send is then rejected and shown). */
  client?: HabClient | null;
  initialTask?: RoverTaskKind;
  /** Suggested relay target (03 SCR-15 "nearest ridge for relay"). */
  suggestedRelayTarget?: SuggestedTarget;
  /** The target the map module collected after `onStartMapPlacement`, in working-projection metres. */
  selectedTarget?: { x_m: number; y_m: number } | null;
  /** Ask the map module to collect a target; without it the dialog only explains that one is needed. */
  onStartMapPlacement?: () => void;
  onClose?: () => void;
  className?: string;
}

const TASKS: readonly { kind: RoverTaskKind; hint: string }[] = [
  { kind: "SCOUT", hint: "Drive there, take curated images, report the terrain" },
  { kind: "CARRY", hint: "Carry an item to a point" },
  { kind: "RELAY", hint: "Park to extend radio coverage" },
  { kind: "RETURN", hint: "Drive back to the hab" },
];

/** What to do next for each Hab Core rejection (04 §D.4: say what happened and what to do). */
const REJECT_HINT: Record<RejectCode, string> = {
  FORBIDDEN_ROLE: "This role cannot task the rover. Ask ops to send it.",
  NO_LINK: "No hab link. Move into coverage and try again.",
  INVALID: "The Hab Core rejected the task. Check the target and try again.",
  NO_RENDEZVOUS: "The rover cannot reach that point. Pick another target.",
  BUSY: "The rover or the Hab Core is busy. Try again in a moment.",
};

type Outcome =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "queued"; task: RoverTaskKind }
  | { phase: "failed"; code: RejectCode; message: string };

/** The vehicle's current task of the kind we sent: it was seen running. */
function isRunning(vehicle: Vehicle | undefined, task: RoverTaskKind): boolean {
  return vehicle?.task?.kind === task;
}

// ---------------------------------------------------------------------------
// Styles: semantic tokens only; every control >= 56 px (04 §C.3 EVA)
// ---------------------------------------------------------------------------

const EVA_PX = "56px";
const panel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--pad-md)",
  boxSizing: "border-box",
  maxWidth: "480px",
  padding: "var(--pad-md)",
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--control-edge)",
  color: "var(--fg-1)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--text-ui)",
  lineHeight: "var(--line-height-ui)",
};
const labelText: CSSProperties = { color: "var(--fg-3)", fontSize: "var(--text-micro)", textTransform: "uppercase", letterSpacing: "0.04em" };
const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums slashed-zero" };
const button: CSSProperties = {
  minHeight: EVA_PX,
  minWidth: EVA_PX,
  padding: "0 var(--pad-md)",
  backgroundColor: "var(--surface-2)",
  color: "var(--fg-1)",
  border: "1px solid var(--control-edge)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-ui)",
  textTransform: "uppercase",
  cursor: "pointer",
};
const primary: CSSProperties = { ...button, backgroundColor: "var(--fg-1)", color: "var(--surface-0)", fontWeight: 700 };
const disabled: CSSProperties = { ...button, color: "var(--fg-3)", cursor: "not-allowed" };
const tileStyle = (active: boolean): CSSProperties => ({
  ...button,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: "2px",
  textAlign: "left",
  // Selection is a heavier outline and a marker (04 §C.5), never colour alone.
  borderWidth: active ? "var(--selection-width)" : "1px",
  borderColor: active ? "var(--route)" : "var(--control-edge)",
});
const box: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--pad-sm)", padding: "var(--pad-sm)", border: "1px solid var(--line)", backgroundColor: "var(--surface-2)" };

function Chip({ p }: { p: Sourced }): ReactElement | null {
  if (!p.prov || p.unavailable) return null;
  return (
    <span
      style={{ marginLeft: "4px", padding: "0 4px", border: "1px solid var(--control-edge)", color: "var(--fg-2)", fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase", whiteSpace: "nowrap" }}
      {...provAttrs(p)}
    >
      {PROVENANCE_GLYPHS[p.prov]} {p.prov.toUpperCase()}
    </span>
  );
}

function Row({ label, name, p, text }: { label: string; name: string; p: Sourced; text: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--pad-sm)" }}>
      <span style={labelText}>{label}</span>
      <span data-field={name} style={mono} {...provAttrs(p)}>
        {text}
      </span>
      <Chip p={p} />
    </div>
  );
}

/** SCR-15 view (React, ADR-012). */
export function RoverTask({
  vehicleId,
  client,
  initialTask = "SCOUT",
  suggestedRelayTarget,
  selectedTarget = null,
  onStartMapPlacement,
  onClose,
  className = "",
}: RoverTaskProps): ReactElement {
  const send = useCommand(client);
  const snapshot = useSnapshot(client);
  const vehicle = vehicleId ? snapshot?.vehicles.find((v) => v.vehicle_id === vehicleId) : undefined;

  const [task, setTask] = useState<RoverTaskKind>(initialTask);
  const [item, setItem] = useState("");
  const [placing, setPlacing] = useState(false);
  const [chosen, setChosen] = useState<"map" | "suggestion" | null>(selectedTarget ? "map" : null);
  const [outcome, setOutcome] = useState<Outcome>({ phase: "idle" });
  const [seenRunning, setSeenRunning] = useState(false);
  const reasonId = useId();
  const itemId = useId();

  // The map module hands over a picked target: it is the choice now.
  useEffect(() => {
    if (selectedTarget) {
      setChosen("map");
      setPlacing(false);
    }
  }, [selectedTarget]);

  // Done is only shown for a task that was seen running in the snapshot.
  useEffect(() => {
    if (outcome.phase === "queued" && isRunning(vehicle, outcome.task)) setSeenRunning(true);
  }, [outcome, vehicle]);

  const needsTarget = task !== "RETURN";
  const suggestion = task === "RELAY" ? suggestedRelayTarget : undefined;
  const target: { x_m: number; y_m: number; p: Sourced } | null =
    !needsTarget
      ? null
      : chosen === "suggestion" && suggestion
        ? { x_m: suggestion.x_m, y_m: suggestion.y_m, p: { prov: suggestion.prov, src: suggestion.src } }
        : chosen === "map" && selectedTarget
          ? // The operator chose this point: `assumed` (a value we chose), the pick is the source (05, 01 Provenance).
            { x_m: selectedTarget.x_m, y_m: selectedTarget.y_m, p: { prov: "assumed", src: "ui:map-pick" } }
          : null;

  const blocker = !vehicleId ? "No utility rover selected" : needsTarget && !target ? "Pick a target on the map" : null;
  const busy = outcome.phase === "sending";

  async function confirm(): Promise<void> {
    if (!vehicleId || blocker || busy) return;
    const args: TaskRoverArgs = {
      vehicle_id: vehicleId,
      task,
      ...(target ? { target: { x_m: target.x_m, y_m: target.y_m } } : {}),
      // A blank label is not sent as an empty item.
      ...(task === "CARRY" && item.trim() ? { item: item.trim() } : {}),
    };
    setOutcome({ phase: "sending" });
    setSeenRunning(false);
    const result = await send({ kind: "TASK_ROVER", args: { ...args } });
    setOutcome(result.ok ? { phase: "queued", task } : { phase: "failed", code: result.code, message: result.message });
  }

  const reset = (): void => {
    setOutcome({ phase: "idle" });
    setSeenRunning(false);
  };

  // ---- result states -------------------------------------------------------
  const running = outcome.phase === "queued" && seenRunning;
  const resultState: "queued" | "enroute" | "done" | "failed" | null =
    outcome.phase === "failed"
      ? "failed"
      : outcome.phase === "queued"
        ? running
          ? vehicle?.task
            ? "enroute"
            : "done"
          : "queued"
        : null;

  const eta: Sourced & { text: string } =
    resultState === "enroute" && isFiniteNumber(vehicle?.eta_s) && vehicle.eta_s >= 0
      ? { text: fmtDuration(vehicle.eta_s), prov: "simulated", src: "snapshot:vehicles.eta_s" }
      : { text: UNAVAILABLE, ...unavailableOf("simulated", "vehicles.eta_s") };
  // TODO(decision): see the header; no estimate exists before the Hab Core accepts the task.
  const batteryAfter = { text: UNAVAILABLE, ...unavailableOf(null, "rover_task.battery_after_wh") };

  const resultBox = (state: NonNullable<typeof resultState>, status: "advisory" | "nominal" | "warning", word: string, body: ReactNode): ReactElement => (
    <div data-state={state} style={box} {...(state === "failed" && outcome.phase === "failed" ? { "data-reject-code": outcome.code } : {})} role="status">
      <StatusIcon status={status} word={word} />
      {body}
    </div>
  );

  return (
    <section className={`scr15-rover-task ${className}`.trim()} aria-label="Rover tasking" style={panel}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={labelText}>[ {vehicleId ?? UNAVAILABLE} /// ROVER TASKING ]</div>
          <h2 style={{ margin: "4px 0 0", fontSize: "var(--text-heading)" }}>Task rover</h2>
        </div>
        {onClose ? (
          <button type="button" aria-label="Close rover tasking" onClick={onClose} style={button}>
            CLOSE
          </button>
        ) : null}
      </header>

      {resultState && outcome.phase !== "sending" ? (
        <>
          {resultState === "queued" && resultBox("queued", "advisory", "QUEUED", <div>{task} sent to {vehicleId}. Waiting for it to start.</div>)}
          {resultState === "enroute" && resultBox("enroute", "advisory", "EN ROUTE", <div>{task} in progress.</div>)}
          {resultState === "done" && resultBox("done", "nominal", "DONE", <div>{task} finished.</div>)}
          {resultState === "failed" &&
            outcome.phase === "failed" &&
            resultBox(
              "failed",
              "warning",
              "FAILED",
              <>
                <div style={mono}>{outcome.code}</div>
                <div data-field="hint">{REJECT_HINT[outcome.code]}</div>
                <div style={{ color: "var(--fg-2)" }}>{outcome.message}</div>
              </>,
            )}
          <Row label="ETA" name="eta" p={eta} text={eta.text} />
          <Row label="Battery after" name="battery-after" p={batteryAfter} text={batteryAfter.text} />
          <button type="button" style={button} onClick={reset}>
            {resultState === "failed" ? "Retry" : "Task another"}
          </button>
        </>
      ) : (
        <>
          <div role="group" aria-label="Task" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
            {TASKS.map(({ kind, hint }) => (
              <button
                key={kind}
                type="button"
                data-task={kind}
                aria-pressed={task === kind}
                style={tileStyle(task === kind)}
                onClick={() => {
                  setTask(kind);
                  setPlacing(false);
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {task === kind ? "▸ " : ""}
                  {kind}
                </span>
                <span style={{ ...labelText, textTransform: "none" }}>{hint}</span>
              </button>
            ))}
          </div>

          {task === "CARRY" ? (
            <div>
              <label htmlFor={itemId} style={labelText}>
                Item (optional)
              </label>
              <input
                id={itemId}
                type="text"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                style={{ display: "block", width: "100%", minHeight: EVA_PX, boxSizing: "border-box", padding: "0 var(--pad-sm)", backgroundColor: "var(--surface-2)", color: "var(--fg-1)", border: "1px solid var(--control-edge)", font: "inherit" }}
              />
            </div>
          ) : null}

          {suggestion ? (
            <div data-field="suggestion" style={box} {...provAttrs(suggestion)}>
              <div style={labelText}>Suggested relay point</div>
              <div style={mono}>
                {suggestion.name ? `${suggestion.name} · ` : ""}X {fmtInt(suggestion.x_m)} m · Y {fmtInt(suggestion.y_m)} m
                <Chip p={suggestion} />
              </div>
              <button type="button" style={button} onClick={() => setChosen("suggestion")}>
                Use this suggestion
              </button>
            </div>
          ) : null}

          {needsTarget ? (
            <div style={box}>
              <div style={labelText}>Target</div>
              {target ? (
                <Row label="Position" name="target" p={target.p} text={`X ${fmtInt(target.x_m)} m · Y ${fmtInt(target.y_m)} m`} />
              ) : placing ? (
                <div>Tap the map to place the target</div>
              ) : null}
              {onStartMapPlacement && !placing ? (
                <button
                  type="button"
                  style={button}
                  onClick={() => {
                    setPlacing(true);
                    onStartMapPlacement();
                  }}
                >
                  {target ? "Pick another on map" : "Pick on map"}
                </button>
              ) : null}
              {placing ? (
                <button type="button" style={button} onClick={() => setPlacing(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          ) : (
            <div style={box}>Return to the hab</div>
          )}

          <Row label="ETA" name="eta" p={eta} text={eta.text} />
          <Row label="Battery after" name="battery-after" p={batteryAfter} text={batteryAfter.text} />

          {busy ? <div role="status">Sending…</div> : null}
          {blocker ? (
            <div id={reasonId} data-field="reason" style={{ color: "var(--fg-2)" }}>
              {blocker}
            </div>
          ) : null}
          <button
            type="button"
            data-action="confirm"
            disabled={Boolean(blocker) || busy}
            aria-describedby={blocker ? reasonId : undefined}
            style={blocker || busy ? disabled : primary}
            onClick={() => void confirm()}
          >
            Confirm task
          </button>
        </>
      )}
    </section>
  );
}
