/**
 * `#/replay` — static, read-only replay of a Hab Core recording (T27.05; FR-34, FR-46; N-21; 03 §A replay).
 *
 * - Read-only through the client, not by disabling the page: the ops console gets the replay client, whose commands are
 *   refused ("Read-only replay"), so every inspection control (event log drawer, panel drawers) keeps working.
 * - Playback is paced by sim time: every tick moves a sim cursor by tick × speed (1×, 10×, 60×) and applies the messages
 *   up to it in one batch. Pause, step and restart are local to playback.
 * - The hash badge says what it covers: the recorded events only. The state on screen is replayed from the recorded
 *   snapshot and deltas.
 * - Entering the route closes the tab's live Hab Core connection (a tab keeps one connection, 03 §A).
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from "react";
import type { Recording } from "@marswalk/protocol";
import { createReplaySource, type HashCheck, type ReplaySource } from "../../net/replaySource";
import { closeHabSessionsExcept } from "../../state/habSession";
import { PROVENANCE_GLYPHS, UNAVAILABLE, provAttrs, unavailableOf } from "../components/provenance";
import { StatusIcon, type ExtendedStatus } from "../components/statusIcon";
import { EventLog } from "../ops/EventLog";
import { selectOpsProps } from "../ops/liveProps";
import { OpsConsole } from "../screens/scr11OpsConsole";

export const RECORDING_URL = "replay/recording.json";
const SPEEDS = [1, 10, 60] as const;
type Speed = (typeof SPEEDS)[number];
const TICK_MS = 100;

const barStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 16px",
  padding: "8px 16px",
  background: "var(--panel, #14181D)",
  color: "var(--text-1, #ECEFF2)",
  borderBottom: "1px solid var(--hairline, #2A313A)",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "12px",
};

const buttonStyle: CSSProperties = {
  minHeight: "32px",
  padding: "4px 12px",
  border: "1px solid var(--text-2, #A9B3BE)",
  background: "var(--raised, #1C2128)",
  color: "var(--text-1, #ECEFF2)",
  fontFamily: "inherit",
  fontSize: "12px",
  cursor: "pointer",
};

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  background: "var(--surface-0, #0B0D10)",
  color: "var(--text-1, #ECEFF2)",
  padding: "24px",
  fontFamily: "var(--font-ui, Inter, sans-serif)",
};

const HASH_VIEW: Record<HashCheck["status"], { status: ExtendedStatus; word: string; text: string }> = {
  verified: { status: "nominal", word: "VERIFIED", text: "log hash verified (events only; state is replayed from the recorded snapshot and deltas)" },
  mismatch: { status: "warning", word: "MISMATCH", text: "log hash does not match: the recorded events do not hash to the recorded log hash" },
  incomplete: { status: "unknown", word: "INCOMPLETE", text: "log hash not checked: the recording does not hold the whole log" },
  unverifiable: { status: "unknown", word: "UNVERIFIABLE", text: "log hash not checked" },
};

function HashBadge({ check }: { check: HashCheck }): ReactElement {
  const view = HASH_VIEW[check.status];
  const recorded = check.recorded !== null;
  const computed = check.computed !== null;
  return (
    <div data-slot="replay-hash" data-hash-status={check.status} style={{ display: "grid", gap: "2px", minWidth: 0, flexBasis: "100%" }}>
      <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <StatusIcon status={view.status} word={view.word} />
        <span>{view.text}</span>
        {check.status !== "verified" && check.status !== "mismatch" && <span>({check.reason})</span>}
      </span>
      <span style={{ overflowWrap: "anywhere" }}>
        Recorded:{" "}
        <span data-recorded-log-hash="" {...provAttrs(recorded ? { prov: "replayed", src: "recording:log_hash" } : unavailableOf("replayed", "recording.log_hash"))}>
          {check.recorded ?? UNAVAILABLE}
        </span>{" "}
        {recorded ? PROVENANCE_GLYPHS.replayed : ""}
      </span>
      <span style={{ overflowWrap: "anywhere" }}>
        Computed from the recorded events:{" "}
        <span data-log-hash="" {...provAttrs(computed ? { prov: "derived", src: "recording:events" } : unavailableOf("derived", "recording.events"))}>
          {check.computed ?? UNAVAILABLE}
        </span>{" "}
        {computed ? PROVENANCE_GLYPHS.derived : ""}
      </span>
    </div>
  );
}

function Playback({ source }: { source: ReplaySource }): ReactElement {
  const snapshot = useSyncExternalStore(source.subscribe, source.state, source.state);
  const events = useSyncExternalStore(source.subscribe, source.events, source.events);
  const position = source.position();
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(60);
  const ended = source.playbackState() === "ended";
  const cursor = useRef<number>(Date.parse(source.position().simTime ?? "") || 0);

  useEffect(() => {
    if (!playing || ended) return;
    const timer = setInterval(() => {
      cursor.current += TICK_MS * speed;
      try {
        source.advanceTo(cursor.current);
      } catch (err) {
        console.error("replay: a recorded message could not be applied", err);
        setPlaying(false);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [source, playing, ended, speed]);

  const syncCursor = (): void => {
    const t = Date.parse(source.position().simTime ?? "");
    if (Number.isFinite(t)) cursor.current = t;
  };

  const sessionEnded = snapshot?.session.status === "ENDED";
  return (
    <div data-replay-state={ended ? "ended" : playing ? "playing" : "paused"}>
      <div style={barStyle} role="region" aria-label="Replay controls">
        <p data-slot="replay-banner" style={{ margin: 0, fontWeight: 700, letterSpacing: "0.06em" }}>
          {PROVENANCE_GLYPHS.replayed} REPLAYED RECORDING — read only
        </p>
        <span>Commands are refused; playback controls are local to this page.</span>
        <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" data-slot="replay-play" style={buttonStyle} onClick={() => setPlaying(!playing)} disabled={ended}>
            {playing ? "Pause playback" : "Play"}
          </button>
          <button type="button" data-slot="replay-step" style={buttonStyle} onClick={() => { setPlaying(false); source.step(); syncCursor(); }} disabled={ended}>
            Step
          </button>
          <button type="button" data-slot="replay-restart" style={buttonStyle} onClick={() => { source.reset(); syncCursor(); setPlaying(false); }}>
            Restart
          </button>
          <span role="group" aria-label="Playback speed" style={{ display: "flex", gap: "4px" }}>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                data-slot={`replay-speed-${s}`}
                data-identifier=""
                aria-pressed={speed === s}
                aria-label={`Playback ${s}×`}
                style={{ ...buttonStyle, ...(speed === s ? { background: "var(--text-1, #ECEFF2)", color: "var(--panel, #14181D)" } : {}) }}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </span>
        </span>
        <span>
          Position:{" "}
          <span data-slot="replay-position" {...provAttrs({ prov: "replayed", src: "recording:messages" })}>
            {`sim ${position.simTime ?? UNAVAILABLE} · message ${position.index} of ${position.total}`}
          </span>{" "}
          {PROVENANCE_GLYPHS.replayed}
        </span>
        <HashBadge check={source.hashCheck()} />
      </div>
      {sessionEnded ? (
        <main data-slot="replay-ended" style={pageStyle}>
          <h1 style={{ fontSize: "20px", marginTop: 0 }}>
            <span {...provAttrs({ prov: "replayed", src: "recording:session.status" })}>Session ended</span> {PROVENANCE_GLYPHS.replayed}
          </h1>
          <p>The recorded session ended here. Its event log stays readable below; Restart plays it again.</p>
          <EventLog events={events} maxHeight="60vh" />
        </main>
      ) : (
        // The ops console redirects to the live report on ENDED; the replay never shows it an ENDED snapshot.
        <OpsConsole client={source} snapshot={snapshot} staticReplay={true} {...selectOpsProps(snapshot, events)} />
      )}
    </div>
  );
}

export interface ReplayRouteProps {
  /** Default: the global `fetch`. Tests and App pass their own. */
  fetchImpl?: (url: string) => Promise<Response>;
}

