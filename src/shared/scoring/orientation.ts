import type { OrientationReading } from '../types';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Score continu selon l'écart d'angle : 100 pour le même angle, `accept` à la limite de la
 * tolérance (la bordure de la zone verte), puis décroissance linéaire jusqu'à 0 à 4 x tolérance.
 */
export function angleScore(deviation: number, toleranceDeg: number, accept = 80): number {
  const d = Math.abs(deviation);
  if (!Number.isFinite(d)) return 0;
  if (toleranceDeg <= 0) return d === 0 ? 100 : 0;
  if (d <= toleranceDeg) return 100 - (100 - accept) * (d / toleranceDeg);
  return Math.max(0, accept * (1 - (d - toleranceDeg) / (3 * toleranceDeg)));
}

export function scoreOrientation(
  expectedBeta: number,
  readings: OrientationReading[],
  toleranceDeg: number,
  acceptScore = 80,
): { score: number; beta: number; alpha: number; gamma: number; deviation: number } {
  if (readings.length === 0) {
    return { score: 0, beta: 0, alpha: 0, gamma: 0, deviation: 0 };
  }
  const beta = mean(readings.map((r) => r.beta));
  const alpha = mean(readings.map((r) => r.alpha));
  const gamma = mean(readings.map((r) => r.gamma));
  const deviation = Math.abs(beta - expectedBeta);
  const score = angleScore(deviation, toleranceDeg, acceptScore);
  return { score, beta, alpha, gamma, deviation };
}
