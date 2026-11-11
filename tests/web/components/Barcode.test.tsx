import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Barcode } from '../../../src/web/components/Barcode';

describe('Barcode', () => {
  it('une barre par touche pour le direct et pour la référence', () => {
    render(<Barcode live={[100, 120, 90]} expected={[110, 115, 95]} />);
    expect(screen.getByLabelText('signature en direct').querySelectorAll('rect')).toHaveLength(3);
    expect(screen.getByLabelText('signature de référence').querySelectorAll('rect')).toHaveLength(3);
  });
  it('supporte un direct vide', () => {
    render(<Barcode live={[]} expected={[110]} />);
    expect(screen.getByLabelText('signature en direct').querySelectorAll('rect')).toHaveLength(0);
  });
});
