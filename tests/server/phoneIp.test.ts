import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { SessionManager } from '../../src/server/sessions';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';
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
