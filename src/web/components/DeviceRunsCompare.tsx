import { useState } from 'react';
import type { DeviceRun } from '../../shared/types';
import { FIELD_LABELS, display, friendlyUserAgent } from './DeviceTable';

const MONO = ['canvasHash', 'installId', 'cookieId', 'idbId'];

interface Row {
  field: string;
  label: string;
  expected: string;
  enabled: boolean;
  actual: (string | null)[];
  match: (boolean | null)[];
  /** Nombre de valeurs différentes entre les appareils. */
  spread: number;
}

/** Une ligne par critère : la valeur de A, puis celle de chaque appareil. */
export function buildRows(runs: DeviceRun[]): Row[] {
  const fields: string[] = [];
  for (const r of runs) for (const l of r.lines) if (!fields.includes(l.field)) fields.push(l.field);
  return fields.map((field) => {
    const lines = runs.map((r) => r.lines.find((l) => l.field === field) ?? null);
    const first = lines.find((l) => l !== null)!;
    const actual = lines.map((l) => (l ? l.actual : null));
    return {
      field,
      label: FIELD_LABELS[field] ?? field,
      expected: first.expected,
      enabled: first.enabled !== false,
      actual,
      match: lines.map((l) => (l ? l.match : null)),
      spread: new Set(actual.filter((a) => a !== null)).size,
    };
  });
}

/** Libellé court d'un appareil : « Phone 2 · Chrome 157 · iOS 27.2 ». */
export function runLabel(run: DeviceRun): string {
  const ua = run.lines.find((l) => l.field === 'userAgent')?.actual;
  return `Phone ${run.n}${ua ? ` · ${friendlyUserAgent(ua)}` : ''}`;
}

/**
 * Plusieurs appareils côte à côte (étape 2 en mode « Stay on step ») : A, puis chaque téléphone ;
 * les cellules rouges sont celles qui diffèrent de A, les lignes où les appareils diffèrent entre
 * eux remontent en tête. Par défaut seuls les écarts sont listés.
 */
export function DeviceRunsCompare({ runs }: { runs: DeviceRun[] }) {
  const [all, setAll] = useState(false);
  const rows = buildRows(runs);
  const differs = (r: Row) => r.match.some((m) => m === false) || r.spread > 1;
  const shown = (all ? rows : rows.filter(differs)).sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || b.spread - a.spread || Number(differs(b)) - Number(differs(a)),
  );
  return (
    <div className="device-compare runs-compare" data-testid="device-runs">
      <div className="cmp-bar">
        <p className="cmp-summary" data-testid="runs-summary">
          {runs.length} devices · {rows.filter(differs).length} of {rows.length} criteria differ
        </p>
        <button type="button" className="chip-toggle" aria-pressed={all} onClick={() => setAll(!all)}>
          {all ? 'Only differences' : 'Show all criteria'}
        </button>
      </div>
      <div className="cmp-scroll">
        <table className="values-table runs-table">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>A’s profile</th>
              {runs.map((r) => (
                <th key={r.phone} title={runLabel(r)}>
                  {runLabel(r)}
                </th>
              ))}
            </tr>
            <tr className="runs-scores">
              <td>Score</td>
              <td>–</td>
              {runs.map((r) => (
                <td key={r.phone} className={r.score >= 80 ? 'cell-ok' : 'cell-ko'}>
                  <strong>{Math.round(r.score)}</strong>
                  {r.submitted ? '' : ' (before PIN)'}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.field} className={row.enabled ? undefined : 'cmp-off'}>
                <td>{row.label}</td>
                <td className={MONO.includes(row.field) ? 'cmp-mono' : undefined} title={row.expected}>
                  {display(row.field, row.expected)}
                </td>
                {row.actual.map((a, i) => (
                  <td
                    key={runs[i].phone}
                    className={`${row.match[i] === false ? 'cell-ko' : 'cell-ok'}${MONO.includes(row.field) ? ' cmp-mono' : ''}`}
                    title={a ?? undefined}
                  >
                    {a === null ? '–' : display(row.field, a)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
