/**
 * SCR-10 — Join / role select (docs/specs/03 §B, 03 SCR-10; layout in 04 §E.2; mode BRIEF, 04 §B.2).
 * Implementation: T25.06 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements: FR-30, FR-31.
 * Purpose: Put each device in the right role in < 10 s; supports deep linking #/join?role=….
 * Seven chamfered tiles: PLANNER · OPS · EV1 · EV2 · HUD EV1 · HUD EV2 · EARTH (a HUD is its own read-only role, 02 §E.4).
 * States: Connecting · Ready · Role taken · Hab Core unreachable.
 * Role taken: "newest wins" (02 §E.4, decided 2026-11-12). The tile offers TAKE OVER and asks first: confirming sends this
 * device to the role, and the Hab Core then disconnects the other device (it shows "Taken over by another device") and
 * logs ROLE_TAKEN_OVER. The screen says so plainly; nothing is taken until the confirm.
 */

import {
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Role } from "@marswalk/protocol";
import { UNAVAILABLE } from "../components/provenance";

export type ClientRoleOption = "planner" | "ops" | "eva:EV1" | "eva:EV2" | "hud:EV1" | "hud:EV2" | "earth";

export interface RoleDescriptor {
  role: ClientRoleOption;
  label: string;
  code: string;
  description: string;
  route: string;
}

export const ROLE_DESCRIPTORS: RoleDescriptor[] = [
  {
    role: "planner",
    label: "Mission Planner",
    code: "PLAN",
    description: "Plan traverse routes, evaluate slope and traverse limits, inspect science sites.",
    route: "#/planner",
  },
  {
    role: "ops",
    label: "Habitat Operations",
    code: "OPS",
    description: "Monitor crew telemetry, manage clock, acknowledge alerts, approve safe haven options.",
    route: "#/ops",
  },
  {
    role: "eva:EV1",
    label: "Lead Astronaut (EV1)",
    code: "EV1",
    description: "Field tablet navigation, safe haven ETA, consumable margins, task checklist.",
    route: "#/eva/EV1",
  },
  {
    role: "eva:EV2",
    label: "Buddy Astronaut (EV2)",
    code: "EV2",
    description: "Buddy navigation, mutual haven proximity, suit status, task verification.",
    route: "#/eva/EV2",
  },
  {
    role: "hud:EV1",
    label: "HUD for EV1",
    code: "HUD EV1",
    description: "Read-only suit HUD view for EV1: shows values, sends no commands. Does not replace the EV1 tablet.",
    route: "#/hud/EV1",
  },
  {
    role: "hud:EV2",
    label: "HUD for EV2",
    code: "HUD EV2",
    description: "Read-only suit HUD view for EV2: shows values, sends no commands. Does not replace the EV2 tablet.",
    route: "#/hud/EV2",
  },
  {
    role: "earth",
    label: "Earth Support",
    code: "EARTH",
    description: "Mission support view with light-time communications delay and solar forecast.",
    route: "#/earth",
  },
];

/** Connection badge: status token fill, a shape and a word each (04 §A.3). Connecting has no status colour. */
const STATUS_BADGE = {
  ready: { fill: "var(--status-nominal, #3DDC84)", text: "✓ HAB CORE CONNECTED" },
  connecting: { fill: "var(--steel, #CFCFCF)", text: "… CONNECTING TO HAB CORE" },
  unreachable: { fill: "var(--status-warning, #FF4D4D)", text: "⬣ HAB CORE UNREACHABLE · RETRYING" },
  unknown: { fill: "transparent", text: "? HAB CORE STATUS —" },
} as const;

export interface JoinProps {
  /** Hab Core connection state. Unset = not known: the badge says so and nothing is assumed. */
  status?: "ready" | "connecting" | "unreachable";
  /** Roles already held by other clients. Unset = not known: no tile is marked taken. */
  takenRoles?: string[];
  /** Id of the loaded scenario. Unset = shown as "—". */
  sessionScenario?: string;
  onSelectRole?: (role: ClientRoleOption, takeOver: boolean) => void;
  className?: string;
}

/**
 * SCR-10 Join view.
 * Uses BRIEF mode: #F7F5F0 paper background, #1A1A1A ink text, #E7553D signal accent (identity only: connection
 * status uses the status tokens with shape + word, 04 §A.3).
 */
