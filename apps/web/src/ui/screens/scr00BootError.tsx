/**
 * SCR-00 — Boot error (docs/specs/03 §B SCR-00, §D "Boot asset failure"; layout from the prototype frame `#scr-00-single`).
 * Purpose: explain why the app cannot start and what to do. Requirements: FR-16, NFR-10. Implemented by T14.04.
 *
 * Content (03 SCR-00): a plain-language cause, the missing file, Retry, and the run instructions. Mode OPS whichever route
 * failed (FD-207): the root carries `data-mode="ops"` and, while mounted, so does `<html>`, which is given back on unmount
 * so a retry that succeeds returns the page to its route's mode. Quiet screen: the failure is a status icon (drawn
 * octagon, shape and word, never colour alone, 04 §A.3), no brand orange, no remote asset (NFR-01). Everything from the
 * problem is rendered as text, never as markup. The heading takes focus on render and Retry is a button (04 §E).
 *
 * The run instructions are shown on the screen, as the README's Quickstart commands, and not as a link: the app runs offline
 * and no README is served, so a link would end on a missing page (FD-226). The mockup's DATA VERSION row is left out: 03
 * SCR-00 does not list it and the data version is unknown when the manifest is what failed.
 */
import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import type { BootProblem } from "../context";
import { StatusIcon } from "../components/statusIcon";
import { UNAVAILABLE } from "../components/provenance";
import "./scr00BootError.css";

export interface BootErrorScreenProps {
  problem: BootProblem;
  /** Retry runs the boot again (03 SCR-00 Exit: Retry -> boot). */
  onRetry: () => void;
}

export interface PlainCause {
  heading: string;
  cause: string;
}

const MISSING = "A required file is missing";
const INVALID = "A required file is not valid";

/** What the person reading sees for a boot problem code; an unknown code shows its own message. */
export function plainCause(problem: BootProblem): PlainCause {
  switch (problem.code) {
    case "MANIFEST_NOT_FOUND":
    case "MANIFEST_LOAD_FAILED":
      return { heading: MISSING, cause: "The site manifest could not be loaded, so the planner does not know which map data to use." };
    case "MANIFEST_PARSE_FAILED":
    case "MANIFEST_INVALID":
      return { heading: INVALID, cause: "The site manifest could not be read as a site manifest, so the planner cannot use it." };
    case "SITE_ID_MISMATCH":
      return { heading: INVALID, cause: "The site manifest is for a different site than the one asked for." };
    case "POI_ASSET_NOT_FOUND":
    case "POI_LOAD_FAILED":
      return { heading: MISSING, cause: "The points-of-interest file could not be loaded." };
    case "POI_PARSE_FAILED":
    case "POI_INVALID":
    case "POI_ASSET_UNRESOLVED":
      return { heading: INVALID, cause: "The points-of-interest file is not valid, or the manifest does not name it correctly." };
    case "GRID_NOT_LOADED":
      return { heading: "The map data failed its check", cause: "The routing grid failed its check or did not load, so no route can be computed." };
    case "NO_WORKER":
      return { heading: "This browser cannot run the planner", cause: "This browser has no Web Worker support, so routes cannot be computed. Open the app in a current browser." };
    case "WORKER_FAILED":
      return { heading: "The route calculation could not start", cause: "The compute worker could not start." };
    case "PLAN_STORE_FAILED":
      return { heading: "The route calculation could not start", cause: "The plan store could not start." };
    case "INVALID_SITE_ID":
      return { heading: "The app cannot start", cause: "The site name in the address is not allowed." };
    default:
      return { heading: "The app cannot start", cause: problem.message };
  }
}

/** Sets `<html data-mode="ops">` while mounted and restores the previous mode (FD-207). */
function useOpsMode(): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-mode");
    html.setAttribute("data-mode", "ops");
    return () => {
      if (previous === null) html.removeAttribute("data-mode");
      else html.setAttribute("data-mode", previous);
    };
  }, []);
}

/** SCR-00 view (React, ADR-012). */
export function BootErrorScreen({ problem, onRetry }: BootErrorScreenProps): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);
  useOpsMode();
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const { heading: title, cause } = plainCause(problem);
  const file = problem.missingFile;

  return (
    <main className="scr00" data-screen="SCR-00" data-slot="boot-failure" data-mode="ops" aria-labelledby="scr00-title">
      {(["tl", "tr", "bl", "br"] as const).map((corner) => (
        <i key={corner} className={`scr00-reg scr00-reg-${corner}`} aria-hidden="true" />
      ))}
      <span className="code">[ SCR-00 /// BOOT ]</span>
      <StatusIcon status="warning" word="CANNOT START" />
      <h1 id="scr00-title" ref={heading} tabIndex={-1} className="scr00-title">
        {title}
      </h1>
      <dl className="scr00-card cut cut-s">
        <dt className="code">What happened</dt>
        <dd data-slot="cause">{cause}</dd>
        <dt className="code">Missing file</dt>
        <dd
          className="scr00-mono"
          data-slot="missing-file"
          {...(file ? {} : { "data-unavailable": "true", "data-source": "unavailable:problem.missingFile" })}
        >
          {file ?? UNAVAILABLE}
        </dd>
        <dt className="code">Code</dt>
        <dd className="scr00-mono" data-slot="code">
          {problem.code}
        </dd>
      </dl>
      <div className="scr00-actions">
        <button type="button" className="btn btn-primary scr00-button" data-slot="boot-retry" onClick={onRetry}>
          Retry
        </button>
      </div>
      <details className="scr00-run" data-slot="run-instructions">
        <summary>Run instructions (README, Quickstart)</summary>
        <p>
          The site data is not in the repository. Put the site bundle in <span className="scr00-mono">data/sites/&lt;site_id&gt;/</span>, then
          start the app:
        </p>
        <pre className="scr00-mono">
          {`make demo   # production build served by the Hab Core (no internet needed)
make hab    # Hab Core on 0.0.0.0:8080 (habitat LAN)
make dev    # Vite dev server; proxies /sites, /api, /ws to the Hab Core`}
        </pre>
      </details>
      <p className="scr00-note">Fix the deployment, then retry. Nothing is guessed: no layer is shown without its file.</p>
    </main>
  );
}
