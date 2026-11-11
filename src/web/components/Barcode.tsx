export interface BarcodeProps {
  live: number[];
  expected: number[];
}

const GAP = 6;
const HEIGHT = 60;

/** Une barre par touche, largeur proportionnelle a la duree (ms). */
function Bars({ values, label, className }: { values: number[]; label: string; className: string }) {
  let x = 0;
  const bars = values.map((v, i) => {
    const w = Math.max(2, v);
    const bar = <rect key={i} x={x} y={0} width={w} height={HEIGHT} />;
    x += w + GAP;
    return bar;
  });
  return (
    <svg
      className={className}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${Math.max(x - GAP, 1)} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      {bars}
    </svg>
  );
}

export function Barcode({ live, expected }: BarcodeProps) {
  return (
    <div className="barcode">
      <div className="barcode-row">
        <div className="barcode-label">Signature de référence (profil enregistré)</div>
        <Bars values={expected} label="signature de référence" className="barcode-expected" />
      </div>
      <div className="barcode-row">
        <div className="barcode-label">Signature en direct</div>
        <Bars values={live} label="signature en direct" className="barcode-live" />
      </div>
    </div>
  );
}
