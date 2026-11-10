/**
 * T13.06 — Unit tests for keyboard map controls and global shortcuts (04 §E Keyboard, 03 §A, 03 SCR-08).
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { installDom, removeDom } from "./domHarness";
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
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        focused.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
      }
    }
    expect(panBy).not.toHaveBeenCalled();

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
});
