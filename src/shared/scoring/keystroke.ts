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

export const STD_FLOOR = 5; // ms
/** Ecart normalise attribue a une touche inconnue du profil. */
export const UNKNOWN_KEY_DEVIATION = 6;
/** Affichage : une touche a moins de 2 ecarts-types est « dans la bande » (vert). */
export const DEAD_ZONE = 2;
/** Calcul du score : au-dela de 1 ecart-type la touche commence a couter (variation naturelle seulement en dessous). */
export const SCORE_DEAD_ZONE = 1;
/** Pente du score : 100·exp(-penalite moyenne / SCORE_DECAY). Plus petit = plus severe. */
export const SCORE_DECAY = 3;
/** Plafond de la penalite d'une mesure : une pause isolee ne pese pas plus qu'une touche franchement fausse. */
export const PENALTY_CAP = 4;
const excess = (z: number) => Math.min(PENALTY_CAP, Math.max(0, z - SCORE_DEAD_ZONE));
/** Poids du tempo global (duree totale de la saisie) face aux mesures touche par touche. */
export const TEMPO_WEIGHT = 5;

/** Normalisation des touches commune a la capture et au profil : caractere seul en minuscule. */
export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

/** Ecart normalise |valeur - moyenne| / max(std, plancher). */
export const zScore = (value: number, mean: number, std: number): number =>
  Math.abs(value - mean) / Math.max(std, STD_FLOOR);

/**
 * Penalites d'une touche (dwell, puis flight sauf pour la premiere touche) ; zDwell/zFlight null
 * = touche sans reference (penalite forfaitaire).
 */
export function keyPenalties(index: number, zDwell: number | null, zFlight: number | null): number[] {
  const dwell = zDwell === null ? UNKNOWN_KEY_DEVIATION : excess(zDwell);
  // flight de la premiere touche : toujours 0, exclu de la moyenne
  if (index === 0) return [dwell];
  return [dwell, zFlight === null ? UNKNOWN_KEY_DEVIATION : excess(zFlight)];
}

export interface RefTiming {
  dwell: number;
  flight: number;
  stdDwell: number;
  stdFlight: number;
}

/**
 * Penalite du tempo global : derive cumulee de la saisie (maintiens + delais) face a celle de
 * la reference sur les memes positions, en ecarts-types (variances additionnees). null si une
 * position n'a pas de reference.
 */
export function tempoPenalty(refs: (RefTiming | null)[], timings: Timing[]): number | null {
  if (timings.length === 0 || refs.length < timings.length) return null;
  // chaque ecart est borne a 2 ecarts-types : une pause isolee ne fausse pas le tempo, seule une
  // derive generale (tout plus lent ou tout plus rapide) s'accumule
  const clip = (d: number, std: number) => Math.max(-2 * std, Math.min(2 * std, d));
  let drift = 0;
  let variance = 0;
  for (let i = 0; i < timings.length; i++) {
    const r = refs[i];
    if (!r) return null;
    drift += clip(timings[i].dwell - r.dwell, r.stdDwell);
    variance += r.stdDwell ** 2;
    if (i > 0) {
      drift += clip(timings[i].flight - r.flight, r.stdFlight);
      variance += r.stdFlight ** 2;
    }
  }
  return excess(Math.abs(drift) / Math.sqrt(Math.max(variance, 1)));
}

/** Score 0-100 a partir des penalites (+ penalite de tempo facultative) ; 0 sans penalite. */
export function scoreFromPenalties(penalties: number[], tempo: number | null = null): number {
  if (penalties.length === 0) return 0;
  const sum = penalties.reduce((a, b) => a + b, 0) + (tempo === null ? 0 : TEMPO_WEIGHT * tempo);
  const avg = sum / (penalties.length + (tempo === null ? 0 : TEMPO_WEIGHT));
  const raw = 100 * Math.exp(-avg / SCORE_DECAY);
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
}

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
  const n = samples[0]?.length ?? 0;
  if (n > 0 && samples.every((s) => s.length === n)) {
    const timings = samples.map(extractTimings);
    profile.positions = Array.from({ length: n }, (_, i) => {
      const d = timings.map((t) => t[i].dwell);
      const f = timings.map((t) => t[i].flight);
      return { key: samples[0][i].key, mean: { dwell: mean(d), flight: mean(f) }, std: { dwell: std(d), flight: std(f) } };
    });
  }
  for (const [key, v] of Object.entries(acc)) {
    profile.mean[key] = { dwell: mean(v.dwell), flight: mean(v.flight) };
    profile.std[key] = { dwell: std(v.dwell), flight: std(v.flight) };
  }
  return profile;
}

/** Référence d'une touche : par position si le profil en a une, sinon par caractère. */
export function referenceAt(
  profile: KeystrokeProfile,
  key: string,
  index: number,
): { mean: { dwell: number; flight: number }; std: { dwell: number; flight: number } } | null {
  const p = profile.positions?.[index];
  // la référence par position ne vaut que si la touche est celle de l'enrôlement
  if (p && p.key === key) return p;
  const m = profile.mean[key];
  const s = profile.std[key];
  return m && s ? { mean: m, std: s } : null;
}

export function scoreKeystroke(
  profile: KeystrokeProfile,
  events: KeyEvent[],
): { score: number; perKey: PerKeyScore[] } {
  const timings = extractTimings(events);
  if (timings.length === 0) return { score: 0, perKey: [] };

  const penalties: number[] = [];
  const perKey: PerKeyScore[] = timings.map((t, i) => {
    const ref = referenceAt(profile, t.key, i);
    const m = ref?.mean;
    const s = ref?.std;
    if (!m || !s) {
      penalties.push(...keyPenalties(i, null, null));
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
    penalties.push(
      ...keyPenalties(i, zScore(t.dwell, m.dwell, s.dwell), zScore(t.flight, m.flight, s.flight)),
    );
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

  const refs = timings.map((t, i): RefTiming | null => {
    const ref = referenceAt(profile, t.key, i);
    return ref
      ? {
          dwell: ref.mean.dwell,
          flight: ref.mean.flight,
          stdDwell: Math.max(ref.std.dwell, STD_FLOOR),
          stdFlight: Math.max(ref.std.flight, STD_FLOOR),
        }
      : null;
  });
  return { score: scoreFromPenalties(penalties, tempoPenalty(refs, timings)), perKey };
}
