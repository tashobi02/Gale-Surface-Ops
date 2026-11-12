/** T26.05, FR-43: presentation of the precomputed Earth link; never computes geometry or delivery times. */
import type { CSSProperties, ReactElement } from "react";
import type { Provenance, Snapshot } from "@marswalk/protocol";
import { useSnapshot } from "../../state/habSession";
import { provAttrs, unavailableOf } from "../components/provenance";
import { formatSimTime } from "./EventLog";

type Cell = { text: string; attrs: ReturnType<typeof provAttrs> };
const missing = (path: string): Cell => ({ text: "—", attrs: provAttrs(unavailableOf(null, `earth.${path}`)) });
const supplied = (text: string, path: string, prov: Provenance): Cell => ({ text, attrs: provAttrs({ prov, src: `snapshot:earth.${path}` }) });

export function EarthLinkWidget({ snapshot: override }: { snapshot?: Snapshot | null }): ReactElement {
  const stored = useSnapshot();
  const active = override === undefined ? stored : override;
  const earth = active?.earth;
  // FD-286: the reducer seeds 0 s when no Earth-link table row exists; a one-way light time is never 0, so 0 reads —.
  const light = earth && Number.isFinite(earth.light_time_s) && earth.light_time_s > 0
    ? supplied(`${Math.floor(earth.light_time_s / 60)}:${String(Math.floor(earth.light_time_s % 60)).padStart(2, "0")}`, "light_time_s", active?.provenance?.["earth.light_time_s"] ?? "derived") : missing("light_time_s");
  const nextPass = earth?.next_pass_utc && Number.isFinite(Date.parse(earth.next_pass_utc))
    ? supplied(`${formatSimTime(earth.next_pass_utc)} UTC`, "next_pass_utc", "derived") : missing("next_pass_utc");
  // N-31: absence of conjunction does not establish that a relay is currently overhead.
  const state = earth?.blackout === true ? supplied("▲ CONJUNCTION", "blackout", "derived") : missing("state");
  const queue = (direction: "to_earth" | "to_mars"): Cell => Array.isArray(earth?.queue)
    ? supplied(String(earth.queue.filter((message) => message.direction === direction && message.state !== "DELIVERED").length), `queue.${direction}`, "simulated") : missing(`queue.${direction}`);
  const rows: [string, string, Cell][] = [
    ["One-way light time", "light-time", light], ["Next relay pass", "next-pass", nextPass],
    ["To Earth", "queue-to-earth", queue("to_earth")], ["To Mars", "queue-to-mars", queue("to_mars")], ["Link state", "link-state", state],
  ];
  const style: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", background: "var(--raised)", border: "1px solid var(--edge)", fontFamily: "var(--font-mono)", fontSize: "12px" };
  return <section aria-label="Earth link" data-testid="earth-link-widget" style={style}>
    <span className="module-label">[ ORBITAL /// EARTH LINK ]</span>
    {rows.map(([label, id, value]) => <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span data-value={id} {...value.attrs} style={{ fontVariantNumeric: "tabular-nums", color: id === "link-state" && earth?.blackout ? "var(--status-caution)" : "var(--text-1)" }}>{value.text}</span>
    </div>)}
  </section>;
}
