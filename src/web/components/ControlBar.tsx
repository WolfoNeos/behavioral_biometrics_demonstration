import { Link } from 'react-router-dom';
import type { Level } from '../../shared/types';

export interface ControlBarProps {
  onJump: (level: Level) => void;
  onReset: () => void;
}

const LEVELS: Level[] = [1, 2, 3];

export function ControlBar({ onJump, onReset }: ControlBarProps) {
  return (
    <nav className="control-bar" aria-label="contrôles de la démo">
      {LEVELS.map((l) => (
        <button key={l} type="button" onClick={() => onJump(l)}>
          Niveau {l}
        </button>
      ))}
      <button type="button" onClick={onReset}>
        Recommencer
      </button>
      <Link to="/config">Configuration</Link>
    </nav>
  );
}
