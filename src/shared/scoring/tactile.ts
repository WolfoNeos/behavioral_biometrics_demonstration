/** Indicative touch summary (not scored). Timestamps in ms. */
export function summarizeTouch(taps: { down: number; up: number }[]): {
  meanDwell: number;
  meanInterval: number;
} {
  if (taps.length === 0) return { meanDwell: 0, meanInterval: 0 };
  const meanDwell = taps.reduce((s, t) => s + (t.up - t.down), 0) / taps.length;
  let meanInterval = 0;
  if (taps.length > 1) {
    let sum = 0;
    for (let i = 1; i < taps.length; i++) sum += taps[i].down - taps[i - 1].down;
    meanInterval = sum / (taps.length - 1);
  }
  return { meanDwell, meanInterval };
}
