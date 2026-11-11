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
const WEIGHTS: Partial<Record<keyof Fingerprint, number>> = { canvasHash: 3 };

export function compareFingerprint(
  expected: Fingerprint,
  actual: Fingerprint,
): { score: number; lines: DeviceLine[] } {
  let total = 0;
  let matched = 0;
  const lines = FIELDS.map((field) => {
    const match = expected[field] === actual[field];
    const w = WEIGHTS[field] ?? 1;
    total += w;
    if (match) matched += w;
    return { field, expected: expected[field], actual: actual[field], match };
  });
  return { score: (matched / total) * 100, lines };
}
