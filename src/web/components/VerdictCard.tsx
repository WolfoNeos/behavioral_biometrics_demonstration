import type { Verdict } from '../../shared/types';

export interface VerdictCardProps {
  verdict: Verdict | null;
}

export function VerdictCard({ verdict }: VerdictCardProps) {
  const state = verdict === null ? 'pending' : verdict.granted ? 'granted' : 'denied';
  const title = state === 'granted' ? 'Authentifié' : state === 'denied' ? 'Échec' : 'En attente';
  const glyph =
    state === 'granted' ? 'M30 62 L50 80 L90 38' : state === 'denied' ? 'M38 38 L82 82 M82 38 L38 82' : 'M40 60 H80';
  return (
    <div className={`card verdict-card ${state}`} role="status" aria-label="verdict">
      <svg className="verdict-icon" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="56" />
        <path d={glyph} />
      </svg>
      <h2 className="verdict-title">{title}</h2>
      {verdict && (
        <>
          <div className="verdict-score">{Math.round(verdict.score)}</div>
          <div className="verdict-score-label">score sur 100</div>
        </>
      )}
    </div>
  );
}
