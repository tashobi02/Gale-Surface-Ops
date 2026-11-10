/**
 * Tests for SCR-15 Rover Tasking (T29.04, FR-41, 03 SCR-15, 03 §C.7, 04 §E).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoverTask, type RoverTaskProps } from "../../src/ui/screens/scr15RoverTask";
import type { TaskRoverArgs } from "@marswalk/protocol";

describe("T29.04 SCR-15 Rover Tasking", () => {
  it("renders task type options: SCOUT, CARRY, RELAY, RETURN", () => {
    const html = renderToStaticMarkup(React.createElement(RoverTask, {}));

    expect(html).toContain("SCOUT");
    expect(html).toContain("CARRY");
    expect(html).toContain("RELAY");
    expect(html).toContain("RETURN");
    expect(html).toContain("UR1");
  });

  it("suggests nearest ridge for RELAY when provided (03 SCR-15)", () => {
    const props: RoverTaskProps = {
      initialTask: "RELAY",
      suggestedRelayTarget: { x_m: 1650, y_m: 2350, name: "Ridge crest alpha" },
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("Ridge crest alpha");
    expect(html).toContain("1650");
    expect(html).toContain("2350");
  });

  it("shows item input field when CARRY task is selected", () => {
    const props: RoverTaskProps = {
      initialTask: "CARRY",
      item: "Drill core sample",
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("Drill core sample");
  });

  it("RETURN task does not require coordinates and confirms return to base", () => {
    const onDispatch = vi.fn();
    const props: RoverTaskProps = {
      initialTask: "RETURN",
      onDispatch,
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("Return to Hab");
    expect(html).toContain("CONFIRM TASK");
  });

  it("displays projected coordinates with provenance (NFR-05, 02 §C.1)", () => {
    const props: RoverTaskProps = {
      initialTask: "SCOUT",
      selectedTarget: { x_m: 2100.5, y_m: -1400.0 },
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("2100.5");
    expect(html).toContain("-1400");
    expect(html).toContain('data-provenance="modelled"');
  });

  it("renders queued state when task is successfully submitted", () => {
    const props: RoverTaskProps = {
      initialState: "queued",
      lastDispatchedTask: {
        vehicle_id: "UR1",
        task: "RELAY",
        target: { x_m: 1600, y_m: 2300 },
      },
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("QUEUED");
    expect(html).toContain("RELAY");
  });

  it("renders failed state with error reason when task is rejected", () => {
    const props: RoverTaskProps = {
      initialState: "failed",
      errorMessage: "NO_ROUTE: Target unreachable due to 22° slope",
    };

    const html = renderToStaticMarkup(React.createElement(RoverTask, props));
    expect(html).toContain("FAILED");
    expect(html).toContain("Target unreachable due to 22° slope");
  });
});

