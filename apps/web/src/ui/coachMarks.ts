/** First-run, memory-only planner guidance (04 §D, §F; T13.07). */
import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";

export const COACH_MARK_STEPS = [
  { title: "Turn on Slope", description: "Open Layers and turn on the slope overlay to inspect the terrain.", anchorSelector: "#scr02-left-tab-layers" },
  { title: "Click a POI → Add as stop", description: "Select a point of interest on the map, then choose Add as stop in its details.", anchorSelector: '[data-slot="map-host"]' },
  { title: "Open Briefing", description: "When your route is computed, open Briefing to review and export the plan. With map focus, B opens it too.", anchorSelector: '[data-slot="briefing"]' },
] as const;

// A document lasts one page load. Revisiting the planner retains dismissal, reloading resets it.
const dismissedDocuments = new WeakSet<Document>();
export interface CoachMarksProps { onDismiss?: () => void }

export function CoachMarks({ onDismiss }: CoachMarksProps): ReactElement | null {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(() => dismissedDocuments.has(document));
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const current = COACH_MARK_STEPS[step]!;

  const dismiss = (): void => {
    if (dismissedDocuments.has(document)) return;
    dismissedDocuments.add(document);
    setDismissed(true);
    if (previousFocus.current?.isConnected) previousFocus.current.focus();
    onDismiss?.();
  };

  useEffect(() => {
    if (dismissed) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    containerRef.current?.querySelector<HTMLElement>('[data-action="next"]')?.focus();
  }, [dismissed]);

  useLayoutEffect(() => {
    if (dismissed) return;
    const position = (): void => {
      const panel = containerRef.current;
      let anchor = document.querySelector(current.anchorSelector);
      if (step === 0 && (!anchor || anchor.getBoundingClientRect().width === 0)) {
        anchor = document.querySelector('[data-slot="drawer-toggle"][data-for="left"]');
      }
      if (!panel || !anchor) return;
      const target = anchor.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const gap = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const topBar = document.querySelector(".scr02-top-bar");
      const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
      const minTop = topBarBottom > 0 ? Math.max(gap, topBarBottom + gap) : gap;

      panel.style.visibility = "";
      panel.style.pointerEvents = "";

      // Attach to the actual workspace control; clamp the panel to the visible viewport below any top bar.
      let left = Math.max(gap, Math.min(step === 0 ? target.right + gap : target.left, vw - box.width - gap));
      let top = Math.max(minTop, Math.min(step === 1 ? target.top + gap : target.bottom + gap, vh - box.height - gap));

      // In one-drawer mode, keep the popover clear of an open drawer so it never intercepts drawer controls or the top bar.
      const openDrawer = document.querySelector('.scr02[data-layout="one-drawer"] [data-drawer]:not([hidden])');
      if (openDrawer) {
        const dr = openDrawer.getBoundingClientRect();
        const overlaps =
          dr.width > 0 && dr.height > 0 &&
          left < dr.right && left + box.width > dr.left &&
          top < dr.bottom && top + box.height > dr.top;
        if (overlaps) {
          const side = openDrawer.getAttribute("data-drawer");
          if (side === "right" && dr.left - box.width - gap >= gap) {
            left = Math.min(left, dr.left - box.width - gap);
          } else if (side === "left" && dr.right + gap + box.width <= vw - gap) {
            left = Math.max(left, dr.right + gap);
          } else if (dr.bottom + gap + box.height <= vh - gap) {
            top = dr.bottom + gap;
          } else {
            // Narrow viewports leave no clear space outside the open drawer and top bar; yield pointer interception while the drawer is open.
            panel.style.visibility = "hidden";
            panel.style.pointerEvents = "none";
          }
        }
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  });

  if (dismissed) return null;
  return createElement("div", {
    className: "coach-marks-popover", "data-step": step + 1, ref: containerRef,
    role: "dialog", "aria-modal": "false", "aria-labelledby": "coach-mark-title", "aria-describedby": "coach-mark-desc",
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
    },
  },
  createElement("div", { className: "coach-mark-card" },
    createElement("h3", { id: "coach-mark-title", className: "coach-mark-title" }, current.title),
    createElement("p", { id: "coach-mark-desc", className: "coach-mark-desc" }, current.description),
    createElement("div", { className: "coach-mark-actions" },
      createElement("span", { className: "code coach-mark-step-counter", "data-provenance": "derived", "data-source": "ui.coachMarks.steps" }, `Step ${step + 1} of ${COACH_MARK_STEPS.length}`),
      createElement("button", { type: "button", className: "btn coach-mark-btn-dismiss", "data-action": "dismiss", onClick: dismiss }, "Dismiss"),
      createElement("button", { type: "button", className: "btn btn-primary coach-mark-btn-next", "data-action": "next", onClick: () => step === COACH_MARK_STEPS.length - 1 ? dismiss() : setStep(step + 1) }, step === COACH_MARK_STEPS.length - 1 ? "Done" : "Next"),
    ),
  ));
}
