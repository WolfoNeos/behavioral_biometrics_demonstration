import type { AuthState } from '../../shared/types';

export type StepState = 'todo' | 'active' | 'passed' | 'escalated' | 'failed';

const STEPS = [
  { level: 1, name: 'Typing' },
  { level: 2, name: 'Device' },
  { level: 3, name: 'Posture' },
] as const;

const STATE_LABEL: Record<StepState, string> = {
  todo: 'upcoming',
  active: 'in progress',
  passed: 'passed',
  escalated: 'doubt',
  failed: 'rejected',
};

/** État de chaque étape : un doute fait passer à l'étape suivante, la dernière bloque. */
export function stepStates(state: AuthState): StepState[] {
  return STEPS.map(({ level }): StepState => {
    if (state.status === 'granted') return level < state.level ? 'escalated' : level === state.level ? 'passed' : 'todo';
    if (state.status === 'blocked') return level < state.verdict.level ? 'escalated' : level === state.verdict.level ? 'failed' : 'todo';
    return level < state.level ? 'escalated' : level === state.level ? 'active' : 'todo';
  });
}

function Shield() {
  return (
    <svg className="console-shield" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 L19 6 V12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 V6 Z" />
      <path d="M9 12 L11.2 14.2 L15 10" />
    </svg>
  );
}

/** En-tête de la console de sécurité (volet droit) : titre et verification progress. */
export function ConsoleHeader({ state }: { state: AuthState }) {
  const states = stepStates(state);
  return (
    <header className="console-header">
      <div className="console-title">
        <Shield />
        <div>
          <strong>Security console</strong>
          <span>Live behavioral analysis</span>
        </div>
      </div>
      <ol className="stepper" aria-label="verification progress">
        {STEPS.map((s, i) => (
          <li key={s.level} className={`step ${states[i]}`} aria-label={`${s.name}: ${STATE_LABEL[states[i]]}`}>
            <span className="step-dot">
              {states[i] === 'passed' ? '✓' : states[i] === 'failed' ? '✕' : states[i] === 'escalated' ? '!' : s.level}
            </span>
            <span className="step-name">{s.name}</span>
          </li>
        ))}
      </ol>
    </header>
  );
}
