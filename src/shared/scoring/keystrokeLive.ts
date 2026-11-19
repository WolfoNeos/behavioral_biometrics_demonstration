import type { ExpectedBar, KeyEvent, KeystrokeProfile } from '../types';
import {
  DEAD_ZONE,
  STD_FLOOR,
  UNKNOWN_KEY_DEVIATION,
  extractTimings,
  keyPenalties,
  normalizeKey,
  scoreFromPenalties,
  zScore,
} from './keystroke';

/** ok : <= 2 sigma (zone d'incertitude) ; warn : <= 3 sigma ; bad : au-dela ; unknown : sans reference. */
export type BarStatus = 'ok' | 'warn' | 'bad' | 'unknown';

export interface LiveBar {
  dwell: number;
  flight: number;
  zDwell: number;
  zFlight: number;
  status: BarStatus;
}

/** Seuil de l'orange : au-dela de 3 sigma, la touche est rouge. */
const WARN_LIMIT = 3;

export function statusOf(z: number): BarStatus {
  return z <= DEAD_ZONE ? 'ok' : z <= WARN_LIMIT ? 'warn' : 'bad';
}

/**
 * Reference par position du mot de passe, construite a partir du profil (meme normalisation
 * que la capture). Ne contient aucun caractere.
 */
export function buildExpectedBars(
  password: string,
  profile: KeystrokeProfile | null,
): ExpectedBar[] | null {
  if (!password || !profile) return null;
  return [...password].map((ch, i) => {
    const key = normalizeKey(ch);
    const m = profile.mean[key];
    const s = profile.std[key];
    if (!m || !s) return { dwell: 0, flight: 0, stdDwell: STD_FLOOR, stdFlight: STD_FLOOR, known: false };
    return {
      dwell: m.dwell,
      // premiere position : flight toujours 0 (comme extractTimings)
      flight: i === 0 ? 0 : m.flight,
      stdDwell: Math.max(s.dwell, STD_FLOOR),
      stdFlight: i === 0 ? STD_FLOOR : Math.max(s.flight, STD_FLOOR),
      known: true,
    };
  });
}

/**
 * Score provisoire, position par position : la barre i est comparee a expected[i] avec la meme
 * formule que scoreKeystroke (memes penalites, meme zone morte, flight de la 1re touche exclu).
 * Pour un mot de passe bien tape et complet, le score egale celui du serveur.
 */
export function scoreKeystrokeLive(
  expected: ExpectedBar[],
  events: KeyEvent[],
): { score: number; bars: LiveBar[] } {
  const penalties: number[] = [];
  const bars = extractTimings(events).map((t, i): LiveBar => {
    const e = expected[i];
    if (!e || !e.known) {
      penalties.push(...keyPenalties(i, null, null));
      const z = UNKNOWN_KEY_DEVIATION;
      return {
        dwell: t.dwell,
        flight: t.flight,
        zDwell: z,
        zFlight: i === 0 ? 0 : z,
        // touche en trop : rouge ; position sans reference : grise
        status: e ? 'unknown' : 'bad',
      };
    }
    const zDwell = zScore(t.dwell, e.dwell, e.stdDwell);
    const zFlight = i === 0 ? 0 : zScore(t.flight, e.flight, e.stdFlight);
    penalties.push(...keyPenalties(i, zDwell, zFlight));
    return { dwell: t.dwell, flight: t.flight, zDwell, zFlight, status: statusOf(Math.max(zDwell, zFlight)) };
  });
  return { score: scoreFromPenalties(penalties), bars };
}
