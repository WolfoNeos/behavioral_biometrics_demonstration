import { describe, it, expect } from 'vitest';
import { scoreOrientation } from '../../../src/shared/scoring/orientation';

const r = (beta: number) => ({ alpha: 10, beta, gamma: 3 });

describe('scoreOrientation', () => {
  it('readings within tolerance score >= 95', () => {
    const s = scoreOrientation(42, [r(41), r(42), r(43)], 5);
    expect(s.score).toBeGreaterThanOrEqual(95);
    expect(s.beta).toBeCloseTo(42);
    expect(s.deviation).toBeCloseTo(0);
    expect(s.alpha).toBeCloseTo(10);
    expect(s.gamma).toBeCloseTo(3);
  });

  it('phone flat (beta 2) scores below 20', () => {
    const s = scoreOrientation(42, [r(2), r(2), r(2)], 5);
    expect(s.score).toBeLessThan(20);
    expect(s.deviation).toBeCloseTo(40);
  });

  it('100 seulement pour le même angle, et dépend de l’écart', () => {
    expect(scoreOrientation(42, [r(42)], 5).score).toBe(100);
    const s2 = scoreOrientation(42, [r(44)], 5).score;
    expect(s2).toBeLessThan(100);
    expect(s2).toBeGreaterThan(80);
    expect(scoreOrientation(42, [r(41)], 5).score).toBeCloseTo(scoreOrientation(42, [r(43)], 5).score);
  });

  it('égale le seuil d’acceptation au bord de la tolérance', () => {
    expect(scoreOrientation(42, [r(47)], 5, 80).score).toBeCloseTo(80);
  });

  it('decays linearly between tolerance and 4x tolerance', () => {
    expect(scoreOrientation(42, [r(42 + 12.5)], 5).score).toBeCloseTo(40);
    expect(scoreOrientation(42, [r(42 + 20)], 5).score).toBeCloseTo(0);
  });

  it('empty readings score 0 without NaN', () => {
    const s = scoreOrientation(42, [], 5);
    expect(s.score).toBe(0);
    expect(Number.isNaN(s.beta)).toBe(false);
    expect(Number.isNaN(s.deviation)).toBe(false);
  });
});
