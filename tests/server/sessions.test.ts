import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { SessionManager } from '../../src/server/sessions';
import { buildKeystrokeProfile } from '../../src/shared/scoring/keystroke';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
import type { KeyEvent, Profile, Fingerprint } from '../../src/shared/types';

const PASSWORD = 'abcde';
const fp: Fingerprint = {
  userAgent: 'ua',
  platform: 'pf',
  language: 'fr',
  screen: '390x844',
  timezone: 'Europe/Paris',
  canvasHash: 'hash',
};

function typing(dwell: number, flight: number, jitter = 0, seed = 0): KeyEvent[] {
  let t = 1000;
  return [...PASSWORD].map((key, i) => {
    const j = jitter * Math.sin(seed * 7 + i * 3);
    const down = t + (i === 0 ? 0 : flight + j);
    const up = down + dwell + j;
    t = up;
    return { key, down, up };
  });
}

const profile: Profile = {
  password: PASSWORD,
  pin: '1234',
  keystroke: buildKeystrokeProfile(Array.from({ length: 10 }, (_, s) => typing(110, 80, 4, s))),
  fingerprint: fp,
  beta: 45,
};

function setup() {
  return new SessionManager({
    getProfile: () => profile,
    getThresholds: () => DEFAULT_THRESHOLDS,
    baseUrl: 'https://localhost:5173',
  });
}

class FakeWs extends EventEmitter {
  send = vi.fn();
  close = vi.fn(() => this.emit('close'));
  lastState() {
    const calls = this.send.mock.calls;
    return JSON.parse(calls[calls.length - 1][0] as string);
  }
}

describe('SessionManager mode God et mot de passe a majuscules', () => {
  const MIXED = 'Ab1Cd2Ef';
  const mixedEvents = (seed: number): KeyEvent[] => {
    let t = 1000;
    return [...MIXED].map((ch, i) => {
      const j = 4 * Math.sin(seed * 7 + i * 3);
      const down = t + (i === 0 ? 0 : 80 + j);
      const up = down + 110 + j;
      t = up;
      // la capture normalise les touches (minuscules)
      return { key: ch.toLowerCase(), down, up };
    });
  };
  const mixedProfile: Profile = {
    ...profile,
    password: MIXED,
    keystroke: buildKeystrokeProfile(Array.from({ length: 10 }, (_, s) => mixedEvents(s))),
  };

  it('God A : un evenement par caractere (majuscules comprises) et acces accorde', () => {
    const m = new SessionManager({
      getProfile: () => mixedProfile,
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://localhost:5173',
    });
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    pc.emit('message', JSON.stringify({ type: 'god', who: 'A' }));
    const snap = m.snapshot(s.id);
    expect(snap.live.keystroke?.perKey).toHaveLength([...MIXED].length);
    expect(snap.live.keystroke!.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.keystroke.accept);
    expect(snap.state.status).toBe('granted');
  });
});

const keystrokeMsg = (events = typing(110, 80)) =>
  JSON.stringify({ type: 'keystroke', events, password: PASSWORD });

