import { Link } from 'react-router-dom';
import type { Level } from '../../shared/types';

export interface ControlBarProps {
  onJump: (level: Level) => void;
  onReset: () => void;
  /** Relance l'étape affichée seule, sans toucher aux autres résultats. */
  onRetry?: (level: Level) => void;
  /** Mode « rester sur l'étape » : état et bascule. */
  stay?: boolean;
  onStay?: (on: boolean) => void;
  /** Level affiché (mis en évidence dans le sélecteur). */
  level?: Level;
}

const LEVELS: Level[] = [1, 2, 3];

/** Menu du présentateur : sélecteur de niveau, remise à zéro, accès à la configuration. */
export function ControlBar({ onJump, onReset, onRetry, stay, onStay, level }: ControlBarProps) {
  return (
    <nav className="control-bar" aria-label="demo controls">
      <div className="seg" role="group" aria-label="Go to level">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className={l === level ? 'seg-btn active' : 'seg-btn'}
            aria-pressed={l === level}
            onClick={() => onJump(l)}
          >
            Level {l}
          </button>
        ))}
      </div>
      {onStay && (
        <button
          type="button"
          className={stay ? 'ctl-btn ctl-toggle on' : 'ctl-btn ctl-toggle'}
          aria-pressed={!!stay}
          onClick={() => onStay(!stay)}
          title="Stay on the current step: results never move on to the next one"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="5" y="9" width="10" height="7" rx="1.6" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
          </svg>
          Stay on step
        </button>
      )}
      {onRetry && level !== undefined && (
        <button type="button" className="ctl-btn" onClick={() => onRetry(level)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10a6 6 0 1 0 2-4.5M4 3v3.5H7.5" />
          </svg>
          Retry step {level}
        </button>
      )}
      <button type="button" className="ctl-btn" onClick={onReset}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4 10a6 6 0 1 0 2-4.5M4 3v3.5H7.5" />
        </svg>
        Restart
      </button>
      <Link to="/config" className="ctl-btn">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
        </svg>
        Configuration
      </Link>
    </nav>
  );
}