export function ReplayRoute({ fetchImpl }: ReplayRouteProps): ReactElement {
  const [source, setSource] = useState<ReplaySource | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    closeHabSessionsExcept(null);
  }, []);

  useEffect(() => {
    let active = true;
    let created: ReplaySource | undefined;
    const doFetch = fetchImpl ?? ((url: string) => fetch(url));
    void (async () => {
      try {
        const response = await doFetch(RECORDING_URL);
        if (!response.ok) throw new Error(`recording unavailable (HTTP ${response.status})`);
        let recording: Recording;
        try {
          recording = (await response.json()) as Recording;
        } catch {
          throw new Error(`the recording (HTTP ${response.status}) is not valid JSON`);
        }
        created = await createReplaySource(recording);
        if (active) setSource(created);
        else created.close();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "recording unavailable");
      }
    })();
    return () => {
      active = false;
      created?.close();
    };
  }, [fetchImpl]);

  if (error) {
    return (
      <main data-replay-state="error" style={pageStyle}>
        <h1 style={{ fontSize: "20px" }}>Replayed recording</h1>
        <p role="alert">Replay unavailable — {error}</p>
      </main>
    );
  }
  if (!source) {
    return (
      <main data-replay-state="loading" style={pageStyle}>
        <h1 style={{ fontSize: "20px" }}>Replayed recording</h1>
        <p role="status">Loading recording…</p>
      </main>
    );
  }
  return <Playback source={source} />;
}
