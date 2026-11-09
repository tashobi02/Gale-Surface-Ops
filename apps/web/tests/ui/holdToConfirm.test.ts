/**
 * T24.05 Tests: Hold-to-confirm critical actions and action row (04 §D.3, §E.5; 01 FR-32, FR-40, FR-44).
 * Exercises HoldToConfirm, SummonRoverButton, AbortToHabButton, and EvaActionRow.
 */

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HoldToConfirm,
  SummonRoverButton,
  AbortToHabButton,
  EvaActionRow,
  TARGET_EVA_PX,
  HOLD_DURATION_MS,
} from "../../src/ui/eva/HoldToConfirm";
import type { HabClient } from "../../src/net/habClient";
import type { CommandResult } from "@marswalk/protocol";

describe("HoldToConfirm component (04 §D.3, §E.5)", () => {
  it("renders with required minimum touch target >= 56 px and 800 ms hold attribute", () => {
    const html = renderToStaticMarkup(
      createElement(HoldToConfirm, {
        label: "Summon rover",
        outcome: "PR1 dispatched",
        onConfirm: () => {},
      })
    );

    expect(html).toContain('data-hold="1"');
    expect(html).toContain('data-hold-duration="800ms"');
    expect(html).toContain("Summon rover");
    expect(html).toContain(`${TARGET_EVA_PX}px`);
  });

  it("renders disabled state with disabled attribute and reason", () => {
    const html = renderToStaticMarkup(
      createElement(HoldToConfirm, {
        label: "Summon rover",
        outcome: "PR1 dispatched",
        disabled: true,
        disabledReason: "Rover en route",
        onConfirm: () => {},
      })
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Rover en route");
  });

  it("renders tap-to-confirm accessibility fallback mode", () => {
    const html = renderToStaticMarkup(
      createElement(HoldToConfirm, {
        label: "Abort to hab",
        outcome: "Abort to hab — walking now",
        tapFallback: true,
        onConfirm: () => {},
      })
    );

    expect(html).toContain("Abort to hab");
    expect(html).toContain("<button");
  });
});

describe("SummonRoverButton & AbortToHabButton (01 FR-40, FR-44; 05 commands)", () => {
  it("SummonRoverButton dispatches SUMMON_VEHICLE with { crew: ['EV1'] } and no invented ETA", async () => {
    let sentCommand: unknown = null;
    const mockClient = {
      send: vi.fn(async (cmd: unknown) => {
        sentCommand = cmd;
        return {
          v: 1,
          type: "COMMAND_RESULT",
          command_id: "c-1",
          ok: true,
          event_seq: 422,
        } as CommandResult;
      }),
    } as unknown as HabClient;

    const onDispatched = vi.fn();
    const btn = SummonRoverButton({
      client: mockClient,
      crewId: "EV1",
      vehicleId: "PR1",
      onDispatched,
    });

    // Execute the button's onConfirm
    const res = await (btn.props as { onConfirm: () => Promise<unknown> }).onConfirm();

    expect(mockClient.send).toHaveBeenCalledWith({
      kind: "SUMMON_VEHICLE",
      args: { crew: ["EV1"] },
    });
    expect(onDispatched).toHaveBeenCalled();
    expect(res).toBeDefined();

    // Verify button outcome prop contains no invented "ETA 14 min" and has honest dispatch status
    expect((btn.props as { outcome: string }).outcome).not.toMatch(/ETA 14 min/);
    expect((btn.props as { outcome: string }).outcome).toBe("PR1 dispatched");

    const html = renderToStaticMarkup(btn);
    expect(html).toContain("Summon rover");
  });

  it("AbortToHabButton dispatches ABORT with { crew: ['EV1'] }", async () => {
    let sentCommand: unknown = null;
    const mockClient = {
      send: vi.fn(async (cmd: unknown) => {
        sentCommand = cmd;
        return {
          v: 1,
          type: "COMMAND_RESULT",
          command_id: "c-2",
          ok: true,
          event_seq: 423,
        } as CommandResult;
      }),
    } as unknown as HabClient;

    const onAborted = vi.fn();
    const btn = AbortToHabButton({
      client: mockClient,
      crewId: "EV1",
      onAborted,
    });

    await (btn.props as { onConfirm: () => Promise<unknown> }).onConfirm();

    expect(mockClient.send).toHaveBeenCalledWith({
      kind: "ABORT",
      args: { crew: ["EV1"] },
    });
    expect(onAborted).toHaveBeenCalled();

    expect((btn.props as { outcome: string }).outcome).toBe("Abort to hab — walking now");
    const html = renderToStaticMarkup(btn);
    expect(html).toContain("Abort to hab");
  });

  it("shows 'Queued — sends when link returns' when unlinked or NO_LINK response", async () => {
    const mockClient = {
      send: vi.fn(async () => {
        return {
          v: 1,
          type: "COMMAND_RESULT",
          command_id: "c-3",
          ok: false,
          code: "NO_LINK",
          message: "suit unlinked",
        } as CommandResult;
      }),
    } as unknown as HabClient;

    const summonBtn = SummonRoverButton({
      client: mockClient,
      linked: false,
      crewId: "EV1",
    });

    expect((summonBtn.props as { outcome: string }).outcome).toBe("Queued — sends when link returns");

    const abortBtn = AbortToHabButton({
      client: mockClient,
      linked: false,
      crewId: "EV1",
    });

    expect((abortBtn.props as { outcome: string }).outcome).toBe("Queued — sends when link returns");
  });
});

describe("EvaActionRow (04 §E.5)", () => {
  it("renders 4 action slots with touch targets >= 56 px", () => {
    const html = renderToStaticMarkup(
      createElement(EvaActionRow, {
        linked: true,
        crewId: "EV1",
      })
    );

    expect(html).toContain("Summon rover");
    expect(html).toContain("Abort to hab");
    expect(html).toContain("Task rover");
    expect(html).toContain("HUD");
    expect(html).toContain(`${TARGET_EVA_PX}px`);
  });
});
