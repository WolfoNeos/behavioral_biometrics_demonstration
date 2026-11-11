import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectFingerprint } from '../../../src/web/capture/fingerprint';

describe('collectFingerprint', () => {
  beforeEach(() => {
    // jsdom n'implémente pas le canvas : on simule l'absence de contexte sans bruit.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('returns all six non-empty string fields', async () => {
    const fp = await collectFingerprint();
    for (const k of ['userAgent', 'platform', 'language', 'screen', 'timezone', 'canvasHash'] as const) {
      expect(typeof fp[k]).toBe('string');
      expect(fp[k].length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', async () => {
    expect(await collectFingerprint()).toEqual(await collectFingerprint());
  });
});
