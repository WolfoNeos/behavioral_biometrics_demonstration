import type { KeyRow } from './keystrokeRows';

export interface BarcodeProps {
  rows: KeyRow[];
  /** false : seulement la signature de reference (panneau « Profil de A »). */
  showLive?: boolean;
}

const HEIGHT = 60;
/** Ecart visuel minimal entre deux barres (un vol negatif = touches chevauchees). */
const MIN_GAP = 4;

interface Bar {
  x: number;
  w: number;
  status: KeyRow['status'];
}

/**
 * Barres sur un axe de temps : largeur = maintien (ms), espace avant la barre = vol (ms).
 * Les positions sans valeur sont sautees.
 */
function layout(
  rows: KeyRow[],
  dwell: (r: KeyRow) => number | null,
  flight: (r: KeyRow) => number | null,
  colored: boolean,
): Bar[] {
  const bars: Bar[] = [];
  let x = 0;
  rows.forEach((r) => {
    const d = dwell(r);
    if (d === null) return;
    if (bars.length > 0) x += Math.max(flight(r) ?? 0, MIN_GAP);
    const w = Math.max(2, d);
    bars.push({ x, w, status: colored ? r.status : null });
    x += w;
  });
  return bars;
}

const extent = (bars: Bar[]) => (bars.length ? bars[bars.length - 1].x + bars[bars.length - 1].w : 0);

function Strip({
  bars,
  ghost,
  label,
  className,
  scale,
}: {
  bars: Bar[];
  ghost?: Bar[];
  label: string;
  className: string;
  scale: number;
}) {
  return (
    <svg className={className} role="img" aria-label={label} viewBox={`0 0 ${scale} ${HEIGHT}`} preserveAspectRatio="none">
      {ghost?.map((b, i) => (
        <rect key={`g${i}`} className="barcode-ghost" x={b.x} y={0} width={b.w} height={HEIGHT} />
      ))}
      {bars.map((b, i) => (
        <rect
          key={i}
          className={b.status ? `bar-${b.status}` : undefined}
          data-status={b.status ?? undefined}
          x={b.x}
          y={ghost ? HEIGHT * 0.15 : 0}
          width={b.w}
          height={ghost ? HEIGHT * 0.7 : HEIGHT}
        />
      ))}
    </svg>
  );
}

/** Signature de frappe en « code-barres » : reference de A au-dessus, frappe en direct dessous. */
export function Barcode({ rows, showLive = true }: BarcodeProps) {
  const reference = layout(rows, (r) => r.expectedDwell, (r) => r.expectedFlight, false);
  const live = layout(rows, (r) => r.dwell, (r) => r.flight, true);
  // une seule echelle pour les deux : le plus long fixe la largeur
  const scale = Math.max(extent(reference), showLive ? extent(live) : 0, 1);
  return (
    <div className="barcode">
      <div className="barcode-row">
        <div className="barcode-label">Signature de référence (profil enregistré)</div>
        <Strip bars={reference} label="signature de référence" className="barcode-expected" scale={scale} />
      </div>
      {showLive && (
        <div className="barcode-row">
          <div className="barcode-label">Signature en direct (sur la référence en filigrane)</div>
          <Strip bars={live} ghost={reference} label="signature en direct" className="barcode-live" scale={scale} />
        </div>
      )}
    </div>
  );
}
