/** SCR-20: ops-only mission defaults and curated candidate selection (FR-53; T32.21, T32.22). */
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { CommandResult, HabCandidate, MissionSetup as SetupValues, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { loadSite } from "../../boot/loadSite";
import { useCommand, useHabClient, useLinkLost, useSnapshot, useTakenOver } from "../../state/habSession";
import type { LoadedSite } from "../context";
import { parseHexColour, readCssToken, requireToken } from "../map/mapTokens";
import { drawCommPreview } from "../setup/commPreview";
import "./scr20MissionSetup.css";

export type GridFetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>;
const fetchGridDefault: GridFetcher = (url, init) => fetch(url, init);
export interface MissionSetupProps {
  client?: HabClient | null;
  /** Undefined loads the URL's local site through the shared loader; null is still loading. */
  site?: LoadedSite | null;
  fetchGrid?: GridFetcher;
}

function CommPreview({ candidate, site, fetchGrid }: { candidate: HabCandidate; site: LoadedSite; fetchGrid: GridFetcher }): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const asset = site.assets.get(candidate.comm_hab_asset);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setState("loading");
    async function draw(): Promise<void> {
      try {
        if (!asset || !canvas.current) throw new Error("Comm grid asset is unavailable");
        const response = await fetchGrid(asset.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Comm grid is unavailable");
        const grid = new Uint8Array(await response.arrayBuffer());
        if (!live || !canvas.current) return;
        drawCommPreview(canvas.current, grid, site.site.grid.width, site.site.grid.height, {
          visible: parseHexColour(requireToken(readCssToken, "--fg-1")),
          shadow: parseHexColour(requireToken(readCssToken, "--surface-1")),
        });
        setState("ready");
      } catch { if (live) setState("unavailable"); }
    }
    void draw();
    return () => { live = false; controller.abort(); };
  }, [asset, site, fetchGrid]);
  const source = candidate.source_ids.join(" ");
  return <figure className="setup-coverage">
    <canvas ref={canvas} role="img" aria-label={`Precomputed comm coverage for ${candidate.label}`} hidden={state !== "ready"} data-provenance={candidate.provenance} data-source={source} />
    {state !== "ready" && <p data-provenance={candidate.provenance} data-source={state === "unavailable" ? `unavailable:${candidate.comm_hab_asset}` : source}>{state === "loading" ? "Loading coverage" : "—"}</p>}
    <figcaption>Precomputed comm coverage · <span data-provenance={candidate.provenance} data-source={source}>{candidate.provenance} · {source || "—"}</span></figcaption>
  </figure>;
}

export function MissionSetup({ client, site: suppliedSite, fetchGrid = fetchGridDefault }: MissionSetupProps): ReactElement {
  const hab = useHabClient(client);
  const snapshot = useSnapshot(hab);
  const [loadedSite, setLoadedSite] = useState<LoadedSite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (suppliedSite !== undefined || hab?.role !== "ops") return;
    let live = true;
    setError(null);
    void loadSite().then((site) => { if (live) setLoadedSite(site); }, (e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Site could not load"); });
    return () => { live = false; };
  }, [suppliedSite, hab, attempt]);
  const site = suppliedSite === undefined ? loadedSite : suppliedSite;
  return <main className="mission-setup" data-screen="SCR-20" data-mode="ops">
    <header className="setup-header"><h1>Mission setup</h1><a href="#/join">Join devices</a></header>
    {hab?.role !== "ops" ? <p>Ops only. Join as Habitat Operations to set up the mission.</p> : error ? <section aria-label="Site loading error">
      <p role="alert" data-provenance="assumed" data-source="boot:site">Site could not load: {error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)}>Retry site loading</button>
    </section> : <SetupPanel key={snapshot?.session.session_id ?? "loading"} client={hab} snapshot={snapshot} site={site} fetchGrid={fetchGrid} />}
  </main>;
}

