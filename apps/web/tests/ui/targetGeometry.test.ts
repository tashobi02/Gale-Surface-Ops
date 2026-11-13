import { afterAll, beforeAll, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { expectTargetSize, TARGET_SELECTOR, targets } from "../../e2e/lib/geometry";
import { installDom, removeDom } from "./domHarness";

beforeAll(installDom);
afterAll(removeDom);

for (const tag of ["textarea", "summary"] as const) {
  it(`the target sweep detects an undersized ${tag}`, async () => {
    const root = document.createElement("div");
    const control = document.createElement(tag);
    control.getBoundingClientRect = () => ({ x: 0, y: 0, width: 8, height: 8, top: 0, left: 0, bottom: 8, right: 8, toJSON: () => ({}) });
    root.id = `fixture-${tag}`; root.append(control); document.body.append(root);
    expect(control.matches(TARGET_SELECTOR)).toBe(true);
    const page = { evaluate: async (fn: (args: { scopeSelector: string; targetSelector: string }) => unknown, args: { scopeSelector: string; targetSelector: string }) => fn(args) } as unknown as Page;
    const found = await targets(page, `#${root.id}`);
    expect(found).toHaveLength(1);
    expect(() => expectTargetSize(found, 44)).toThrow(/below 44 x 44/);
    root.remove();
  });
}
