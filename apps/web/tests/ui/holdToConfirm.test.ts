/**
 * HoldToConfirm follow-ups (docs/specs/04 §D.3; 01 FR-32, FR-40, FR-44): a hold that the finger leaves, loses the pointer
 * capture of, or that is disabled underneath it never confirms; the declared hold duration is the one in use.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HOLD_DURATION_MS, HoldToConfirm } from "../../src/ui/eva/HoldToConfirm";
import { accepted } from "./fixtureStore";
import { click, fire, flush, installDom, mount, must, pointerDown, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const press = (onConfirm: () => unknown, extra: Record<string, unknown> = {}) =>
  createElement(HoldToConfirm, { label: "Test action", outcome: "Test accepted", onConfirm: onConfirm as () => void, ...extra });

const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

/** What a browser sends when the pointer leaves the element: pointerout with no related target (React derives onPointerLeave from it). */
const leave = (target: Element) => fire(target, new window.MouseEvent("pointerout", { bubbles: true, relatedTarget: null }));
const lostCapture = (target: Element) => fire(target, new window.Event("lostpointercapture", { bubbles: true }));

describe("a hold the pointer abandons is cancelled", () => {
  it("leaving the button mid-hold cancels: waiting out the rest of the hold never confirms", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await advance(300);
    expect(button.getAttribute("data-phase")).toBe("holding");
    await leave(button);
    expect(button.getAttribute("data-phase")).toBe("cancelled");
    await advance(HOLD_DURATION_MS * 2);
    await flush();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("losing the pointer capture mid-hold cancels", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await advance(300);
    await lostCapture(button);
    expect(button.getAttribute("data-phase")).toBe("cancelled");
    await advance(HOLD_DURATION_MS * 2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("moving the pointer outside the button's box (a captured touch never leaves) cancels", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");
    button.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 160, width: 200, height: 60, x: 100, y: 100, toJSON: () => ({}) });

    await pointerDown(button);
    await advance(200);
    const move = (x: number, y: number) => fire(button, new window.MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
    await move(150, 130);
    expect(button.getAttribute("data-phase")).toBe("holding");
    await move(150, 400);
    expect(button.getAttribute("data-phase")).toBe("cancelled");
    await advance(HOLD_DURATION_MS * 2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a completed hold is not undone by the pointer leaving afterwards", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await advance(HOLD_DURATION_MS + 50);
    await flush();
    await leave(button);
    await lostCapture(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("data-phase")).not.toBe("cancelled");
  });
});

describe("disabled flipping underneath the control", () => {
  it("disabled turning on mid-hold stops the hold: it never confirms", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const view = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(view.container, "button");

    await pointerDown(button);
    await advance(400);
    await view.rerender(press(onConfirm, { disabled: true }));
    await advance(HOLD_DURATION_MS * 2);
    await flush();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.getAttribute("data-phase")).toBe("idle");
    expect(button.disabled).toBe(true);
  });

  it("disabled turning on while 'Confirm' is armed (tap fallback) does not confirm on the next tap", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const view = await mount(press(onConfirm, { tapFallback: true }));
    const button = must<HTMLButtonElement>(view.container, "button");

    await click(button);
    expect(button.getAttribute("data-phase")).toBe("confirm");
    await view.rerender(press(onConfirm, { tapFallback: true, disabled: true }));
    await click(button);
    await flush();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.getAttribute("data-phase")).toBe("idle");
  });

  it("a hold that started while enabled and is still enabled at the end confirms exactly once", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const view = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(view.container, "button");

    await pointerDown(button);
    await advance(400);
    await view.rerender(press(onConfirm, { disabledReason: "unrelated prop change" }));
    await advance(HOLD_DURATION_MS);
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("data-hold-duration reflects the hold in use", () => {
  it("declares 800ms by default and the prop's value when it is set", () => {
    expect(renderToStaticMarkup(press(() => {}))).toContain('data-hold-duration="800ms"');
    expect(renderToStaticMarkup(press(() => {}, { holdDurationMs: 1200 }))).toContain('data-hold-duration="1200ms"');
    expect(renderToStaticMarkup(press(() => {}, { holdDurationMs: 1200 }))).not.toContain('data-hold-duration="800ms"');
  });

  it("a hold of the declared length confirms at that length, not at 800 ms", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm, { holdDurationMs: 1200 }));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await advance(HOLD_DURATION_MS + 50);
    expect(onConfirm).not.toHaveBeenCalled();
    await advance(400);
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
