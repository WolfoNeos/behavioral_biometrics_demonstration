import { Link } from 'react-router-dom';
import type { Level } from '../../shared/types';

export interface ControlBarProps {
  onJump: (level: Level) => void;
  onReset: () => void;
  /** Level affiché (mis en évidence dans le sélecteur). */
  level?: Level;
}

const LEVELS: Level[] = [1, 2, 3];

/** Menu du présentateur : sélecteur de niveau, remise à zéro, accès à la configuration. */
export function ControlBar({ onJump, onReset, level }: ControlBarProps) {
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
