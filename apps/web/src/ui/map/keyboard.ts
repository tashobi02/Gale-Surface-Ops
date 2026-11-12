/**
 * Keyboard map controls and global shortcuts (04 §E Keyboard, 03 §A, 03 SCR-02, 03 SCR-08).
 * Implementation: T13.06 (Ridita Alam, R5 EVA & Ops UI · design system).
 *
 * Shortcuts:
 * - Map focus: Arrow keys pan; +/− zoom (04 §E).
 * - Delete: removes selected stop (C11, 03 §C.3).
 * - B: opens Briefing (#/briefing) when plan is computed; disabled if no stops or on error (03 SCR-08, 04 §D).
 * - ?: opens Sources & Methods (#/sources) (03 SCR-02).
 * - A toggles and Enter places at the crosshair through `planContext.addStop`, the add-stop mode's own controller (T08.07, FD-117):
 *   this file only delegates. Without `addStop` neither key is bound. Enter on a button or link is left to that control.
 * - Shortcuts are ignored when focus is in an input or editable field.
 * - Arrow keys are never hijacked (no preventDefault, no pan) when focus is inside a composite widget
 *   (radio group, listbox, menu, slider, tabs, ...): those own the arrows (04 §E, WAI-ARIA APG).
 * - Mounted by `createMap` (ui/map/createMap.ts, T07.06), whose focusable viewport is `getTargetElement`; the planner
 *   passes its `planContext` (Delete, B, ?) through `createMap`'s `keyboard` option. The screen that composes the
 *   map (SCR-02, T07.08, scr02MapWorkspace.tsx) passes its `planContext` there: the start waypoint is never offered to
 *   Delete, and B is enabled only for OK, Over limits or Partial with a stop.
 * - Instant view transitions when prefers-reduced-motion is active (04 §E Motion).
 */

export interface KeyboardMapHandle {
  /** Pan map by dx, dy (pixels or projected metres). */
  panBy: (dx: number, dy: number, options?: { animate?: boolean }) => void;
  /** Zoom map in (+1) or out (-1). */
  zoomBy: (delta: number, options?: { animate?: boolean }) => void;
  /** Optional reference to map container element. */
  getTargetElement?: () => HTMLElement | null;
}

export interface KeyboardPlanContext {
  /** Returns the id of the currently selected stop, or null. */
  getSelectedStopId: () => string | null;
  /** Removes the stop with the given id and triggers plan recomputation (03 §C.3). */
  deleteStop: (id: string) => void;
  /**
   * Returns true if the Briefing button is enabled:
   * plan is computed (OK, Over limits, Partial) and stops > 0.
   * False if no stops or after computation error (04 §D, 03 SCR-08).
   */
  canOpenBriefing: () => boolean;
  /** Optional custom navigation handler (defaults to hash assignment). */
  navigate?: (route: string) => void;
  /** The add-stop mode (T08.07): `A` toggles it and `Enter` places at the crosshair while it is on (FD-117). */
  addStop?: AddStopControl;
}

export interface AddStopControl {
  isActive: () => boolean;
  toggle: () => void;
  placeAtCrosshair: () => void | Promise<void>;
}

export interface KeyboardControlsOptions {
  mapHandle?: KeyboardMapHandle;
  planContext?: KeyboardPlanContext;
  /** Custom root element or window (defaults to global window). */
  target?: Window | HTMLElement;
  /** Step size in pixels for arrow key pans (default 50). */
  panStepPx?: number;
}

/** Check if the event target is a text input, textarea, or contentEditable element. */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === "input") {
    const inputType = (target as HTMLInputElement).type?.toLowerCase();
    // Non-text inputs (checkbox, radio, button) can still accept map shortcuts
    return !["checkbox", "radio", "button", "submit", "reset"].includes(inputType);
  }
  if (tag === "textarea" || tag === "select") {
    return true;
  }
  return Boolean(target.isContentEditable);
}

/** ARIA roles whose widgets use the arrow keys themselves (WAI-ARIA Authoring Practices composite widgets). */
const COMPOSITE_ROLES = [
  "radiogroup",
  "radio",
  "listbox",
  "option",
  "menu",
  "menubar",
  "menuitem",
  "menuitemradio",
  "menuitemcheckbox",
  "slider",
  "spinbutton",
  "scrollbar",
  "tablist",
  "tab",
  "tree",
  "treeitem",
  "grid",
  "treegrid",
  "combobox",
  "toolbar",
];

const COMPOSITE_SELECTOR = [
  ...COMPOSITE_ROLES.map((role) => `[role="${role}"]`),
  "input[type='radio']",
  "input[type='range']",
  "select",
].join(",");

/**
 * True when the element is, or sits inside, a composite widget that owns the arrow keys (role-based).
 * With `boundary` (the map element) only widgets strictly inside it count: a map mounted inside a toolbar or grid
 * must still pan, and a map element that itself carries such a role is not "inside" a widget.
 */
