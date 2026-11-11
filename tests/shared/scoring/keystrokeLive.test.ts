import { describe, it, expect } from 'vitest';
import type { ExpectedBar, KeyEvent } from '../../../src/shared/types';
import { buildKeystrokeProfile, scoreKeystroke } from '../../../src/shared/scoring/keystroke';
import {
  buildExpectedBars,
  scoreKeystrokeLive,
  statusOf,
} from '../../../src/shared/scoring/keystrokeLive';

const PASSWORD = 'secret';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 1) / 4294967297;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** Frappe bruitee du mot de passe (graine deterministe). */
function noisy(seed: number, dwell: number, flight: number, std: number, word = PASSWORD): KeyEvent[] {
  const g = rng(seed);
  let t = 1000;
  return [...word].map((key, i) => {
    const down = t + (i === 0 ? 0 : Math.max(5, flight + std * g()));
    const up = down + Math.max(20, dwell + std * g());
    t = up;
    return { key, down, up };
  });
}

const profile = buildKeystrokeProfile(Array.from({ length: 10 }, (_, i) => noisy(500 + i, 110, 80, 20)));
const expected = buildExpectedBars(PASSWORD, profile)!;

/** Evenements construits a partir de dwell/flight explicites. */
function fromTimings(timings: { key: string; dwell: number; flight: number }[]): KeyEvent[] {
  let t = 0;
  return timings.map((x, i) => {
    const down = i === 0 ? 0 : t + x.flight;
    const up = down + x.dwell;
    t = up;
    return { key: x.key, down, up };
  });
}

describe('buildExpectedBars', () => {
  it('une entree par position, flight 0 en premiere position, sans caractere', () => {
    expect(expected).toHaveLength(PASSWORD.length);
    expect(expected[0].flight).toBe(0);
    expect(expected[1]).toMatchObject({
      dwell: profile.mean.e.dwell,
      flight: profile.mean.e.flight,
      stdDwell: profile.std.e.dwell,
      stdFlight: profile.std.e.flight,
      known: true,
    });
    for (const bar of expected) {
      expect(Object.keys(bar).sort()).toEqual(['dwell', 'flight', 'known', 'stdDwell', 'stdFlight']);
      for (const v of Object.values(bar)) expect(['number', 'boolean']).toContain(typeof v);
    }
  });
  it('normalise comme la capture : majuscule -> minuscule', () => {
    const bars = buildExpectedBars('SeC', profile)!;
    expect(bars.every((b) => b.known)).toBe(true);
    expect(bars[0].dwell).toBe(profile.mean.s.dwell);
  });
  it('caractere absent du profil : known false, zeros, plancher 5 ms', () => {
    const bars = buildExpectedBars('sz', profile)!;
    expect(bars[1]).toEqual({ dwell: 0, flight: 0, stdDwell: 5, stdFlight: 5, known: false });
  });
  it('null sans mot de passe ou sans profil de frappe', () => {
    expect(buildExpectedBars('', profile)).toBeNull();
    expect(buildExpectedBars(PASSWORD, null)).toBeNull();
  });
});

describe('scoreKeystrokeLive', () => {
  it('mot de passe complet bien tape : meme score que scoreKeystroke (graines)', () => {
    for (const seed of [1, 2, 3, 7, 11, 42, 99, 123]) {
      for (const [d, f, s] of [
        [110, 80, 20],
        [240, 160, 40],
        [150, 60, 10],
      ]) {
        const events = noisy(seed, d, f, s);
        expect(scoreKeystrokeLive(expected, events).score).toBe(scoreKeystroke(profile, events).score);
      }
    }
  });

  it('meme score avec un caractere inconnu du profil dans le mot de passe', () => {
    const word = 'sez';
    const bars = buildExpectedBars(word, profile)!;
    const events = noisy(5, 110, 80, 20, word);
    expect(scoreKeystrokeLive(bars, events).score).toBe(scoreKeystroke(profile, events).score);
  });

  it('statuts aux bornes 2 sigma / 3 sigma (dwell)', () => {
    const exp: ExpectedBar[] = [{ dwell: 100, flight: 0, stdDwell: 10, stdFlight: 5, known: true }];
    const at = (dwell: number) => scoreKeystrokeLive(exp, fromTimings([{ key: 'x', dwell, flight: 0 }])).bars[0];
    expect(at(120)).toMatchObject({ status: 'ok', zDwell: 2 });
    expect(at(121).status).toBe('warn');
    expect(at(130)).toMatchObject({ status: 'warn', zDwell: 3 });
    expect(at(131).status).toBe('bad');
    expect(at(70).status).toBe('warn');
  });

  it('le flight compte pour le statut a partir de la deuxieme touche', () => {
    const exp: ExpectedBar[] = [
      { dwell: 100, flight: 0, stdDwell: 10, stdFlight: 10, known: true },
      { dwell: 100, flight: 50, stdDwell: 10, stdFlight: 10, known: true },
    ];
    const r = scoreKeystrokeLive(
      exp,
      fromTimings([
        { key: 'x', dwell: 100, flight: 0 },
        { key: 'y', dwell: 100, flight: 90 },
      ]),
    );
    expect(r.bars[0]).toMatchObject({ zFlight: 0, status: 'ok' });
    expect(r.bars[1]).toMatchObject({ zDwell: 0, zFlight: 4, status: 'bad' });
  });

  it('touches en trop : barres bad et score penalise', () => {
    const events = noisy(3, 110, 80, 20);
    const extra = noisy(3, 110, 80, 20, `${PASSWORD}xy`);
    const full = scoreKeystrokeLive(expected, events);
    const more = scoreKeystrokeLive(expected, extra);
    expect(more.bars).toHaveLength(PASSWORD.length + 2);
    expect(more.bars.slice(-2).map((b) => b.status)).toEqual(['bad', 'bad']);
    expect(more.score).toBeLessThan(full.score);
  });

  it('touches manquantes : seules les barres tapees comptent', () => {
    const events = noisy(3, 110, 80, 20).slice(0, 3);
    const r = scoreKeystrokeLive(expected, events);
    expect(r.bars).toHaveLength(3);
    expect(r.score).toBe(scoreKeystroke(profile, events).score);
  });

  it('position inconnue : statut unknown et penalite', () => {
    const exp = buildExpectedBars('sz', profile)!;
    const r = scoreKeystrokeLive(exp, noisy(4, 110, 80, 20, 'sz'));
    expect(r.bars[1].status).toBe('unknown');
    expect(r.score).toBeLessThan(scoreKeystrokeLive(exp.slice(0, 1), noisy(4, 110, 80, 20, 's')).score);
  });

  it('evenements vides ou reference vide : score 0, pas de NaN', () => {
    expect(scoreKeystrokeLive(expected, [])).toEqual({ score: 0, bars: [] });
    const r = scoreKeystrokeLive([], noisy(1, 110, 80, 20));
    expect(Number.isNaN(r.score)).toBe(false);
    expect(r.bars.every((b) => b.status === 'bad' && Number.isFinite(b.zDwell))).toBe(true);
  });
});

describe('statusOf', () => {
  it('<= 2 ok, <= 3 warn, au-dela bad', () => {
    expect(statusOf(0)).toBe('ok');
    expect(statusOf(2)).toBe('ok');
    expect(statusOf(2.01)).toBe('warn');
    expect(statusOf(3)).toBe('warn');
    expect(statusOf(3.01)).toBe('bad');
  });
});
