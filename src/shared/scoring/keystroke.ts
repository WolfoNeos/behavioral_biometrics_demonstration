import type { KeyEvent, KeystrokeProfile } from '../types';

export interface Timing {
  key: string;
  dwell: number;
  flight: number;
}

export interface PerKeyScore {
  key: string;
  dwell: number;
  flight: number;
  expectedDwell: number;
  expectedFlight: number;
  bandDwell: number;
  bandFlight: number;
}

const STD_FLOOR = 5; // ms
/** Ecart normalise attribue a une touche inconnue du profil. */
const UNKNOWN_KEY_DEVIATION = 6;
/** Zone morte : un ecart <= 2 ecarts-types est de la variation naturelle, non penalisee. */
const DEAD_ZONE = 2;
const excess = (z: number) => Math.max(0, z - DEAD_ZONE);

/** dwell = up - down ; flight = down[i] - up[i-1] (0 pour la premiere touche). */
export function extractTimings(events: KeyEvent[]): Timing[] {
  return events.map((e, i) => ({
    key: e.key,
    dwell: e.up - e.down,
    flight: i === 0 ? 0 : e.down - events[i - 1].up,
  }));
}

export function buildKeystrokeProfile(samples: KeyEvent[][]): KeystrokeProfile {
  const acc: Record<string, { dwell: number[]; flight: number[] }> = {};
  for (const s of samples) {
    for (const t of extractTimings(s)) {
      (acc[t.key] ??= { dwell: [], flight: [] }).dwell.push(t.dwell);
      acc[t.key].flight.push(t.flight);
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = (xs: number[]) => {
    const m = mean(xs);
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    return Math.max(Math.sqrt(v), STD_FLOOR);
  };
  const profile: KeystrokeProfile = { mean: {}, std: {}, samples: samples.length };
  for (const [key, v] of Object.entries(acc)) {
    profile.mean[key] = { dwell: mean(v.dwell), flight: mean(v.flight) };
    profile.std[key] = { dwell: std(v.dwell), flight: std(v.flight) };
  }
  return profile;
}

export function scoreKeystroke(
  profile: KeystrokeProfile,
  events: KeyEvent[],
): { score: number; perKey: PerKeyScore[] } {
  const timings = extractTimings(events);
  if (timings.length === 0) return { score: 0, perKey: [] };

  const deviations: number[] = [];
  const perKey: PerKeyScore[] = timings.map((t, i) => {
    const m = profile.mean[t.key];
    const s = profile.std[t.key];
    if (!m || !s) {
      deviations.push(UNKNOWN_KEY_DEVIATION);
      if (i > 0) deviations.push(UNKNOWN_KEY_DEVIATION);
      return {
        key: t.key,
        dwell: t.dwell,
        flight: t.flight,
        expectedDwell: t.dwell,
        expectedFlight: t.flight,
        bandDwell: STD_FLOOR,
        bandFlight: STD_FLOOR,
      };
    }
    const bandDwell = Math.max(s.dwell, STD_FLOOR);
    const bandFlight = Math.max(s.flight, STD_FLOOR);
    deviations.push(excess(Math.abs(t.dwell - m.dwell) / bandDwell));
    // flight de la premiere touche : toujours 0, exclu de la moyenne
    if (i > 0) deviations.push(excess(Math.abs(t.flight - m.flight) / bandFlight));
    return {
      key: t.key,
      dwell: t.dwell,
      flight: t.flight,
      expectedDwell: m.dwell,
      expectedFlight: m.flight,
      bandDwell: s.dwell,
      bandFlight: s.flight,
    };
  });

  const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const raw = 100 * Math.exp(-avg / 3);
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  return { score, perKey };
}
