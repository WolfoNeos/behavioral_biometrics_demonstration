import { describe, expect, it } from 'vitest';
import { clientIp, normalizeIp, serverFingerprintFields } from '../../src/server/clientIp';

describe('clientIp', () => {
  it('normalise les adresses IPv4 mappées en IPv6', () => {
    expect(normalizeIp('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(normalizeIp(undefined)).toBe('');
  });

  it('derrière le proxy : dernière valeur de x-forwarded-for (celle du proxy, pas du client)', () => {
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, ::ffff:192.168.1.50' }, '127.0.0.1')).toBe('192.168.1.50');
    expect(clientIp({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] }, '127.0.0.1')).toBe('2.2.2.2');
  });

  it('sans proxy : adresse de la connexion', () => {
    expect(clientIp({}, '::ffff:10.0.0.7')).toBe('10.0.0.7');
  });
});

describe('serverFingerprintFields', () => {
  it('adresse, version IP et en-têtes du navigateur', () => {
    const f = serverFingerprintFields(
      { 'x-forwarded-for': '192.168.1.50', 'accept-language': 'fr-CH,fr;q=0.9' },
      '127.0.0.1',
    );
    expect(f).toEqual({ ip: '192.168.1.50', ipVersion: '4', acceptLanguage: 'fr-CH,fr;q=0.9' });
  });

  it('IPv6 reconnue', () => {
    expect(serverFingerprintFields({}, '::1').ipVersion).toBe('6');
  });
});
