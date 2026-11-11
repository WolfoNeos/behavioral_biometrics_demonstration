import { describe, it, expect } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';

describe('DEFAULT_THRESHOLDS', () => {
  it('exige 10 échantillons d\'enrôlement', () => {
    expect(DEFAULT_THRESHOLDS.enrollSamples).toBe(10);
  });
  it('tolère 5 degrés d\'orientation', () => {
    expect(DEFAULT_THRESHOLDS.orientation.toleranceDeg).toBe(5);
  });
  it('a un seuil keystroke accept supérieur à warn', () => {
    expect(DEFAULT_THRESHOLDS.keystroke.accept).toBeGreaterThan(DEFAULT_THRESHOLDS.keystroke.warn);
  });
});
