/**
 * Keyboard move of the selected stop (T08.10; FD-119; 04 §E; NFR-04): a group of five real buttons that appears while a stop is
 * selected. Four nudge it by one routing-grid cell (north is up: +y in projected metres; the cell size is the manifest's
 * `grid.cell_m`) and "Move to crosshair" places it at the map centre. The arrow keys on a focused nudge button do the same. Every move
 * goes through the placement function, so it is validated like a drop (snap offer, "Outside mapped area", refusal); quick presses are
 * applied in order, each from the stop's position after the one before. It is the keyboard path of 01 §E step 5, not only a fallback.
 */
import { useCallback, useRef, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import type { PlanStore } from "../../state/planStore";
import type { MapHandle } from "../context";
import type { Placement } from "./waypointLayer";

export interface KeyboardMoveProps {
  planStore: PlanStore;
  placement: Placement;
  mapHandle: Pick<MapHandle, "getCenter">;
  /** Metres per routing-grid cell (manifest `grid.cell_m`). */
  cellM: number;
}

/** Arrow key to (dx, dy) in cells; north is up, so ArrowUp is +y. */
export const nudgeKeys = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
} as const satisfies Record<string, readonly [number, number]>;

const BUTTONS = [
  { action: "nudge-north", word: "north", glyph: "↑", d: [0, 1] },
  { action: "nudge-west", word: "west", glyph: "←", d: [-1, 0] },
  { action: "nudge-east", word: "east", glyph: "→", d: [1, 0] },
  { action: "nudge-south", word: "south", glyph: "↓", d: [0, -1] },
] as const;

export function KeyboardMove({ planStore, placement, mapHandle, cellM }: KeyboardMoveProps): ReactElement | null {
  const subscribe = useCallback((onChange: () => void) => planStore.subscribe(() => onChange()), [planStore]);
  const plan = useSyncExternalStore(subscribe, () => planStore.get(), () => planStore.get());
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const selected = plan.waypoints.find((w) => w.id === plan.selected_waypoint_id);
  if (!selected || selected.role !== "stop") return null;
  const number = plan.waypoints.filter((w) => w.role === "stop").findIndex((w) => w.id === selected.id) + 1;
  const id = selected.id;

  /** Run `step` after the moves already queued; it reads the stop's position when it runs. */
  const enqueue = (step: () => Promise<unknown>): void => {
    queue.current = queue.current.then(step, step);
  };
  const nudge = (dx: number, dy: number): void =>
    enqueue(async () => {
      const now = planStore.get().waypoints.find((w) => w.id === id);
      if (now) await placement.move(id, now.x_m + dx * cellM, now.y_m + dy * cellM);
    });
  const toCrosshair = (): void =>
    enqueue(async () => {
      const centre = mapHandle.getCenter();
      await placement.move(id, centre[0], centre[1]);
    });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const d = (nudgeKeys as Record<string, readonly [number, number]>)[event.key];
    if (!d) return;
    event.preventDefault();
    event.stopPropagation();
    nudge(d[0], d[1]);
  };

  return (
    <div className="scr02-keyboard-move" role="group" aria-label={`Move stop ${number}`} data-slot="keyboard-move" onKeyDown={onKeyDown}>
      <span className="scr02-keyboard-move-title">
        Move stop <span data-identifier>{number}</span>
      </span>
      {BUTTONS.map((b) => (
        <button key={b.action} type="button" data-action={b.action} aria-label={`Move stop ${number} one cell ${b.word}`} onClick={() => nudge(b.d[0], b.d[1])}>
          <span aria-hidden="true">{b.glyph}</span> {b.word.toUpperCase()}
        </button>
      ))}
      <button type="button" data-action="move-to-crosshair" onClick={toCrosshair}>
        Move to crosshair
      </button>
    </div>
  );
}