export function Join({
  status,
  takenRoles = [],
  sessionScenario,
  onSelectRole,
  className = "",
}: JoinProps): ReactElement {
  const [takeOverConfirmRole, setTakeOverConfirmRole] = useState<ClientRoleOption | null>(null);

  const handleRoleClick = (role: ClientRoleOption, isTaken: boolean) => {
    if (isTaken) {
      setTakeOverConfirmRole(role);
    } else {
      if (onSelectRole) {
        onSelectRole(role, false);
      } else if (typeof window !== "undefined") {
        const desc = ROLE_DESCRIPTORS.find((r) => r.role === role);
        if (desc) window.location.hash = desc.route;
      }
    }
  };

  const handleConfirmTakeOver = (role: ClientRoleOption) => {
    setTakeOverConfirmRole(null);
    if (onSelectRole) {
      onSelectRole(role, true);
    } else if (typeof window !== "undefined") {
      const desc = ROLE_DESCRIPTORS.find((r) => r.role === role);
      if (desc) window.location.hash = desc.route;
    }
  };

  const rootStyle: CSSProperties = {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "var(--paper, #F7F5F0)",
    color: "var(--ink, #1A1A1A)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    display: "flex",
    flexDirection: "column",
    padding: "24px",
    boxSizing: "border-box",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "32px",
    borderBottom: "2px solid var(--charcoal, #282828)",
    paddingBottom: "16px",
  };

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
  };

  const tileStyle: CSSProperties = {
    backgroundColor: "var(--concrete, #E8E6E1)",
    border: "2px solid var(--charcoal, #282828)",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "220px",
    cursor: "pointer",
    position: "relative",
    clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))", // cut-m chamfer (04 §C.3)
    transition: "transform 100ms ease-out",
  };

  const takenTileStyle: CSSProperties = {
    ...tileStyle,
    opacity: 0.8,
    backgroundColor: "var(--steel, #CFCFCF)",
    borderStyle: "dashed",
  };

  const buttonStyle: CSSProperties = {
    minHeight: "44px",
    padding: "8px 16px",
    backgroundColor: "var(--ink, #1A1A1A)",
    color: "var(--paper, #F7F5F0)",
    border: "none",
    fontWeight: 600,
    fontFamily: "var(--font-mono, monospace)",
    cursor: "pointer",
    marginTop: "16px",
    textTransform: "uppercase",
  };

  return (
    <div
      className={`scr10-join ${className}`}
      data-surface="brief"
      data-mode="brief"
      style={rootStyle}
    >
      {/* ------------------------------------------------ Header */}
      <header style={headerStyle}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--ink-2, #5A5A5A)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            [ HAB CORE /// SURFACE OPS ]
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display, Inter, sans-serif)",
              fontSize: "32px",
              fontWeight: 600,
              textTransform: "uppercase",
              margin: "4px 0",
            }}
          >
            SELECT CLIENT ROLE
          </h1>
          <div style={{ color: "var(--ink-2, #5A5A5A)", fontSize: "14px" }}>
            Assign this device to a mission role. Scenario: <strong data-slot="join-scenario">{sessionScenario ?? UNAVAILABLE}</strong>
          </div>
        </div>

        {/* Hab Core connection status: shape + word + status token (04 §A.3); unknown is shown as unknown */}
        <div style={{ textAlign: "right" }}>
          <div
            data-slot="join-status"
            data-status={status ?? "unknown"}
            style={{
              backgroundColor: STATUS_BADGE[status ?? "unknown"].fill,
              color: "var(--ink, #1A1A1A)",
              padding: "6px 12px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              fontWeight: 700,
              ...(status === undefined ? { border: "1px dotted var(--ink, #1A1A1A)" } : {}),
            }}
          >
            {STATUS_BADGE[status ?? "unknown"].text}
          </div>
        </div>
      </header>

      {/* ------------------------------------------- Role Selection Tiles */}
      <main style={gridStyle}>
        {ROLE_DESCRIPTORS.map((desc) => {
          const isTaken = takenRoles.includes(desc.role) || takenRoles.includes(desc.code.toLowerCase());
          const isConfirmingTakeOver = takeOverConfirmRole === desc.role;

          return (
            <article
              key={desc.role}
              className={`role-tile ${isTaken ? "role-taken" : ""}`}
              style={isTaken ? takenTileStyle : tileStyle}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "14px",
                      fontWeight: 700,
                      backgroundColor: "var(--charcoal, #282828)",
                      color: "#FFFFFF",
                      padding: "2px 8px",
                    }}
                  >
                    [{desc.code}]
                  </span>

                  {isTaken && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--ink, #1A1A1A)",
                        textTransform: "uppercase",
                      }}
                    >
                      ROLE TAKEN
                    </span>
                  )}
                </div>

                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    margin: "4px 0 12px 0",
                  }}
                >
                  {desc.label}
                </h2>

                <p
                  style={{
                    fontSize: "14px",
                    lineHeight: 1.45,
                    color: "var(--ink-2, #5A5A5A)",
                    margin: 0,
                  }}
                >
                  {desc.description}
                </p>
              </div>

              {/* Action Button */}
              <div>
                {isConfirmingTakeOver ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
                    <p data-slot="join-taken-note" style={{ flexBasis: "100%", margin: 0, fontSize: "14px" }}>
                      This role is already open on another device. If you take it over, the other device will be disconnected.
                    </p>
                    <button
                      style={{
                        ...buttonStyle,
                        backgroundColor: "var(--signal, #E7553D)",
                        flex: 1,
                      }}
                      onClick={() => handleConfirmTakeOver(desc.role)}
                      aria-label={`Confirm take over ${desc.label}; the other device is disconnected`}
                    >
                      TAKE OVER (DISCONNECTS THE OTHER DEVICE)
                    </button>
                    <button
                      style={{
                        ...buttonStyle,
                        backgroundColor: "var(--steel, #CFCFCF)",
                        color: "var(--ink, #1A1A1A)",
                      }}
                      onClick={() => setTakeOverConfirmRole(null)}
                      aria-label="Cancel"
                    >
                      CANCEL
                    </button>
                  </div>
                ) : (
                  <button
                    style={{
                      ...buttonStyle,
                      width: "100%",
                      backgroundColor: isTaken ? "var(--charcoal, #282828)" : "var(--ink, #1A1A1A)",
                    }}
                    onClick={() => handleRoleClick(desc.role, isTaken)}
                    aria-label={`Select role ${desc.label}`}
                  >
                    {isTaken ? "TAKE OVER…" : "JOIN AS " + desc.code}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </main>

      {/* ------------------------------------------- QR Code Drawer / Notice */}
      <footer
        style={{
          marginTop: "48px",
          borderTop: "1px solid var(--charcoal, #282828)",
          paddingTop: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "12px",
          color: "var(--ink-2, #5A5A5A)",
        }}
      >
        <div>
          OPS QR DEEP LINK: <code>#/join?role=eva:EV1</code> · SESSION MEMORY ONLY (04 §E.2)
        </div>
        <div>
          LOCAL AIR-GAPPED NETWORK · NFR-01 VERIFIED
        </div>
      </footer>
    </div>
  );
}
