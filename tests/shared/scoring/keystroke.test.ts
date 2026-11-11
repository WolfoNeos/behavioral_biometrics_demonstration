import { describe, it, expect } from 'vitest';
import type { KeyEvent } from '../../../src/shared/types';
import {
  extractTimings,
  buildKeystrokeProfile,
  scoreKeystroke,
} from '../../../src/shared/scoring/keystroke';

const KEYS = ['a', 'b', 'c', 'd', 'e'];

/** Saisie synthetique : dwell et flight constants (+ jitter deterministe). */
function sample(dwell: number, flight: number, jitter = 0, seed = 0): KeyEvent[] {
  const events: KeyEvent[] = [];
  let t = 1000;
  KEYS.forEach((key, i) => {
    const j = jitter * Math.sin(seed * 7 + i * 3);
    const down = t + (i === 0 ? 0 : flight + j);
    const up = down + dwell + j;
    events.push({ key, down, up });
    t = up;
  });
  return events;
}

const samples = Array.from({ length: 10 }, (_, s) => sample(110, 80, 4, s));

describe('extractTimings', () => {
  it('calcule dwell et flight (flight=0 pour la premiere touche)', () => {
    const t = extractTimings([
      { key: 'a', down: 0, up: 100 },
      { key: 'b', down: 180, up: 300 },
    ]);
    expect(t).toEqual([
      { key: 'a', dwell: 100, flight: 0 },
      { key: 'b', dwell: 120, flight: 80 },
    ]);
  });
});

describe('buildKeystrokeProfile', () => {
  it('moyenne ~110 ms sur 10 echantillons', () => {
    const p = buildKeystrokeProfile(samples);
    expect(p.samples).toBe(10);
    expect(p.mean.a.dwell).toBeCloseTo(110, 0);
    expect(p.std.a.dwell).toBeGreaterThanOrEqual(5);
  });
  it('plancher de std a 5 ms (un seul echantillon)', () => {
    const p = buildKeystrokeProfile([sample(110, 80)]);
    expect(p.std.b.dwell).toBe(5);
    expect(p.std.b.flight).toBe(5);
  });
});

describe('scoreKeystroke', () => {
  const profile = buildKeystrokeProfile(samples);

  it('saisie identique au profil >= 90', () => {
    expect(scoreKeystroke(profile, sample(110, 80)).score).toBeGreaterThanOrEqual(90);
  });
  it('saisie saccadee a ~240 ms < 50', () => {
    expect(scoreKeystroke(profile, sample(240, 240)).score).toBeLessThan(50);
  });
  it('profil a un seul echantillon : score defini', () => {
    const p = buildKeystrokeProfile([sample(110, 80)]);
    const { score } = scoreKeystroke(p, sample(115, 85));
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
  it('touche absente du profil : defini et penalise', () => {
    const events = sample(110, 80);
    events[2] = { ...events[2], key: 'z' };
    const { score } = scoreKeystroke(profile, events);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBeLessThan(scoreKeystroke(profile, sample(110, 80)).score);
  });
  it('evenements vides : score 0', () => {
    expect(scoreKeystroke(profile, []).score).toBe(0);
  });
  it('perKey expose la zone d incertitude (std)', () => {
    const r = scoreKeystroke(profile, sample(110, 80));
    expect(r.perKey).toHaveLength(5);
    expect(r.perKey[0].bandDwell).toBe(profile.std.a.dwell);
    expect(r.perKey[0].expectedDwell).toBe(profile.mean.a.dwell);
  });
});
