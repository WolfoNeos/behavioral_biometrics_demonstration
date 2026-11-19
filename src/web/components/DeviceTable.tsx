import { FIELD_WEIGHTS, IDENTITY_FIELDS, IDENTITY_MISMATCH_CAP } from '../../shared/scoring/device';
import type { Fingerprint } from '../../shared/types';

export interface DeviceTableLine {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
}

export interface DeviceTableProps {
  lines: DeviceTableLine[];
  /** Profil de A : affiché en attente de mesure, quand `lines` est vide. */
  expected?: Fingerprint | null;
}

/** Libelles francais des champs d'empreinte (tableau et panneau « Profil de A »). */
export const FIELD_LABELS: Record<string, string> = {
  userAgent: 'Navigateur',
  platform: 'Système',
  language: 'Langue',
  screen: 'Écran',
  timezone: 'Fuseau horaire',
  canvasHash: 'Empreinte canvas',
};

const weightOf = (field: string): number => FIELD_WEIGHTS[field as keyof Fingerprint] ?? 1;
const pts = (v: number): string => `${Math.round(v * 10) / 10}`.replace('.', ',');

/**
 * Comparaison côte à côte du profil de A et de l'appareil mesuré : une ligne par critère,
 * colorée (vert identique, rouge différent), avec le poids du critère dans le score.
 */
export function DeviceTable({ lines, expected = null }: DeviceTableProps) {
  const measured = lines.length > 0;
  const rows: DeviceTableLine[] = measured
    ? lines
    : expected
      ? (Object.keys(FIELD_LABELS) as (keyof Fingerprint)[]).map((field) => ({
          field,
          expected: expected[field],
          actual: '',
          match: false,
        }))
      : [];
  const total = rows.reduce((sum, l) => sum + weightOf(l.field), 0) || 1;
  const gained = rows.reduce((sum, l) => (l.match ? sum + weightOf(l.field) : sum), 0);
  const raw = (gained / total) * 100;
  const capped = measured && rows.some((l) => !l.match && IDENTITY_FIELDS.includes(l.field as keyof Fingerprint));

  return (
    <div className="device-compare">
      <table className="values-table">
        <thead>
          <tr>
            <th>Critère</th>
            <th>Profil de A</th>
            <th>Appareil mesuré</th>
            <th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const w = (weightOf(l.field) / total) * 100;
            const state = !measured ? 'pending' : l.match ? 'same' : 'diff';
            return (
              <tr key={l.field} className={`cmp-${state}`}>
                <td>{FIELD_LABELS[l.field] ?? l.field}</td>
                <td title={l.expected}>
                  <span className="cmp-val">{l.expected}</span>
                </td>
                <td title={l.actual}>
                  <span className="cmp-val">{measured ? l.actual : '…'}</span>
                  {measured &&
                    (l.match ? (
                      <span className="ok" aria-label="conforme">
                        ✓
                      </span>
                    ) : (
                      <span className="ko" aria-label="différent">
                        ✗
                      </span>
                    ))}
                </td>
                <td className="num">{state === 'pending' ? '' : l.match ? `+${pts(w)}` : `−${pts(w)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {measured && (
        <p className="cmp-total" data-testid="device-total">
          {capped ? "Score brut" : "Score"} : <strong>{pts(raw)}</strong> / 100
          {capped && (
            <span className="cmp-cap">
              {' '}
              · plafonné à {IDENTITY_MISMATCH_CAP} (navigateur ou canvas différent)
            </span>
          )}
        </p>
      )}
    </div>
  );
}
