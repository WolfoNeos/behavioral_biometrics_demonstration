import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CRITERIA } from '../../../src/shared/criteria';
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

  it('collecte tout le catalogue relevé par le navigateur, chaque critère non vide', async () => {
    const fp = await collectFingerprint();
    const keys = CRITERIA.filter((d) => !d.server).map((d) => d.key);
    expect(keys.length).toBeGreaterThan(70);
    for (const k of keys) {
      expect(typeof fp[k], k).toBe('string');
      expect((fp[k] as string).length, k).toBeGreaterThan(0);
    }
    expect(fp.languages).toContain('en');
  });

  it('collecte les critères d’instance et garde le même identifiant stocké d’un appel à l’autre', async () => {
    localStorage.clear();
    const first = await collectFingerprint();
    for (const k of ['installId', 'cookieId', 'idbId', 'voices', 'media', 'permissions', 'storage'] as const) {
      expect(typeof first[k]).toBe('string');
      expect((first[k] as string).length).toBeGreaterThan(0);
    }
    expect(first.installId).not.toBe('unavailable');
    expect((await collectFingerprint()).installId).toBe(first.installId);
    // un autre navigateur (stockage vide) a un autre identifiant
    localStorage.clear();
    expect((await collectFingerprint()).installId).not.toBe(first.installId);
  });

  it('ne contient pas d’adresse IP : elle est ajoutée par le serveur', async () => {
    expect('ip' in (await collectFingerprint())).toBe(false);
  });
});
