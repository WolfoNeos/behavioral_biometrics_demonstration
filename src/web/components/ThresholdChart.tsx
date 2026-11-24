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

const BAND_LABEL = "Uncertainty band";
const LOWER_LABEL = 'Lower bound (ms)';

/** Une seule entree de legende pour la bande : la borne basse est masquee. */
export function legendFilter(item: { text: string }): boolean {
  return item.text !== LOWER_LABEL;
}

const ms = (v: number | null) => (v === null ? '–' : `${Math.round(v)} ms`);

/**
 * Axe du flight : lineaire jusqu'a FLIGHT_KNEE, puis comprime (pente 1/FLIGHT_SLOPE) pour que les
 * pauses restent visibles sans ecraser le reste ; au-dela de FLIGHT_CAP le point est colle au bord
 * et marque d'un triangle.
 */
export const FLIGHT_KNEE = 200;
export const FLIGHT_SLOPE = 4;
export const FLIGHT_CAP = 1500;
export const FLIGHT_MIN = -100;
export const squash = (v: number | null): number | null =>
  v === null ? null : v <= FLIGHT_KNEE ? v : FLIGHT_KNEE + (v - FLIGHT_KNEE) / FLIGHT_SLOPE;
export const unsquash = (t: number): number => (t <= FLIGHT_KNEE ? t : FLIGHT_KNEE + (t - FLIGHT_KNEE) * FLIGHT_SLOPE);
const clampFlight = (v: number | null) => (v === null ? null : Math.max(FLIGHT_MIN, Math.min(FLIGHT_CAP, v)));

const dwellBand = (r: KeyRow, sign: 1 | -1) =>
  r.expectedDwell === null || r.bandDwell === null ? null : r.expectedDwell + sign * r.bandDwell;
const flightBand = (r: KeyRow, i: number, sign: 1 | -1) =>
  i === 0 || r.expectedFlight === null || r.bandFlight === null ? null : r.expectedFlight + sign * r.bandFlight;

/**
 * Deux graphiques empiles, une valeur par position (le mot de passe n'est jamais affiche) :
 * le temps de maintien (point colore selon l'ecart) puis le temps entre deux touches (flight),
 * chacun avec sa reference et sa bande d'incertitude.
 */
export function ThresholdChart({ rows }: ThresholdChartProps) {
  const ink = token('--color-ink');
  const grey = token('--color-grey');
  const greySoft = token('--color-grey-soft');
  const blue = token('--color-blue');
  const blueSoft = '#93b4f5';
  const labels = rows.map((_, i) => String(i + 1));
  const pointColors = rows.map((r) => (r.status ? token(STATUS_TOKEN[r.status]) : ink));
  const flights = rows.map((r, i) => (i === 0 ? null : r.flight));
  const outOfRange = flights.map((v) => v !== null && (v > FLIGHT_CAP || v < FLIGHT_MIN));

  const holdData = {
    labels,
    datasets: [
      {
        label: 'Hold (ms)',
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
        label: 'Hold expected (ms)',
        data: rows.map((r) => r.expectedDwell),
        borderColor: grey,
        backgroundColor: grey,
        borderDash: [6, 4],
        pointRadius: 3,
        tension: 0.2,
      },
      {
        label: BAND_LABEL,
        data: rows.map((r) => dwellBand(r, 1)),
        borderColor: 'transparent',
        backgroundColor: greySoft,
        pointRadius: 0,
        fill: '+1',
        tension: 0.2,
      },
      { label: LOWER_LABEL, data: rows.map((r) => dwellBand(r, -1)), borderColor: 'transparent', pointRadius: 0, tension: 0.2 },
    ],
  };
  const flightData = {
    labels,
    datasets: [
      {
        // temps entre deux touches (la 1re touche n'en a pas) ; hors de l'echelle : triangle au bord
        label: 'Flight (ms)',
        data: flights.map((v) => squash(clampFlight(v))),
        rawFlights: flights,
        borderColor: blue,
        backgroundColor: blue,
        borderWidth: 2.5,
        pointRadius: outOfRange.map((o) => (o ? 8 : 5)),
        pointStyle: outOfRange.map((o) => (o ? 'triangle' : 'rectRot')),
        tension: 0.2,
      },
      {
        label: 'Flight expected (ms)',
        data: rows.map((r, i) => squash(i === 0 ? null : r.expectedFlight)),
        borderColor: blueSoft,
        backgroundColor: blueSoft,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.2,
      },
      {
        label: BAND_LABEL,
        data: rows.map((r, i) => squash(flightBand(r, i, 1))),
        borderColor: 'transparent',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        pointRadius: 0,
        fill: '+1',
        tension: 0.2,
      },
      { label: LOWER_LABEL, data: rows.map((r, i) => squash(flightBand(r, i, -1))), borderColor: 'transparent', pointRadius: 0, tension: 0.2 },
    ],
  };
  const font = { family: "Inter, 'Segoe UI', system-ui, sans-serif", size: 13 };
  const muted = token('--color-ink-muted');
  const border = token('--color-border');
  const options = (yTitle: string, xTitle: string | null, y: Record<string, unknown>) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    scales: {
      y: {
        title: { display: true, text: yTitle, font, color: muted },
        ticks: { font, color: muted, maxTicksLimit: 5 },
        grid: { color: border },
        border: { display: false },
        ...y,
      },
      x: {
        title: { display: xTitle !== null, text: xTitle ?? '', font, color: muted },
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
  });
  const flightOut = outOfRange.filter(Boolean).length;
  const compressed = [
    ...flights,
    ...rows.map((r) => r.expectedFlight),
    ...rows.map((r, i) => flightBand(r, i, 1)),
  ].some((v) => v !== null && v > FLIGHT_KNEE);
  return (
    <div className="threshold-chart" aria-label="keystroke timing chart">
      <div className="chart-canvas chart-half" aria-label="hold time chart">
        <Line data={holdData} options={options('Hold time (ms)', null, { beginAtZero: true })} />
      </div>
      <div className="chart-canvas chart-half" aria-label="flight time chart">
        <Line
          data={flightData}
          options={options(
            compressed ? `Flight (ms · scale compressed above ${FLIGHT_KNEE})` : 'Flight (ms)',
            'Position in the password',
            {
              min: FLIGHT_MIN,
              suggestedMax: 300,
              ticks: { font, color: muted, maxTicksLimit: 6, callback: (t: number | string) => Math.round(unsquash(Number(t))) },
            },
          )}
        />
      </div>
      {flightOut > 0 && (
        <p className="chart-note" role="note">
          ▲ {flightOut} flight value{flightOut > 1 ? 's' : ''} beyond {FLIGHT_CAP} ms, shown at the edge
        </p>
      )}
      <table className="values-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Hold</th>
            <th>Expected</th>
            <th>Uncertainty band</th>
            <th>Flight</th>
            <th>Expected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="key">{i + 1}</td>
              <td>{ms(r.dwell)}</td>
              <td>{ms(r.expectedDwell)}</td>
              <td>± {ms(r.bandDwell)}</td>
              <td>{i === 0 ? '–' : ms(r.flight)}</td>
              <td>{i === 0 ? '–' : ms(r.expectedFlight)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
