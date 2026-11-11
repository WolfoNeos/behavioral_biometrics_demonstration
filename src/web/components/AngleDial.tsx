export interface AngleDialProps {
  expectedBeta: number;
  tolerance: number;
  beta: number | null;
}

const CX = 100;
const CY = 100;
const R = 80;
const LIMIT = 90;

/** beta (degres, -90..90) -> point du demi-cercle ; 0 degre = en haut. */
function point(beta: number, radius: number) {
  const phi = (Math.max(-LIMIT, Math.min(LIMIT, beta)) * Math.PI) / 180;
  return { x: CX + radius * Math.sin(phi), y: CY - radius * Math.cos(phi) };
}

export function AngleDial({ expectedBeta, tolerance, beta }: AngleDialProps) {
  const start = point(expectedBeta - tolerance, R);
  const end = point(expectedBeta + tolerance, R);
  const track = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const arc = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
  const needle = beta === null ? null : point(beta, R - 6);
  const mark = point(expectedBeta, R + 12);
  const markIn = point(expectedBeta, R - 12);
  return (
    <div className="angle-dial">
      <svg viewBox="0 0 200 115" role="img" aria-label="cadran d'angle">
        <path className="dial-track" d={track} />
        <path className="dial-tolerance" data-testid="tolerance-arc" d={arc} />
        <line className="dial-expected-mark" x1={markIn.x} y1={markIn.y} x2={mark.x} y2={mark.y} />
        {needle && (
          <line
            className="dial-needle"
            data-testid="needle"
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
          />
        )}
        <circle className="dial-hub" cx={CX} cy={CY} r={6} />
      </svg>
      <div className="dial-value" aria-label="angle mesuré">
        {beta === null ? '—' : `${Math.round(beta)}°`}
      </div>
      <div className="dial-expected" aria-label="angle attendu">
        {`${Math.round(expectedBeta)}° ± ${tolerance}°`}
      </div>
    </div>
  );
}
