import { useState } from 'react';
import type { DeviceRun } from '../../shared/types';
import { DeviceTable, FIELD_LABELS, display, friendlyUserAgent } from './DeviceTable';

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

/** Au-delà de ce nombre d'appareils, les cellules n'affichent plus que ✓ ou ✗ (la valeur reste au survol). */
export const COMPACT_FROM = 4;

/** Garde les `limit` derniers appareils arrivés (null = tous). */
export function limitRuns(runs: DeviceRun[], limit: number | null): DeviceRun[] {
  return limit === null || limit < 1 ? runs : runs.slice(-limit);
}

/**
 * Plusieurs appareils côte à côte (étape 2 en mode « Stay on step ») : A, puis chaque téléphone.
 * Une cellule verte (✓) est identique à A ; une cellule rouge (✗) donne la valeur qui diffère.
 * Les lignes où les appareils diffèrent entre eux remontent en tête ; par défaut seuls les écarts
 * sont listés. Le nombre d'appareils comparés peut être limité (les plus récents) ; avec
 * beaucoup d'appareils, seules les marques ✓ / ✗ sont affichées, et un appareil peut être choisi
 * pour le comparer en détail au profil de A.
 */
export function DeviceRunsCompare({ runs: allRuns }: { runs: DeviceRun[] }) {
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const runs = limitRuns(allRuns, limit);
  const compact = runs.length >= COMPACT_FROM;
  const detail = runs.find((r) => r.phone === selected) ?? null;
  const rows = buildRows(runs);
  const differs = (r: Row) => r.match.some((m) => m === false) || r.spread > 1;
  const shown = (all ? rows : rows.filter(differs)).sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || b.spread - a.spread || Number(differs(b)) - Number(differs(a)),
  );
  return (
    <div className="runs-compare" data-testid="device-runs">
      <div className="cmp-bar">
        <p className="cmp-summary ko" data-testid="runs-summary">
          {runs.length} devices · {rows.filter(differs).length} of {rows.length} criteria differ
        </p>
        <div className="runs-controls">
          <label className="runs-limit">
            Compare at most
            <input
              type="number"
              min={2}
              max={allRuns.length}
              inputMode="numeric"
              placeholder="all"
              aria-label="Maximum number of devices compared"
              value={limit ?? ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setLimit(Number.isFinite(n) && n >= 1 ? n : null);
              }}
            />
            devices
          </label>
          <button type="button" className="chip-toggle" aria-pressed={all} onClick={() => setAll(!all)}>
            {all ? 'Only differences' : 'Show all criteria'}
          </button>
        </div>
      </div>
      <div className="runs-pick" role="group" aria-label="Device to compare with A">
        <span>Compare with A:</span>
        <button type="button" className="chip-toggle" aria-pressed={detail === null} onClick={() => setSelected(null)}>
          All devices
        </button>
        {runs.map((r) => (
          <button
            key={r.phone}
            type="button"
            className="chip-toggle"
            aria-pressed={detail?.phone === r.phone}
            title={runLabel(r)}
            onClick={() => setSelected(r.phone)}
          >
            Phone {r.n}
          </button>
        ))}
      </div>
      {detail && (
        <div className="runs-detail" data-testid="run-detail">
          <p className="runs-detail-title">
            {runLabel(detail)} <span>vs A’s profile</span>
          </p>
          <DeviceTable lines={detail.lines} />
        </div>
      )}
      <div className={compact ? 'cmp-scroll runs-compact' : 'cmp-scroll'} hidden={detail !== null}>
        <table className="values-table runs-table">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>A’s profile</th>
              {runs.map((r) => (
                <th key={r.phone} title={runLabel(r)} onClick={() => setSelected(r.phone)}>
                  <span className="run-name">Phone {r.n}</span>
                  <span className="run-browser">{runLabel(r).split(' · ').slice(1).join(' · ')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="runs-scores">
              <td>Score</td>
              <td>–</td>
              {runs.map((r) => (
                <td key={r.phone} className={r.score >= 80 ? 'cell-ok' : 'cell-ko'}>
                  <strong>{Math.round(r.score)}</strong>
                  {!r.submitted && <span className="run-note">before PIN</span>}
                </td>
              ))}
            </tr>
            {shown.map((row) => (
              <tr key={row.field} className={row.enabled ? undefined : 'cmp-off'}>
                <td>{row.label}</td>
                <td className={MONO.includes(row.field) ? 'cmp-mono' : undefined} title={row.expected}>
                  {display(row.field, row.expected)}
                </td>
                {row.actual.map((a, i) => {
                  const diff = row.match[i] === false;
                  return (
                    <td
                      key={runs[i].phone}
                      className={`${diff ? 'cell-ko' : 'cell-ok'}${MONO.includes(row.field) ? ' cmp-mono' : ''}`}
                      title={a ?? undefined}
                    >
                      {a === null ? (
                        '–'
                      ) : diff ? (
                        <>
                          <span className="mark" aria-label="different">
                            ✗
                          </span>
                          {!compact && display(row.field, a)}
                        </>
                      ) : (
                        <span className="mark" aria-label="identical">
                          ✓
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
