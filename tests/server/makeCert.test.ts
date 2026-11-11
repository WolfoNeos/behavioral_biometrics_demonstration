import { describe, it, expect } from 'vitest';
import { buildSan, buildOpensslArgs, buildOpensslConfig, pickOpenssl } from '../../src/server/certArgs';

describe('buildSan', () => {
  it('contient toujours localhost et 127.0.0.1', () => {
    expect(buildSan([])).toBe('DNS:localhost,IP:127.0.0.1');
  });
  it('ajoute IP LAN et hotes extra, dedupliques, DNS vs IP detectes', () => {
    expect(buildSan(['192.168.1.5', '127.0.0.1'], ['192.168.43.1', 'myhost.local', '192.168.1.5'])).toBe(
      'DNS:localhost,IP:127.0.0.1,IP:192.168.1.5,IP:192.168.43.1,DNS:myhost.local',
    );
  });
});

describe('buildOpensslConfig / args', () => {
  it('declare SAN, serverAuth et CA:FALSE', () => {
    const c = buildOpensslConfig('DNS:localhost');
    expect(c).toContain('subjectAltName = DNS:localhost');
    expect(c).toContain('extendedKeyUsage = serverAuth');
    expect(c).toContain('CA:FALSE');
    expect(c).toContain('CN = demo-biometrie');
  });
  it('construit les arguments openssl (30 jours par defaut)', () => {
    const a = buildOpensslArgs({ configPath: 'c.cnf', keyPath: 'k.pem', certPath: 'd.pem' });
    expect(a).toEqual(expect.arrayContaining(['req', '-x509', '-nodes', '-config', 'c.cnf', '-keyout', 'k.pem', '-out', 'd.pem']));
    expect(a[a.indexOf('-days') + 1]).toBe('30');
  });
});

describe('pickOpenssl', () => {
  it('prefere le PATH', () => {
    expect(pickOpenssl({ onPath: true, exists: () => false })).toBe('openssl');
  });
  it('retombe sur Git for Windows', () => {
    const want = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
    expect(pickOpenssl({ onPath: false, exists: (p) => p === want })).toBe(want);
  });
  it('null si introuvable', () => {
    expect(pickOpenssl({ onPath: false, exists: () => false })).toBeNull();
  });
});
