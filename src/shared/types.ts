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
