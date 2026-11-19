import type { KeyRow } from './keystrokeRows';

export interface BarcodeProps {
  rows: KeyRow[];
  /** false : seulement la signature de reference (panneau « A’s profile »). */
  showLive?: boolean;
}

const HEIGHT = 60;
/** Ecart visuel minimal entre deux barres (un vol negatif = touches chevauchees). */
const MIN_GAP = 4;
/** Plafond d'un ecart ou d'un maintien affiche quand la reference ne donne pas de bande (ms). */
const FALLBACK_CAP = 400;
/** Plancher de largeur d'une barre (ms). */
const MIN_BAR = 2;

export interface Bar {
  x: number;
  w: number;
  status: KeyRow['status'];
  /** vol (ou maintien) au-dela du plafond : affiche plafonne, avec un repere « pause ». */
  paused: boolean;
}

/** Plafond d'affichage : attendu + 3 ecarts-types si la reference est connue, sinon fixe. */
const capOf = (expected: number | null, band: number | null): number =>
  expected !== null && band !== null ? Math.max(expected + 3 * band, MIN_GAP) : FALLBACK_CAP;

/**
 * Disposition des deux bandes sur une echelle commune. Les ecarts et maintiens affiches sont
 * plafonnes : une longue pause ne deforme pas l'echelle, elle recoit un repere. Les barres en
 * direct sont posees sur les memes x que la reference du meme indice (comparaison touche par
 * touche) ; sans reference a cet indice, elles suivent leur propre cumul.
 */
export function barcodeLayout(rows: KeyRow[]): { reference: Bar[]; live: Bar[]; scale: number } {
  const reference: Bar[] = [];
  const refX = new Map<number, number>();
  let x = 0;
  rows.forEach((r, i) => {
    if (r.expectedDwell === null) return;
    if (reference.length > 0) {
      const flight = r.expectedFlight ?? 0;
      x += Math.min(Math.max(flight, MIN_GAP), capOf(r.expectedFlight, r.bandFlight));
    }
    const w = Math.max(MIN_BAR, Math.min(r.expectedDwell, capOf(r.expectedDwell, r.bandDwell)));
    reference.push({ x, w, status: null, paused: false });
    refX.set(i, x);
    x += w;
  });

  const live: Bar[] = [];
  let cursor = 0;
  rows.forEach((r, i) => {
    if (r.dwell === null) return;
    const flightCap = capOf(r.expectedFlight, r.bandFlight);
    const flight = r.flight ?? 0;
    const paused = live.length > 0 && flight > flightCap;
    const dwellCap = capOf(r.expectedDwell, r.bandDwell);
    const w = Math.max(MIN_BAR, Math.min(r.dwell, dwellCap));
    const aligned = refX.get(i);
    const bx = aligned !== undefined ? aligned : live.length > 0 ? cursor + Math.min(Math.max(flight, MIN_GAP), flightCap) : 0;
    live.push({ x: bx, w, status: r.status, paused: paused || r.dwell > dwellCap });
    cursor = bx + w;
  });

  const end = (bars: Bar[]) => bars.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  return { reference, live, scale: Math.max(end(reference), end(live), 1) };
}

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
      {bars.map((b, i) =>
        b.paused ? (
          <rect
            key={`p${i}`}
            className="barcode-pause"
            data-testid="barcode-pause"
            x={Math.max(0, b.x - scale * 0.012)}
            y={0}
            width={scale * 0.01}
            height={HEIGHT * 0.3}
          />
        ) : null,
      )}
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
  const { reference, live, scale } = barcodeLayout(rows);
  return (
    <div className="barcode">
      <div className="barcode-row">
        <div className="barcode-label">Reference signature (enrolled profile)</div>
        <Strip bars={reference} label="reference signature" className="barcode-expected" scale={scale} />
      </div>
      {showLive && (
        <div className="barcode-row">
          <div className="barcode-label">Live signature (over the reference watermark)</div>
          <Strip bars={live} ghost={reference} label="live signature" className="barcode-live" scale={scale} />
        </div>
      )}
    </div>
  );
}
