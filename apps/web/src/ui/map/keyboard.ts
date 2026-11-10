/**
 * Keyboard map controls and global shortcuts (04 §E Keyboard, 03 §A, 03 SCR-02, 03 SCR-08).
 * Implementation: T13.06 (Ridita Alam, R5 EVA & Ops UI · design system).
 *
 * Shortcuts:
 * - Map focus: Arrow keys pan; +/− zoom (04 §E).
 * - Delete: removes selected stop (C11, 03 §C.3).
 * - B: opens Briefing (#/briefing) when plan is computed; disabled if no stops or on error (03 SCR-08, 04 §D).
 * - ?: opens Sources & Methods (#/sources) (03 SCR-02).
 * - A and Enter are deliberately NOT bound here (reserved for T08.07 add-stop crosshair mode).
 * - Shortcuts are ignored when focus is in an input or editable field.
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

    if (mapHandle && mapHasFocus) {
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

    // Note: 'A' and 'Enter' are reserved for T08.07 (add-stop crosshair mode) and NOT bound here.
  };

  target.addEventListener("keydown", handleKeyDown as EventListener);

  return () => {
    target.removeEventListener("keydown", handleKeyDown as EventListener);
  };
}