describe('SessionManager.submit', () => {
  it('niveau 1 : frappe identique au profil -> granted', () => {
    const m = setup();
    const s = m.create();
    const v = m.submit(s.id, 1, { kind: 'keystroke', events: typing(110, 80), password: PASSWORD });
    expect(v.granted).toBe(true);
    expect(m.snapshot(s.id).state.status).toBe('granted');
  });

  it('niveau 1 : frappe de B -> pending niveau 2', () => {
    const m = setup();
    const s = m.create();
    const v = m.submit(s.id, 1, { kind: 'keystroke', events: typing(200, 200), password: PASSWORD });
    expect(v.granted).toBe(false);
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 2 });
  });

  it('niveau 1 : mauvais mot de passe = echec dur meme avec la bonne frappe', () => {
    const m = setup();
    const s = m.create();
    const v = m.submit(s.id, 1, { kind: 'keystroke', events: typing(110, 80), password: 'nope' });
    expect(v.score).toBe(0);
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 2 });
  });

  it('niveau 2 : PIN faux -> pending niveau 3', () => {
    const m = setup();
    const s = m.create();
    m.jump(s.id, 2);
    m.submit(s.id, 2, { kind: 'pin', pin: '0000', fingerprint: fp, taps: [] });
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 3 });
  });

  it('niveau 2 : bon PIN et bon appareil -> granted', () => {
    const m = setup();
    const s = m.create();
    m.jump(s.id, 2);
    const v = m.submit(s.id, 2, {
      kind: 'pin',
      pin: '1234',
      fingerprint: fp,
      taps: [{ down: 0, up: 80 }],
    });
    expect(v.granted).toBe(true);
    expect(m.snapshot(s.id).live.tactile).toBeDefined();
  });

  it('niveau 3 : orientation conforme -> granted, sinon blocked', () => {
    const m = setup();
    const s = m.create();
    m.jump(s.id, 3);
    m.submit(s.id, 3, { kind: 'orientation', readings: [{ alpha: 0, beta: 90, gamma: 0 }] });
    expect(m.snapshot(s.id).state.status).toBe('blocked');
    m.reset(s.id);
    m.jump(s.id, 3);
    m.submit(s.id, 3, { kind: 'orientation', readings: [{ alpha: 0, beta: 45, gamma: 0 }] });
    expect(m.snapshot(s.id).state.status).toBe('granted');
  });

  it('profil sans reference : score 0', () => {
    const m = new SessionManager({
      getProfile: () => ({ ...profile, keystroke: null }),
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
    });
    const s = m.create();
    const v = m.submit(s.id, 1, { kind: 'keystroke', events: typing(110, 80), password: PASSWORD });
    expect(v.score).toBe(0);
  });
});

describe('SessionManager.inject', () => {
  it.each([1, 2, 3] as const)('inject A niveau %i >= accept, B < warn', (level) => {
    const th = [
      DEFAULT_THRESHOLDS.keystroke,
      DEFAULT_THRESHOLDS.device,
      DEFAULT_THRESHOLDS.orientation,
    ][level - 1];
    const m = setup();
    const a = m.create();
    m.jump(a.id, level);
    expect(m.inject(a.id, 'A', level).score).toBeGreaterThanOrEqual(th.accept);
    const b = m.create();
    m.jump(b.id, level);
    expect(m.inject(b.id, 'B', level).score).toBeLessThan(th.warn);
  });

  it('inject passe par le chemin normal : le graphe live est mis a jour', () => {
    const m = setup();
    const s = m.create();
    m.inject(s.id, 'A', 1);
    expect(m.snapshot(s.id).live.keystroke?.perKey.length).toBe(PASSWORD.length);
  });
});

