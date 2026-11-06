/**
 * T22.03: mission clock (02 §D.14; FR-34, NFR-06). Fails against the stub until T22.04.
 *
 * API these tests fix for T22.04 (engine/clock.ts): sim time is an integer number of seconds from
 * the scenario start (`t_s`); ISO-8601 only at the edges (`simTimeIso`). The server passes real
 * elapsed milliseconds in (`advanceReal`); the clock never reads wall-clock time itself.
 * The cast exists only because the stub predates this API; T22.04 aligns the module.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as clockModule from "../src/engine/clock";

type Speed = 1 | 10 | 60;
interface Clock {
  start_utc: string;
  t_s: number;
  speed: Speed;
  paused: boolean;
}
interface ClockApi {
  SIM_STEP_S: number;
  createClock(start_utc: string, speed?: Speed): Clock;
  /** Whole sim steps for `elapsed_ms` of real time, carrying the remainder to the next call. */
  advanceReal(clock: Clock & { carry_ms?: number }, elapsed_ms: number): { clock: Clock; steps: number };
  stepClock(clock: Clock, steps: number): Clock;
  setSpeed(clock: Clock, speed: Speed): Clock;
  setPaused(clock: Clock, paused: boolean): Clock;
  /** Land exactly on the first scheduled event strictly after the current time; unchanged if none. */
  jumpToNextEvent(clock: Clock, event_times_utc: string[]): Clock;
  simTimeIso(clock: Clock): string;
}
const clock = clockModule as unknown as ClockApi;

const START = "2024-05-20T00:00:00Z"; // 05 §F.4 start_utc

describe("mission clock (T22.03 → T22.04)", () => {
  it("uses a fixed step of 1 s sim time (02 §D.14)", () => {
    expect(clock.SIM_STEP_S).toBe(1);
    const c = clock.stepClock(clock.createClock(START), 3);
    expect(c.t_s).toBe(3);
    expect(clock.simTimeIso(c)).toBe("2024-05-20T00:00:03Z");
  });

  it.each([
    [1, 1000, 1],
    [10, 1000, 10],
    [60, 1000, 60],
  ] as const)("at %i× converts %i ms of real time into %i whole steps", (speed, ms, steps) => {
    const r = clock.advanceReal(clock.createClock(START, speed), ms);
    expect(r.steps).toBe(steps);
    expect(r.clock.t_s).toBe(steps);
  });

  it("carries a fraction of a step to the next call instead of rounding it away", () => {
    const a = clock.advanceReal(clock.createClock(START, 1), 1500);
    expect(a.steps).toBe(1);
    const b = clock.advanceReal(a.clock, 500);
    expect(b.steps).toBe(1);
    expect(b.clock.t_s).toBe(2);
  });

  it("pause stops steps and does not bank real time", () => {
    const paused = clock.setPaused(clock.createClock(START, 60), true);
    const r = clock.advanceReal(paused, 10_000);
    expect(r.steps).toBe(0);
    expect(r.clock.t_s).toBe(0);
    const resumed = clock.advanceReal(clock.setPaused(r.clock, false), 1000);
    expect(resumed.steps).toBe(60);
  });

  it("changing speed keeps the current sim time", () => {
    const c = clock.setSpeed(clock.stepClock(clock.createClock(START, 1), 5), 60);
    expect(c.t_s).toBe(5);
    expect(c.speed).toBe(60);
  });

  it("jump-to-next-event lands exactly on the next scheduled scenario event", () => {
    const events = ["2024-05-20T01:00:00Z", "2024-05-20T00:30:00Z", "2024-05-20T00:00:00Z"];
    const at = clock.stepClock(clock.createClock(START), 10);
    const j1 = clock.jumpToNextEvent(at, events);
    expect(clock.simTimeIso(j1)).toBe("2024-05-20T00:30:00Z");
    const j2 = clock.jumpToNextEvent(j1, events);
    expect(clock.simTimeIso(j2)).toBe("2024-05-20T01:00:00Z");
    expect(clock.jumpToNextEvent(j2, events).t_s).toBe(j2.t_s);
  });

  it("nothing under src/engine/ reads wall-clock time (NFR-06): no Date.now(), new Date(), performance.now()", () => {
    const engineDir = join(dirname(fileURLToPath(import.meta.url)), "../src/engine");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) files.push(path);
      }
    };
    walk(engineDir);
    expect(files.length).toBeGreaterThan(0);
    const forbidden = /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bperformance\.now\s*\(|\bsetInterval\s*\(|\bsetTimeout\s*\(/;
    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
        .replace(/\/\/.*$/gm, ""); // line comments
      expect(forbidden.test(code), file).toBe(false);
    }
  });
});
