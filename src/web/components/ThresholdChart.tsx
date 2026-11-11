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
import type { PerKeyScore } from '../../shared/scoring/keystroke';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Legend, Tooltip);

export interface ThresholdChartProps {
  perKey: PerKeyScore[];
}

/** Lit un jeton CSS (les couleurs ne sont definies que dans tokens.css). */
function token(name: string): string {
  if (typeof document === 'undefined') return 'currentColor';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor';
}

const ms = (v: number) => `${Math.round(v)} ms`;

/** Temps de maintien (dwell) par touche : direct, attendu, bande d'incertitude. */
export function ThresholdChart({ perKey }: ThresholdChartProps) {
  const ink = token('--color-ink');
  const grey = token('--color-grey');
  const greySoft = token('--color-grey-soft');
  const data = {
    labels: perKey.map((p) => p.key),
    datasets: [
      {
        label: 'Direct (ms)',
        data: perKey.map((p) => p.dwell),
        borderColor: ink,
        backgroundColor: ink,
        borderWidth: 3,
        pointRadius: 5,
        tension: 0.2,
      },
      {
        label: 'Attendu (ms)',
        data: perKey.map((p) => p.expectedDwell),
        borderColor: grey,
        backgroundColor: grey,
        borderDash: [6, 4],
        pointRadius: 3,
        tension: 0.2,
      },
      {
        label: 'Borne haute (ms)',
        data: perKey.map((p) => p.expectedDwell + p.bandDwell),
        borderColor: 'transparent',
        backgroundColor: greySoft,
        pointRadius: 0,
        fill: '+1',
        tension: 0.2,
      },
      {
        label: 'Borne basse (ms)',
        data: perKey.map((p) => p.expectedDwell - p.bandDwell),
        borderColor: 'transparent',
        pointRadius: 0,
        tension: 0.2,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { title: { display: true, text: 'Temps de maintien (ms)' }, beginAtZero: true },
      x: { title: { display: true, text: 'Touche' } },
    },
    plugins: { legend: { labels: { font: { size: 14 } } } },
  };
  return (
    <div className="threshold-chart" aria-label="graphique des temps de frappe">
      <div className="chart-canvas">
        <Line data={data} options={options} />
      </div>
      <table className="values-table">
        <thead>
          <tr>
            <th>Touche</th>
            <th>Direct</th>
            <th>Attendu</th>
            <th>Zone d&apos;incertitude</th>
          </tr>
        </thead>
        <tbody>
          {perKey.map((p, i) => (
            <tr key={i}>
              <td className="key">{p.key}</td>
              <td>{ms(p.dwell)}</td>
              <td>{ms(p.expectedDwell)}</td>
              <td>± {ms(p.bandDwell)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
