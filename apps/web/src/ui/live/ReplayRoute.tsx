/** Static, read-only replay of a Hab Core recording (T27.05). */
import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import type { Recording } from "@marswalk/protocol";
import { createReplaySource, type ReplaySource } from "../../net/replaySource";
import { selectOpsProps } from "../ops/liveProps";
import { OpsConsole } from "../screens/scr11OpsConsole";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Playback({ source, recording }: { source: ReplaySource; recording: Recording }): ReactElement {
  const snapshot = useSyncExternalStore(source.subscribe, source.state, source.state);
  const events = useSyncExternalStore(source.subscribe, source.events, source.events);
  const [playing, setPlaying] = useState(true);
  const ended = source.playbackState() === "ended";
  useEffect(() => {
    if (!playing || ended) return;
    const timer = window.setInterval(() => { for (let i = 0; i < 30 && source.playbackState() !== "ended"; i++) source.step(); }, 100);
    return () => window.clearInterval(timer);
  }, [source, playing, ended]);
  return <main data-replay-state={ended ? "ended" : playing ? "playing" : "paused"}>
    <header style={{ padding: "1rem", background: "var(--surface-1)", color: "var(--text-1)" }}>
      <h1>Replayed recording</h1>
      <button type="button" onClick={() => setPlaying(!playing)} disabled={ended}>{playing ? "Pause" : "Play"}</button>{" "}
      <button type="button" onClick={() => { setPlaying(false); source.step(); }} disabled={ended}>Step</button>{" "}
      <button type="button" onClick={() => { source.reset(); setPlaying(false); }}>Restart</button>
      <p>Recorded log hash: <span data-recorded-log-hash data-provenance="replayed" data-source="recording:log_hash">{recording.log_hash}</span></p>
      <p>Verified log hash: <span data-log-hash data-provenance="derived" data-source={source.hashCheck().status === "verified" ? "recording:events" : "unavailable:recording.events"}>{source.hashCheck().status === "verified" ? source.hashCheck().computed : "—"}</span></p>
      {source.hashCheck().status !== "verified" && <p role="status">{source.hashCheck().reason}</p>}
    </header>
    {snapshot?.session.status !== "ENDED" && <fieldset disabled aria-label="Read-only recorded ops view" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <OpsConsole client={source} snapshot={snapshot} {...selectOpsProps(snapshot, events)} />
    </fieldset>}
    {snapshot?.session.status === "ENDED" && <p data-provenance="replayed" data-source="recording:session.status">Session ended</p>}
  </main>;
}

export function ReplayRoute(): ReactElement {
  const [loaded, setLoaded] = useState<{ source: ReplaySource; recording: Recording } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let source: ReplaySource | undefined;
    void (async () => {
      try {
        const response = await fetch("replay/recording.json");
        if (!response.ok) throw new Error(`recording unavailable (HTTP ${response.status})`);
        const recording = await response.json() as Recording;
        source = await createReplaySource(recording, sha256);
        if (active) setLoaded({ source, recording });
        else source.close();
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Recording unavailable"); }
    })();
    return () => { active = false; source?.close(); };
  }, []);
  if (error) return <main><h1>Replayed recording</h1><p role="alert">{error}</p></main>;
  if (!loaded) return <main><h1>Replayed recording</h1><p role="status">Loading recording…</p></main>;
  return <Playback {...loaded} />;
}
