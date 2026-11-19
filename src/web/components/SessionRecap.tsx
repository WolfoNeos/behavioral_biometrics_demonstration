import { DOUBT_PENALTY } from '../../shared/trust';
import type { SessionRecap as Recap, StepOutcome } from '../../shared/trust';
import { Gauge } from './Gauge';

const OUTCOME: Record<StepOutcome, { label: string; mark: string }> = {
  passed: { label: 'Passed', mark: '✓' },
  doubt: { label: 'Doubt: next step', mark: '!' },
  failed: { label: 'Rejected', mark: '✕' },
  skipped: { label: 'Not needed', mark: '–' },
};

/** Bilan de fin de session : overall trust et récapitulatif des trois étapes. */
export function SessionRecap({ recap }: { recap: Recap }) {
  return (
    <div className="recap" data-testid="session-recap">
      <div className="recap-trust">
        <Gauge score={recap.trust} accept={recap.accept} warn={recap.warn} label="overall trust" />
        <p className="gauge-caption" data-testid="gauge-caption">
          Overall trust
        </p>
      </div>
      <div className="recap-main">
        <p className={recap.granted ? 'recap-verdict ok' : 'recap-verdict ko'}>
          {recap.granted ? '✓ Access granted' : '✕ Access denied'}
        </p>
        <ol className="recap-steps">
          {recap.steps.map((s) => (
            <li key={s.level} className={`recap-step ${s.outcome}`} aria-label={`${s.name}: ${OUTCOME[s.outcome].label}`}>
              <span className="recap-mark" aria-hidden="true">
                {OUTCOME[s.outcome].mark}
              </span>
              <span className="recap-name">{s.name}</span>
              <span
                className={s.secret === null ? 'recap-secret' : s.secret ? 'recap-secret ok' : 'recap-secret ko'}
                aria-label={`${s.secretLabel}: ${s.secret === null ? 'not requested' : s.secret ? 'correct' : 'incorrect'}`}
              >
                {s.secret === null ? '—' : s.secret ? `${s.secretLabel} ✓` : `${s.secretLabel} ✕`}
              </span>
              <span className="recap-score">{s.score === null ? '—' : Math.round(s.score)}</span>
              <span className="recap-bar" aria-hidden="true">
                <i style={{ width: `${s.score === null ? 0 : Math.max(0, Math.min(100, s.score))}%` }} />
              </span>
              <span className="recap-outcome">{OUTCOME[s.outcome].label}</span>
            </li>
          ))}
        </ol>
        <p className="recap-note">
          Secret = password or PIN entered, compared with the expected one. Trust = score of the deciding verification, −{DOUBT_PENALTY} points per doubt.
        </p>
      </div>
    </div>
  );
}
