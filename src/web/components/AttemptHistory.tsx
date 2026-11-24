import type { Attempt } from '../../shared/types';

const SHOWN = 8;

/**
 * Essais de la session, du plus ancien au plus récent : étape, score, verdict. Conservés à
 * travers Restart pour comparer plusieurs personnes devant le public.
 */
export function AttemptHistory({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) return null;
  const shown = attempts.slice(-SHOWN);
  return (
    <section className="attempts" aria-label="Attempts" data-testid="attempts">
      <h3>Attempts</h3>
      <ol>
        {shown.map((a) => (
          <li
            key={a.n}
            className={a.granted ? 'attempt ok' : a.secret ? 'attempt warn' : 'attempt ko'}
            title={a.secret ? undefined : 'Wrong password / PIN'}
          >
            <span className="attempt-n">#{a.n}</span>
            <span className="attempt-step">Step {a.level}</span>
            <strong>{a.score}</strong>
            <span className="attempt-mark" aria-label={a.granted ? 'accepted' : 'refused'}>
              {a.granted ? '✓' : '✗'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
