/**
 * FD-115 — the one shared Notice element for the 03 §D notices ("Outside mapped area", "Slope too steep", ...).
 * A polite status region that is always in the DOM (so a screen reader hears a message that appears later), with the status
 * icon and word (04 §A.3 #2), and a Dismiss button.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { Notice } from "../../src/ui/components/Notice";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
});

describe("Notice (FD-115)", () => {
  it("is an empty polite status region when there is no message", async () => {
    const m = await mountRaw(createElement(Notice, { message: null }));
    open.push(m);
    const el = must(m.container, '[data-slot="notice"]');
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.textContent).toBe("");
    expect(el.getAttribute("data-empty")).toBe("true");
  });

  it("shows the message with a status icon and its word, never colour alone", async () => {
    const m = await mountRaw(createElement(Notice, { message: "Outside mapped area", status: "caution" }));
    open.push(m);
    const el = must(m.container, '[data-slot="notice"]');
    expect(el.textContent).toContain("Outside mapped area");
    expect(el.textContent).toContain("CAUTION");
    expect(el.getAttribute("data-status")).toBe("caution");
    expect(el.getAttribute("data-empty")).toBeNull();
  });

  it("Dismiss calls back when given a handler", async () => {
    const onDismiss = vi.fn();
    const m = await mountRaw(createElement(Notice, { message: "Slope too steep", onDismiss }));
    open.push(m);
    await click(must(m.container, '[data-action="dismiss-notice"]'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no Dismiss button without a handler", async () => {
    const m = await mountRaw(createElement(Notice, { message: "x" }));
    open.push(m);
    expect(m.container.querySelector('[data-action="dismiss-notice"]')).toBeNull();
  });

  it("shows a message that carries its own labelled values (a ReactNode), not only a string", async () => {
    const message = createElement("span", { "data-provenance": "derived", "data-source": "usgs-gale-dem-1m-v3" }, "22.0°");
    const m = await mountRaw(createElement(Notice, { message, status: "warning" }));
    open.push(m);
    expect(must(m.container, '[data-slot="notice"] [data-provenance]').textContent).toBe("22.0°");
    expect(must(m.container, '[data-slot="notice"]').getAttribute("data-status")).toBe("warning");
  });

  it("renders its action buttons (a snap offer: use the snapped position, place elsewhere) and calls the one pressed", async () => {
    const accept = vi.fn();
    const decline = vi.fn();
    const m = await mountRaw(
      createElement(Notice, {
        message: "Not walkable here",
        status: "warning",
        actions: [
          { action: "accept-snap", label: "Use snapped position", onClick: accept },
          { action: "decline-snap", label: "Place elsewhere", onClick: decline },
        ],
      }),
    );
    open.push(m);
    const buttons = [...m.container.querySelectorAll<HTMLButtonElement>("[data-slot='notice'] button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Use snapped position", "Place elsewhere"]);
    await click(must(m.container, '[data-action="decline-snap"]'));
    expect(decline).toHaveBeenCalledTimes(1);
    expect(accept).not.toHaveBeenCalled();
  });
});
