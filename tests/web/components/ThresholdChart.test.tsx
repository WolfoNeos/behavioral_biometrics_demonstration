import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: unknown; options: unknown }) => (
    <div
      data-testid="chart"
      data-chart={JSON.stringify(props.data)}
      data-options={JSON.stringify(props.options)}
    />
  ),
}));

import { ThresholdChart } from '../../../src/web/components/ThresholdChart';
import { rowsFromPerKey } from '../../../src/web/components/keystrokeRows';

const perKey = rowsFromPerKey([
  { key: 'a', dwell: 100, flight: 0, expectedDwell: 90, expectedFlight: 0, bandDwell: 20, bandFlight: 0 },
  { key: 'b', dwell: 130, flight: 50, expectedDwell: 120, expectedFlight: 60, bandDwell: 10, bandFlight: 15 },
]);

describe('ThresholdChart', () => {
  it("passe étiquettes, séries et bande d'incertitude en ms", () => {
    render(<ThresholdChart rows={perKey} />);
    const data = JSON.parse(screen.getByTestId('chart').getAttribute('data-chart')!);
    // positions numerotees : aucun caractere du mot de passe a l'ecran
    expect(data.labels).toEqual(['1', '2']);
    const by = (l: string) => data.datasets.find((d: { label: string }) => d.label === l).data;
    expect(by('Hold (ms)')).toEqual([100, 130]);
    expect(by('Hold expected (ms)')).toEqual([90, 120]);
    expect(by("Uncertainty band")).toEqual([110, 130]);
    expect(by('Lower bound (ms)')).toEqual([70, 110]);
  });
  it('affiche les valeurs numériques en ms', () => {
    render(<ThresholdChart rows={perKey} />);
    expect(screen.getByText('130 ms')).toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
  });
  it("désactive les animations et ne garde qu'une entrée de légende", () => {
    render(<ThresholdChart rows={perKey} />);
    const opts = JSON.parse(screen.getByTestId('chart').getAttribute('data-options')!);
    expect(opts.animation).toEqual({ duration: 0 });
    expect(opts.plugins.legend.labels.font.size).toBe(13);
  });
  it('filtre la légende (fonction non sérialisable : testée via le module)', async () => {
    const { legendFilter } = await import('../../../src/web/components/ThresholdChart');
    expect(legendFilter({ text: "Uncertainty band" })).toBe(true);
        expect(legendFilter({ text: 'Lower bound (ms)' })).toBe(false);
    expect(legendFilter({ text: 'Hold (ms)' })).toBe(true);
  });
  it('construction point par point : positions non tapees a null, reference complete', () => {
    const rows = [
      { dwell: 100, flight: 0, expectedDwell: 90, expectedFlight: 0, bandDwell: 20, bandFlight: 5, status: 'ok' as const },
      { dwell: null, flight: null, expectedDwell: 120, expectedFlight: 60, bandDwell: 10, bandFlight: 15, status: null },
    ];
    render(<ThresholdChart rows={rows} />);
    const data = JSON.parse(screen.getByTestId('chart').getAttribute('data-chart')!);
    const by = (l: string) => data.datasets.find((d: { label: string }) => d.label === l);
    expect(by('Hold (ms)').data).toEqual([100, null]);
    expect(by('Hold expected (ms)').data).toEqual([90, 120]);
    expect(by('Hold (ms)').pointBackgroundColor).toHaveLength(2);
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
    // courbe du flight : rien à la 1re position (pas de touche avant), puis mesure et attendu
    expect(by('Flight (ms)').data).toEqual([null, null]);
    expect(by('Flight expected (ms)').data).toEqual([null, 60]);
  });
});
