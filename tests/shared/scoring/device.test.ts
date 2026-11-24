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

describe('compareFingerprint : critères supplémentaires (jumeaux du même modèle)', () => {
  const full: Fingerprint = {
    ...fp,
    pixelRatio: '3',
    cores: '6',
    memory: 'unavailable',
    touchPoints: '5',
    webgl: 'Apple|Apple GPU|16384',
    languages: 'fr-FR,en-US',
    numberFormat: '1 234 567,891',
    fonts: '9:abc123',
    textSize: '17px|16px',
    reducedMotion: '0',
    cookiesEnabled: 'true',
  };

  it('compare tous les critères présents dans le profil', () => {
    const r = compareFingerprint(full, { ...full });
    expect(r.lines).toHaveLength(17);
    expect(r.score).toBe(100);
  });

  it('même modèle et même navigateur mais réglages différents : refusé (< seuil d’acceptation 80)', () => {
    const twin = { ...full, languages: 'en-US', fonts: '11:def456', textSize: '19px|16px', numberFormat: '1,234,567.891' };
    const r = compareFingerprint(full, twin);
    expect(r.lines.filter((l) => !l.match)).toHaveLength(4);
    expect(r.score).toBeLessThan(80);
  });

  it('un seul réglage différent reste accepté (réglage changé légitimement)', () => {
    expect(compareFingerprint(full, { ...full, textSize: '19px|16px' }).score).toBeGreaterThanOrEqual(80);
  });

  it('un profil ancien (six critères) reste comparable sans pénaliser les nouveaux critères', () => {
    const r = compareFingerprint(fp, { ...full });
    expect(r.lines).toHaveLength(6);
    expect(r.score).toBe(100);
  });

  it('un client ancien qui n’envoie pas les nouveaux critères est pénalisé face à un profil complet', () => {
    const r = compareFingerprint(full, { ...fp });
    expect(r.score).toBeLessThan(80);
  });
});

describe('compareFingerprint : IP et identifiant stocké', () => {
  const base: Fingerprint = {
    ...fp,
    languages: 'fr-FR',
    ip: '192.168.1.50',
    installId: 'id-A',
    voices: '3:abc',
    media: 'in:1|video:2|out:1',
    permissions: 'notifications:granted',
    storage: '60GB',
  };

  it('un autre identifiant stocké (autre téléphone, même modèle et mêmes réglages) est refusé net', () => {
    const r = compareFingerprint(base, { ...base, installId: 'id-B', ip: '192.168.1.77' });
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.lines.find((l) => l.field === 'installId')?.match).toBe(false);
  });

  it('une IP différente seule (changement de wifi) reste acceptée', () => {
    expect(compareFingerprint(base, { ...base, ip: '10.0.0.8' }).score).toBeGreaterThanOrEqual(80);
  });

  it('IP et identifiant sont comparés quand le profil les contient', () => {
    const r = compareFingerprint(base, { ...base });
    expect(r.lines.map((l) => l.field)).toEqual(
      expect.arrayContaining(['ip', 'installId', 'voices', 'media', 'permissions', 'storage']),
    );
    expect(r.score).toBe(100);
  });
});


describe('compareFingerprint : choix des critères (réglages)', () => {
  const a: Fingerprint = { ...fp, cores: '6', webgl: 'GPU-1', languages: 'fr-FR' };

  it('un critère désactivé est listé mais ne compte plus dans le score', () => {
    const b = { ...a, languages: 'en-US' };
    const on = compareFingerprint(a, b);
    const off = compareFingerprint(a, b, { languages: { enabled: false } });
    expect(on.score).toBeLessThan(100);
    expect(off.score).toBe(100);
    const line = off.lines.find((l) => l.field === 'languages')!;
    expect(line).toMatchObject({ match: false, enabled: false });
  });

  it('le poids se règle : un critère plus lourd pèse plus dans le score', () => {
    const b = { ...a, cores: '8' };
    const light = compareFingerprint(a, b, { cores: { weight: 1 } }).score;
    const heavy = compareFingerprint(a, b, { cores: { weight: 6 } }).score;
    expect(heavy).toBeLessThan(light);
  });

  it('un critère peut devenir critère d’identité : l’écart plafonne le score', () => {
    const b = { ...a, cores: '8' };
    expect(compareFingerprint(a, b).score).toBeGreaterThan(80);
    expect(compareFingerprint(a, b, { cores: { identity: true } }).score).toBeLessThanOrEqual(40);
  });

  it('un critère d’identité désactivé ne plafonne plus', () => {
    const b = { ...a, userAgent: 'autre' };
    expect(compareFingerprint(a, b).score).toBeLessThanOrEqual(40);
    expect(compareFingerprint(a, b, { userAgent: { enabled: false } }).score).toBeGreaterThan(80);
  });

  it('les critères volatils sont désactivés par défaut', () => {
    const v = compareFingerprint({ ...a, battery: '80|true' }, { ...a, battery: '20|false' });
    expect(v.score).toBe(100);
    expect(v.lines.find((l) => l.field === 'battery')?.enabled).toBe(false);
  });
});
