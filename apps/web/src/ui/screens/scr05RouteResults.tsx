/**
 * SCR-05 — Route Results panel (docs/specs/03 §B; layout in docs/specs/04 §F).
 * Purpose: Show whether the plan works and why.
 * Requirements: FR-07–FR-12, FR-15, NFR-05.
 * Implemented by T09.03 (Saba Atharique).
 */

import React, { useState, useEffect, useRef, type ReactElement } from "react";
import type { PlanState, PlanStore, PlanStatus } from "../../state/planStore";
import type { MapHandle, ProvenanceKind } from "../context";
import type { Leg, NoRouteLeg, PlanResult, Warning } from "@marswalk/protocol";
import { StatusIcon } from "../components/statusIcon";
import { renderProfileChart } from "../results/profileChart";
import { renderWarningsList } from "../results/warningsList";
import { linkProfileToMap } from "../results/profileLink";
import "./scr05RouteResults.css";

export interface RouteResultsProps {
  planStore: PlanStore;
  mapHandle?: MapHandle;
  className?: string;
}

interface MetricItemProps {
  label: string;
  value: string | number;
  unit?: string;
  provenance: ProvenanceKind;
  sourceId: string;
  tooltip?: string;
}

function MetricItem({
  label,
  value,
  unit,
  provenance,
  sourceId,
  tooltip,
}: MetricItemProps): ReactElement {
  return (
    <div
      className="scr05-metric"
      data-provenance={provenance}
      data-source-id={sourceId}
      title={tooltip}
    >
      <div className="scr05-metric-label">{label}</div>
      <div className="scr05-metric-val-wrap">
        <span className="scr05-metric-value">{value}</span>
        {unit && <span className="scr05-metric-unit">{unit}</span>}
        <span
          className="scr05-provenance-chip"
          data-provenance={provenance}
          data-source-id={sourceId}
          title={`Source: ${sourceId} (${provenance})`}
        >
          {provenance.slice(0, 3).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function getAnnouncement(state: PlanState | undefined): string {
  if (!state) return "";
  const { status, result, last_error_code } = state;
  const isError = status === "Error";
  const isComputing = status === "Computing";
  const isPartial = status === "Partial" || result?.status === "PARTIAL";
  const isOverLimits = status === "OverLimits" || result?.status === "OVER_LIMITS";
  const isEmpty = status === "Empty" || (!isError && !isComputing && (!result || (state.waypoints?.length ?? 0) < 2));

  if (isError) {
    return `Plan computation failed: ${last_error_code ?? "Error"}`;
  }
  if (isComputing) {
    return "Plan computing…";
  }
  if (isEmpty) {
    return "Plan empty: Add at least one stop";
  }
  if (isPartial) {
    return "Plan updated: Partial route, unroutable legs detected";
  }
  if (isOverLimits) {
    const warnCount = result?.warnings?.length ?? 0;
    return `Plan updated: Over limits, ${warnCount} warnings`;
  }
  const warnCount = result?.warnings?.length ?? 0;
  return `Plan updated: OK, ${warnCount} warnings`;
}

/**
 * SCR-05 Route Results View (React, ADR-012, 04 §F).
 */
export function RouteResults({
  planStore,
  mapHandle,
  className = "",
}: RouteResultsProps): ReactElement {
  const [state, setState] = useState<PlanState>(() => planStore?.get() ?? ({} as PlanState));
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>(() => getAnnouncement(planStore?.get()));

  const profileRef = useRef<HTMLDivElement>(null);
  const warningsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!planStore) return;
    const unsub = planStore.subscribe((nextState) => {
      setState(nextState);
      setAnnouncement(getAnnouncement(nextState));
    });
    return unsub;
  }, [planStore]);

  const { status = "Empty", result, scenario, last_error_code } = state;
  const isError = status === "Error";
  const isComputing = status === "Computing";
  const isPartial = status === "Partial" || result?.status === "PARTIAL";
  const isOverLimits = status === "OverLimits" || result?.status === "OVER_LIMITS";
  const isEmpty = status === "Empty" || (!isError && !isComputing && (!result || (state.waypoints?.length ?? 0) < 2));

  // Mount profile chart and warnings list safely
  useEffect(() => {
    if (result && profileRef.current) {
      try {
        renderProfileChart(profileRef.current, result);
        if (mapHandle) {
          linkProfileToMap(mapHandle, profileRef.current);
        }
      } catch {
        // Handled: stub or child failure caught so panel stays usable (step 6)
      }
    }
  }, [result, mapHandle]);

  useEffect(() => {
    if (result?.warnings && warningsRef.current) {
      try {
        renderWarningsList(warningsRef.current, result.warnings);
      } catch {
        // Handled: stub or child failure caught so panel stays usable (step 6)
      }
    }
  }, [result?.warnings]);

  // Determine banner icon and reason
  let bannerStatus: "nominal" | "caution" | "warning" | "unknown" = "nominal";
  let bannerWord = "OK";
  let bannerReason = "Plan meets all constraints";

  if (isError) {
    bannerStatus = "warning";
    bannerWord = "Computation failed";
    bannerReason = last_error_code ? `Error: ${last_error_code}` : "Worker timeout or crash";
  } else if (isComputing) {
    bannerStatus = "unknown";
    bannerWord = "Computing…";
    bannerReason = "Evaluating terrain & route constraints…";
  } else if (isEmpty) {
    bannerStatus = "unknown";
    bannerWord = "Empty";
    bannerReason = "Add at least one stop";
  } else if (isPartial) {
    bannerStatus = "warning";
    bannerWord = "Partial";
    const noRouteLeg = result?.legs?.find((l) => l.status === "NO_ROUTE") as NoRouteLeg | undefined;
    bannerReason = noRouteLeg?.reason
      ? `No route: ${noRouteLeg.reason}`
      : "Some legs could not be routed";
  } else if (isOverLimits) {
    bannerStatus = "warning";
    bannerWord = "Over limits";
    const limits = result?.warnings
      ?.filter((w) => w.severity === "blocked" || w.code.includes("LIMIT") || w.code.includes("EXCEEDED"))
      ?.map((w) => w.code) ?? [];
    bannerReason = limits.length > 0 ? limits.join(", ") : "Route exceeds operating limits";
  }

  const totals = result?.totals;
  const hideTotals = isPartial || isEmpty || !totals;

  // Formatted metric values (04 §C.2, 02 §E.2)
  const distKm = !hideTotals && totals ? (totals.distance_m / 1000).toFixed(2) : "—";
  const walkTime = !hideTotals && totals ? `${totals.walk_time_min}` : "—";
  const maxDurationMin =
    scenario?.max_eva_duration_h !== undefined
      ? Math.round(scenario.max_eva_duration_h * 60)
      : 360;
  const evaTotal =
    !hideTotals && totals
      ? `${totals.eva_total_min} / ${maxDurationMin}`
      : "—";
  const maxSlope = !hideTotals && totals ? `${totals.max_slope_deg}` : "—";
  const maxWalkback =
    !hideTotals && totals
      ? `${totals.max_walkback_km} / ${scenario?.walkback_limit_km ?? 3.6}`
      : "—";
  const dose =
    !hideTotals && result?.radiation?.dose_mSv !== undefined
      ? `${result.radiation.dose_mSv}`
      : "—";

  return (
    <section
      className={`scr05-results-panel ${className}`}
      data-collapsed={isCollapsed}
      data-computing={isComputing}
      aria-label="Route Results Panel"
    >
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Header / Collapse Bar (48 px when collapsed) */}
      <div className="scr05-status-strip">
        <div className="scr05-banner-status">
          <StatusIcon status={bannerStatus} word={bannerWord} />
          <span className="scr05-banner-reason">{bannerReason}</span>
          {isError && (
            <button
              type="button"
              className="scr05-retry-btn"
              onClick={() => planStore?.retry()}
            >
              Retry
            </button>
          )}
        </div>
        <div className="scr05-strip-actions">
          {!isCollapsed && !isEmpty && result?.legs && (
            <button
              type="button"
              className="scr05-details-toggle"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
            >
              {showDetails ? "Hide details" : "Details"}
            </button>
          )}
          <button
            type="button"
            className="scr05-collapse-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand results panel" : "Collapse results panel"}
          >
            {isCollapsed ? "▲ Expand" : "▼ Collapse"}
          </button>
        </div>
      </div>

      {/* Expanded Main Panel Body */}
      {!isCollapsed && (
        <div className="scr05-body">
          {/* Middle Section: Metrics Row & Profile Chart */}
          <div className="scr05-middle-col">
            <div
              className="scr05-metrics-row"
              data-totals-hidden={hideTotals}
              style={{ opacity: isComputing ? 0.5 : 1.0 }}
            >
              <MetricItem
                label="Distance"
                value={distKm}
                unit={hideTotals ? undefined : "km"}
                provenance="derived"
                sourceId="compute:route"
                tooltip="Total traverse distance along terrain"
              />
              <MetricItem
                label="Walk Time"
                value={walkTime}
                unit={hideTotals ? undefined : "min"}
                provenance="modelled"
                sourceId="model:tobler"
                tooltip="Estimated walking time using Tobler hiking function"
              />
              <MetricItem
                label="EVA Total"
                value={evaTotal}
                unit={hideTotals ? undefined : "min"}
                provenance="derived"
                sourceId="compute:time"
                tooltip="Total EVA time vs. planned maximum duration limit"
              />
              <MetricItem
                label="Max Slope"
                value={maxSlope}
                unit={hideTotals ? undefined : "°"}
                provenance="derived"
                sourceId="mola_dem"
                tooltip="Maximum traversed slope angle"
              />
              <MetricItem
                label="Max Walkback"
                value={maxWalkback}
                unit={hideTotals ? undefined : "km"}
                provenance="modelled"
                sourceId="model:walkback"
                tooltip="Furthest walkback return distance vs limit"
              />
              <MetricItem
                label="Dose"
                value={dose}
                unit={hideTotals ? undefined : "mSv"}
                provenance="modelled"
                sourceId={result?.radiation?.const_id ?? "model:radiation"}
                tooltip="Estimated cumulative radiation dose"
              />
            </div>

            {/* Profile Chart Container */}
            <div className="scr05-profile-container" ref={profileRef}>
              {(!result?.legs || result.legs.length === 0) && (
                <div className="scr05-placeholder">
                  {isEmpty ? "Profile appears after stops are added" : "Profile loading…"}
                </div>
              )}
            </div>
          </div>

          {/* Right Section: Warnings List */}
          <div className="scr05-right-col" ref={warningsRef}>
            <div className="scr05-warnings-header">Warnings</div>
            {result?.warnings && result.warnings.length > 0 ? (
              <ul className="scr05-warnings-list">
                {result.warnings.map((w, idx) => (
                  <li
                    key={idx}
                    className={`scr05-warning-item scr05-warning-${w.severity}`}
                    data-severity={w.severity}
                  >
                    <span className="scr05-warning-badge">{w.severity.toUpperCase()}</span>
                    <span className="scr05-warning-msg">{w.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="scr05-no-warnings">No active warnings</div>
            )}
          </div>
        </div>
      )}

      {/* Per-leg Details Breakdown (Progressive disclosure, 04 §D) */}
      {!isCollapsed && showDetails && result?.legs && (
        <div className="scr05-details-table-wrap">
          <table className="scr05-details-table">
            <thead>
              <tr>
                <th>Leg</th>
                <th>From → To</th>
                <th>Status</th>
                <th>Distance</th>
                <th>Walk Time</th>
                <th>Max Slope</th>
                <th>Climb / Descent</th>
              </tr>
            </thead>
            <tbody>
              {result.legs.map((leg: Leg, i: number) => {
                const isLegOk = leg.status === "OK";
                return (
                  <tr key={i} className={`scr05-leg-row ${isLegOk ? "ok" : "no-route"}`}>
                    <td>#{i + 1}</td>
                    <td>
                      {leg.from} → {leg.to}
                    </td>
                    <td>{leg.status}</td>
                    <td>{isLegOk ? `${(leg.distance_m / 1000).toFixed(2)} km` : "—"}</td>
                    <td>{isLegOk ? `${leg.walk_time_min} min` : "—"}</td>
                    <td>{isLegOk ? `${leg.max_slope_deg}°` : "—"}</td>
                    <td>
                      {isLegOk ? `+${leg.climb_m} m / -${leg.descent_m} m` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
