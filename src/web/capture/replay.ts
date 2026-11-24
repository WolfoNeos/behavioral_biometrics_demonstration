import type { ExpectedBar, KeyEvent } from '../../shared/types';

/**
 * Saisie reconstruite depuis la référence de A : maintien et délai moyens par position, décalés de
 * `shift` écarts-types (0 = A à l'identique ; 8 = l'imitateur type de la démo).
 */
export function eventsFromBars(bars: ExpectedBar[], shift = 0): KeyEvent[] {
  const events: KeyEvent[] = [];
  let t = 0;
  bars.forEach((b, i) => {
    if (!b.known) return;
    const dwell = Math.max(20, b.dwell + shift * b.stdDwell);
    const flight = b.flight + shift * b.stdFlight;
    const down = i === 0 || events.length === 0 ? t : Math.max(t + flight, t - dwell + 1);
    const up = down + dwell;
    events.push({ key: `k${i}`, down, up });
    t = up;
  });
  return events;
}

/**
 * Rejoue une saisie touche après touche à son rythme (accéléré si elle dépasse maxMs) :
 * `onStep` reçoit les touches déjà « tapées », `onDone` est appelé une fois la dernière relâchée.
 * Renvoie la fonction d'annulation.
 */
export function replayEvents(
  events: KeyEvent[],
  onStep: (typed: KeyEvent[]) => void,
  onDone: () => void,
  maxMs = 6500,
): () => void {
  if (events.length === 0) {
    onDone();
    return () => undefined;
  }
  const start = events[0].down;
  const span = Math.max(1, events[events.length - 1].up - start);
  const speed = Math.max(1, span / maxMs);
  const timers: ReturnType<typeof setTimeout>[] = [];
  events.forEach((e, i) => {
    timers.push(setTimeout(() => onStep(events.slice(0, i + 1)), Math.max(0, (e.up - start) / speed)));
  });
  timers.push(setTimeout(onDone, span / speed + 350));
  return () => timers.forEach(clearTimeout);
}
