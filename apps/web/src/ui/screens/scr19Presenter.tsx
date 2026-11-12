/** SCR-19: presenter-only command surface (FR-51, FR-52; T32.19, T32.20). */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { PERMISSIONS, type Command, type CommandResult, type Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useHabClient, useLinkLost, useSnapshot, useTakenOver } from "../../state/habSession";
import { provAttrs, unavailableOf } from "../components/provenance";
import { ClockControl } from "../ops/ClockControl";
import "./scr19Presenter.css";

export interface PresenterProps { client?: HabClient | null }
type Pending = { kind: Command["kind"]; stop: number | null };
type Result = { kind: Command["kind"]; result: CommandResult };

export function Presenter({ client }: PresenterProps): ReactElement {
  const hab = useHabClient(client);
  const snapshot = useSnapshot(hab);
  return <PresenterPanel key={snapshot?.session.session_id ?? "no-session"} client={hab} snapshot={snapshot} />;
}

function PresenterPanel({ client, snapshot }: { client: HabClient | null; snapshot: Snapshot | null }): ReactElement {
  const command = useCommand(client);
  const link = useLinkLost(client);
  const takenOver = useTakenOver(client);
  const [pending, setPending] = useState<Pending | null>(null);
  const inFlight = useRef(false);
  const [results, setResults] = useState<Result[]>([]);
  const [confirm, setConfirm] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirm) confirmRef.current?.focus(); }, [confirm]);
  const closeConfirm = (): void => { setConfirm(false); resetRef.current?.focus(); };
  const [failedQR, setFailedQR] = useState<string[]>([]);
  const session = snapshot?.session;
  const status = session?.status;
  const running = status === "RUNNING" || status === "PAUSED";
  const loadable = status === "LOADED" || status === "ENDED";
  const storm = snapshot?.event_library?.find((e) => e.kind === "SPACE_WEATHER");
  const stormRunning = session?.started_events?.some((e) => e.event_id === storm?.event_id) ?? false;
  const target = snapshot?.next_stop_target;
  const connected = !!client && client.role === "presenter" && !takenOver && !link.lost;
  const disabled = !connected || !!pending;

  async function send(kind: Command["kind"], args: Command["args"] = {}): Promise<void> {
    if (!connected || client?.takenOver() || client?.linkLost().lost || inFlight.current || !PERMISSIONS.presenter.includes(kind)) return;
    if (kind === "LOAD_SCENARIO" && !loadable) return;
    if (kind === "JUMP_NEXT_EVENT" && !running) return;
    if (kind === "SET_CLOCK" && (!session || status === "ENDED")) return;
    inFlight.current = true;
    setPending({ kind, stop: target?.stop_index ?? null });
    const result = await command({ kind, args });
    setResults((previous) => [{ kind, result }, ...previous]);
    inFlight.current = false;
    setPending(null);
  }

  const value = (field: string, text: string | number | undefined | null): ReactElement => <span {...provAttrs(text == null ? unavailableOf(null, `session.${field}`) : { prov: "simulated", src: `snapshot:session.${field}` })}>{text ?? "—"}</span>;
  return <main className="presenter" data-screen="SCR-19" data-mode="ops">
    <header className="presenter-header"><h1>Presenter panel</h1><a href="#/join">Join devices</a></header>
    <dl className="presenter-session" aria-label="Session">
      <div><dt>Scenario</dt><dd>{value("scenario_id", session?.scenario_id)}</dd></div>
      <div><dt>Hab site</dt><dd>{value("hab_candidate_id", session?.hab_candidate_id)}</dd></div>
      <div><dt>Sim time · simulated</dt><dd>{value("clock.sim_time", session?.clock.sim_time)}</dd></div>
      <div><dt>Speed</dt><dd>{value("clock.speed", session ? `${session.clock.speed}×` : null)}</dd></div>
      <div><dt>Status</dt><dd>{status ? value("status", status) : <span {...provAttrs(unavailableOf(null, "session.status"))}>Not connected</span>}</dd></div>
    </dl>
    <section className="presenter-beats" aria-labelledby="presenter-beats-title">
      <h2 id="presenter-beats-title">Session beats</h2>
      <div className="presenter-actions">
        <button type="button" aria-label="Next stop" aria-describedby="presenter-next-target" disabled={disabled || !running || !target} onClick={() => void send("JUMP_NEXT_STOP")}>
          Next stop — <span id="presenter-next-target" data-provenance="simulated" data-source="snapshot:next_stop_target">{target ? `Stop ${target.stop_index} · ${target.stop_id}` : "—"}</span>
        </button>
        <button type="button" aria-label="Start storm" disabled={disabled || !session || status === "ENDED" || !storm || stormRunning} onClick={() => { if (storm) void send("START_EVENT", { event_id: storm.event_id }); }}>Start storm</button>
      </div>
      {storm && <p data-provenance={storm.provenance} data-source={storm.source_id}>{storm.label}</p>}
      <p role="status" aria-live="polite" data-provenance="simulated" data-source="command:pending">
        {pending?.kind === "JUMP_NEXT_STOP" ? `Advancing to stop ${pending.stop ?? "—"} · ${session?.clock.sim_time ?? "—"}` : pending ? `${pending.kind} pending` : stormRunning ? "Storm running" : ""}
      </p>
      <fieldset className="presenter-clock" data-provenance="simulated" data-source="snapshot:session.clock" disabled={disabled || !session || status === "ENDED"}>
        <legend>Mission clock · simulated</legend>
        <ClockControl speed={session?.clock.speed} isPaused={session?.clock.paused} onCommand={(c) => void send(c.kind, c.args)} />
      </fieldset>
      <div className="presenter-actions">
        {loadable && <button type="button" aria-label="Load scenario" disabled={disabled} onClick={() => void send("LOAD_SCENARIO", { scenario_id: session?.scenario_id })}>Load scenario</button>}
        {running && <button type="button" aria-label="Jump to next event" disabled={disabled} onClick={() => void send("JUMP_NEXT_EVENT")}>Jump to next event</button>}
        <button ref={resetRef} type="button" aria-label="Reset session" aria-disabled={disabled || !session} aria-expanded={confirm} onClick={() => { if (!disabled && session) setConfirm(true); }}>Reset session</button>
      </div>
      {confirm && <div className="presenter-confirm" role="group" aria-label="Confirm session reset" onKeyDown={(e) => { if (e.key === "Escape") closeConfirm(); }}>
        <p>Reset ends this run and loads a fresh session of the same scenario.</p>
        <button ref={confirmRef} type="button" aria-label="Confirm reset session" aria-disabled={disabled} onClick={() => { if (!disabled) { closeConfirm(); void send("RESET_SESSION"); } }}>Confirm reset session</button>
        <button type="button" onClick={closeConfirm}>Keep this session</button>
      </div>}
    </section>
    <section aria-labelledby="presenter-results-title"><h2 id="presenter-results-title">Last command results</h2>
      <ol aria-label="Last command results" aria-live="polite">{results.map(({ kind, result }, index) => <li key={index} data-provenance="simulated" data-source={`command:${result.command_id}`}>
        {kind} — {result.ok ? "Accepted" : `${result.code}: ${result.message}`}
      </li>)}</ol>
      {!results.length && <p>No commands sent in this view.</p>}
    </section>
    <section aria-labelledby="presenter-join-title"><h2 id="presenter-join-title">Join this session</h2>
      <div className="presenter-qr">{(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((role) => <figure key={role}>
        {failedQR.includes(role) ? <p {...provAttrs(unavailableOf(null, "api/join-qr"))}>—</p> : <img data-provenance="derived" data-source={`api/join-qr?role=${encodeURIComponent(role)}`} src={`api/join-qr?role=${encodeURIComponent(role)}`} alt={`Join as ${role}`} width="144" height="144" onError={() => setFailedQR((previous) => [...previous, role])} />}
        <figcaption data-provenance="assumed" data-source="spec:02-E.4"><a href={`#/join?role=${encodeURIComponent(role)}`}>{role}</a></figcaption>
      </figure>)}</div>
    </section>
  </main>;
}
