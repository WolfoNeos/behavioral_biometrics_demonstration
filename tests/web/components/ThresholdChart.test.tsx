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

const perKey = [
  { key: 'a', dwell: 100, flight: 0, expectedDwell: 90, expectedFlight: 0, bandDwell: 20, bandFlight: 0 },
  { key: 'b', dwell: 130, flight: 50, expectedDwell: 120, expectedFlight: 60, bandDwell: 10, bandFlight: 15 },
];

describe('ThresholdChart', () => {
  it("passe étiquettes, séries et bande d'incertitude en ms", () => {
    render(<ThresholdChart perKey={perKey} />);
    const data = JSON.parse(screen.getByTestId('chart').getAttribute('data-chart')!);
    expect(data.labels).toEqual(['a', 'b']);
    const by = (l: string) => data.datasets.find((d: { label: string }) => d.label === l).data;
    expect(by('Direct (ms)')).toEqual([100, 130]);
    expect(by('Attendu (ms)')).toEqual([90, 120]);
    expect(by("Zone d'incertitude")).toEqual([110, 130]);
    expect(by('Borne basse (ms)')).toEqual([70, 110]);
  });
  it('affiche les valeurs numériques en ms', () => {
    render(<ThresholdChart perKey={perKey} />);
    expect(screen.getByText('130 ms')).toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
  });
  it("désactive les animations et ne garde qu'une entrée de légende", () => {
    render(<ThresholdChart perKey={perKey} />);
    const opts = JSON.parse(screen.getByTestId('chart').getAttribute('data-options')!);
    expect(opts.animation).toEqual({ duration: 0 });
    expect(opts.plugins.legend.labels.font.size).toBe(18);
  });
  it('filtre la légende (fonction non sérialisable : testée via le module)', async () => {
    const { legendFilter } = await import('../../../src/web/components/ThresholdChart');
    expect(legendFilter({ text: "Zone d'incertitude" })).toBe(true);
        expect(legendFilter({ text: 'Borne basse (ms)' })).toBe(false);
    expect(legendFilter({ text: 'Direct (ms)' })).toBe(true);
  });
});