export function isCompositeWidget(target: EventTarget | null, boundary?: Element | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }
  const widget = target.closest(COMPOSITE_SELECTOR);
  if (widget === null) {
    return false;
  }
  return !boundary || (widget !== boundary && boundary.contains(widget));
}

/** Default hash navigation matching 03 §A routes. */
export function defaultNavigate(route: string): void {
  if (typeof window !== "undefined") {
    const cleanRoute = route.startsWith("#") ? route : `#${route.startsWith("/") ? "" : "/"}${route}`;
    window.location.hash = cleanRoute;
  }
}

/** Check if prefers-reduced-motion is requested (04 §E Motion). */
export function prefersReducedMotion(): boolean {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

/**
 * Attach global and map keyboard event listeners.
 * Returns an unsubscribe cleanup function.
 */
export function attachKeyboardControls(options: KeyboardControlsOptions = {}): () => void {
  const {
    mapHandle,
    planContext,
    target = typeof window !== "undefined" ? window : undefined,
    panStepPx = 50,
  } = options;

  if (!target) {
    return () => {};
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    // 1. Ignore shortcuts when typing in inputs or contentEditable (04 §E)
    if (isEditableElement(event.target)) {
      return;
    }

    // Never trigger shortcuts if modifier keys (Ctrl/Cmd/Alt) are pressed, unless Shift for '?'
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = event.key;
    const reducedMotion = prefersReducedMotion();
    const animate = !reducedMotion;

    // 2. Map panning & zooming (04 §E)
    // Arrow keys and +/− must only pan/zoom when the map element actually has focus
    // (never hijack page-wide when no target element is set).
    const mapElement = mapHandle?.getTargetElement?.();
    const mapHasFocus = Boolean(
      mapElement &&
        (mapElement === document.activeElement ||
          (typeof mapElement.contains === "function" && mapElement.contains(document.activeElement))),
    );

    // A radio group, listbox, menu or slider inside the map container keeps its own arrow-key behaviour.
    const inComposite = isCompositeWidget(event.target, mapElement) || isCompositeWidget(document.activeElement, mapElement);

    if (mapHandle && mapHasFocus && !inComposite) {
      switch (key) {
        case "ArrowUp":
          event.preventDefault();
          mapHandle.panBy(0, -panStepPx, { animate });
          return;
        case "ArrowDown":
          event.preventDefault();
          mapHandle.panBy(0, panStepPx, { animate });
          return;
        case "ArrowLeft":
          event.preventDefault();
          mapHandle.panBy(-panStepPx, 0, { animate });
          return;
        case "ArrowRight":
          event.preventDefault();
          mapHandle.panBy(panStepPx, 0, { animate });
          return;
        case "+":
        case "=":
          event.preventDefault();
          mapHandle.zoomBy(1, { animate });
          return;
        case "-":
        case "_":
          event.preventDefault();
          mapHandle.zoomBy(-1, { animate });
          return;
      }
    }

    // 2b. Add-stop mode (T08.07, FD-117): A toggles; Enter places at the crosshair, unless a button or link has focus.
    if (planContext?.addStop) {
      if (key === "a" || key === "A") {
        event.preventDefault();
        planContext.addStop.toggle();
        return;
      }
      if (key === "Enter" && planContext.addStop.isActive()) {
        const control = event.target instanceof Element ? event.target.closest("button, a, [role='button'], [role='switch'], [role='radio'], [role='tab']") : null;
        if (!control) {
          event.preventDefault();
          void planContext.addStop.placeAtCrosshair();
          return;
        }
      }
    }

    // 3. Delete selected stop (C11, 03 §C.3)
    if (key === "Delete" && planContext) {
      const selectedId = planContext.getSelectedStopId();
      if (selectedId) {
        event.preventDefault();
        planContext.deleteStop(selectedId);
        return;
      }
    }

    // 4. Briefing shortcut: 'b' or 'B' (03 SCR-08, 04 §D)
    if (key === "b" || key === "B") {
      if (planContext && planContext.canOpenBriefing()) {
        event.preventDefault();
        const nav = planContext.navigate ?? defaultNavigate;
        nav("#/briefing");
      }
      // If canOpenBriefing is false (no stops or computation error), does nothing (04 §D)
      return;
    }

    // 5. Sources & Methods shortcut: '?' (03 SCR-02, 03 SCR-09)
    if (key === "?") {
      event.preventDefault();
      const nav = planContext?.navigate ?? defaultNavigate;
      nav("#/sources");
      return;
    }

  };

  target.addEventListener("keydown", handleKeyDown as EventListener);

  return () => {
    target.removeEventListener("keydown", handleKeyDown as EventListener);
  };
}
