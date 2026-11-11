import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEFAULT_THRESHOLDS } from '../shared/types';
import type { Profile, Thresholds } from '../shared/types';

export const DEFAULT_PROFILE_PATH = resolve('data', 'profile.json');
export const DEFAULT_THRESHOLDS_PATH = resolve('data', 'thresholds.json');

export function emptyProfile(): Profile {
  return { password: '', pin: '', keystroke: null, fingerprint: null, beta: null };
}

function readJson<T>(path: string, fallback: () => T): T {
  if (!existsSync(path)) return fallback();
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

export function loadProfile(path = DEFAULT_PROFILE_PATH): Profile {
  return { ...emptyProfile(), ...readJson<Partial<Profile>>(path, emptyProfile) };
}

export function saveProfile(p: Profile, path = DEFAULT_PROFILE_PATH): void {
  writeJson(path, p);
}

export function loadThresholds(path = DEFAULT_THRESHOLDS_PATH): Thresholds {
  return readJson<Thresholds>(path, () => structuredClone(DEFAULT_THRESHOLDS));
}

export function saveThresholds(t: Thresholds, path = DEFAULT_THRESHOLDS_PATH): void {
  writeJson(path, t);
}
