import { describe, expect, it } from 'vitest';
import { CRITERIA, CRITERIA_BY_KEY, CORE_KEYS, resolveCriteria, sanitizeCriteria } from '../../src/shared/criteria';

describe('catalogue des critères', () => {
  it('clés uniques, six critères historiques et critères relevés par le serveur', () => {
    const keys = CRITERIA.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of CORE_KEYS) expect(CRITERIA_BY_KEY[k]).toBeDefined();
    expect(CRITERIA.filter((d) => d.server).map((d) => d.key)).toEqual(
      expect.arrayContaining(['ip', 'ipVersion', 'acceptLanguage']),
    );
  });

  it('plus de quatre-vingts critères, chacun avec un libellé et un groupe', () => {
    expect(CRITERIA.length).toBeGreaterThan(80);
    for (const d of CRITERIA) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.group).toBeTruthy();
    }
  });
});

describe('resolveCriteria', () => {
  it('défauts : tout actif sauf les critères volatils ; identité pour navigateur, canvas, identifiant', () => {
    const r = resolveCriteria();
    expect(r.battery.enabled).toBe(false);
    expect(r.cores.enabled).toBe(true);
    expect(r.canvasHash).toMatchObject({ weight: 3, identity: true });
    expect(r.installId.identity).toBe(true);
    expect(r.cores.identity).toBe(false);
  });

  it('les réglages surchargent le catalogue', () => {
    const r = resolveCriteria({ battery: { enabled: true }, cores: { weight: 5, identity: true } });
    expect(r.battery.enabled).toBe(true);
    expect(r.cores).toMatchObject({ weight: 5, identity: true });
  });
});

describe('sanitizeCriteria', () => {
  it('garde les critères connus et les valeurs valides, borne le poids à 10', () => {
    expect(
      sanitizeCriteria({ cores: { enabled: false, weight: 99 }, nope: { enabled: true }, memory: { weight: -1, identity: 'x' } }),
    ).toEqual({ cores: { enabled: false, weight: 10 } });
  });

  it('forme invalide : aucun réglage', () => {
    expect(sanitizeCriteria(null)).toEqual({});
    expect(sanitizeCriteria([1, 2])).toEqual({});
  });
});
