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

  it('decays linearly between tolerance and 4x tolerance', () => {
    expect(scoreOrientation(42, [r(42 + 12.5)], 5).score).toBeCloseTo(50);
  });

  it('empty readings score 0 without NaN', () => {
    const s = scoreOrientation(42, [], 5);
    expect(s.score).toBe(0);
    expect(Number.isNaN(s.beta)).toBe(false);
    expect(Number.isNaN(s.deviation)).toBe(false);
  });
});
