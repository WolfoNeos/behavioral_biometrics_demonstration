import { CRITERIA, CRITERIA_BY_KEY } from '../../shared/criteria';
import { IDENTITY_MISMATCH_CAP } from '../../shared/scoring/device';
import type { Fingerprint } from '../../shared/types';

export interface DeviceTableLine {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  /** Compté dans le score (défaut : oui). */
  enabled?: boolean;
  weight?: number;
  identity?: boolean;
}

export interface DeviceTableProps {
  lines: DeviceTableLine[];
  /** A’s profile : affiché en attente de mesure, quand `lines` est vide. */
  expected?: Fingerprint | null;
}

/** Libelles francais des champs d'empreinte (tableau et panneau « A’s profile »). */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(CRITERIA.map((d) => [d.key, d.label]));

const weightOf = (l: DeviceTableLine): number => l.weight ?? CRITERIA_BY_KEY[l.field]?.weight ?? 1;
const isOn = (l: DeviceTableLine): boolean => l.enabled !== false;
const pts = (v: number): string => `${Math.round(v * 10) / 10}`;

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

const clip = (v: string, n = 30): string => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

/** Valeur affichée : lisible et courte (le détail brut n'aide pas le public). */
export function display(field: string, value: string): string {
  if (field === 'userAgent') return friendlyUserAgent(value);
  if (field === 'canvasHash') return value.length > 9 ? `${value.slice(0, 8)}…` : value;
  if (field === 'webgl') return clip(value.split('|')[1] ?? value);
  if (['installId', 'cookieId', 'idbId'].includes(field)) return value.length > 12 ? `${value.slice(0, 8)}…` : value;
  if (field === 'voices') {
    const [count, hash] = value.split(':');
    return hash ? `${count} voices · ${hash.slice(0, 6)}` : value;
  }
  if (field === 'fonts') {
    const [count, hash] = value.split(':');
    return hash ? `${count} fonts · ${hash.slice(0, 6)}` : value;
  }
  return clip(value);
}

/**
 * Comparaison du profil de A et de l'appareil mesuré : une ligne par critère, les écarts en tête
 * (en rouge), puis les critères identiques (en vert), avec les points gagnés ou perdus.
 */
export function DeviceTable({ lines, expected = null }: DeviceTableProps) {
  const measured = lines.length > 0;
  const active = lines.filter(isOn);
  const total = active.reduce((sum, l) => sum + weightOf(l), 0) || 1;
  const gained = active.reduce((sum, l) => (l.match ? sum + weightOf(l) : sum), 0);
  const raw = (gained / total) * 100;
  const capped = measured && active.some((l) => !l.match && (l.identity ?? CRITERIA_BY_KEY[l.field]?.identity));
  const differing = active.filter((l) => !l.match).length;
  const ignored = lines.filter((l) => !isOn(l));
  // écarts d'abord (ce qui trahit l'appareil), puis les identiques, puis les critères ignorés
  const rows = measured ? [...active.filter((l) => !l.match), ...active.filter((l) => l.match), ...ignored] : [];
  const pendingFields = !measured && expected ? CRITERIA.map((d) => d.key).filter((f) => typeof expected[f] === 'string') : [];

  if (!measured) {
    return (
      <div className="device-compare">
        <p className="cmp-summary pending" data-testid="device-summary">
          {pendingFields.length > 0 ? `Waiting for the phone… ${pendingFields.length} criteria will be compared` : 'Waiting for the phone…'}
        </p>
        <ul className="cmp-chips">
          {pendingFields.map((f) => (
            <li key={f} className="chip-cmp pending">
              {FIELD_LABELS[f]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="device-compare">
      <div className="cmp-bar">
        <p className={differing === 0 ? 'cmp-summary ok' : 'cmp-summary ko'} data-testid="device-summary">
          {differing === 0 ? `All ${active.length} criteria identical` : `${active.length - differing} of ${active.length} criteria identical · ${differing} differ`}
          {ignored.length > 0 && <span className="cmp-ignored-count"> · {ignored.length} ignored</span>}
        </p>
        <p className="cmp-total" data-testid="device-total">
          {capped ? 'Raw score' : 'Score'}: <strong>{pts(raw)}</strong> / 100
          {capped && <span className="cmp-cap"> · capped at {IDENTITY_MISMATCH_CAP} (browser, canvas or stored ID differs)</span>}
        </p>
      </div>
      <div className="cmp-scroll">
        <table className="values-table">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>A’s profile</th>
              <th>Measured device</th>
              <th>Result</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const on = isOn(l);
              const w = (weightOf(l) / total) * 100;
              const mono = ['canvasHash', 'installId', 'cookieId', 'idbId'].includes(l.field) ? 'cmp-mono' : undefined;
              return (
                <tr key={l.field} className={!on ? 'cmp-off' : l.match ? 'cmp-same' : 'cmp-diff'}>
                  <td>{FIELD_LABELS[l.field] ?? l.field}</td>
                  <td title={l.expected} className={mono}>
                    {display(l.field, l.expected)}
                  </td>
                  <td title={l.actual} className={mono}>
                    {display(l.field, l.actual)}
                  </td>
                  <td className="cmp-status">
                    {!on ? (
                      <>
                        <span aria-label={l.match ? 'match' : 'different'}>{l.match ? '✓' : '✗'}</span> Ignored
                      </>
                    ) : l.match ? (
                      <>
                        <span className="ok" aria-label="match">
                          ✓
                        </span>
                        Identical
                      </>
                    ) : (
                      <>
                        <span className="ko" aria-label="different">
                          ✗
                        </span>
                        Different
                      </>
                    )}
                  </td>
                  <td className="num">{!on ? '–' : l.match ? `+${pts(w)}` : `−${pts(w)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
