import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_THRESHOLDS } from '../shared/types';
import type { Profile, Thresholds } from '../shared/types';
import { sanitizeCriteria } from '../shared/criteria';
import type { CriteriaOverrides } from '../shared/criteria';
import { sanitizeWelcome } from '../shared/welcome';
import type { WelcomeContent } from '../shared/welcome';

export const DEFAULT_PROFILE_PATH = resolve('data', 'profile.json');
export const DEFAULT_THRESHOLDS_PATH = resolve('data', 'thresholds.json');
export const DEFAULT_WELCOME_PATH = resolve('data', 'welcome.json');
export const DEFAULT_CRITERIA_PATH = resolve('data', 'criteria.json');

export function emptyProfile(): Profile {
  return { password: '', pin: '', keystroke: null, fingerprint: null, beta: null };
}

/** Lit un objet JSON ; fichier absent, illisible ou non-objet -> null. */
function readObject(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const v: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

export function loadProfile(path = DEFAULT_PROFILE_PATH): Profile {
  return { ...emptyProfile(), ...(readObject(path) as Partial<Profile> | null) };
}

export function saveProfile(p: Profile, path = DEFAULT_PROFILE_PATH): void {
  writeJson(path, p);
}

/** Fusion profonde avec les valeurs par defaut : un champ manquant ou invalide retombe sur le defaut. */
export function loadThresholds(path = DEFAULT_THRESHOLDS_PATH): Thresholds {
  const raw = readObject(path) ?? {};
  const d = DEFAULT_THRESHOLDS;
  const section = <K extends 'keystroke' | 'device' | 'orientation'>(k: K): Thresholds[K] => {
    const v = raw[k];
    const o = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const out = { ...d[k] } as Record<string, number>;
    for (const f of Object.keys(out)) {
      const x = o[f];
      if (typeof x === 'number' && Number.isFinite(x)) out[f] = x;
    }
    return out as Thresholds[K];
  };
  const n = raw.enrollSamples;
  return {
    keystroke: section('keystroke'),
    device: section('device'),
    orientation: section('orientation'),
    enrollSamples: typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : d.enrollSamples,
  };
}

export function saveThresholds(t: Thresholds, path = DEFAULT_THRESHOLDS_PATH): void {
  writeJson(path, t);
}

/** Contenu de l'écran de réussite ; fichier absent ou invalide -> valeurs par défaut. */
export function loadWelcome(path = DEFAULT_WELCOME_PATH): WelcomeContent {
  return sanitizeWelcome(readObject(path));
}

export function saveWelcome(w: WelcomeContent, path = DEFAULT_WELCOME_PATH): void {
  writeJson(path, w);
}

/** Réglages des critères de l'empreinte (actif, poids, identité) ; absent -> catalogue par défaut. */
export function loadCriteria(path = DEFAULT_CRITERIA_PATH): CriteriaOverrides {
  return sanitizeCriteria(readObject(path));
}

export function saveCriteria(c: CriteriaOverrides, path = DEFAULT_CRITERIA_PATH): void {
  writeJson(path, c);
}

export const DEFAULT_ATTEMPTS_PATH = resolve('data', 'attempts.json');
const MAX_LOGGED_ATTEMPTS = 500;

/** Journal des essais (frappes brutes et scores) pour le banc d'essai ; borné aux plus récents. */
export function appendAttempt(record: Record<string, unknown>, path = DEFAULT_ATTEMPTS_PATH): void {
  let all: unknown[] = [];
  try {
    if (existsSync(path)) {
      const v: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (Array.isArray(v)) all = v;
    }
  } catch {
    all = [];
  }
  all.push(record);
  writeJson(path, all.slice(-MAX_LOGGED_ATTEMPTS));
}
