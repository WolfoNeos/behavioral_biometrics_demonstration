import { describe, expect, it } from 'vitest';
import { buildRecap, DOUBT_PENALTY } from '../../src/shared/trust';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
import type { Snapshot } from '../../src/shared/types';

const snap = (over: Partial<Snapshot>): Snapshot => ({
  state: { status: 'pending', level: 1 },
  level: 1,
  live: {},
  expected: { keystroke: null, fingerprint: null, beta: null },
  phoneConnected: false,
  sessionUrl: 'http://x/m/a',
  lastVerdict: null,
  liveOrientation: null,
  thresholds: DEFAULT_THRESHOLDS,
  expectedBars: null,
  ...over,
});

const verdict = (level: 1 | 2 | 3, score: number, granted: boolean) => ({
  level,
  score,
  color: granted ? ('green' as const) : ('red' as const),
  granted,
});

describe('buildRecap', () => {
  it('null tant que la session est en cours', () => {
    expect(buildRecap(snap({}))).toBeNull();
  });

  it('accès accordé dès la frappe : confiance = score, autres étapes non nécessaires', () => {
    const r = buildRecap(snap({ state: { status: 'granted', level: 1, verdict: verdict(1, 94, true) } }))!;
    expect(r.trust).toBe(94);
    expect(r.granted).toBe(true);
    expect(r.steps.map((s) => s.outcome)).toEqual(['passed', 'skipped', 'skipped']);
  });

  it('chaque doute coûte des points de confiance', () => {
    const r = buildRecap(
      snap({
        state: { status: 'granted', level: 3, verdict: verdict(3, 92, true) },
        live: { keystroke: { score: 23, perKey: [] }, device: { score: 40, lines: [] } },
      }),
    )!;
    expect(r.trust).toBe(92 - 2 * DOUBT_PENALTY);
    expect(r.steps.map((s) => s.outcome)).toEqual(['doubt', 'doubt', 'passed']);
    expect(r.steps.map((s) => s.score)).toEqual([23, 40, 92]);
  });

  it('bloqué : étape décisive refusée, confiance basse et bornée à 0', () => {
    const r = buildRecap(snap({ state: { status: 'blocked', verdict: verdict(3, 4, false) } }))!;
    expect(r.granted).toBe(false);
    expect(r.trust).toBe(0);
    expect(r.steps[2].outcome).toBe('failed');
  });

  it('reporte si chaque secret correspondait, en plus du comportement', () => {
    const r = buildRecap(
      snap({
        state: { status: 'blocked', verdict: verdict(3, 0, false) },
        secrets: { 1: true, 2: true, 3: false },
        live: { keystroke: { score: 90, perKey: [] }, device: { score: 95, lines: [] }, orientation: { score: 97, beta: 42, alpha: 0, gamma: 0, deviation: 0 } },
      }),
    )!;
    expect(r.steps.map((s) => s.secret)).toEqual([true, true, false]);
    expect(r.steps.map((s) => s.secretLabel)).toEqual(['Password', 'PIN', 'PIN']);
    // bonne posture mesurée mais PIN faux : étape refusée, confiance nulle
    expect(r.steps[2]).toMatchObject({ score: 97, outcome: 'failed' });
    expect(r.trust).toBe(0);
  });
});
