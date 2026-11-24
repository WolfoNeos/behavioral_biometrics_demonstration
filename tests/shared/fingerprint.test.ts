import { describe, expect, it } from 'vitest';
import { CRITERIA } from '../../src/shared/criteria';
import { sanitizeFingerprint, withServerFields, FINGERPRINT_FIELDS } from '../../src/shared/fingerprint';

const core = { userAgent: 'u', platform: 'p', language: 'l', screen: 's', timezone: 't', canvasHash: 'c' };

describe('sanitizeFingerprint', () => {
  it('accepte les six critères historiques seuls (client ancien)', () => {
    expect(sanitizeFingerprint(core)).toEqual(core);
  });

  it('garde les critères supplémentaires texte, tronqués, et ignore le reste', () => {
    const fp = sanitizeFingerprint({ ...core, languages: 'x'.repeat(500), cores: 8, inconnu: 'zzz' })!;
    expect(fp.languages).toHaveLength(200);
    expect('cores' in fp).toBe(false);
    expect('inconnu' in fp).toBe(false);
  });

  it('refuse une forme invalide', () => {
    expect(sanitizeFingerprint(null)).toBeNull();
    expect(sanitizeFingerprint([])).toBeNull();
    expect(sanitizeFingerprint({ ...core, canvasHash: 3 })).toBeNull();
    expect(sanitizeFingerprint({ userAgent: 'u' })).toBeNull();
  });

  it('couvre tout le catalogue, IP et identifiant stocké compris', () => {
    expect(FINGERPRINT_FIELDS).toHaveLength(CRITERIA.length);
    expect(CRITERIA.length).toBeGreaterThan(80);
    expect(FINGERPRINT_FIELDS).toContain('ip');
    expect(FINGERPRINT_FIELDS).toContain('installId');
  });

  it('withServerFields remplace tout critère serveur déclaré par le client', () => {
    const fp = sanitizeFingerprint({ ...core, ip: '6.6.6.6', acceptLanguage: 'fake', cores: '4' })!;
    const out = withServerFields(fp, { ip: '10.0.0.5', acceptLanguage: 'fr-FR', pas_un_critere: 'x' });
    expect(out.ip).toBe('10.0.0.5');
    expect(out.acceptLanguage).toBe('fr-FR');
    expect('acceptLanguage' in withServerFields(fp, { ip: '1.1.1.1' })).toBe(false); // déclaré par le client, absent côté serveur : retiré
    expect('pas_un_critere' in out).toBe(false);
    expect(out.cores).toBe('4');
    expect('ip' in withServerFields(fp, {})).toBe(false);
  });
});
