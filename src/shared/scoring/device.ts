import type { Fingerprint } from '../types';

export interface DeviceLine {
  field: keyof Fingerprint;
  expected: string;
  actual: string;
  match: boolean;
}

const FIELDS: (keyof Fingerprint)[] = [
  'userAgent',
  'platform',
  'language',
  'screen',
  'timezone',
  'canvasHash',
];

// canvasHash is the strongest signal. A weight of 2 would give 71/100 on a
// canvas mismatch, which would not drop below the 70 bar, so it weighs 3.
export const FIELD_WEIGHTS: Partial<Record<keyof Fingerprint, number>> = { canvasHash: 3 };

// Identity fields: the browser (userAgent) and the canvas rendering. If either one differs, it is
// another browser or another device, whatever the other fields say. Otherwise the same phone with
// a second browser matches on 5 fields out of 6 (platform, language, screen, timezone and often
// the canvas) and scores 87.5, above the usual acceptance threshold. Screen, language and timezone
// are tolerated because they can change legitimately (rotation, settings).
export const IDENTITY_FIELDS: (keyof Fingerprint)[] = ['userAgent', 'canvasHash'];

// Strictly below the default `warn` threshold (50), so the verdict is red, not orange.
export const IDENTITY_MISMATCH_CAP = 40;

export function compareFingerprint(
  expected: Fingerprint,
  actual: Fingerprint,
): { score: number; lines: DeviceLine[] } {
  let total = 0;
  let matched = 0;
  const lines = FIELDS.map((field) => {
    const match = expected[field] === actual[field];
    const w = FIELD_WEIGHTS[field] ?? 1;
    total += w;
    if (match) matched += w;
    return { field, expected: expected[field], actual: actual[field], match };
  });
  const score = (matched / total) * 100;
  const identityMismatch = lines.some((l) => !l.match && IDENTITY_FIELDS.includes(l.field));
  return { score: identityMismatch ? Math.min(score, IDENTITY_MISMATCH_CAP) : score, lines };
}
