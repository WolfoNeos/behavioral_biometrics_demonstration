import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Barcode } from '../../../src/web/components/Barcode';
import type { KeyRow } from '../../../src/web/components/keystrokeRows';

const row = (over: Partial<KeyRow>): KeyRow => ({
  dwell: null,
  flight: null,
  expectedDwell: 100,
  expectedFlight: 80,
  bandDwell: 10,
  bandFlight: 10,
  status: null,
  ...over,
});

const liveRects = () =>
  screen.getByLabelText('signature en direct').querySelectorAll('rect:not(.barcode-ghost)');

describe('Barcode', () => {
  it('une barre par position tapee, colorée par statut, sur la reference en filigrane', () => {
    render(
      <Barcode
        rows={[
          row({ dwell: 100, flight: 0, status: 'ok' }),
          row({ dwell: 140, flight: 90, status: 'bad' }),
          row({}),
        ]}
      />,
    );
    expect(liveRects()).toHaveLength(2);
    expect([...liveRects()].map((r) => r.getAttribute('data-status'))).toEqual(['ok', 'bad']);
    expect(liveRects()[1]).toHaveClass('bar-bad');
    const live = screen.getByLabelText('signature en direct');
    expect(live.querySelectorAll('rect.barcode-ghost')).toHaveLength(3);
    expect(screen.getByLabelText('signature de référence').querySelectorAll('rect')).toHaveLength(3);
  });

  it('largeur = maintien, espace avant la barre = vol', () => {
    render(<Barcode rows={[row({ dwell: 100, flight: 0, status: 'ok' }), row({ dwell: 50, flight: 30, status: 'ok' })]} />);
    const [a, b] = [...liveRects()];
    expect(a.getAttribute('width')).toBe('100');
    expect(b.getAttribute('x')).toBe('130');
    expect(b.getAttribute('width')).toBe('50');
  });

  it('supporte un direct vide', () => {
    render(<Barcode rows={[row({})]} />);
    expect(liveRects()).toHaveLength(0);
  });

  it('utilise une échelle horizontale commune', () => {
    render(<Barcode rows={[row({ dwell: 400, flight: 0, status: 'bad' }), row({})]} />);
    const vb = (l: string) => screen.getByLabelText(l).getAttribute('viewBox');
    expect(vb('signature en direct')).toBe(vb('signature de référence'));
  });

  it('showLive false : seulement la reference', () => {
    render(<Barcode rows={[row({})]} showLive={false} />);
    expect(screen.queryByLabelText('signature en direct')).toBeNull();
    expect(screen.getByLabelText('signature de référence').querySelectorAll('rect')).toHaveLength(1);
  });
});
