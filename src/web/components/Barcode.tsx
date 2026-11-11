export interface BarcodeProps {
  live: number[];
  expected: number[];
}

const GAP = 6;
const HEIGHT = 60;

/** Une barre par touche, largeur proportionnelle a la duree (ms). */
const barWidth = (v: number) => Math.max(2, v);
const totalWidth = (values: number[]) =>
  values.reduce((sum, v) => sum + barWidth(v), 0) + GAP * Math.max(values.length - 1, 0);

function Bars({
  values,
  label,
  className,
  scale,
}: {
  values: number[];
  label: string;
  className: string;
  scale: number;
}) {
  let x = 0;
  const bars = values.map((v, i) => {
    const w = barWidth(v);
    const bar = <rect key={i} x={x} y={0} width={w} height={HEIGHT} />;
    x += w + GAP;
    return bar;
  });
  return (
    <svg
      className={className}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${scale} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      {bars}
    </svg>
  );
}

export function Barcode({ live, expected }: BarcodeProps) {
  // Une seule echelle pour les deux : le plus long des deux fixe la largeur.
  const scale = Math.max(totalWidth(live), totalWidth(expected), 1);
  return (
    <div className="barcode">
      <div className="barcode-row">
        <div className="barcode-label">Signature de référence (profil enregistré)</div>
        <Bars values={expected} label="signature de référence" className="barcode-expected" scale={scale} />
      </div>
      <div className="barcode-row">
        <div className="barcode-label">Signature en direct</div>
        <Bars values={live} label="signature en direct" className="barcode-live" scale={scale} />
      </div>
    </div>
  );
}
