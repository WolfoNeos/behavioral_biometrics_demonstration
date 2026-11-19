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

  it('another browser on the same phone (only the userAgent differs) is rejected', () => {
    const r = compareFingerprint(fp, { ...fp, userAgent: 'Autre navigateur' });
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.lines.find((l) => l.field === 'userAgent')?.match).toBe(false);
  });

  it('a different canvas is capped below the warn threshold even when five other fields match', () => {
    const r = compareFingerprint(fp, { ...fp, canvasHash: 'other' });
    expect(r.score).toBeLessThanOrEqual(40);
  });

  it('a change of screen, language or timezone alone stays accepted (rotation, settings)', () => {
    expect(compareFingerprint(fp, { ...fp, screen: '1080x1920' }).score).toBeGreaterThanOrEqual(80);
    expect(compareFingerprint(fp, { ...fp, language: 'en-US' }).score).toBeGreaterThanOrEqual(80);
    expect(compareFingerprint(fp, { ...fp, timezone: 'UTC' }).score).toBeGreaterThanOrEqual(80);
  });

  it('canvasHash weighs more than another field', () => {
    const a = compareFingerprint(fp, { ...fp, canvasHash: 'x' }).score;
    const b = compareFingerprint(fp, { ...fp, language: 'en-US' }).score;
    expect(a).toBeLessThan(b);
  });
});