describe('SessionManager lastVerdict', () => {
  it('echec de frappe : etat niveau 2, lastVerdict niveau 1 avec score bas', () => {
    const m = setup();
    const s = m.create();
    m.submit(s.id, 1, { kind: 'keystroke', events: typing(200, 200), password: PASSWORD });
    const snap = m.snapshot(s.id);
    expect(snap.state).toEqual({ status: 'pending', level: 2 });
    expect(snap.lastVerdict).toMatchObject({
      level: 1,
      granted: false,
      reason: 'signal hors seuil',
    });
    expect(snap.lastVerdict!.score).toBeLessThan(DEFAULT_THRESHOLDS.keystroke.warn);
  });

  it('mauvais mot de passe : raison password incorrect', () => {
    const m = setup();
    const s = m.create();
    m.submit(s.id, 1, { kind: 'keystroke', events: typing(110, 80), password: 'nope' });
    expect(m.snapshot(s.id).lastVerdict).toEqual({
      level: 1,
      score: 0,
      granted: false,
      reason: 'password incorrect',
    });
  });

  it('PIN faux : raison PIN incorrect', () => {
    const m = setup();
    const s = m.create();
    m.jump(s.id, 2);
    m.submit(s.id, 2, { kind: 'pin', pin: '0000', fingerprint: fp, taps: [] });
    expect(m.snapshot(s.id).lastVerdict).toMatchObject({
      level: 2,
      granted: false,
      reason: 'PIN incorrect',
    });
  });

  it('acces accorde (y compris God) : reason null', () => {
    const m = setup();
    const s = m.create();
    m.inject(s.id, 'A', 1);
    expect(m.snapshot(s.id).lastVerdict).toMatchObject({ level: 1, granted: true, reason: null });
  });

  it('jump efface live du niveau cible et lastVerdict ; reset efface tout', () => {
    const m = setup();
    const s = m.create();
    m.submit(s.id, 1, { kind: 'keystroke', events: typing(200, 200), password: PASSWORD });
    m.submit(s.id, 2, { kind: 'pin', pin: '1234', fingerprint: { ...fp, canvasHash: 'x' }, taps: [] });
    expect(m.snapshot(s.id).live.device).toBeDefined();
    m.jump(s.id, 2);
    const snap = m.snapshot(s.id);
    expect(snap.live.device).toBeUndefined();
    expect(snap.live.tactile).toBeUndefined();
    expect(snap.live.keystroke).toBeDefined();
    expect(snap.lastVerdict).toBeNull();
    m.submit(s.id, 2, { kind: 'pin', pin: '0000', fingerprint: fp, taps: [] });
    m.reset(s.id);
    expect(m.snapshot(s.id).lastVerdict).toBeNull();
    expect(m.snapshot(s.id).live).toEqual({});
  });

  it('les seuils du serveur sont dans le snapshot', () => {
    const th = { ...DEFAULT_THRESHOLDS, keystroke: { accept: 70, warn: 40 } };
    const m = new SessionManager({
      getProfile: () => profile,
      getThresholds: () => th,
      baseUrl: 'https://x',
    });
    expect(m.snapshot(m.create().id).thresholds).toEqual(th);
  });

  it('broadcastAll diffuse un nouvel etat a toutes les sessions', () => {
    const m = setup();
    const a = m.create();
    const b = m.create();
    const pa = new FakeWs();
    const pb = new FakeWs();
    m.attachPc(a.id, pa);
    m.attachPc(b.id, pb);
    pa.send.mockClear();
    pb.send.mockClear();
    m.broadcastAll();
    expect(pa.send).toHaveBeenCalledTimes(1);
    expect(pb.send).toHaveBeenCalledTimes(1);
  });
});

