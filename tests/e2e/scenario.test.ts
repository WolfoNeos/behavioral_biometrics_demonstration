import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../src/server/sessions';
import { buildKeystrokeProfile } from '../../src/shared/scoring/keystroke';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
import type { Fingerprint, KeyEvent, Profile } from '../../src/shared/types';

const PASSWORD = 'Demo2026!';
const PROFILE_BETA = 42;

const fpA: Fingerprint = {
  userAgent: 'Mozilla/5.0 (iPhone)',
  platform: 'iPhone',
  language: 'fr-FR',
  screen: '390x844',
  timezone: 'Europe/Paris',
  canvasHash: 'hash-a',
};
const fpB: Fingerprint = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  platform: 'Linux armv81',
  language: 'en-US',
  screen: '412x915',
  timezone: 'America/New_York',
  canvasHash: 'hash-b',
};

/** Gaussienne seedee (Box-Muller sur LCG) pour un jitter realiste et deterministe. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 1) / 4294967297;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

function typing(seed: number, dwell: number, flight: number, std: number): KeyEvent[] {
  const g = rng(seed);
  let t = 1000;
  return [...PASSWORD].map((key, i) => {
    const down = t + (i === 0 ? 0 : Math.max(5, flight + std * g()));
    const up = down + Math.max(20, dwell + std * g());
    t = up;
    return { key, down, up };
  });
}

const profile: Profile = {
  password: PASSWORD,
  pin: '4821',
  keystroke: buildKeystrokeProfile(Array.from({ length: 10 }, (_, i) => typing(1000 + i, 110, 80, 20))),
  fingerprint: fpA,
  beta: PROFILE_BETA,
};

const taps = [...profile.pin].map((_, i) => ({ down: i * 300, up: i * 300 + 90 }));
const orient = (beta: number) => ({
  kind: 'orientation' as const,
  readings: [{ alpha: 0, beta, gamma: 0 }],
});
const keystroke = (events: KeyEvent[]) => ({ kind: 'keystroke' as const, events, password: PASSWORD });
const pin = (fingerprint: Fingerprint) => ({ kind: 'pin' as const, pin: profile.pin, fingerprint, taps });

function newSession() {
  const m = new SessionManager({
    getProfile: () => profile,
    getThresholds: () => DEFAULT_THRESHOLDS,
    baseUrl: 'https://localhost:5173',
  });
  return { m, id: m.create().id };
}

describe('scenario de demo (seuils par defaut)', () => {
  it('B : frappe fausse (mot de passe correct) -> en attente du niveau 2', () => {
    const { m, id } = newSession();
    const v = m.submit(id, 1, keystroke(typing(77, 240, 160, 40)));
    expect(v.granted).toBe(false);
    expect(m.snapshot(id).state).toEqual({ status: 'pending', level: 2 });
  });

  it('B : empreinte inconnue + bon PIN -> en attente du niveau 3', () => {
    const { m, id } = newSession();
    m.jump(id, 2);
    const v = m.submit(id, 2, pin(fpB));
    expect(v.granted).toBe(false);
    expect(m.snapshot(id).state).toEqual({ status: 'pending', level: 3 });
  });

  it('B : telephone a plat (beta 2 vs 42) -> bloque', () => {
    const { m, id } = newSession();
    m.jump(id, 3);
    const v = m.submit(id, 3, orient(2));
    expect(v.granted).toBe(false);
    expect(m.snapshot(id).state.status).toBe('blocked');
  });

  it('B enchaine les trois niveaux -> bloque', () => {
    const { m, id } = newSession();
    m.submit(id, 1, keystroke(typing(77, 240, 160, 40)));
    m.submit(id, 2, pin(fpB));
    m.submit(id, 3, orient(2));
    expect(m.snapshot(id).state.status).toBe('blocked');
  });

  it('A niveau 1 : sa frappe -> granted', () => {
    const { m, id } = newSession();
    const v = m.submit(id, 1, keystroke(typing(5, 110, 80, 20)));
    expect(v.granted).toBe(true);
    expect(m.snapshot(id).state.status).toBe('granted');
  });

  it('A niveau 2 : sa frappe ratee puis son empreinte + PIN -> granted', () => {
    const { m, id } = newSession();
    m.jump(id, 2);
    const v = m.submit(id, 2, pin(fpA));
    expect(v.granted).toBe(true);
    expect(m.snapshot(id).state.status).toBe('granted');
  });

  it('A niveau 3 : beta ~42 -> granted', () => {
    const { m, id } = newSession();
    m.jump(id, 3);
    const v = m.submit(id, 3, orient(PROFILE_BETA + 1));
    expect(v.granted).toBe(true);
    expect(m.snapshot(id).state.status).toBe('granted');
  });
});
