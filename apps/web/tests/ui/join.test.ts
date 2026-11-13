import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { JoinRoute } from "../../src/ui/live/JoinRoute";
import { click, flush, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => { document.body.innerHTML = ""; window.location.hash = ""; });
const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));

describe("SCR-10 join routes", () => {
  it("deep link selects role", async () => {
    await mount(createElement(JoinRoute, { fetchImpl, joinRole: "presenter" }));
    await flush();
    expect(window.location.hash).toBe("#/presenter");
  });
  it("presenter tile joins as presenter", async () => {
    const { container } = await mount(createElement(JoinRoute, { fetchImpl }));
    await flush();
    await click(must(container, 'button[aria-label="Select role Presenter"]'));
    expect(window.location.hash).toBe("#/presenter");
  });
});

import { QrDrawer } from "../../src/ui/ops/QrDrawer";

it("QR drawer retains the join link when an image fails", async () => {
  const { container } = await mount(createElement(QrDrawer));
  await click(must(container, 'button[aria-label="Join QR codes"]'));
  const img = must<HTMLImageElement>(container, 'img[alt="Join as presenter"]');
  await act(async () => { img.dispatchEvent(new window.Event("error")); });
  await flush();
  expect(container.querySelector('img[alt="Join as presenter"]')).toBeNull();
  expect(must(container, '[data-source="unavailable:api/join-qr"]').getAttribute("data-unavailable")).toBe("true");
  expect(must(container, 'a[href="#/join?role=presenter"]').textContent).toContain("presenter");
});
