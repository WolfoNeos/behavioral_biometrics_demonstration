import type { Level, Snapshot, Thresholds } from './types';

/** Points de confiance perdus à chaque vérification supplémentaire déclenchée par un doute. */
export const DOUBT_PENALTY = 8;

export type StepOutcome = 'passed' | 'doubt' | 'failed' | 'skipped';

export interface StepRecap {
  level: Level;
  name: string;
  /** Score de l'étape ; null si aucune mesure. */
  score: number | null;
  outcome: StepOutcome;
}

export interface SessionRecap {
  steps: StepRecap[];
  /** Confiance globale 0-100 : score de la vérification décisive moins DOUBT_PENALTY par doute. */
  trust: number;
  granted: boolean;
  /** Niveau qui a tranché (accès accordé ou blocage). */
  deciding: Level;
  /** Seuils du signal décisif, pour colorer la confiance globale. */
  accept: number;
  warn: number;
}

export const STEP_NAMES: Record<Level, string> = { 1: 'Frappe', 2: 'Appareil', 3: 'Posture' };

const clamp = (v: number): number => Math.max(0, Math.min(100, v));

function thresholdsOf(level: Level, t: Thresholds): { accept: number; warn: number } {
  return level === 1 ? t.keystroke : level === 2 ? t.device : t.orientation;
}

/**
 * Bilan d'une session terminée (accès accordé ou bloqué) ; null tant qu'elle est en cours.
 * Les étapes avant la décisive ont déclenché un doute, celles d'après n'ont pas été nécessaires.
 */
export function buildRecap(snap: Snapshot): SessionRecap | null {
  const { state } = snap;
  if (state.status === 'pending') return null;
  const granted = state.status === 'granted';
  const deciding = state.verdict.level;
  const live: Record<Level, number | null> = {
    1: snap.live.keystroke?.score ?? null,
    2: snap.live.device?.score ?? null,
    3: snap.live.orientation?.score ?? null,
  };
  const steps = ([1, 2, 3] as Level[]).map((level): StepRecap => {
    if (level === deciding) {
      return { level, name: STEP_NAMES[level], score: state.verdict.score, outcome: granted ? 'passed' : 'failed' };
    }
    return {
      level,
      name: STEP_NAMES[level],
      score: level < deciding ? live[level] : null,
      outcome: level < deciding ? 'doubt' : 'skipped',
    };
  });
  const trust = Math.round(clamp(state.verdict.score - DOUBT_PENALTY * (deciding - 1)));
  const { accept, warn } = thresholdsOf(deciding, snap.thresholds);
  return { steps, trust, granted, deciding, accept, warn };
}
