import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DeviceRunsCompare, buildRows } from '../../../src/web/components/DeviceRunsCompare';
import type { DeviceRun } from '../../../src/shared/types';

const line = (field: string, expected: string, actual: string) => ({ field, expected, actual, match: expected === actual });
const run = (n: number, score: number, actuals: Record<string, string>, submitted = true): DeviceRun => ({
  n,
  phone: `p${n}`,
  score,
  submitted,
  lines: [
    line('platform', 'iPhone', actuals.platform ?? 'iPhone'),
    line('cores', '6', actuals.cores ?? '6'),
    line('installId', 'id-A', actuals.installId ?? 'id-A'),
  ],
});

describe('DeviceRunsCompare', () => {
  const runs = [run(1, 100, {}), run(2, 38, { cores: '8', installId: 'id-B' })];

  it('buildRows : valeur de A, valeur de chaque appareil, dispersion', () => {
    const rows = buildRows(runs);
    const cores = rows.find((r) => r.field === 'cores')!;
    expect(cores.actual).toEqual(['6', '8']);
    expect(cores.match).toEqual([true, false]);
    expect(cores.spread).toBe(2);
    expect(rows.find((r) => r.field === 'platform')!.spread).toBe(1);
  });

  it('colonnes A + un par appareil, scores en tête, seuls les écarts par défaut', () => {
    render(<DeviceRunsCompare runs={runs} />);
    expect(screen.getByTestId('runs-summary')).toHaveTextContent('2 devices · 2 of 3 criteria differ');
    expect(screen.getByRole('columnheader', { name: /Phone 1/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Phone 2/ })).toBeInTheDocument();
    expect(screen.queryByText('iPhone')).toBeNull(); // critère identique : masqué
    const cell = within(screen.getByText('CPU cores').closest('tr')!).getAllByRole('cell');
    expect(cell[2]).toHaveClass('cell-ok'); // appareil 1 = A
    expect(cell[3]).toHaveClass('cell-ko'); // appareil 2 diffère
  });

  it('« Show all criteria » affiche aussi les critères identiques', async () => {
    render(<DeviceRunsCompare runs={runs} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show all criteria' }));
    expect(screen.getAllByText('iPhone').length).toBeGreaterThan(0);
  });

  it('relevé avant PIN signalé', () => {
    render(<DeviceRunsCompare runs={[run(1, 100, {}, false), run(2, 50, {})]} />);
    expect(screen.getByText(/before PIN/)).toBeInTheDocument();
  });
});
