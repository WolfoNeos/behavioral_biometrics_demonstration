import { describe, it, expect } from 'vitest';
import type { Fingerprint } from '../../../src/shared/types';
import { compareFingerprint } from '../../../src/shared/scoring/device';

const fp: Fingerprint = {
  userAgent: 'UA',
  platform: 'Win32',
  language: 'fr-FR',
  screen: '1920x1080',
  timezone: 'Europe/Paris',
  canvasHash: 'abc123',
};

describe('compareFingerprint', () => {
  it('identical fingerprints score 100 with all lines matching', () => {
    const r = compareFingerprint(fp, { ...fp });
    expect(r.score).toBe(100);
    expect(r.lines).toHaveLength(6);
    expect(r.lines.every((l) => l.match)).toBe(true);
  });

  it('a different canvasHash scores below 70', () => {
    const r = compareFingerprint(fp, { ...fp, canvasHash: 'other' });
    expect(r.score).toBeLessThan(70);
    expect(r.lines.find((l) => l.field === 'canvasHash')?.match).toBe(false);
  });

  it('canvasHash weighs more than another field', () => {
    const a = compareFingerprint(fp, { ...fp, canvasHash: 'x' }).score;
    const b = compareFingerprint(fp, { ...fp, language: 'en-US' }).score;
    expect(a).toBeLessThan(b);
  });
});
