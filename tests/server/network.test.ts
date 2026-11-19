import { describe, expect, it } from 'vitest';
import { describeNetwork, normalizeBaseUrl } from '../../src/server/network';

describe('normalizeBaseUrl', () => {
  it('ajoute le schéma https et le port du front', () => {
    expect(normalizeBaseUrl('192.168.1.20')).toBe('https://192.168.1.20:5173');
    expect(normalizeBaseUrl(' http://10.0.0.5:5173/ ')).toBe('http://10.0.0.5:5173');
    expect(normalizeBaseUrl('https://demo.example/chemin')).toBe('https://demo.example');
  });
  it('refuse le vide et les schémas non web', () => {
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl('ftp://x')).toBeNull();
    expect(normalizeBaseUrl(undefined)).toBeNull();
  });
});

describe('describeNetwork', () => {
  const interfaces = { wifi: [{ address: '192.168.43.10', family: 'IPv4', internal: false }] };
  it('marque l’interface active et sans certificat en HTTP', () => {
    const n = describeNetwork({ baseUrl: 'http://192.168.43.10:5173', source: 'auto', interfaces, certPem: null });
    expect(n.https).toBe(false);
    expect(n.covered).toBeNull();
    expect(n.candidates[0]).toMatchObject({ address: '192.168.43.10', active: true, covered: null });
  });
  it('en HTTPS sans certificat valide : adresse non couverte', () => {
    const n = describeNetwork({ baseUrl: 'https://192.168.43.10:5173', source: 'manual', interfaces, certPem: null });
    expect(n.covered).toBe(false);
    expect(n.candidates[0].covered).toBe(false);
  });
});
