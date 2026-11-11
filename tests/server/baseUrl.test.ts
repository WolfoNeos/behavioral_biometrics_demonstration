import { describe, it, expect } from 'vitest';
import { pickBaseUrl, type Interfaces } from '../../src/server/baseUrl';

const nics: Interfaces = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  eth: [
    { address: 'fe80::1', family: 'IPv6', internal: false },
    { address: '192.168.43.10', family: 'IPv4', internal: false },
  ],
  wifi: [{ address: '10.0.0.5', family: 'IPv4', internal: false }],
};

describe('pickBaseUrl', () => {
  it('DEMO_BASE_URL a priorite (sans slash final)', () => {
    expect(pickBaseUrl({ env: 'https://demo.example/', interfaces: nics, hasCerts: true })).toBe(
      'https://demo.example',
    );
  });
  it('premiere IPv4 non interne, https si certificats', () => {
    expect(pickBaseUrl({ interfaces: nics, hasCerts: true })).toBe('https://192.168.43.10:5173');
  });
  it('http sans certificats', () => {
    expect(pickBaseUrl({ interfaces: nics, hasCerts: false })).toBe('http://192.168.43.10:5173');
  });
  it('aucune interface externe : localhost', () => {
    expect(pickBaseUrl({ interfaces: { lo: nics.lo }, hasCerts: false })).toBe(
      'http://localhost:5173',
    );
  });
});
