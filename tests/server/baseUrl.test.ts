import { describe, it, expect } from 'vitest';
import { listCandidates, pickBaseUrl, type Interfaces } from '../../src/server/baseUrl';

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

describe('listCandidates', () => {
  const nic = (address: string) => [{ address, family: 'IPv4', internal: false }];
  it('ignore link-local 169.254', () => {
    const interfaces = { a: nic('169.254.3.4'), b: nic('10.1.1.1') };
    expect(pickBaseUrl({ interfaces, hasCerts: false })).toBe('http://10.1.1.1:5173');
  });
  it('prefere 192.168 a 10 puis a 172.16-31', () => {
    const all = { a: nic('172.20.0.2'), b: nic('10.0.0.2'), c: nic('192.168.1.2') };
    expect(pickBaseUrl({ interfaces: all, hasCerts: false })).toBe('http://192.168.1.2:5173');
    const two = { a: nic('172.20.0.2'), b: nic('10.0.0.2') };
    expect(pickBaseUrl({ interfaces: two, hasCerts: false })).toBe('http://10.0.0.2:5173');
  });
  it('saute un adaptateur virtuel si un reel existe', () => {
    const interfaces = { 'vEthernet (WSL)': nic('192.168.99.1'), 'Wi-Fi': nic('172.16.5.5') };
    expect(pickBaseUrl({ interfaces, hasCerts: false })).toBe('http://172.16.5.5:5173');
    expect(listCandidates(interfaces).map((c) => c.name)).toEqual(['Wi-Fi', 'vEthernet (WSL)']);
  });
  it('seulement virtuel : retombe dessus', () => {
    const interfaces = { 'VirtualBox Host-Only': nic('192.168.56.1') };
    expect(pickBaseUrl({ interfaces, hasCerts: false })).toBe('http://192.168.56.1:5173');
  });
});
