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

describe('SessionManager telephone et WebSocket', () => {
  it('un deuxieme attachPhone remplace le premier (un seul telephone actif)', () => {
    const m = setup();
    const s = m.create();
    const first = new FakeWs();
    const second = new FakeWs();
    m.attachPhone(s.id, first);
    m.attachPhone(s.id, second);
    expect(first.close).toHaveBeenCalled();
    // la fermeture de l'ancien ne doit pas detacher le nouveau
    expect(m.snapshot(s.id).phoneConnected).toBe(true);
    // les messages de l'ancien telephone sont ignores
    first.emit('message', keystrokeMsg());
    expect(m.snapshot(s.id).state.status).toBe('pending');
    second.emit('message', keystrokeMsg());
    expect(m.snapshot(s.id).state.status).toBe('granted');
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
