import { CRITERIA, resolveCriteria } from '../criteria';
import type { CriteriaOverrides } from '../criteria';
import type { Fingerprint } from '../types';

export interface DeviceLine {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  /** Compté dans le score ? (réglage de la configuration ; faux = affiché mais ignoré) */
  enabled?: boolean;
  weight?: number;
  /** Critère d'identité : s'il diffère, le score est plafonné. */
  identity?: boolean;
}

// Identity criteria (browser, canvas rendering, browser-stored ID): if one of them differs, it is
// another browser or another device, whatever the other criteria say. Otherwise the same phone
// with a second browser matches almost everything and scores above the acceptance threshold.
// Strictly below the default `warn` threshold (50), so the verdict is red, not orange.
export const IDENTITY_MISMATCH_CAP = 40;

/**
 * Compare l'empreinte mesurée au profil de A. Seuls les critères présents dans le profil sont
 * comparés (un profil ancien reste utilisable) ; ceux que la configuration désactive sont
 * listés mais ne comptent pas. Chaque critère actif pèse son poids ; un écart sur un critère
 * d'identité plafonne le score.
 */
export function compareFingerprint(
  expected: Fingerprint,
  actual: Fingerprint,
  overrides: CriteriaOverrides = {},
): { score: number; lines: DeviceLine[] } {
  const settings = resolveCriteria(overrides);
  let total = 0;
  let matched = 0;
  const lines: DeviceLine[] = [];
  for (const def of CRITERIA) {
    const exp = expected[def.key];
    if (typeof exp !== 'string') continue;
    const act = actual[def.key] ?? '';
    const match = exp === act;
    const { enabled, weight, identity } = settings[def.key];
    if (enabled) {
      total += weight;
      if (match) matched += weight;
    }
    lines.push({ field: def.key, expected: exp, actual: act, match, enabled, weight, identity });
  }
  const score = total === 0 ? 0 : (matched / total) * 100;
  const identityMismatch = lines.some((l) => l.enabled && l.identity && !l.match);
  return { score: identityMismatch ? Math.min(score, IDENTITY_MISMATCH_CAP) : score, lines };
}
