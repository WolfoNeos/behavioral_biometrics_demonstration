import { CORE_KEYS, CRITERIA_KEYS, SERVER_KEYS } from './criteria';
import type { Fingerprint } from './types';

/** Tous les critères connus (voir `criteria.ts`). */
export const FINGERPRINT_FIELDS: string[] = CRITERIA_KEYS;

const MAX_LEN = 200;

/**
 * Normalise une empreinte reçue : les six critères historiques doivent être du texte, les
 * autres critères connus sont facultatifs (texte tronqué), le reste est ignoré. Null si invalide.
 */
export function sanitizeFingerprint(raw: unknown): Fingerprint | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!CORE_KEYS.every((f) => typeof o[f] === 'string')) return null;
  const out: Record<string, string> = {};
  for (const f of CRITERIA_KEYS) {
    const v = o[f];
    if (typeof v === 'string') out[f] = v.slice(0, MAX_LEN);
  }
  return out as unknown as Fingerprint;
}

/**
 * Valeurs relevées par le serveur (adresse, en-têtes) : elles remplacent tout ce que le client
 * aurait déclaré pour ces critères, qu'il ne peut donc pas falsifier.
 */
export function withServerFields(fp: Fingerprint, server: Record<string, string> = {}): Fingerprint {
  const out: Record<string, string | undefined> = { ...fp };
  for (const key of SERVER_KEYS) delete out[key];
  for (const [key, value] of Object.entries(server)) {
    if (SERVER_KEYS.includes(key)) out[key] = value.slice(0, MAX_LEN);
  }
  return out as unknown as Fingerprint;
}
