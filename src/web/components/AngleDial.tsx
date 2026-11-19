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
const TICKS = [0, 15, 30, 45, 60, 75, 90];

const clamp = (a: number): number => Math.max(0, Math.min(90, a));
const rad = (a: number): number => (clamp(a) * Math.PI) / 180;
const point = (angle: number, r: number) => ({
  x: PX + r * Math.cos(rad(angle)),
  y: PY - r * Math.sin(rad(angle)),
});

export function AngleDial({ expectedBeta, tolerance, beta }: AngleDialProps) {
  const lo = point(expectedBeta - tolerance, R);
  const hi = point(expectedBeta + tolerance, R);
  const wedge = `M ${PX} ${PY} L ${lo.x} ${lo.y} A ${R} ${R} 0 0 0 ${hi.x} ${hi.y} Z`;
  const arc = `M ${PX + R} ${PY} A ${R} ${R} 0 0 0 ${PX} ${PY - R}`;
  const ghostEnd = point(expectedBeta, R);
  const ghostLabel = point(expectedBeta, R + 54);

  const deviation = beta === null ? null : Math.abs(beta - expectedBeta);
  const inside = deviation !== null && deviation <= tolerance;
  const state = beta === null ? 'idle' : inside ? 'ok' : 'ko';

  return (
    <div className={`angle-dial dial-${state}`}>
      <svg viewBox="8 6 296 254" role="img" aria-label="cadran d'angle">
        {/* sol et arc gradué */}
        <path className="dial-track" d={arc} />
        <line className="dial-ground" x1={PX} y1={PY} x2={PX + R + 8} y2={PY} />
        <line className="dial-ground" x1={PX} y1={PY} x2={PX} y2={PY - R - 8} />
        {TICKS.map((t) => {
          const a = point(t, R - 4);
          const b = point(t, R + 8);
          const l = point(t, R + 24);
          return (
            <g key={t}>
              <line className="dial-tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <text className="dial-tick-label" x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle">
                {t}°
              </text>
            </g>
          );
        })}

        {/* zone acceptée : posture habituelle de A ± tolérance */}
        <path className="dial-tolerance" data-testid="tolerance-arc" d={wedge} />
        <line className="dial-expected-line" x1={PX} y1={PY} x2={ghostEnd.x} y2={ghostEnd.y} />
        <text className="dial-expected-label" x={ghostLabel.x} y={ghostLabel.y} textAnchor="middle">
          A
        </text>

        {/* téléphone mesuré, vu de profil */}
        {beta !== null && (
          <g className="dial-phone" data-testid="needle" transform={`translate(${PX} ${PY}) rotate(${-clamp(beta)})`}>
            <rect x={26} y={-9} width={R - 40} height={18} rx={9} />
            <circle cx={R - 26} cy={0} r={3} />
          </g>
        )}
        <circle className="dial-hub" cx={PX} cy={PY} r={7} />
      </svg>

      <div className="dial-info">
        <div className="dial-measure">
          <span className="dial-caption">Inclinaison mesurée</span>
          <span className="dial-value" aria-label="angle mesuré">
            {beta === null ? '—' : `${Math.round(beta)}°`}
          </span>
        </div>
        <div className="dial-measure">
          <span className="dial-caption">Posture de A</span>
          <span className="dial-expected" aria-label="angle attendu">
            {`${Math.round(expectedBeta)}° ± ${tolerance}°`}
          </span>
        </div>
        <p className="dial-verdict" data-testid="dial-verdict">
          {deviation === null
            ? 'En attente de la mesure…'
            : inside
              ? `✓ Dans la zone de A (écart ${Math.round(deviation)}°)`
              : `✗ Hors de la zone de A (écart ${Math.round(deviation)}°)`}
        </p>
      </div>
    </div>
  );
}
