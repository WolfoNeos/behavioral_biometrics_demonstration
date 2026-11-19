import type { PerKeyScore } from '../../shared/scoring/keystroke';
import { extractTimings, zScore } from '../../shared/scoring/keystroke';
import type { BarStatus, LiveBar } from '../../shared/scoring/keystrokeLive';
import { scoreKeystrokeLive, statusOf } from '../../shared/scoring/keystrokeLive';
import type { ExpectedBar, KeyEvent } from '../../shared/types';

/**
 * Une ligne par position du mot de passe (aucun caractere) : mesure tapee (null si pas encore
 * tapee) face a la reference de A (null si inconnue ou touche en trop).
 */
export interface KeyRow {
  dwell: number | null;
  flight: number | null;
  expectedDwell: number | null;
  expectedFlight: number | null;
  bandDwell: number | null;
  bandFlight: number | null;
  status: BarStatus | null;
}

/** Reference par position + barres tapees ; longueur = la plus longue des deux. */
export function rowsFromLive(expected: ExpectedBar[] | null, bars: LiveBar[]): KeyRow[] {
  const n = Math.max(expected?.length ?? 0, bars.length);
  return Array.from({ length: n }, (_, i) => {
    const e = expected?.[i];
    const ref = e && e.known ? e : null;
    const b = bars[i];
    return {
      dwell: b ? b.dwell : null,
      flight: b ? b.flight : null,
      expectedDwell: ref ? ref.dwell : null,
      expectedFlight: ref ? ref.flight : null,
      bandDwell: ref ? ref.stdDwell : null,
      bandFlight: ref ? ref.stdFlight : null,
      status: b ? b.status : null,
    };
  });
}

/** Mesure officielle du serveur (apres Entree ou mode God), coloree selon la meme zone. */
export function rowsFromPerKey(perKey: PerKeyScore[]): KeyRow[] {
  return perKey.map((p, i) => {
    const zDwell = zScore(p.dwell, p.expectedDwell, p.bandDwell);
    const zFlight = i === 0 ? 0 : zScore(p.flight, p.expectedFlight, p.bandFlight);
    return {
      dwell: p.dwell,
      flight: p.flight,
      expectedDwell: p.expectedDwell,
      expectedFlight: i === 0 ? 0 : p.expectedFlight,
      bandDwell: p.bandDwell,
      bandFlight: p.bandFlight,
      status: statusOf(Math.max(zDwell, zFlight)),
    };
  });
}

/** Vue provisoire pendant la frappe ; sans reference, barres grises et pas de score. */
export function liveView(
  expected: ExpectedBar[] | null,
  events: KeyEvent[],
): { score: number | null; rows: KeyRow[] } {
  if (!expected) {
    const bars = extractTimings(events).map(
      (t): LiveBar => ({ dwell: t.dwell, flight: t.flight, zDwell: 0, zFlight: 0, status: 'unknown' }),
    );
    return { score: null, rows: rowsFromLive(null, bars) };
  }
  const r = scoreKeystrokeLive(expected, events);
  return { score: events.length ? r.score : null, rows: rowsFromLive(expected, r.bars) };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Resume numerique : ecart moyen de maintien, vol moyen (et celui de A), touches tapees. */
export function summarize(rows: KeyRow[]) {
  const typed = rows.filter((r) => r.dwell !== null);
  const both = typed.filter((r) => r.expectedDwell !== null);
  const flights = rows.slice(1);
  return {
    typed: typed.length,
    expected: rows.filter((r) => r.expectedDwell !== null).length,
    dwellGap: mean(both.map((r) => Math.abs(r.dwell! - r.expectedDwell!))),
    flight: mean(flights.filter((r) => r.flight !== null).map((r) => r.flight!)),
    expectedFlight: mean(flights.filter((r) => r.expectedFlight !== null).map((r) => r.expectedFlight!)),
  };
}
