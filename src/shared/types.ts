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
  /**
   * Référence par position du mot de passe (présente si les saisies d'enrôlement ont toutes la
   * même longueur). Plus fine que la référence par caractère : une lettre répétée ou un
   * enchaînement différent ne brouille plus la bande.
   */
  positions?: { key: string; mean: { dwell: number; flight: number }; std: { dwell: number; flight: number } }[];
}

/**
 * Empreinte de l'appareil : les six critères historiques sont toujours présents, les autres
 * (catalogue dans `criteria.ts`) le sont selon le client. Valeurs en texte.
 */
export interface Fingerprint {
  userAgent: string;
  platform: string;
  language: string;
  screen: string;
  timezone: string;
  canvasHash: string;
  [criterion: string]: string | undefined;
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
  | { kind: 'orientation'; readings: OrientationReading[]; pin?: string };

/** Intervalle minimal entre deux envois de l'orientation en direct (telephone et serveur). */
export const LIVE_ORIENTATION_INTERVAL_MS = 100;

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

/** Raison d'un echec ; null quand l'acces est accorde. */
export type FailReason = 'password incorrect' | 'PIN incorrect' | 'signal out of range';

/** Dernier verdict rendu dans la session (efface par reset et jump). */
export interface LastVerdict {
  level: Level;
  score: number;
  granted: boolean;
  reason: FailReason | null;
}

/**
 * Reference de frappe d'une position du mot de passe enregistre (moyenne/ecart-type du profil
 * pour la touche a cette position). Aucun caractere : le mot de passe reste illisible a l'ecran.
 * known false : caractere absent du profil (zeros, plancher d'ecart-type).
 */
export interface ExpectedBar {
  dwell: number;
  flight: number;
  stdDwell: number;
  stdFlight: number;
  known: boolean;
}

/** Screen affiché sur le téléphone, reflété à côté du QR code pour expliquer la démo. */
export type PhoneScreen = 'connecting' | 'pin' | 'checking' | 'step' | 'done';

export interface PhoneView {
  screen: PhoneScreen;
  /** Nombre de digits entered (jamais les chiffres eux-mêmes). */
  digits: number;
  /** Touche en cours d'appui : un chiffre, ou « erase ». */
  pressed: string | null;
  /** Étape suivante : le pavé est redemandé (vérification supplémentaire). */
  again: boolean;
}

export interface Snapshot {
  state: AuthState;
  level: Level;
  live: LiveResults;
  expected: ExpectedReference;
  phoneConnected: boolean;
  sessionUrl: string;
  lastVerdict: LastVerdict | null;
  /** Orientation courante diffusee par le telephone au niveau 3 (avant « Confirm »). */
  liveOrientation: OrientationReading | null;
  /** Thresholds en vigueur cote serveur (la jauge ne peut pas les contredire). */
  thresholds: Thresholds;
  /** Une entree par position du mot de passe enregistre ; null sans mot de passe ou sans profil de frappe. */
  expectedBars: ExpectedBar[] | null;
  /** Reflet de l'écran du téléphone ; null sans téléphone connecté. */
  phoneView?: PhoneView | null;
  /** Secret (mot de passe ou PIN) correct à chaque étape soumise : true = attendu, false = incorrect. */
  secrets?: Partial<Record<Level, boolean>>;
  /** Historique des essais de la session (conservé à travers Restart et les sauts de niveau). */
  attempts?: Attempt[];
}

/** Un essai soumis : étape, score mesuré, secret correct, verdict. */
export interface Attempt {
  n: number;
  level: Level;
  score: number;
  /** Mot de passe / PIN correct. */
  secret: boolean;
  granted: boolean;
}
