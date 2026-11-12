/**
 * T13.06 — Unit tests for keyboard map controls and global shortcuts (04 §E Keyboard, 03 §A, 03 SCR-08).
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { installDom, must, removeDom } from "./domHarness";
import {
  attachKeyboardControls,
  isCompositeWidget,
  isEditableElement,
  prefersReducedMotion,
  type KeyboardMapHandle,
  type KeyboardPlanContext,
} from "../../src/ui/map/keyboard";

describe("T13.06 Keyboard Controls (keyboard.ts)", () => {
  let container: HTMLDivElement;
  let mapElement: HTMLDivElement;
  let inputElement: HTMLInputElement;

  beforeAll(() => installDom());
  afterAll(() => removeDom());

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    mapElement = document.createElement("div");
    mapElement.tabIndex = 0;
    container.appendChild(mapElement);

    inputElement = document.createElement("input");
    inputElement.type = "text";
    container.appendChild(inputElement);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("isEditableElement identifies editable text inputs, textareas, and contentEditable", () => {
    expect(isEditableElement(inputElement)).toBe(true);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isEditableElement(checkbox)).toBe(false);

    const textarea = document.createElement("textarea");
    expect(isEditableElement(textarea)).toBe(true);

    const div = document.createElement("div");
    expect(isEditableElement(div)).toBe(false);
  });

  it("does NOT pan or zoom when map element is not focused (no page-wide hijacking)", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const mapHandle: KeyboardMapHandle = {
      panBy,
      zoomBy,
      getTargetElement: () => mapElement,
    };

    const cleanup = attachKeyboardControls({ mapHandle });

    // Focus is on body / container, not mapElement
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));

    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();

    cleanup();
  });

  it("does NOT pan or zoom when getTargetElement returns null (no element set)", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const mapHandle: KeyboardMapHandle = {
      panBy,
      zoomBy,
      getTargetElement: () => null,
    };

    const cleanup = attachKeyboardControls({ mapHandle });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));

    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();

    cleanup();
  });

  it("pans and zooms when map element has focus", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const mapHandle: KeyboardMapHandle = {
      panBy,
      zoomBy,
      getTargetElement: () => mapElement,
    };

    const cleanup = attachKeyboardControls({ mapHandle, panStepPx: 40 });

    mapElement.focus();
    expect(document.activeElement).toBe(mapElement);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(panBy).toHaveBeenCalledWith(0, 40, { animate: true });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(panBy).toHaveBeenCalledWith(40, 0, { animate: true });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(zoomBy).toHaveBeenCalledWith(1, { animate: true });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));
    expect(zoomBy).toHaveBeenCalledWith(-1, { animate: true });

    cleanup();
  });

  it("ignores shortcuts when typing inside an editable field", () => {
    const deleteStop = vi.fn();
    const navigate = vi.fn();
    const planContext: KeyboardPlanContext = {
      getSelectedStopId: () => "stop-1",
      deleteStop,
      canOpenBriefing: () => true,
      navigate,
    };

    const cleanup = attachKeyboardControls({ planContext });

    inputElement.focus();
    inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));

    expect(navigate).not.toHaveBeenCalled();
    expect(deleteStop).not.toHaveBeenCalled();

    cleanup();
  });

  it("handles Delete stop, Briefing (b), and Sources (?) shortcuts", () => {
    const deleteStop = vi.fn();
    const navigate = vi.fn();
    const planContext: KeyboardPlanContext = {
      getSelectedStopId: () => "wp-sulfate",
      deleteStop,
      canOpenBriefing: () => true,
      navigate,
    };

    const cleanup = attachKeyboardControls({ planContext });

    // Delete selected stop
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(deleteStop).toHaveBeenCalledWith("wp-sulfate");

    // 'b' opens briefing when canOpenBriefing is true
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    expect(navigate).toHaveBeenCalledWith("#/briefing");

    // '?' opens sources
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    expect(navigate).toHaveBeenCalledWith("#/sources");

    cleanup();
  });

  describe("map shortcuts leave other controls their own keys (package 25 review: Delete on a task button deleted the stop)", () => {
    const planContext = () => {
      const addStop = { isActive: () => false, toggle: vi.fn(), placeAtCrosshair: vi.fn() };
      const context: KeyboardPlanContext = { getSelectedStopId: () => "wp-1", deleteStop: vi.fn(), canOpenBriefing: () => true, navigate: vi.fn(), addStop };
      return { context, addStop };
    };
    const press = (target: Element, ...keys: string[]): void => {
      for (const key of keys) target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    };
    const cases: [string, string, string][] = [
      ["a button", '<button type="button">Delete task</button>', "button"],
      ["a summary", "<details open><summary>Stop tasks</summary><p>body</p></details>", "summary"],
      ["a link", '<a href="#/x">Link</a>', "a"],
      ["a [role=button]", '<div role="button" tabindex="0">Act</div>', '[role="button"]'],
      ["a select", "<select><option>one</option></select>", "select"],
      ["a checkbox", '<input type="checkbox">', 'input[type="checkbox"]'],
      ["a textarea", "<textarea></textarea>", "textarea"],
      ["a contenteditable", '<div contenteditable="true">text</div>', "[contenteditable]"],
      ["an element inside a button", '<button type="button"><span id="inner">Delete</span></button>', "#inner"],
    ];
    it.each(cases)("Delete, b, ? and a do nothing on %s", (_name, html, selector) => {
      container.insertAdjacentHTML("beforeend", html);
      const { context, addStop } = planContext();
      const cleanup = attachKeyboardControls({ planContext: context, mapHandle: { panBy: vi.fn(), zoomBy: vi.fn(), getTargetElement: () => mapElement } });
      press(must(container, selector), "Delete", "b", "B", "?", "a");
      expect(context.deleteStop).not.toHaveBeenCalled();
      expect(context.navigate).not.toHaveBeenCalled();
      expect(addStop.toggle).not.toHaveBeenCalled();
      cleanup();
    });

    it("still fires from the map viewport, the body and a control inside the map", () => {
      const control = document.createElement("button");
      mapElement.appendChild(control);
      const { context, addStop } = planContext();
      const cleanup = attachKeyboardControls({ planContext: context, mapHandle: { panBy: vi.fn(), zoomBy: vi.fn(), getTargetElement: () => mapElement } });
      press(mapElement, "Delete");
      press(document.body, "Delete");
      press(control, "Delete");
      expect(context.deleteStop).toHaveBeenCalledTimes(3);
      press(mapElement, "a");
      press(control, "a");
      expect(addStop.toggle).toHaveBeenCalledTimes(2);
      press(document.body, "b");
      expect(context.navigate).toHaveBeenCalledWith("#/briefing");
      cleanup();
    });

    it("keeps arrow panning on a control inside the map but not on one outside it", () => {
      const inside = document.createElement("button");
      mapElement.appendChild(inside);
      const outside = document.createElement("button");
      container.appendChild(outside);
      const panBy = vi.fn();
      const cleanup = attachKeyboardControls({ mapHandle: { panBy, zoomBy: vi.fn(), getTargetElement: () => mapElement } });
      inside.focus();
      press(inside, "ArrowUp");
      expect(panBy).toHaveBeenCalledTimes(1);
      outside.focus();
      press(outside, "ArrowUp");
      expect(panBy).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  it("does not open briefing when canOpenBriefing returns false", () => {
    const navigate = vi.fn();
    const planContext: KeyboardPlanContext = {
      getSelectedStopId: () => null,
      deleteStop: vi.fn(),
      canOpenBriefing: () => false,
      navigate,
    };

    const cleanup = attachKeyboardControls({ planContext });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    expect(navigate).not.toHaveBeenCalled();

    cleanup();
  });

  it("passes { animate: false } to pan and zoom under prefers-reduced-motion (04 §E Motion)", () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query }));
    vi.stubGlobal("matchMedia", matchMedia);
    (window as unknown as { matchMedia: unknown }).matchMedia = matchMedia;
    expect(prefersReducedMotion()).toBe(true);

    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const mapHandle: KeyboardMapHandle = { panBy, zoomBy, getTargetElement: () => mapElement };
    const cleanup = attachKeyboardControls({ mapHandle, panStepPx: 40 });
    mapElement.focus();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    expect(panBy).toHaveBeenCalledWith(0, -40, { animate: false });
    expect(zoomBy).toHaveBeenCalledWith(1, { animate: false });

    cleanup();
    vi.unstubAllGlobals();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it("cleanup removes the listener: keys after cleanup() do nothing", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const deleteStop = vi.fn();
    const navigate = vi.fn();
    const mapHandle: KeyboardMapHandle = { panBy, zoomBy, getTargetElement: () => mapElement };
    const planContext: KeyboardPlanContext = {
      getSelectedStopId: () => "stop-1",
      deleteStop,
      canOpenBriefing: () => true,
      navigate,
    };
    const cleanup = attachKeyboardControls({ mapHandle, planContext });
    mapElement.focus();

    cleanup();

    for (const key of ["ArrowDown", "+", "-", "Delete", "b", "?"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();
    expect(deleteStop).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("modifier guard: Ctrl+b, Meta+b and Alt+? do not open briefing or sources", () => {
    const navigate = vi.fn();
    const planContext: KeyboardPlanContext = {
      getSelectedStopId: () => null,
      deleteStop: vi.fn(),
      canOpenBriefing: () => true,
      navigate,
    };
    const cleanup = attachKeyboardControls({ planContext });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", altKey: true }));
    expect(navigate).not.toHaveBeenCalled();

    // Control: the plain key still works, so the guard (not a broken setup) is what blocked the above.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
    expect(navigate).toHaveBeenCalledWith("#/briefing");

    cleanup();
  });

  it("keyboard: no pan without a focused map target", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    // No getTargetElement at all, and a handle whose element is not focused: neither may pan or zoom.
    const noTarget = attachKeyboardControls({ mapHandle: { panBy, zoomBy } });
    const other = document.createElement("button");
    container.appendChild(other);
    other.focus();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-"]) {
      const ev = new KeyboardEvent("keydown", { key, cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();
    noTarget();

    // A handle that does name its element, while a different element holds focus: still no pan or zoom.
    const withTarget = attachKeyboardControls({ mapHandle: { panBy, zoomBy, getTargetElement: () => mapElement } });
    other.focus();
    expect(document.activeElement).toBe(other);
    for (const key of ["ArrowUp", "ArrowLeft", "+", "-"]) {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      other.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();
    withTarget();
  });

  it("keyboard: arrows inside radio groups/listboxes are not prevented", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const cleanup = attachKeyboardControls({
      mapHandle: { panBy, zoomBy, getTargetElement: () => mapElement },
    });

    const radio = document.createElement("input");
    radio.type = "radio";
    const group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    group.appendChild(radio);
    const listbox = document.createElement("ul");
    listbox.setAttribute("role", "listbox");
    const option = document.createElement("li");
    option.setAttribute("role", "option");
    option.tabIndex = 0;
    listbox.appendChild(option);
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const menuitem = document.createElement("button");
    menuitem.setAttribute("role", "menuitem");
    menu.appendChild(menuitem);
    const slider = document.createElement("div");
    slider.setAttribute("role", "slider");
    slider.tabIndex = 0;
    mapElement.append(group, listbox, menu, slider);

    for (const focused of [radio, option, menuitem, slider]) {
      focused.focus();
      expect(document.activeElement).toBe(focused);
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "-"]) {
        const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        focused.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
      }
    }
    expect(panBy).not.toHaveBeenCalled();
    expect(zoomBy).not.toHaveBeenCalled();

    // Control: the map element itself still pans, so the guard (not a broken setup) blocked the above.
    mapElement.focus();
    const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    mapElement.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(panBy).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("isCompositeWidget is role-based and looks at ancestors", () => {
    const group = document.createElement("div");
    group.setAttribute("role", "radiogroup");
    const inner = document.createElement("span");
    group.appendChild(inner);
    expect(isCompositeWidget(inner)).toBe(true);
    expect(isCompositeWidget(document.createElement("div"))).toBe(false);
    expect(isCompositeWidget(null)).toBe(false);
  });

  it("keyboard: a map mounted inside a toolbar/grid ancestor still pans (the composite check stops at the map)", () => {
    const panBy = vi.fn();
    const zoomBy = vi.fn();
    const toolbar = document.createElement("div");
    toolbar.setAttribute("role", "toolbar");
    const grid = document.createElement("div");
    grid.setAttribute("role", "grid");
    toolbar.appendChild(grid);
    const innerMap = document.createElement("div");
    innerMap.tabIndex = 0;
    grid.appendChild(innerMap);
    container.appendChild(toolbar);

    const cleanup = attachKeyboardControls({ mapHandle: { panBy, zoomBy, getTargetElement: () => innerMap } });
    innerMap.focus();
    const ev = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
    innerMap.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(panBy).toHaveBeenCalledTimes(1);

    // A map element that is itself role=grid is not "inside" a composite either.
    innerMap.setAttribute("role", "grid");
    innerMap.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    expect(panBy).toHaveBeenCalledTimes(2);
    expect(isCompositeWidget(innerMap, innerMap)).toBe(false);
    cleanup();
  });

  it("isCompositeWidget accepts SVG targets (Element, not only HTMLElement)", () => {
    const group = document.createElement("div");
    group.setAttribute("role", "slider");
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    const circle = document.createElementNS(svgNs, "circle");
    svg.appendChild(circle);
    group.appendChild(svg);
    expect(circle instanceof HTMLElement).toBe(false);
    expect(isCompositeWidget(circle)).toBe(true);
    const outer = document.createElement("div");
    outer.appendChild(group);
    expect(isCompositeWidget(circle, outer)).toBe(true);
    const lone = document.createElementNS(svgNs, "circle");
    expect(isCompositeWidget(lone)).toBe(false);
  });
});
