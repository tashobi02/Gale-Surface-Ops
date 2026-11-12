/** FR-31, 04 §C.7, FD-018: local Web Audio only; never drives mission state. */
import { useEffect, useRef, useState } from "react";
import type { Alert } from "@marswalk/protocol";

export function useOpsSound(alerts: Alert[], enabled: boolean): { armed: boolean } {
  const audio = useRef<AudioContext | null>(null);
  const [armed, setArmed] = useState(false);
  const seenCautions = useRef(new Set<string>());
  useEffect(() => {
    let disposed = false;
    const arm = (): void => {
      const Audio = window.AudioContext;
      if (!Audio || audio.current?.state === "running") return;
      audio.current ??= new Audio();
      void audio.current.resume().then(() => { if (!disposed) setArmed(true); }).catch(() => {});
    };
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);

  const warningKey = alerts.filter((a) => a.level === "warning" && a.acked_seq === null).map((a) => `${a.alert_id}/${a.raised_seq}`).join("|");
  const cautionKey = alerts.filter((a) => a.level === "caution" && a.acked_seq === null && a.cleared_seq === null).map((a) => `${a.alert_id}/${a.raised_seq}`).join("|");
  useEffect(() => {
    if (!enabled || !armed || !audio.current) return;
    const context = audio.current;
    const oscillators: OscillatorNode[] = [];
    // FD-281: UI alarm timbre, not a science value. Two tones for warnings, one for cautions.
    const tone = (frequency: number, offset: number): void => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime + offset;
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      oscillators.push(oscillator);
    };
    const warning = (): void => { tone(440, 0); tone(660, 0.25); };
    let interval: ReturnType<typeof setInterval> | undefined;
    if (warningKey) { warning(); interval = setInterval(warning, 5000); }
    for (const key of cautionKey.split("|").filter(Boolean)) {
      if (!seenCautions.current.has(key)) { seenCautions.current.add(key); tone(660, 0); }
    }
    return () => {
      clearInterval(interval);
      for (const oscillator of oscillators) {
        try { oscillator.stop(); } catch { /* Already ended. */ }
        oscillator.disconnect();
      }
    };
  }, [armed, enabled, warningKey, cautionKey]);
  return { armed };
}
