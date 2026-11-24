import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { SessionManager } from '../../src/server/sessions';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
import { buildKeystrokeProfile } from '../../src/shared/scoring/keystroke';
import type { Profile } from '../../src/shared/types';

class FakeWs extends EventEmitter {
  send(): void {}
  close(): void {}
}

const core = { userAgent: 'u', platform: 'p', language: 'fr', screen: 's', timezone: 'z', canvasHash: 'c' };
const profile = (): Profile => ({
  password: 'pw',
  pin: '1234',
  keystroke: null,
  fingerprint: { ...core, ip: '192.168.1.50', installId: 'id-A' },
  beta: null,
});
const manager = () =>
  new SessionManager({ getProfile: profile, getThresholds: () => DEFAULT_THRESHOLDS, baseUrl: 'https://x' });
const line = (m: SessionManager, id: string, field: string) =>
  m.snapshot(id).live.device?.lines.find((l) => l.field === field);

describe('adresse IP du téléphone (relevée par le serveur)', () => {
  it('le message device est complété avec l’IP de la connexion du téléphone', () => {
    const m = manager();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone as never, { ip: '192.168.1.50' });
    m.jump(s.id, 2);
    phone.emit('message', JSON.stringify({ type: 'device', fingerprint: { ...core, installId: 'id-A' } }));
    expect(line(m, s.id, 'ip')).toMatchObject({ expected: '192.168.1.50', actual: '192.168.1.50', match: true });
    expect(line(m, s.id, 'installId')?.match).toBe(true);
  });

  it('une IP déclarée par le client est ignorée', () => {
    const m = manager();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone as never, { ip: '192.168.1.77' });
    m.jump(s.id, 2);
    phone.emit('message', JSON.stringify({ type: 'device', fingerprint: { ...core, installId: 'id-A', ip: '192.168.1.50' } }));
    expect(line(m, s.id, 'ip')).toMatchObject({ actual: '192.168.1.77', match: false });
  });

  it('un autre téléphone du même modèle (autre IP, autre identifiant) est refusé avec le PIN pourtant bon', () => {
    const m = manager();
    const s = m.create();
    const phone = new FakeWs();
    m.attachPhone(s.id, phone as never, { ip: '192.168.1.77' });
    m.jump(s.id, 2);
    phone.emit(
      'message',
      JSON.stringify({ type: 'pin', pin: '1234', taps: [], fingerprint: { ...core, installId: 'id-B' } }),
    );
    const snap = m.snapshot(s.id);
    expect(snap.state).toEqual({ status: 'pending', level: 3 });
    expect(snap.live.device?.score).toBeLessThanOrEqual(40);
    expect(snap.secrets?.[2]).toBe(true);
  });
});

describe('relance d’une seule étape', () => {
  it('efface les mesures de l’étape 2 sans toucher à celles de l’étape 1', () => {
    const m = manager();
    const s = m.create();
    m.inject(s.id, 'A', 1);
    m.inject(s.id, 'A', 2);
    const before = m.snapshot(s.id);
    expect(before.live.keystroke).toBeUndefined(); // pas de profil de frappe dans ce test
    expect(before.live.device).toBeDefined();
    m.handleMessage(s.id, JSON.stringify({ type: 'retry', level: 2 }));
    const after = m.snapshot(s.id);
    expect(after.state).toEqual({ status: 'pending', level: 2 });
    expect(after.live.device).toBeUndefined();
    expect(after.secrets?.[2]).toBeUndefined();
  });
});

describe('historique des essais', () => {
  it('chaque soumission est notée, et Restart ne l’efface pas', () => {
    const m = manager();
    const s = m.create();
    m.inject(s.id, 'A', 1);
    m.reset(s.id);
    m.inject(s.id, 'B', 1);
    const attempts = m.snapshot(s.id).attempts!;
    expect(attempts.map((a) => a.n)).toEqual([1, 2]);
    expect(attempts.every((a) => a.level === 1)).toBe(true);
  });

  it('journal : onAttempt reçoit la frappe brute et le score', () => {
    const seen: { level: number; score: number }[] = [];
    const m = new SessionManager({
      getProfile: profile,
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
      onAttempt: (a) => seen.push({ level: a.level, score: a.score }),
    });
    const s = m.create();
    m.inject(s.id, 'A', 1);
    expect(seen).toHaveLength(1);
    expect(seen[0].level).toBe(1);
  });
});

describe('journal : saisies simulées', () => {
  it('la saisie injectée (touches A / B) est marquée simulée, une saisie tapée ne l’est pas', () => {
    const flags: boolean[] = [];
    const ev = [{ key: 'a', down: 0, up: 90 }];
    const m = new SessionManager({
      getProfile: () => ({ ...profile(), password: 'a', keystroke: buildKeystrokeProfile([ev, ev]) }),
      getThresholds: () => DEFAULT_THRESHOLDS,
      baseUrl: 'https://x',
      onAttempt: (a) => flags.push(a.simulated),
    });
    const s = m.create();
    m.inject(s.id, 'B', 1);
    m.reset(s.id);
    m.handleMessage(s.id, JSON.stringify({ type: 'keystroke', events: ev, password: 'a' }));
    expect(flags).toEqual([true, false]);
  });
});

describe('étape relancée seule : pas de passage à la suivante', () => {
  it('réussite ou échec : on reste sur l’étape, le résultat est noté', () => {
    const m = manager();
    const s = m.create();
    m.jump(s.id, 2);
    m.handleMessage(s.id, JSON.stringify({ type: 'retry', level: 2 }));
    m.inject(s.id, 'A', 2); // réussite
    let snap = m.snapshot(s.id);
    expect(snap.state).toEqual({ status: 'pending', level: 2 });
    expect(snap.live.device).toBeDefined();
    expect(snap.attempts?.at(-1)).toMatchObject({ level: 2, granted: true });
    m.inject(s.id, 'B', 2); // échec
    snap = m.snapshot(s.id);
    expect(snap.state).toEqual({ status: 'pending', level: 2 });
    expect(snap.attempts?.at(-1)).toMatchObject({ level: 2, granted: false });
  });

  it('un saut de niveau ou Restart rend le comportement normal', () => {
    const m = manager();
    const s = m.create();
    m.jump(s.id, 2);
    m.handleMessage(s.id, JSON.stringify({ type: 'retry', level: 2 }));
    m.jump(s.id, 2);
    m.inject(s.id, 'B', 2);
    expect(m.snapshot(s.id).state).toEqual({ status: 'pending', level: 3 });
  });
});
