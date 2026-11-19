import type { AuthState, Level, Thresholds, Verdict } from '../types';

export type { AuthState };

type Color = Verdict['color'];

export function colorFor(score: number, t: { accept: number; warn: number }): Color {
  if (score >= t.accept) return 'green';
  if (score >= t.warn) return 'orange';
  return 'red';
}

export function startState(): AuthState {
  return { status: 'pending', level: 1 };
}

function levelThresholds(level: Level, t: Thresholds): { accept: number; warn: number } {
  if (level === 1) return t.keystroke;
  if (level === 2) return t.device;
  return t.orientation;
}

function escalate(level: Level, verdict: Verdict): AuthState {
  return level < 3
    ? { status: 'pending', level: (level + 1) as Level }
    : { status: 'blocked', verdict };
}

export function applyVerdict(
  state: AuthState,
  level: Level,
  score: number,
  t: Thresholds,
): { state: AuthState; verdict: Verdict } {
  if (state.status !== 'pending') return { state, verdict: state.verdict };
  const th = levelThresholds(level, t);
  const granted = score >= th.accept;
  const verdict: Verdict = { level, score, color: colorFor(score, th), granted };
  const next: AuthState = granted
    ? { status: 'granted', level, verdict }
    : escalate(level, verdict);
  return { state: next, verdict };
}

export function hardFail(state: AuthState, level: Level): AuthState {
  if (state.status !== 'pending') return state;
  return escalate(level, { level, score: 0, color: 'red', granted: false });
}

export function jumpTo(level: Level): AuthState {
  return { status: 'pending', level };
}

export function reset(): AuthState {
  return startState();
}
