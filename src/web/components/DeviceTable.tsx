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

/** User-agent lisible : « Chrome 157 · iOS 27.2 » ; valeur brute si non reconnue. */
export function friendlyUserAgent(ua: string): string {
  const browser =
    /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua)?.[1] !== undefined
      ? `Edge ${/Edg(?:e|A|iOS)?\/(\d+)/.exec(ua)![1]}`
      : /(?:CriOS|Chrome)\/(\d+)/.exec(ua)
        ? `Chrome ${/(?:CriOS|Chrome)\/(\d+)/.exec(ua)![1]}`
        : /(?:FxiOS|Firefox)\/(\d+)/.exec(ua)
          ? `Firefox ${/(?:FxiOS|Firefox)\/(\d+)/.exec(ua)![1]}`
          : /Version\/(\d+)[\d.]*.*Safari/.exec(ua)
            ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
            : null;
  const ios = /(?:iPhone|CPU) OS (\d+)[_.](\d+)/.exec(ua);
  const android = /Android (\d+)/.exec(ua);
  const win = /Windows NT (\d+)/.exec(ua);
  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua);
  const os = ios
    ? `iOS ${ios[1]}.${ios[2]}`
    : android
      ? `Android ${android[1]}`
      : win
        ? `Windows ${win[1] === '10' ? '10/11' : win[1]}`
        : mac
          ? `macOS ${mac[1]}.${mac[2]}`
          : null;
  if (!browser || !os) return ua.length > 48 ? `${ua.slice(0, 48)}…` : ua;
  return `${browser} · ${os}`;
}

/** Valeur affichée : lisible et courte (le détail brut n'aide pas le public). */
function display(field: string, value: string): string {
  if (field === 'userAgent') return friendlyUserAgent(value);
  if (field === 'canvasHash') return value.length > 9 ? `${value.slice(0, 8)}…` : value;
  return value;
}

/**
 * Comparaison côte à côte du profil de A et de l'appareil mesuré : une ligne par critère,
 * colorée (vert identique, rouge différent), avec les points gagnés ou perdus dans le score.
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
            <th>Résultat</th>
            <th className="num">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const w = (weightOf(l.field) / total) * 100;
            const state = !measured ? 'pending' : l.match ? 'same' : 'diff';
            const mono = l.field === 'canvasHash' ? 'cmp-mono' : undefined;
            return (
              <tr key={l.field} className={`cmp-${state}`}>
                <td>{FIELD_LABELS[l.field] ?? l.field}</td>
                <td title={l.expected} className={mono}>
                  {display(l.field, l.expected)}
                </td>
                <td title={l.actual} className={mono}>
                  {measured ? display(l.field, l.actual) : '…'}
                </td>
                <td className="cmp-status">
                  {measured &&
                    (l.match ? (
                      <>
                        <span className="ok" aria-label="conforme">
                          ✓
                        </span>
                        Identique
                      </>
                    ) : (
                      <>
                        <span className="ko" aria-label="différent">
                          ✗
                        </span>
                        Différent
                      </>
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
          {capped ? 'Score brut' : 'Score'} : <strong>{pts(raw)}</strong> / 100
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
