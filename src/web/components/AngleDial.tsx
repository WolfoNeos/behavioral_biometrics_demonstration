import { useEffect, useRef, useState } from 'react';

export interface AngleDialProps {
  expectedBeta: number;
  tolerance: number;
  beta: number | null;
}

// Vue de profil : le pivot est en bas à gauche, 0° = téléphone à plat (vers la droite),
// 90° = téléphone à la verticale (vers le haut).
const PX = 44;
const PY = 236;
const R = 196;
const MAJOR = [0, 15, 30, 45, 60, 75, 90];
const MINOR = Array.from({ length: 19 }, (_, i) => i * 5).filter((a) => a % 15 !== 0);

const clamp = (a: number): number => Math.max(0, Math.min(90, a));
const rad = (a: number): number => (clamp(a) * Math.PI) / 180;
const point = (angle: number, r: number) => ({
  x: PX + r * Math.cos(rad(angle)),
  y: PY - r * Math.sin(rad(angle)),
});
const sweep = (from: number, to: number, r: number): string => {
  const a = point(from, r);
  const b = point(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 0 ${b.x} ${b.y}`;
};

/**
 * Valeur lissée pour l'affichage : les mesures arrivent ~10 fois par seconde et sont
 * bruitées ; on glisse vers la cible à chaque image pour un mouvement fluide.
 */
function useSmoothed(target: number | null, tauMs = 110): number | null {
  const [value, setValue] = useState<number | null>(target);
  const current = useRef<number | null>(target);
  const goal = useRef<number | null>(target);
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  goal.current = target;

  useEffect(() => {
    if (target === null) {
      current.current = null;
      setValue(null);
      return;
    }
    if (current.current === null) {
      current.current = target; // première mesure : pas de glissement depuis nulle part
      setValue(target);
      return;
    }
    if (frame.current !== null || typeof requestAnimationFrame === 'undefined') return;
    last.current = performance.now();
    const step = (now: number): void => {
      const g = goal.current;
      const c = current.current;
      if (g === null || c === null) {
        frame.current = null;
        return;
      }
      const dt = Math.min(now - last.current, 64);
      last.current = now;
      const next = c + (g - c) * (1 - Math.exp(-dt / tauMs));
      const done = Math.abs(g - next) < 0.05;
      current.current = done ? g : next;
      setValue(current.current);
      frame.current = done ? null : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [target, tauMs]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );
  return value;
}

export function AngleDial({ expectedBeta, tolerance, beta }: AngleDialProps) {
  const shown = useSmoothed(beta);
  const lo = clamp(expectedBeta - tolerance);
  const hi = clamp(expectedBeta + tolerance);
  const a = point(lo, R);
  const b = point(hi, R);
  const wedge = `M ${PX} ${PY} L ${a.x} ${a.y} A ${R} ${R} 0 0 0 ${b.x} ${b.y} Z`;
  const arc = sweep(0, 90, R);
  const target = point(expectedBeta, R);
  const targetLabel = point(expectedBeta, R + 54);

  const deviation = beta === null ? null : Math.abs(beta - expectedBeta);
  const inside = deviation !== null && deviation <= tolerance;
  const state = beta === null ? 'idle' : inside ? 'ok' : 'ko';
  const tip = shown === null ? null : point(shown, R - 58);

  return (
    <div className={`angle-dial dial-${state}`}>
      <svg viewBox="8 6 296 254" role="img" aria-label="angle dial">
        <defs>
          <linearGradient
            id="wedge-fade"
            gradientUnits="userSpaceOnUse"
            x1={PX}
            y1={PY}
            x2={target.x}
            y2={target.y}
          >
            <stop offset="0" stopColor="var(--color-green)" stopOpacity="0.04" />
            <stop offset="1" stopColor="var(--color-green)" stopOpacity="0.32" />
          </linearGradient>
          <filter id="phone-shadow" x="-20%" y="-60%" width="140%" height="240%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#111827" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* graduations */}
        <path className="dial-track" d={arc} />
        <line className="dial-ground" x1={PX - 6} y1={PY} x2={PX + R + 10} y2={PY} />
        {MINOR.map((t) => {
          const p = point(t, R - 2);
          const q = point(t, R + 4);
          return <line key={t} className="dial-tick minor" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
        })}
        {MAJOR.map((t) => {
          const p = point(t, R - 6);
          const q = point(t, R + 9);
          const l = point(t, R + 25);
          return (
            <g key={t}>
              <line className="dial-tick" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
              <text className="dial-tick-label" x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle">
                {t}°
              </text>
            </g>
          );
        })}

        {/* zone acceptée : posture habituelle de A ± tolérance */}
        <path className="dial-tolerance" data-testid="tolerance-arc" d={wedge} />
        <path className="dial-tolerance-edge" d={sweep(lo, hi, R)} />
        <line className="dial-expected-line" x1={PX} y1={PY} x2={target.x} y2={target.y} />
        <g className="dial-expected-tag" transform={`translate(${targetLabel.x} ${targetLabel.y})`}>
          <circle r="14" />
          <text textAnchor="middle" dominantBaseline="central">
            A
          </text>
        </g>

        {/* mesure : arc balayé depuis le sol, puis téléphone vu de profil */}
        {shown !== null && tip && (
          <>
            <path className="dial-sweep" d={sweep(0, shown, R - 58)} />
            <g className="dial-bubble" transform={`translate(${tip.x} ${tip.y})`}>
              <circle r="4" />
            </g>
            <g
              className="dial-phone"
              data-testid="needle"
              transform={`translate(${PX} ${PY}) rotate(${-clamp(shown)})`}
              filter="url(#phone-shadow)"
            >
              <rect className="dial-phone-body" x={22} y={-6} width={R - 34} height={12} rx={6} />
              <rect className="dial-phone-screen" x={28} y={-3} width={R - 52} height={6} rx={3} />
              <circle className="dial-phone-cam" cx={R - 22} cy={0} r={2} />
            </g>
          </>
        )}
        <circle className="dial-hub" cx={PX} cy={PY} r={7} />
        <circle className="dial-hub-dot" cx={PX} cy={PY} r={2.5} />
      </svg>

      <div className="dial-info">
        <span className="dial-live">
          <i aria-hidden="true" /> {beta === null ? 'Waiting for the phone' : 'Live measurement'}
        </span>
        <div className="dial-measure">
          <span className="dial-caption">Measured tilt</span>
          <span className="dial-value" aria-label="measured angle">
            {beta === null ? '—' : `${Math.round(beta)}°`}
          </span>
        </div>
        <div className="dial-measure">
          <span className="dial-caption">A’s posture</span>
          <span className="dial-expected" aria-label="expected angle">
            {`${Math.round(expectedBeta)}° ± ${tolerance}°`}
          </span>
        </div>
        <p className="dial-verdict" data-testid="dial-verdict">
          {deviation === null
            ? 'Waiting for the measurement…'
            : inside
              ? `✓ Within A’s zone (gap ${Math.round(deviation)}°)`
              : `✗ Outside A’s zone (gap ${Math.round(deviation)}°)`}
        </p>
      </div>
    </div>
  );
}
