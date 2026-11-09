/**
 * Minimal DOM harness for interaction tests of the real React components (NFR-04: pointer and keyboard).
 *
 * The suites stay in Vitest's default node environment, so the SSR (`renderToStaticMarkup`) suites are untouched.
 * `installDom()` puts a jsdom window on `globalThis` for the suites that click, hold and type; `removeDom()`
 * takes it away again. react-dom/client is imported only after the window exists, because it reads `window`
 * when it loads.
 *
 * jsdom is a devDependency of @marswalk/web. It is resolved with createRequire from this file so the harness
 * works whether npm hoisted it to the repository root or kept it in apps/web/node_modules.
 */
import { createRequire } from "node:module";
import { act, type ReactElement } from "react";
import type { Root } from "react-dom/client";

const nodeRequire = createRequire(import.meta.url);

type Globals = Record<string, unknown>;

let installed: string[] | null = null;
let windowRef: (Window & typeof globalThis) | null = null;

export function installDom(): void {
  if (installed) return;
  // jsdom ships no type declarations; only the part used here is described.
  const { JSDOM } = nodeRequire("jsdom") as {
    JSDOM: new (html: string, options: { url: string; pretendToBeVisual: boolean }) => { window: unknown };
  };
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Window & typeof globalThis;
  windowRef = win;
  const g = globalThis as unknown as Globals;
  const keys: string[] = [];
  const define = (key: string, value: unknown): void => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    keys.push(key);
  };
  // Window properties that Node does not already provide, plus the ones Node provides but jsdom must replace.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key === "undefined" || key === "NaN" || key === "Infinity") continue;
    if (key in g && !["navigator", "window", "self", "document"].includes(key)) continue;
    define(key, (win as unknown as Globals)[key]);
  }
  define("window", win);
  define("self", win);
  define("document", win.document);
  define("navigator", win.navigator);
  define("requestAnimationFrame", win.requestAnimationFrame.bind(win));
  define("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
  define("IS_REACT_ACT_ENVIRONMENT", true);
  installed = keys;
}

export function removeDom(): void {
  if (!installed) return;
  windowRef?.close();
  for (const key of installed) {
    delete (globalThis as unknown as Globals)[key];
  }
  installed = null;
  windowRef = null;
}

export interface Mounted {
  container: HTMLElement;
  rerender(element: ReactElement): Promise<void>;
  unmount(): Promise<void>;
}

/** Mounts a real component into the document and flushes its effects. */
export async function mount(element: ReactElement): Promise<Mounted> {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Dispatches a bubbling event inside act so React state updates flush. */
export async function fire(target: Element, event: Event): Promise<void> {
  await act(async () => {
    target.dispatchEvent(event);
  });
}

export async function click(target: Element): Promise<void> {
  await fire(target, new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
}

export async function pointerDown(target: Element): Promise<void> {
  const Ctor = (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? window.MouseEvent;
  await fire(target, new Ctor("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
}

export async function pointerUp(target: Element): Promise<void> {
  const Ctor = (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? window.MouseEvent;
  await fire(target, new Ctor("pointerup", { bubbles: true, cancelable: true, button: 0 }));
}

export async function keyDown(target: Element, key: string): Promise<void> {
  await fire(target, new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
}

export async function keyUp(target: Element, key: string): Promise<void> {
  await fire(target, new window.KeyboardEvent("keyup", { bubbles: true, cancelable: true, key }));
}

/** First element matching a selector; throws with the selector when absent so a failure names what is missing. */
export function must<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  return el;
}

/** Flush pending promise callbacks and React effects. */
export async function flush(): Promise<void> {
  await act(async () => {});
}
