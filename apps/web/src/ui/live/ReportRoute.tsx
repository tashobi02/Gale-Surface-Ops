/**
 * `#/report` — SCR-17 fed by the Hab Core (docs/specs/03 SCR-17; 01 FR-46; T27.03).
 *
 * GET `api/report` (relative: the page's own origin, the Hab Core; NFR-01) -> `adaptPostEvaReport` -> `PostEvaReport`.
 * Nothing is computed here. While loading, and when the request or the body fails, the report layout stays with "—" in
 * every value (04 §D.1) and a status line says which it is and why; a failed request offers RETRY. A body that is not a
 * report is an error: a half-filled report would read as a result.
 *
 */
import { LINK_LOST_AFTER_MS } from "@marswalk/protocol";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { adaptPostEvaReport, type ApiPostEvaReport } from "../report/reportAdapter";
import { logLiveFallback } from "./fallbackDebug";
import { useSnapshot } from "../../state/habSession";
import { PostEvaReport, type PostEvaReportProps, type PostEvaReportData } from "../screens/scr17PostEvaReport";

export const REPORT_URL = "api/report";
export const LOG_URL = "api/log";
/** The object URL of a download lives this long after the click, so the browser has started reading it. */
const REVOKE_AFTER_MS = 60_000;

type ReportState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: PostEvaReportData };

