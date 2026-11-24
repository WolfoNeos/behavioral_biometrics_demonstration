import type { PostureRun } from '../../shared/types';

export interface PostureRunsProps {
  runs: PostureRun[];
  /** Angle enregistré pour A (null sans profil de posture). */
  expectedBeta: number | null;
  accept: number;
  warn: number;
}

const tone = (score: number, accept: number, warn: number): 'ok' | 'mid' | 'ko' =>
  score >= accept ? 'ok' : score >= warn ? 'mid' : 'ko';

/**
 * Posture de plusieurs téléphones côte à côte (étape 3 en mode « Stay on step ») : une ligne par
 * téléphone avec son score, l'angle mesuré face à celui de A et le PIN. Le dernier envoi de
 * chaque téléphone remplace le précédent.
 */
export function PostureRuns({ runs, expectedBeta, accept, warn }: PostureRunsProps) {
  if (runs.length === 0) {
    return (
      <p className="cmp-summary pending" data-testid="posture-runs-empty">
        Waiting for the phones…
      </p>
    );
  }
  return (
    <div className="posture-runs" data-testid="posture-runs">
      <ul>
        {runs.map((r) => {
          const t = tone(r.score, accept, warn);
          return (
            <li key={r.phone} className={`posture-run ${t}`} data-testid="posture-run">
              <span className="pr-name">Phone {r.n}</span>
              <span className="pr-score">
                <strong>{Math.round(r.score)}</strong>
                <span className="pr-bar" aria-hidden="true">
                  <span className="pr-fill" style={{ width: `${Math.max(0, Math.min(100, r.score))}%` }} />
                  <span className="pr-mark" style={{ left: `${accept}%` }} />
                </span>
              </span>
              <span className="pr-angle">
                {Math.round(r.beta)}°{expectedBeta !== null && <span> vs {Math.round(expectedBeta)}° · ±{Math.round(r.deviation)}°</span>}
              </span>
              <span className={r.secret ? 'pr-pin ok' : 'pr-pin ko'}>PIN {r.secret ? '✓' : '✗'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
