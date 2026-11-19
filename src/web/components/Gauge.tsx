import { useEffect, useRef, useState } from 'react';

export interface GaugeProps {
  /** null : no measurement pour ce niveau -> jauge neutre « — ». */
  score: number | null;
  accept: number;
  warn: number;
  /** Nom accessible de la jauge (par défaut « score »). */
  label?: string;
}

const CX = 100;
const CY = 100;
const R = 85;

/** Point du demi-cercle (0 a gauche, 100 a droite) pour une valeur 0-100. */
function point(value: number, radius: number) {
  const theta = Math.PI * (1 - value / 100);
  return { x: CX + radius * Math.cos(theta), y: CY - radius * Math.sin(theta) };
}

function Marker({ value, label }: { value: number; label: string }) {
  const a = point(value, R - 16);
  const b = point(value, R + 16);
  const t = point(value, R + 28);
  return (
    <g aria-label={label}>
      <line className="gauge-marker" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <text className="gauge-marker-label" x={t.x} y={t.y}>
        {value}
      </text>
    </g>
  );
}

/** Nombre qui glisse vers sa nouvelle valeur (le premier affichage est immédiat). */
function useCountUp(target: number | null, ms = 500): number | null {
  const [value, setValue] = useState<number | null>(target);
  const from = useRef<number | null>(target);
  useEffect(() => {
    if (target === null || from.current === null || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (target - start) * eased;
      from.current = v;
      setValue(Math.round(v));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function Gauge({ score, accept, warn, label = 'score' }: GaugeProps) {
  // la couleur vient de la valeur affichee (arrondie) : « 80 » n'est jamais orange
  const shown = score === null ? null : Math.round(score);
  const color =
    shown === null ? 'neutral' : shown >= accept ? 'green' : shown >= warn ? 'orange' : 'red';
  const counted = useCountUp(shown);
  const clamped = shown === null ? 0 : Math.max(0, Math.min(100, shown));
  const path = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  return (
    <div
      className={`gauge ${color}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown ?? undefined}
      aria-valuetext={shown === null ? 'no measurement' : undefined}
      data-color={color}
    >
      <svg viewBox="0 0 200 125" aria-hidden="false">
        <path className="gauge-track" d={path} pathLength={100} />
        <path className="gauge-zone red" d={path} pathLength={100} strokeDasharray={`${warn} 100`} />
        <path className="gauge-zone orange" d={path} pathLength={100} strokeDasharray={`0 ${warn} ${accept - warn} 100`} />
        <path className="gauge-zone green" d={path} pathLength={100} strokeDasharray={`0 ${accept} ${100 - accept} 100`} />
        <path
          className="gauge-fill"
          d={path}
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
        />
        <Marker value={warn} label={`warning threshold ${warn}`} />
        <Marker value={accept} label={`acceptance threshold ${accept}`} />
      </svg>
      <div className="gauge-score">{shown === null ? '—' : (counted ?? shown)}</div>
    </div>
  );
}
