/** N-100/N-120: transport the server's modelled seconds; never compute a client ETA. */
import { useEffect, useState } from "react";
import type { Snapshot } from "@marswalk/protocol";
import type { HavenFieldInput } from "./opsLayers";

export function useHabTimeField(snapshot: Snapshot | null | undefined, enabled: boolean): HavenFieldInput | null {
  const key = snapshot?.plan ? JSON.stringify([snapshot.session.session_id, snapshot.session.plan_revision, snapshot.session.hab_candidate_id, snapshot.session.data_version]) : null;
  const version = snapshot?.session.data_version;
  const [entry, setEntry] = useState<{ key: string; field: HavenFieldInput } | null>(null);
  useEffect(() => {
    setEntry(null);
    if (!enabled || key === null) return;
    const abort = new AbortController();
    void fetch("/api/hab-time-field", { signal: abort.signal, cache: "no-store" }).then(async response => {
      if (!response.ok || response.headers.get("X-Data-Version") !== version || response.headers.get("X-Unit") !== "s" || response.headers.get("X-Provenance") !== "modelled") return;
      const width = Number(response.headers.get("X-Grid-Width"));
      const height = Number(response.headers.get("X-Grid-Height"));
      const cell_m = Number(response.headers.get("X-Grid-Cell-M"));
      const origin = response.headers.get("X-Grid-Origin-M")?.split(",").map(Number);
      if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isFinite(cell_m) || cell_m <= 0 || origin?.length !== 2 || !origin.every(Number.isFinite)) return;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== width * height * Float32Array.BYTES_PER_ELEMENT) return;
      const view = new DataView(bytes);
      const seconds = new Float64Array(width * height);
      for (let i = 0; i < seconds.length; i++) {
        const value = view.getFloat32(i * 4, true);
        if (Number.isNaN(value) || value < 0) return;
        seconds[i] = value;
      }
      if (!abort.signal.aborted) setEntry({ key, field: { width, height, cell_m, origin_m: origin as [number, number], seconds, source_id: "api:hab-time-field" } });
    }).catch(() => { /* unavailable is the initial state; no stale field survives */ });
    return () => abort.abort();
  }, [key, enabled, version]);
  return enabled && entry?.key === key ? entry.field : null;
}
