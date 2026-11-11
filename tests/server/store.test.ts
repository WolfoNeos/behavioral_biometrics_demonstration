import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadProfile,
  saveProfile,
  loadThresholds,
  saveThresholds,
} from '../../src/server/store';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
import type { Profile } from '../../src/shared/types';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'store-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('store', () => {
  it('profil absent : profil vide par defaut', () => {
    expect(loadProfile(join(dir, 'profile.json'))).toEqual({
      password: '',
      pin: '',
      keystroke: null,
      fingerprint: null,
      beta: null,
    });
  });

  it('aller-retour du profil identique (dossier cree si absent)', () => {
    const p: Profile = {
      password: 'secret',
      pin: '1234',
      keystroke: {
        mean: { a: { dwell: 100, flight: 50 } },
        std: { a: { dwell: 5, flight: 5 } },
        samples: 3,
      },
      fingerprint: {
        userAgent: 'u',
        platform: 'p',
        language: 'fr',
        screen: '1x1',
        timezone: 'UTC',
        canvasHash: 'h',
      },
      beta: 42,
    };
    const path = join(dir, 'sub', 'profile.json');
    saveProfile(p, path);
    expect(loadProfile(path)).toEqual(p);
  });

  it('seuils absents : valeurs par defaut ; aller-retour identique', () => {
    const path = join(dir, 'thresholds.json');
    expect(loadThresholds(path)).toEqual(DEFAULT_THRESHOLDS);
    const t = { ...DEFAULT_THRESHOLDS, enrollSamples: 4 };
    saveThresholds(t, path);
    expect(loadThresholds(path)).toEqual(t);
  });
});

describe('store : fichiers corrompus', () => {
  it('JSON invalide -> valeurs par defaut', () => {
    const pp = join(dir, 'profile.json');
    const tp = join(dir, 'thresholds.json');
    writeFileSync(pp, '{ pas du json');
    writeFileSync(tp, 'null');
    expect(loadProfile(pp)).toEqual(loadProfile(join(dir, 'absent.json')));
    expect(loadThresholds(tp)).toEqual(DEFAULT_THRESHOLDS);
  });

  it('seuils partiels : fusion profonde avec les defauts', () => {
    const tp = join(dir, 'thresholds.json');
    writeFileSync(tp, JSON.stringify({ keystroke: { accept: 90 }, orientation: 'x', enrollSamples: 'a' }));
    const t = loadThresholds(tp);
    expect(t.keystroke).toEqual({ accept: 90, warn: DEFAULT_THRESHOLDS.keystroke.warn });
    expect(t.orientation).toEqual(DEFAULT_THRESHOLDS.orientation);
    expect(t.enrollSamples).toBe(DEFAULT_THRESHOLDS.enrollSamples);
  });
});
