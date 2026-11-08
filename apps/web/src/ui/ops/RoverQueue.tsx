/**
 * Rover task queue display (ETA and battery) on the utility rover card (SCR-11).
 * FR-41, NFR-05, 04 §E.10 Specimen card.
 * Implemented by T29.05 (Saba Atharique).
 */

import React, { type ReactElement } from "react";
import type { Vehicle, RoverTaskKind } from "@marswalk/protocol";
import type { ProvenanceKind } from "../context";

export interface QueuedRoverTask {
  taskId?: string;
  kind: RoverTaskKind | "SUMMON";
  target?: { x_m: number; y_m: number };
  item?: string;
  eta_s?: number | null;
  battery_wh?: number | null;
}

export interface RoverQueueProps {
  vehicle: Vehicle;
  queuedTasks?: QueuedRoverTask[];
  className?: string;
}

/**
 * Metric chip with explicit data provenance attributes (NFR-05, FR-15).
 */
function RoverMetricValue({
  label,
  value,
  unit,
  provenance,
  sourceId,
}: {
  label: string;
  value: string | number;
  unit?: string;
  provenance: ProvenanceKind;
  sourceId: string;
}): ReactElement {
  return (
    <div
      className="rover-metric"
      data-provenance={provenance}
      data-source-id={sourceId}
    >
      <span className="rover-metric-label">{label}</span>
      <div className="rover-metric-value-wrap">
        <span className="rover-metric-num">{value}</span>
        {unit && <span className="rover-metric-unit">{unit}</span>}
        <span
          className="rover-provenance-badge"
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

/**
 * SCR-11 utility rover queue display (ADR-012, 04 §E.10).
 */
export function RoverQueue({
  vehicle,
  queuedTasks = [],
  className = "",
}: RoverQueueProps): ReactElement {
  const { vehicle_id, state, task, eta_s, battery_wh } = vehicle;
  const hasActiveTask = task !== null && task !== undefined;
  const hasQueuedTasks = queuedTasks.length > 0;

  return (
    <div className={`rover-queue-card ${className}`} data-vehicle-id={vehicle_id}>
      {/* Specimen card header (04 §E.10) */}
      <div className="rover-card-header">
        <span className="rover-code">[{vehicle_id}]</span>
        <span className="rover-state-badge" data-state={state}>
          {state}
        </span>
      </div>

      {/* Active task section */}
      <div className="rover-active-section">
        <div className="rover-section-label">Active Task</div>
        {hasActiveTask ? (
          <div className="rover-task-active">
            <div className="rover-task-main">
              <span className="rover-task-kind">{task.kind}</span>
              {task.item && <span className="rover-task-item">Item: {task.item}</span>}
              {task.target && (
                <span
                  className="rover-task-target"
                  data-provenance="simulated"
                  data-source-id="sim:vehicle"
                >
                  ({Math.round(task.target.x_m)}, {Math.round(task.target.y_m)})
                </span>
              )}
            </div>

            <div className="rover-metrics-grid">
              {eta_s !== null && eta_s !== undefined && (
                <RoverMetricValue
                  label="ETA"
                  value={eta_s}
                  unit="s"
                  provenance="modelled"
                  sourceId="model:rover-kinematics"
                />
              )}
              {battery_wh !== null && battery_wh !== undefined && (
                <RoverMetricValue
                  label="Battery"
                  value={battery_wh}
                  unit="Wh"
                  provenance="simulated"
                  sourceId="sim:battery"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="rover-empty-msg">No active task</div>
        )}
      </div>

      {/* Queued tasks list */}
      <div className="rover-queued-section">
        <div className="rover-section-label">Queued Tasks ({queuedTasks.length})</div>
        {hasQueuedTasks ? (
          <ul className="rover-task-list">
            {queuedTasks.map((t, idx) => (
              <li key={t.taskId ?? idx} className="rover-task-queued-item">
                <span className="rover-task-kind">{t.kind}</span>
                {t.item && <span className="rover-task-item">{t.item}</span>}
                {t.eta_s !== null && t.eta_s !== undefined && (
                  <RoverMetricValue
                    label="ETA"
                    value={t.eta_s}
                    unit="s"
                    provenance="modelled"
                    sourceId="model:rover-kinematics"
                  />
                )}
                {t.battery_wh !== null && t.battery_wh !== undefined && (
                  <RoverMetricValue
                    label="Est. Batt"
                    value={t.battery_wh}
                    unit="Wh"
                    provenance="modelled"
                    sourceId="model:battery-drain"
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rover-empty-msg">No queued tasks</div>
        )}
      </div>
    </div>
  );
}
