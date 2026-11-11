export interface GaugeProps {
  /** null : aucune mesure pour ce niveau -> jauge neutre « — ». */
  score: number | null;
  accept: number;
  warn: number;
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

export function Gauge({ score, accept, warn }: GaugeProps) {
  // la couleur vient de la valeur affichee (arrondie) : « 80 » n'est jamais orange
  const shown = score === null ? null : Math.round(score);
  const color =
    shown === null ? 'neutral' : shown >= accept ? 'green' : shown >= warn ? 'orange' : 'red';
  const clamped = shown === null ? 0 : Math.max(0, Math.min(100, shown));
  const path = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  return (
    <div
      className={`gauge ${color}`}
      role="meter"
      aria-label="score"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown ?? undefined}
      aria-valuetext={shown === null ? 'aucune mesure' : undefined}
      data-color={color}
    >
      <svg viewBox="0 0 200 125" aria-hidden="false">
        <path className="gauge-track" d={path} pathLength={100} />
        <path
          className="gauge-fill"
          d={path}
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
        />
        <Marker value={warn} label={`seuil alerte ${warn}`} />
        <Marker value={accept} label={`seuil acceptation ${accept}`} />
      </svg>
      <div className="gauge-score">{shown === null ? '—' : shown}</div>
    </div>
  );
}
