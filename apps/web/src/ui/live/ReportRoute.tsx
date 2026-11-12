/**
 * `#/report` — SCR-17 fed by the Hab Core (docs/specs/03 SCR-17; 01 FR-46; T27.03).
 *
 * GET `api/report` (relative: the page's own origin, the Hab Core; NFR-01) -> `adaptPostEvaReport` -> `PostEvaReport`.
 * Nothing is computed here. While loading, and when the request or the body fails, the report layout stays with "—" in
 * every value (04 §D.1) and a status line says which it is and why; a failed request offers RETRY. A body that is not a
 * report is an error: a half-filled report would read as a result.
 *
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { adaptPostEvaReport, type ApiPostEvaReport } from "../report/reportAdapter";
import { PostEvaReport, type PostEvaReportData } from "../screens/scr17PostEvaReport";

export const REPORT_URL = "api/report";

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

export function ReportRoute({ fetchImpl, onBack }: ReportRouteProps): ReactElement {
  const [report, setReport] = useState<ReportState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [exportError, setExportError] = useState("");
  const doFetch = fetchImpl ?? ((url: string) => fetch(url));

  useEffect(() => {
    let live = true;
    setReport({ state: "loading" });
    void loadReport(doFetch).then((next) => {
      if (live) setReport(next);
    });
    return () => {
      live = false;
    };
    // `doFetch` is rebuilt from the prop on each render; only a new prop or an explicit retry refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, fetchImpl]);

  const back = useCallback(() => {
    if (onBack) onBack();
    else globalThis.location.hash = "#/ops";
  }, [onBack]);

  const exportLog = async (): Promise<void> => {
    try {
      setExportError("");
      const response = await doFetch("api/log");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const lines = (await response.text()).split("\n").filter((line) => line.trim() !== "");
      const events: unknown[] = lines.map((line) => JSON.parse(line));
      const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `log-${report.state === "ready" ? report.data.sessionId ?? "session" : "session"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(`Could not export log: ${err instanceof Error ? err.message : "request failed"}`);
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
      {exportError && <p role="alert">{exportError}</p>}
      <PostEvaReport report={report.state === "ready" ? report.data : undefined} onBack={back} onExportLog={report.state === "ready" ? () => { void exportLog(); } : undefined} />
    </>
  );
}
