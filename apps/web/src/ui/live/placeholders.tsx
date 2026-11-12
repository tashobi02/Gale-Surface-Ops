/**
 * What a route shows when its screen cannot: not built yet, unknown address, render failure
 * (docs/specs/03 §D; T07.03 step 4 "never a blank page"). Plain, neutral chrome: no status colours (04 §A.3) and
 * no brand orange. Every missing value is "—". A boot failure is SCR-00 (screens/scr00BootError.tsx), not a placeholder.
 */
import { Component, type CSSProperties, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { UNAVAILABLE } from "../components/provenance";
import { isNotBuilt } from "../../boot/bootPlanner";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: "32px",
  background: "var(--surface-0, #F7F5F0)",
  color: "var(--fg-1, #1A1A1A)",
  fontFamily: "var(--font-ui, Inter, sans-serif)",
};

const linkStyle: CSSProperties = { color: "inherit", textDecoration: "underline", marginRight: "16px" };

function HomeLinks(): ReactElement {
  return (
    <p style={{ marginTop: "24px" }}>
      <a href="#/join" style={linkStyle}>
        Join (SCR-10)
      </a>
      <a href="#/sources" style={linkStyle}>
        Sources (SCR-09)
      </a>
    </p>
  );
}

export interface NotBuiltProps {
  /** Screen id of 03 §B, e.g. "SCR-16". */
  screen: string;
  /** Name of the screen. */
  label: string;
  /** Why or where it is tracked, e.g. "TASK-18". Unset reads "—". */
  task?: string;
}

/** A screen that is not built: names it, says where it is tracked, and gives a way on. */
export function NotBuilt({ screen, label, task }: NotBuiltProps): ReactElement {
  return (
    <main data-slot="not-built" data-screen-id={screen} style={pageStyle}>
      <p className="code" style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
        [ {screen} ]
      </p>
      <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{label} — not built yet</h1>
      <p>
        Tracked in <span data-source="docs/tasks/status.md">{task ?? UNAVAILABLE}</span>. No values are shown here.
      </p>
      <HomeLinks />
    </main>
  );
}

/** The address names no route: a "—" screen and a way on, with nothing of the typed address echoed. */
export function UnknownRoute(): ReactElement {
  return (
    <main data-screen="unknown" data-surface="brief" style={pageStyle}>
      <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{UNAVAILABLE}</h1>
      <p>No screen is at this address.</p>
      <HomeLinks />
    </main>
  );
}

interface BoundaryProps extends NotBuiltProps {
  children: ReactNode;
}

/**
 * Catches a screen that throws while rendering. The "TODO(...)" stub error becomes the not-built placeholder; any other
 * error is shown as text (and logged), so a broken screen never leaves a blank page.
 */
export class RouteBoundary extends Component<BoundaryProps, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (!isNotBuilt(error)) console.error("Screen failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isNotBuilt(error)) return <NotBuilt screen={this.props.screen} label={this.props.label} task={this.props.task} />;
    return (
      <main data-slot="screen-error" role="alert" style={pageStyle}>
        <p className="code" style={{ margin: 0, fontFamily: "var(--font-mono, monospace)" }}>
          [ {this.props.screen} ]
        </p>
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{this.props.label} failed to render</h1>
        <p>{error instanceof Error ? error.message : UNAVAILABLE}</p>
        <HomeLinks />
      </main>
    );
  }
}
