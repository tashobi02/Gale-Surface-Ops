/**
 * M1 LAN spike (T20.07; NFR-12). Runs the real Hab Core server (T20.04) with a spike-only session
 * that emits one numbered EVENT per sim second at 1× (the server's pacing loop drives it), and
 * serves ./public, a page that shows each EVENT's seq large. Spike code: never imported by the app.
 *
 *   npx tsx apps/hab-core/spike/spike.ts [--port 8080]
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command, CommandResult, LogEvent, Snapshot } from "@marswalk/protocol";
import type { StateChange } from "../src/engine/reducer";
import { startServer } from "../src/server";
import type { SessionHandle } from "../src/session";

const START = "2024-05-20T00:00:00Z"; // spike clock origin (05 §F.4 start_utc); not a scenario

class SpikeSession implements SessionHandle {
  private seq = 0;
  private events: LogEvent[] = [];
  private simTime(): string {
    return new Date(Date.parse(START) + this.seq * 1000).toISOString().replace(".000Z", "Z");
  }
  snapshot(clients: Snapshot["clients"]): Snapshot {
    return {
      v: 1, type: "SNAPSHOT", seq: this.seq, sim_time: this.simTime(),
      session: { session_id: "s-spike", scenario_id: "lan-spike", data_version: "spike", seed: 0, status: "RUNNING",
        clock: { sim_time: this.simTime(), speed: 1, paused: false }, plan_revision: 0, last_seq: this.seq, log_hash: "" },
      plan: null, crew: [], vehicles: [], alerts: [], options: [], tasks: [],
      earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] }, clients, provenance: {},
    };
  }
  apply(command: Command): { result: CommandResult; events: LogEvent[] } {
    return { result: { v: 1, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code: "INVALID", message: "spike accepts no commands" }, events: [] };
  }
  advance(steps: number): { events: LogEvent[]; deltas: StateChange[] } {
    const out: LogEvent[] = [];
    for (let i = 0; i < steps; i++) {
      this.seq += 1;
      // Spike only: the kind is irrelevant; the page shows `seq`.
      const ev: LogEvent = { seq: this.seq, sim_time: this.simTime(), kind: "CLOCK_CHANGED", actor: "system", data: { spike_n: this.seq }, provenance: {} };
      out.push(ev);
      this.events.push(ev);
    }
    return { events: out, deltas: [] };
  }
  eventsAfter(seq: number): LogEvent[] {
    return this.events.filter((e) => e.seq > seq);
  }
}

const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8080;
const here = dirname(fileURLToPath(import.meta.url));
const server = await startServer({ site: "spike", port, session: new SpikeSession(), webDir: join(here, "public"), sitesDir: join(here, "no-sites") });
console.log(`LAN spike on ${server.url.replace("127.0.0.1", "0.0.0.0")}: open http://<laptop-ip>:${port}/ on each device`);
