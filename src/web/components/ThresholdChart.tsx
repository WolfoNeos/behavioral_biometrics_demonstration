import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { BarStatus } from '../../shared/scoring/keystrokeLive';
import type { KeyRow } from './keystrokeRows';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip);

export interface ThresholdChartProps {
  /** Une ligne par position (aucun caractere affiche) ; null = pas encore tape / sans reference. */
  rows: KeyRow[];
}

/** Couleur d'un point selon l'ecart a la reference (jetons de tokens.css). */
const STATUS_TOKEN: Record<BarStatus, string> = {
  ok: '--color-green',
  warn: '--color-orange',
  bad: '--color-red',
  unknown: '--color-grey',
};

/** Lit un jeton CSS (les couleurs ne sont definies que dans tokens.css). */
function token(name: string): string {
  if (typeof document === 'undefined') return 'currentColor';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';
}

const BAND_LABEL = "Zone d'incertitude";
const LOWER_LABEL = 'Borne basse (ms)';

/** Une seule entree de legende pour la bande : la borne basse est masquee. */
export function legendFilter(item: { text: string }): boolean {
  return item.text !== LOWER_LABEL;
}

const ms = (v: number | null) => (v === null ? '–' : `${Math.round(v)} ms`);
const band = (r: KeyRow, sign: 1 | -1) =>
  r.expectedDwell === null || r.bandDwell === null ? null : r.expectedDwell + sign * r.bandDwell;

/**
 * Temps de maintien (dwell) par position : direct (point par point, colore selon l'ecart),
 * attendu, bande d'incertitude. Positions numerotees : le mot de passe n'est jamais affiche.
 */
export function ThresholdChart({ rows }: ThresholdChartProps) {
  const ink = token('--color-ink');
  const grey = token('--color-grey');
  const greySoft = token('--color-grey-soft');
  const pointColors = rows.map((r) => (r.status ? token(STATUS_TOKEN[r.status]) : ink));
  const data = {
    labels: rows.map((_, i) => String(i + 1)),
    datasets: [
      {
        label: 'Direct (ms)',
        data: rows.map((r) => r.dwell),
        borderColor: ink,
        backgroundColor: ink,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        borderWidth: 2.5,
        pointRadius: 6,
        tension: 0.2,
      },
      {
        label: 'Attendu (ms)',
        data: rows.map((r) => r.expectedDwell),
        borderColor: grey,
        backgroundColor: grey,
        borderDash: [6, 4],
        pointRadius: 3,
        tension: 0.2,
      },
      {
        label: BAND_LABEL,
        data: rows.map((r) => band(r, 1)),
        borderColor: 'transparent',
        backgroundColor: greySoft,
        pointRadius: 0,
        fill: '+1',
        tension: 0.2,
      },
      {
        label: LOWER_LABEL,
        data: rows.map((r) => band(r, -1)),
        borderColor: 'transparent',
        pointRadius: 0,
        tension: 0.2,
      },
    ],
  };
  const font = { family: "Inter, 'Segoe UI', system-ui, sans-serif", size: 13 };
  const muted = token('--color-ink-muted');
  const border = token('--color-border');
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      y: {
        title: { display: true, text: 'Temps de maintien (ms)', font, color: muted },
        ticks: { font, color: muted, maxTicksLimit: 5 },
        grid: { color: border },
        border: { display: false },
        beginAtZero: true,
      },
      x: {
        title: { display: true, text: 'Position dans le mot de passe', font, color: muted },
        ticks: { font, color: muted },
        grid: { display: false },
        border: { color: border },
      },
    },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: { font, color: muted, filter: legendFilter, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
      },
    },
  };
  return (
    <div className="threshold-chart" aria-label="graphique des temps de frappe">
      <div className="chart-canvas">
        <Line data={data} options={options} />
      </div>
      <table className="values-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Direct</th>
            <th>Attendu</th>
            <th>Zone d&apos;incertitude</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="key">{i + 1}</td>
              <td>{ms(r.dwell)}</td>
              <td>{ms(r.expectedDwell)}</td>
              <td>± {ms(r.bandDwell)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