describe('SessionManager orientation en direct', () => {
  const live = (beta: unknown, alpha: unknown = 1, gamma: unknown = 2) =>
    JSON.stringify({ type: 'orientationLive', alpha, beta, gamma });

  it('acceptee au niveau 3, diffusee, puis effacee apres Valider', () => {
    const m = setup();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone);
    m.jump(s.id, 3);
    phone.emit('message', live(30));
    expect(m.snapshot(s.id).liveOrientation).toEqual({ alpha: 1, beta: 30, gamma: 2 });
    expect(phone.lastState().liveOrientation).toEqual({ alpha: 1, beta: 30, gamma: 2 });
    phone.emit(
      'message',
      JSON.stringify({ type: 'orientation', readings: [{ alpha: 0, beta: 45, gamma: 0 }] }),
    );
    expect(m.snapshot(s.id).liveOrientation).toBeNull();
  });

  it('alpha et gamma null -> 0 ; beta invalide ignore', () => {
    const m = setup();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone);
    m.jump(s.id, 3);
    phone.emit('message', live(12, null, null));
    expect(m.snapshot(s.id).liveOrientation).toEqual({ alpha: 0, beta: 12, gamma: 0 });
    for (const bad of [live(null), live('x'), live(20, 'a'), live(20, 1, {})]) {
      expect(() => phone.emit('message', bad)).not.toThrow();
      expect(m.snapshot(s.id).liveOrientation).toEqual({ alpha: 0, beta: 12, gamma: 0 });
    }
  });

  it('ignoree hors du niveau 3 ; effacee par jump et reset', () => {
    const m = setup();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone);
    phone.emit('message', live(30));
    expect(m.snapshot(s.id).liveOrientation).toBeNull();
    m.jump(s.id, 3);
    phone.emit('message', live(30));
    m.jump(s.id, 3);
    expect(m.snapshot(s.id).liveOrientation).toBeNull();
    phone.emit('message', live(30));
    m.reset(s.id);
    expect(m.snapshot(s.id).liveOrientation).toBeNull();
  });

  it('diffusion limitee : au plus une par intervalle, la derniere valeur part en differe', () => {
    vi.useFakeTimers();
    try {
      const m = setup();
      const s = m.create();
      const pc = new FakeWs();
      const phone = new FakeWs();
      m.attachPc(s.id, pc);
      m.attachPhone(s.id, phone);
      m.jump(s.id, 3);
      vi.advanceTimersByTime(1000);
      pc.send.mockClear();
      for (let b = 1; b <= 10; b++) phone.emit('message', live(b));
      expect(pc.send).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(150);
      expect(pc.send).toHaveBeenCalledTimes(2);
      expect(pc.lastState().liveOrientation.beta).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SessionManager telephone et WebSocket', () => {
  it('deux telephones attaches : aucun n est ferme, les deux peuvent soumettre', () => {
    const m = setup();
    const s = m.create();
    const first = new FakeWs();
    const second = new FakeWs();
    m.attachPhone(s.id, first);
    m.attachPhone(s.id, second);
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
    expect(m.snapshot(s.id).phoneConnected).toBe(true);
    // le premier telephone soumet le PIN au niveau 2
    m.jump(s.id, 2);
    first.emit(
      'message',
      JSON.stringify({ type: 'pin', pin: '0000', fingerprint: fp, taps: [] }),
    );
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 3 });
    // le second soumet la posture au niveau 3
    second.emit(
      'message',
      JSON.stringify({ type: 'orientation', readings: [{ alpha: 0, beta: 45, gamma: 0 }] }),
    );
    expect(m.snapshot(s.id).state.status).toBe('granted');
    // les deux recoivent l'etat
    expect(first.lastState().state.status).toBe('granted');
    expect(second.lastState().state.status).toBe('granted');
  });

  it('phoneConnected reste vrai tant qu un telephone est attache', () => {
    const m = setup();
    const s = m.create();
    const first = new FakeWs();
    const second = new FakeWs();
    m.attachPhone(s.id, first);
    m.attachPhone(s.id, second);
    first.emit('close');
    expect(m.snapshot(s.id).phoneConnected).toBe(true);
    second.emit('close');
    expect(m.snapshot(s.id).phoneConnected).toBe(false);
  });

  it('telephone deconnecte puis rattache : la session garde son niveau', () => {
    const m = setup();
    const s = m.create();
    const ws1 = new FakeWs();
    m.attachPhone(s.id, ws1);
    m.jump(s.id, 3);
    ws1.emit('close');
    expect(m.snapshot(s.id).phoneConnected).toBe(false);
    m.attachPhone(s.id, new FakeWs());
    const snap = m.snapshot(s.id);
    expect(snap.phoneConnected).toBe(true);
    expect(snap.level).toBe(3);
    expect(snap.state).toEqual({ status: 'pending', level: 3 });
  });

  it('diffuse {type:state} a tous les clients a chaque changement', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    const phone = new FakeWs();
    m.attachPc(s.id, pc);
    m.attachPhone(s.id, phone);
    expect(pc.lastState()).toMatchObject({ type: 'state', phoneConnected: true });
    pc.emit('message', JSON.stringify({ type: 'jump', level: 2 }));
    for (const ws of [pc, phone]) {
      expect(ws.lastState()).toMatchObject({
        type: 'state',
        level: 2,
        sessionUrl: `https://localhost:5173/m/${s.id}`,
      });
    }
    pc.emit('message', JSON.stringify({ type: 'reset' }));
    expect(phone.lastState().level).toBe(1);
  });

  it('message god utilise le niveau courant ; invalide ou hors niveau ignore', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    pc.emit('message', JSON.stringify({ type: 'god', who: 'A' }));
    expect(m.snapshot(s.id).state.status).toBe('granted');
    pc.emit('message', 'pas du json');
    m.reset(s.id);
    // payload du niveau 3 alors que la session est au niveau 1 : ignore
    pc.emit(
      'message',
      JSON.stringify({ type: 'orientation', readings: [{ alpha: 0, beta: 45, gamma: 0 }] }),
    );
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 1 });
  });
});