export interface ReportRouteProps {
  /** Default: the global `fetch`. Tests pass a stub. */
  fetchImpl?: (url: string) => Promise<Response>;
  /** Default: back to the ops console. */
  onBack?: () => void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The parts the adapter reads: a body without them is not a report. */
function isApiReport(v: unknown): v is ApiPostEvaReport {
  return (
    isRecord(v) &&
    typeof v.log_hash === "string" &&
    isRecord(v.stops) &&
    Array.isArray(v.stops.details) &&
    isRecord(v.alerts) &&
    Array.isArray(v.alerts.details) &&
    isRecord(v.tasks) &&
    isRecord(v.dose) &&
    Array.isArray(v.dose.per_crew)
  );
}

async function loadReport(fetchImpl: (url: string) => Promise<Response>): Promise<ReportState> {
  let response: Response;
  try {
    response = await fetchImpl(REPORT_URL);
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "request failed" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { state: "error", message: `the response (HTTP ${response.status}) is not valid JSON` };
  }
  if (!response.ok) {
    const reason = isRecord(body) && typeof body.error === "string" ? body.error : "request refused";
    return { state: "error", message: `${reason} (HTTP ${response.status})` };
  }
  if (!isApiReport(body)) return { state: "error", message: "the response is not a post-EVA report" };
  try {
    return { state: "ready", data: adaptPostEvaReport(body) };
  } catch (err) {
    return { state: "error", message: `the report could not be read: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

const statusStyle: CSSProperties = {
  maxWidth: "800px",
  margin: "16px auto 0",
  padding: "8px 12px",
  border: "1px solid #111827",
  background: "#FFFFFF",
  color: "#111827",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "14px",
  display: "flex",
  gap: "12px",
  alignItems: "center",
  justifyContent: "space-between",
};

/**
 * Bound a Hab Core request by the link watchdog interval (FD-502): every request, including its body read,
 * must settle within `LINK_LOST_AFTER_MS`, so a wedged session surfaces as an error instead of a button
 * that never resolves. The caller owns the timer so it can clear it on unmount.
 */
function withDeadline<T>(operation: Promise<T>, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("Hab Core request timed out"));
    }, LINK_LOST_AFTER_MS);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function ReportRoute({ fetchImpl, onBack }: ReportRouteProps): ReactElement {
  const snapshot = useSnapshot();
  const [logFallback, setLogFallback] = useState<PostEvaReportProps["logFallback"]>();
  const [report, setReport] = useState<ReportState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [exportError, setExportError] = useState("");
  const exporting = useRef(false);
  const doFetch = fetchImpl ?? ((url: string) => fetch(url));

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const request = fetchImpl ?? ((url: string) => fetch(url, { signal: controller.signal }));
    const bounded = async <T,>(operation: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([operation, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Hab Core request timed out")), LINK_LOST_AFTER_MS);
          timers.add(timer);
        })]);
      } finally {
        if (timer !== undefined) { clearTimeout(timer); timers.delete(timer); }
      }
    };
    setReport({ state: "loading" });
    setLogFallback(undefined);
    void bounded(loadReport(request)).catch((error: unknown): ReportState => ({ state: "error", message: error instanceof Error ? error.message : "request failed" })).then((next) => {
      if (!live) return;
      setReport(next);
      if (next.state !== "error") return;
      logLiveFallback("report-log");
      setLogFallback({ events: [], loading: true });
      void bounded((async () => {
          const response = await request(LOG_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const events = (await response.text()).split("\n").filter(line => line.trim()).map(line => {
            const event: unknown = JSON.parse(line);
            if (!isRecord(event) || !Number.isInteger(event.seq) || typeof event.sim_time !== "string" || typeof event.actor !== "string" || typeof event.kind !== "string") throw new Error("invalid event log");
            return { seq: event.seq as number, time: event.sim_time, actor: event.actor, event: event.kind, prov: "simulated" as const };
          });
          return events;
      })()).then(events => { if (live) setLogFallback({ events }); }).catch((error: unknown) => {
        if (live) setLogFallback({ events: [], error: error instanceof Error ? error.message : "request failed" });
      });
    });
    return () => {
      live = false;
      controller.abort();
      for (const timer of timers) clearTimeout(timer);
    };
    // `doFetch` is rebuilt from the prop on each render; only a new prop or an explicit retry refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, fetchImpl]);

  const back = useCallback(() => {
    if (onBack) onBack();
    else globalThis.location.hash = "#/ops";
  }, [onBack]);

  /** GET api/log (session.jsonl) -> a JSON array of its events, downloaded as log-<session_id>.json. One at a time. */
  const exportLog = async (): Promise<void> => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      setExportError("");
      // FD-502: the export request is bounded by the same watchdog interval as the in-page log fetch, so a
      // wedged Hab Core surfaces as an error instead of a button that never resolves.
      const response = await withDeadline(doFetch(LOG_URL), () => logLiveFallback("report-export"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const lines = (await withDeadline(response.text(), () => logLiveFallback("report-export")))
        .split("\n").filter((line) => line.trim() !== "");
      const events: unknown[] = lines.map((line, i) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`log line ${i + 1} is not valid JSON`);
        }
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `log-${report.state === "ready" ? report.data.sessionId ?? "session" : "session"}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    } catch (err) {
      setExportError(`Could not export log: ${err instanceof Error ? err.message : "request failed"}`);
    } finally {
      exporting.current = false;
    }
  };

  return (
    <>
      {report.state !== "ready" && (
        <div data-slot="report-status" data-state={report.state} role={report.state === "error" ? "alert" : "status"} style={statusStyle}>
          <span>
            {report.state === "loading" ? "LOADING REPORT FROM HAB CORE …" : `REPORT UNAVAILABLE — ${report.message}`}
          </span>
          {report.state === "error" && (
            <button
              type="button"
              data-slot="report-retry"
              onClick={() => setAttempt((n) => n + 1)}
              style={{ minHeight: "44px", padding: "6px 16px", border: "1px solid #111827", background: "#FFFFFF", cursor: "pointer", fontFamily: "inherit" }}
            >
              RETRY
            </button>
          )}
        </div>
      )}
      {exportError && (
        <div className="report-route-no-print" style={{ maxWidth: "800px", margin: "8px auto 0" }}>
          <p role="alert" data-slot="report-export-error" style={{ ...statusStyle, margin: 0 }}>
            {exportError}
          </p>
        </div>
      )}
      <PostEvaReport report={report.state === "ready" ? report.data : undefined} logFallback={logFallback ? { ...logFallback, logHash: snapshot?.session.log_hash } : undefined} onBack={back} onExportLog={report.state !== "loading" ? () => { void exportLog(); } : undefined} />
    </>
  );
}
