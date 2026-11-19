import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Barcode, barcodeLayout } from '../../../src/web/components/Barcode';
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
  screen.getByLabelText('signature en direct').querySelectorAll('rect:not(.barcode-ghost):not(.barcode-pause)');

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

  it('largeur = maintien ; la barre en direct est posee sur le x de la reference du meme indice', () => {
    render(<Barcode rows={[row({ dwell: 100, flight: 0, status: 'ok' }), row({ dwell: 50, flight: 30, status: 'ok' })]} />);
    const [a, b] = [...liveRects()];
    expect(a.getAttribute('width')).toBe('100');
    // reference : 100 de maintien puis 80 de vol attendu
    expect(b.getAttribute('x')).toBe('180');
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

  describe('plafonnement des ecarts', () => {
    const ref = (over: Partial<KeyRow> = {}) =>
      row({ dwell: 100, flight: 80, expectedDwell: 100, expectedFlight: 80, bandDwell: 10, bandFlight: 20, status: 'ok', ...over });
    const reference = [ref({ flight: 0, expectedFlight: 0 }), ref(), ref(), ref()];

    it('une pause de 3 s ne deforme pas l echelle et reste visible comme repere', () => {
      const normal = barcodeLayout(reference);
      const paused = barcodeLayout([reference[0], reference[1], ref({ flight: 3000 }), reference[3]]);
      // l'echelle ne bouge pas (la reference ne depend pas du direct, la pause est plafonnee)
      expect(paused.scale).toBe(normal.scale);
      expect(paused.scale).toBeLessThan(700);
      // chaque barre garde une largeur lisible : > 10 % de l'echelle
      paused.live.forEach((b) => expect(b.w / paused.scale).toBeGreaterThan(0.1));
      expect(paused.live.map((b) => b.paused)).toEqual([false, false, true, false]);
    });

    it('barres en direct dans le plafond : memes x que la reference', () => {
      const l = barcodeLayout([reference[0], ref({ flight: 100 }), ref({ flight: 60 }), ref({ flight: 140 })]);
      l.live.forEach((b, i) => {
        expect(b.x).toBe(l.reference[i].x);
        expect(b.paused).toBe(false);
      });
    });

    it('vol negatif : ecart minimal visible, pas de x decroissant', () => {
      const l = barcodeLayout([ref({ flight: 0, expectedFlight: 0 }), ref({ flight: -40, expectedFlight: -20 }), ref()]);
      for (let i = 1; i < l.reference.length; i++) {
        expect(l.reference[i].x).toBeGreaterThan(l.reference[i - 1].x + l.reference[i - 1].w - 0.001);
        expect(l.live[i].x).toBeGreaterThan(l.live[i - 1].x + l.live[i - 1].w - 0.001);
      }
      expect(l.live.every((b) => !b.paused)).toBe(true);
    });

    it('sans reference : plafond fixe de 400 ms', () => {
      const none = (flight: number) =>
        row({ dwell: 100, flight, expectedDwell: null, expectedFlight: null, bandDwell: null, bandFlight: null, status: 'unknown' });
      const l = barcodeLayout([none(0), none(3000), none(100)]);
      expect(l.reference).toHaveLength(0);
      expect(l.scale).toBeLessThan(1000);
      expect(l.live[1].x).toBe(500);
      expect(l.live[1].paused).toBe(true);
    });

    it('le repere pause est dessine dans la bande en direct', () => {
      render(<Barcode rows={[reference[0], ref({ flight: 3000 })]} />);
      expect(screen.getAllByTestId('barcode-pause')).toHaveLength(1);
      expect(liveRects()).toHaveLength(2);
    });
  });
});
