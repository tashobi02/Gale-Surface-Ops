/** SCR-16: Earth support, FR-43 and FR-48. */
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { Provenance, Snapshot } from "@marswalk/protocol";
import { useCommand, useSnapshot } from "../../state/habSession";
import { EarthLinkWidget } from "../ops/EarthLinkWidget";
import { fmtFixed, provAttrs, unavailableOf } from "../components/provenance";
import "./scr16EarthView.css";

export function earthLinkState(earth: { blackout: boolean; link_state?: "AVAILABLE" | "WAITING" | "BLACKOUT" | null } | null): string | null {
  return earth?.link_state === "BLACKOUT" ? "CONJUNCTION BLACKOUT" : earth?.link_state ?? (earth?.blackout ? "CONJUNCTION BLACKOUT" : null);
}

export function asOfStamp(asOf: string | null, now: string | null): string | null {
  if (!asOf || !now) return null;
  const then = Date.parse(asOf), current = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(current) || then > current) return null;
  return `as of ${new Date(then).toISOString().slice(11, 16)} (${Math.floor((current - then) / 60000)} min ago)`;
}

interface DelayedView {
  as_of_utc: string | null;
  crew: { crew_id: string; x_m: number; y_m: number; sample_utc: string }[];
  alerts: { alert_id: string; message: string; level: string; raised_utc: string }[];
  provenance: Record<string, Provenance>;
  source_ids: Record<string, string>;
}

export function EarthView(): ReactElement {
  const snapshot = useSnapshot();
  const send = useCommand();
  const [delayed, setDelayed] = useState<DelayedView | null>(null);
  const sessionId = snapshot?.session.session_id;
  const simTime = snapshot?.sim_time;
  useEffect(() => {
    const abort = new AbortController();
    setDelayed(null);
    if (sessionId) void fetch("/api/earth-view", { signal: abort.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!abort.signal.aborted) setDelayed(value && Array.isArray(value.crew) && Array.isArray(value.alerts) ? value : null); })
      .catch(() => { if (!abort.signal.aborted) setDelayed(null); });
    return () => abort.abort();
  }, [sessionId, simTime]);
  const delayedAttrs = (field: string) => provAttrs(delayed?.provenance[field] && delayed.source_ids[field]
    ? { prov: delayed.provenance[field], src: delayed.source_ids[field] }
    : unavailableOf(null, `earth.delayed_summary.${field}`));
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const state = earthLinkState(snapshot?.earth ?? null);
  const queue = snapshot?.earth?.queue?.filter((item) => item.direction === "to_mars" && item.state !== "DELIVERED");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    const result = await send({ kind: "SEND_MESSAGE", args: { body: body.trim() } });
    setPending(false);
    if (result.ok) { setBody(""); setFeedback("Message queued."); }
    else setFeedback(result.message);
  }
  return <main className="earth-view" data-screen="SCR-16">
    <header><p className="module-label">[ MISSION CONTROL /// EARTH ]</p><h1>Earth support</h1></header>
    <div className="earth-grid">
      <section className="earth-panel" aria-labelledby="earth-summary"><h2 id="earth-summary">Crew and alerts</h2>
        <p>Delayed summary</p>
        {delayed?.as_of_utc ? <>
          <ul>{delayed.crew.map(member => <li key={member.crew_id} {...delayedAttrs("crew")}>{member.crew_id}: [{fmtFixed(member.x_m, 0)}, {fmtFixed(member.y_m, 0)}] m · sampled {member.sample_utc}</li>)}</ul>
          <ul>{delayed.alerts.map(alert => <li key={alert.alert_id} {...delayedAttrs("alerts")}>{alert.level} · {alert.message} · raised {alert.raised_utc}</li>)}</ul>
          {delayed.alerts.length === 0 && <p {...delayedAttrs("alerts")}>No delayed alerts.</p>}
        </> : <p {...provAttrs(unavailableOf(null, "earth.delayed_summary"))}>—</p>}
        <p>As of <span {...(delayed?.as_of_utc ? delayedAttrs("as_of_utc") : provAttrs(unavailableOf(null, "earth.delayed_summary.as_of")))}>{delayed?.as_of_utc ?? "—"}</span></p>
      </section>
      <div><EarthLinkWidget snapshot={snapshot} /><p>Link status: {state ? <strong className={state === "CONJUNCTION BLACKOUT" ? "earth-caution" : undefined} {...provAttrs({ prov: snapshot?.provenance?.["earth.link_state"] ?? "derived", src: snapshot?.earth?.link_state ? snapshot.earth.link_source_id ?? "snapshot:earth.link_state" : "snapshot:earth.blackout" })}>{state === "CONJUNCTION BLACKOUT" ? "▲ " : ""}{state}</strong> : <span {...provAttrs(unavailableOf(null, "earth.link_state"))}>—</span>}</p></div>
      <section className="earth-panel"><h2>Message to Mars</h2>
        <form onSubmit={(event) => { void submit(event); }}><label htmlFor="earth-message">Message</label><textarea id="earth-message" maxLength={280} value={body} onChange={(event) => setBody(event.target.value)} /><button type="submit" disabled={pending || !body.trim()}>Send message</button><p role="status">{feedback}</p></form>
      </section>
      <section className="earth-panel"><h2>Outgoing queue</h2>
        {queue ? queue.length === 0 ? <p>No messages queued.</p> : <ul>{queue.map((message) => <li key={message.message_id}>
          <p {...provAttrs({ prov: "simulated", src: "snapshot:earth.queue.body" })}>{message.body}</p>
          <span {...provAttrs({ prov: message.provenance.state ?? "simulated", src: "snapshot:earth.queue.state" })}>{message.state}</span>{" · Delivery estimate: "}
          <time {...provAttrs({ prov: message.provenance.deliver_utc ?? "derived", src: "snapshot:earth.queue.deliver_utc" })}>{message.deliver_utc}</time>
        </li>)}</ul> : <p {...provAttrs(unavailableOf(null, "earth.queue"))}>—</p>}
      </section>
    </div>
  </main>;
}
