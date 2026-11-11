import type { OrientationReading } from '../types';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function scoreOrientation(
  expectedBeta: number,
  readings: OrientationReading[],
  toleranceDeg: number,
): { score: number; beta: number; alpha: number; gamma: number; deviation: number } {
  if (readings.length === 0) {
    return { score: 0, beta: 0, alpha: 0, gamma: 0, deviation: 0 };
  }
  const beta = mean(readings.map((r) => r.beta));
  const alpha = mean(readings.map((r) => r.alpha));
  const gamma = mean(readings.map((r) => r.gamma));
  const deviation = Math.abs(beta - expectedBeta);
  let score = 100;
  if (deviation > toleranceDeg) {
    score = 100 * (1 - (deviation - toleranceDeg) / (3 * toleranceDeg));
  }
  score = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return { score, beta, alpha, gamma, deviation };
}