function SetupPanel({ client, snapshot, site, fetchGrid }: { client: HabClient; snapshot: Snapshot | null; site: LoadedSite | null; fetchGrid: GridFetcher }): ReactElement {
  const command = useCommand(client);
  const link = useLinkLost(client);
  const taken = useTakenOver(client);
  const [pending, setPending] = useState<"SELECT_HAB_SITE" | "SET_MISSION_SETUP" | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const session = snapshot?.session;
  const settings = session?.mission_setup;
  const locked = !!snapshot && (snapshot.plan !== null || session?.status !== "LOADED");
  const disabled = !snapshot || !site || locked || !!pending || link.lost || taken;
  const candidates = site?.site.hab_candidates;
  async function send(kind: "SELECT_HAB_SITE" | "SET_MISSION_SETUP", args: Record<string, unknown>): Promise<void> {
    if (disabled || inFlight.current || client.takenOver() || client.linkLost().lost) return;
    inFlight.current = true; setPending(kind); setResult(null);
    const next = await command({ kind, args });
    setResult(next); setPending(null); inFlight.current = false;
  }
  const set = (args: Partial<SetupValues>): void => { void send("SET_MISSION_SETUP", args); };
  const attrs = (field: keyof SetupValues) => ({ "data-provenance": "assumed", "data-source": `${settings ? "snapshot" : "unavailable"}:session.mission_setup.${field}` });
  return <>
    <p className="setup-state" role="status" aria-live="polite" data-provenance="simulated" data-source="snapshot:session">
      {!snapshot || !site ? "Loading" : locked ? "Locked — reset the session before changing the mission." : pending === "SELECT_HAB_SITE" ? "Computing haven fields" : pending ? "Saving mission settings" : "Ready"}
    </p>
    <section aria-labelledby="setup-sites-title"><h2 id="setup-sites-title">Hab site</h2><p>Candidate sites prepared on Earth, pre-checked.</p>
      <div className="setup-candidates">{candidates?.length ? [...candidates].sort((a, b) => a.rank - b.rank).map((candidate) => {
        const source = candidate.source_ids.join(" ");
        const data = { "data-provenance": candidate.provenance, "data-source": source };
        const selected = session?.hab_candidate_id === candidate.candidate_id;
        return <article className="setup-candidate" key={candidate.candidate_id} data-candidate-id={candidate.candidate_id} data-selected={selected}>
          <p className="setup-candidate-code" {...data}>{candidate.candidate_id} · Rank {candidate.rank}</p>
          <h3 {...data}>{candidate.label}</h3>
          <dl><div><dt>Position · projected metres</dt><dd {...data}>{candidate.hab_mast.x_m} m east · {candidate.hab_mast.y_m} m north</dd></div>
            <div><dt>Planetocentric · east-positive</dt><dd {...data}>{candidate.lat}° latitude · {candidate.lon_e}° longitude</dd></div></dl>
          <p {...data}>{candidate.note ?? "—"}</p>
          <CommPreview candidate={candidate} site={site!} fetchGrid={fetchGrid} />
          <button type="button" aria-label={`Select ${candidate.label}`} aria-pressed={selected} disabled={disabled} onClick={() => void send("SELECT_HAB_SITE", { candidate_id: candidate.candidate_id })}>
            {selected ? "Selected" : "Select site"}
          </button>
        </article>;
      }) : site && <article className="setup-candidate"><h3>Fixed site</h3>
        <p data-provenance="derived" data-source="manifest:default_start">{site.site.default_start.label} · {site.site.default_start.x_m} m east · {site.site.default_start.y_m} m north</p>
        <p>This manifest has a single fixed mission site.</p>
      </article>}</div>
      {!!candidates?.length && <p className="setup-legend">Coverage: light = line of sight; dark = no line of sight; transparent = no data. North is up.</p>}
    </section>
    <section aria-labelledby="setup-settings-title"><h2 id="setup-settings-title">Mission settings</h2>
      <p className="setup-assumptions" data-provenance="assumed" data-source="spec:03-SCR-20">Defaults are assumptions</p>
      <fieldset className="setup-settings" disabled={disabled || !settings}><legend>Defaults for the planner</legend>
        <label>Crew count<select aria-label="Crew count" {...attrs("crew_count")} value={settings?.crew_count ?? ""} onChange={(e) => set({ crew_count: Number(e.target.value) })}>
          {!settings && <option value="">—</option>}<option value="1">1</option><option value="2">2</option>
        </select></label>
        <label className="setup-vehicle"><input type="checkbox" role="switch" aria-label="Vehicle available" {...attrs("vehicle_available")} checked={settings?.vehicle_available ?? false} disabled={!settings || (!settings.vehicle_available && !settings.vehicle_param_set)} onChange={(e) => set({ vehicle_available: e.target.checked })} />Vehicle available <span {...attrs("vehicle_available")}>{settings ? settings.vehicle_available ? "ON" : "OFF" : "—"}</span></label>
        <label>Vehicle parameter set<select aria-label="Vehicle parameter set" {...attrs("vehicle_param_set")} value={settings?.vehicle_param_set ?? ""} onChange={(e) => set({ vehicle_param_set: e.target.value })}>
          <option value="">—</option>{[...new Set([...(settings?.vehicle_param_set ? [settings.vehicle_param_set] : []), ...(snapshot?.vehicles.filter((v) => v.kind === "pressurized_rover").map((v) => v.param_set) ?? [])])].map((id) => <option key={id} value={id}>{id}</option>)}
        </select></label>
        <label>Solar phase<select aria-label="Solar phase" {...attrs("solar_phase")} value={settings?.solar_phase ?? ""} onChange={(e) => set({ solar_phase: e.target.value })}>
          {!settings && <option value="">—</option>}<option value="max">Solar maximum</option><option value="min">Solar minimum</option>
        </select></label>
        <label>Maximum time to haven (min)<input type="number" aria-label="Maximum time to haven (min)" {...attrs("max_haven_min")} min="5" max="120" step="any" key={settings?.max_haven_min ?? "unknown"} defaultValue={settings?.max_haven_min ?? ""} onBlur={(e) => {
          const input = e.currentTarget;
          if (!input.value || !input.validity.valid || !Number.isFinite(input.valueAsNumber)) { setInputError("Maximum time to haven must be between 5 and 120 min."); }
          else { setInputError(null); if (input.valueAsNumber !== settings?.max_haven_min) set({ max_haven_min: input.valueAsNumber }); }
          input.value = settings ? String(settings.max_haven_min) : "";
        }} /></label>
      </fieldset>
      {inputError && <p role="alert" data-provenance="assumed" data-source="spec:02-E.3">{inputError}</p>}
      {result && <p role={result.ok ? "status" : "alert"} data-provenance="simulated" data-source={`command:${result.command_id}`}>{result.ok ? "Command accepted" : `${result.code}: ${result.message}`}</p>}
    </section>
    <footer className="setup-footer"><a aria-label="Continue to the planner" href="#/planner">Continue to the planner</a></footer>
  </>;
}
