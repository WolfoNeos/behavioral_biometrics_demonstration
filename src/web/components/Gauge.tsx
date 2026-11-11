export interface GaugeProps {
  score: number;
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
  const color = score >= accept ? 'green' : score >= warn ? 'orange' : 'red';
  const clamped = Math.max(0, Math.min(100, score));
  const path = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  return (
    <div
      className={`gauge ${color}`}
      role="meter"
      aria-label="score"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
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
      <div className="gauge-score">{Math.round(score)}</div>
    </div>
  );
}
