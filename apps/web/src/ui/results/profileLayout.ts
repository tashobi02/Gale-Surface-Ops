/** Display-only distance layout. NO_ROUTE reserves pixels, never an invented distance (FR-08, FD-247). */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Leg } from "@marswalk/protocol";

export const PROFILE_AXIS = { width: 720, left: 230, span: 460, gap: 24 } as const;

export function useProfileLayout(legs: readonly Leg[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(PROFILE_AXIS.width);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (value: number) => { if (Number.isFinite(value) && value > 0) setWidth(value); };
    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => { if (entries[0]) measure(entries[0].contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const data = useMemo(() => {
    let distance = 0, gaps = 0;
    const entries = legs.map((leg, index) => {
      const entry = { leg, index, start: distance, gap: gaps };
      if (leg.status === "OK") distance += leg.distance_m;
      else gaps++;
      return entry;
    });
    return { entries, distance, gaps };
  }, [legs]);
  const left = Math.min(PROFILE_AXIS.left, width * PROFILE_AXIS.left / PROFILE_AXIS.width);
  const span = Math.max(1, width - left - (PROFILE_AXIS.width - PROFILE_AXIS.left - PROFILE_AXIS.span));
  const gapPx = Math.min(PROFILE_AXIS.gap, span / Math.max(1, data.gaps + 1));
  const x = (distance: number, gap: number) => left + distance / Math.max(1, data.distance) * (span - data.gaps * gapPx) + gap * gapPx;
  return { ref, width, left, x, entries: data.entries };
}
