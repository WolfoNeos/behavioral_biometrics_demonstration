import type { PerKeyScore } from './scoring/keystroke';
import type { DeviceLine } from './scoring/device';

export type Level = 1 | 2 | 3;

/** Timestamps en ms (performance.now()). */
export interface KeyEvent {
  key: string;
  down: number;
  up: number;
}

export interface KeystrokeProfile {
  mean: Record<string, { dwell: number; flight: number }>;
  std: Record<string, { dwell: number; flight: number }>;
  samples: number;
}

export interface Fingerprint {
  userAgent: string;
  platform: string;
  language: string;
  screen: string;
  timezone: string;
  canvasHash: string;
}

export interface OrientationReading {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface Thresholds {
  keystroke: { accept: number; warn: number };
  device: { accept: number; warn: number };
  orientation: { accept: number; warn: number; toleranceDeg: number };
  enrollSamples: number;
}

export interface Profile {
  password: string;
  pin: string;
  keystroke: KeystrokeProfile | null;
  fingerprint: Fingerprint | null;
  beta: number | null;
}

export interface Verdict {
  level: Level;
  score: number;
  color: 'green' | 'orange' | 'red';
  granted: boolean;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  keystroke: { accept: 80, warn: 50 },
  device: { accept: 80, warn: 50 },
  orientation: { accept: 80, warn: 50, toleranceDeg: 5 },
  enrollSamples: 10,
};

export type AuthState =
  | { status: 'pending'; level: Level }
  | { status: 'granted'; level: Level; verdict: Verdict }
  | { status: 'blocked'; verdict: Verdict };

export type SubmitPayload =
  | { kind: 'keystroke'; events: KeyEvent[]; password: string }
  | {
      kind: 'pin';
      pin: string;
      fingerprint: Fingerprint;
      taps: { down: number; up: number }[];
    }
  | { kind: 'orientation'; readings: OrientationReading[] };

/** Derniere mesure calculee par niveau (JSON-serialisable). */
export interface LiveResults {
  keystroke?: { score: number; perKey: PerKeyScore[] };
  device?: { score: number; lines: DeviceLine[] };
  orientation?: {
    score: number;
    beta: number;
    alpha: number;
    gamma: number;
    deviation: number;
  };
  tactile?: { meanDwell: number; meanInterval: number };
}

/** Reference enregistree (sans mot de passe ni PIN). */
export interface ExpectedReference {
  keystroke: KeystrokeProfile | null;
  fingerprint: Fingerprint | null;
  beta: number | null;
}

export interface Snapshot {
  state: AuthState;
  level: Level;
  live: LiveResults;
  expected: ExpectedReference;
  phoneConnected: boolean;
  sessionUrl: string;
}