describe('SessionManager robustesse des messages entrants', () => {
  const bad: [string, string][] = [
    ['null', 'null'],
    ['nombre', '42'],
    ['tableau', '[]'],
    ['type inconnu', JSON.stringify({ type: 'boom' })],
    ['type non texte', JSON.stringify({ type: 3 })],
    ['keystroke sans events', JSON.stringify({ type: 'keystroke' })],
    ['keystroke events invalides', JSON.stringify({ type: 'keystroke', password: 'x', events: [{ key: 'a' }] })],
    ['pin sans fingerprint ni taps', JSON.stringify({ type: 'pin', pin: '1234' })],
    ['orientation sans readings', JSON.stringify({ type: 'orientation' })],
    ['orientation readings invalides', JSON.stringify({ type: 'orientation', readings: [{ alpha: 'a' }] })],
  ];

  it.each(bad)('message %s : session intacte, aucune exception', (_n, raw) => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    for (const level of [1, 2, 3] as const) {
      m.jump(s.id, level);
      expect(() => pc.emit('message', raw)).not.toThrow();
      expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level });
    }
  });

  it('orientation avec alpha et gamma null est acceptee et notee (granted)', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    m.jump(s.id, 3);
    pc.emit(
      'message',
      JSON.stringify({ type: 'orientation', readings: [{ alpha: null, beta: 45, gamma: null }] }),
    );
    const snap = m.snapshot(s.id);
    expect(snap.state.status).toBe('granted');
    expect(snap.live.orientation).toMatchObject({ alpha: 0, gamma: 0, beta: 45 });
  });

  it('orientation avec beta null est rejetee sans exception', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    m.jump(s.id, 3);
    const raw = JSON.stringify({
      type: 'orientation',
      readings: [{ alpha: 0, beta: null, gamma: 0 }],
    });
    expect(() => pc.emit('message', raw)).not.toThrow();
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 3 });
  });

  it('god sur une session granted ne change rien', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    pc.emit('message', JSON.stringify({ type: 'god', who: 'A' }));
    const before = m.snapshot(s.id).state;
    expect(before.status).toBe('granted');
    pc.emit('message', JSON.stringify({ type: 'god', who: 'B' }));
    expect(m.snapshot(s.id).state).toEqual(before);
  });

  it('une erreur de ws.send ou un evenement error ne propage rien', () => {
    const m = setup();
    const s = m.create();
    const pc = new FakeWs();
    pc.send.mockImplementation(() => {
      throw new Error('socket ferme');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => m.attachPc(s.id, pc)).not.toThrow();
    expect(() => pc.emit('error', new Error('x'))).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('SessionManager expectedBars', () => {
  it('une entree par position du mot de passe, sans aucun caractere', () => {
    const m = setup();
    const s = m.create();
    const bars = m.snapshot(s.id).expectedBars;
    expect(bars).toHaveLength(PASSWORD.length);
    expect(bars?.[0]).toMatchObject({ dwell: profile.keystroke!.mean.a.dwell, flight: 0, known: true });
    expect(bars?.[3]).toMatchObject({
      dwell: profile.keystroke!.mean.d.dwell,
      flight: profile.keystroke!.mean.d.flight,
    });
    for (const bar of bars!) {
      // seulement les cinq champs numeriques/booleens : aucune chaine, donc aucun caractere
      expect(Object.keys(bar).sort()).toEqual(['dwell', 'flight', 'known', 'stdDwell', 'stdFlight']);
      for (const v of Object.values(bar)) expect(typeof v === 'number' || typeof v === 'boolean').toBe(true);
    }
    const json = JSON.stringify(bars);
    for (const ch of PASSWORD) expect(json).not.toContain(`"${ch}"`);
    expect(JSON.stringify(m.snapshot(s.id))).not.toContain(PASSWORD);
  });

  it('null sans profil de frappe ou sans mot de passe', () => {
    const noKs = new SessionManager({
      getProfile: () => ({ ...profile, keystroke: null }),
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
    });
    expect(noKs.snapshot(noKs.create().id).expectedBars).toBeNull();
    const noPwd = new SessionManager({
      getProfile: () => ({ ...profile, password: '' }),
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
    });
    expect(noPwd.snapshot(noPwd.create().id).expectedBars).toBeNull();
  });

  it('rediffuse la reference quand le profil change (broadcastAll)', () => {
    let current: Profile = profile;
    const m = new SessionManager({
      getProfile: () => current,
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
    });
    const s = m.create();
    const pc = new FakeWs();
    m.attachPc(s.id, pc);
    expect(pc.lastState().expectedBars).toHaveLength(5);
    current = { ...profile, password: 'abc' };
    m.broadcastAll();
    expect(pc.lastState().expectedBars).toHaveLength(3);
  });
});
