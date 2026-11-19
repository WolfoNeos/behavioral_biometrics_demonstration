import { DOUBT_PENALTY } from '../../shared/trust';
import type { SessionRecap as Recap, StepOutcome } from '../../shared/trust';
import { Gauge } from './Gauge';

const OUTCOME: Record<StepOutcome, { label: string; mark: string }> = {
  passed: { label: 'Validé', mark: '✓' },
  doubt: { label: 'Doute : étape suivante', mark: '!' },
  failed: { label: 'Refusé', mark: '✕' },
  skipped: { label: 'Non nécessaire', mark: '–' },
};

/** Bilan de fin de session : confiance globale et récapitulatif des trois étapes. */
export function SessionRecap({ recap }: { recap: Recap }) {
  return (
    <div className="recap" data-testid="session-recap">
      <div className="recap-trust">
        <Gauge score={recap.trust} accept={recap.accept} warn={recap.warn} label="confiance globale" />
        <p className="gauge-caption" data-testid="gauge-caption">
          Confiance globale
        </p>
      </div>
      <div className="recap-main">
        <p className={recap.granted ? 'recap-verdict ok' : 'recap-verdict ko'}>
          {recap.granted ? '✓ Accès accordé' : '✕ Accès refusé'}
        </p>
        <ol className="recap-steps">
          {recap.steps.map((s) => (
            <li key={s.level} className={`recap-step ${s.outcome}`} aria-label={`${s.name} : ${OUTCOME[s.outcome].label}`}>
              <span className="recap-mark" aria-hidden="true">
                {OUTCOME[s.outcome].mark}
              </span>
              <span className="recap-name">{s.name}</span>
              <span
                className={s.secret === null ? 'recap-secret' : s.secret ? 'recap-secret ok' : 'recap-secret ko'}
                aria-label={`${s.secretLabel} : ${s.secret === null ? 'non demandé' : s.secret ? 'correct' : 'incorrect'}`}
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
          Secret = mot de passe ou PIN saisi comparé à celui attendu. Confiance = score de la vérification décisive, −{DOUBT_PENALTY} points par doute.
        </p>
      </div>
    </div>
  );
}
