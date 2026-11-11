import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AngleDial } from '../../../src/web/components/AngleDial';

describe('AngleDial', () => {
  it('beta null affiche — sans aiguille', () => {
    render(<AngleDial expectedBeta={45} tolerance={5} beta={null} />);
    expect(screen.getByLabelText('angle mesuré')).toHaveTextContent('—');
    expect(screen.queryByTestId('needle')).toBeNull();
    expect(screen.getByTestId('tolerance-arc')).toBeInTheDocument();
  });
  it("affiche l'angle en degrés avec aiguille", () => {
    render(<AngleDial expectedBeta={45} tolerance={5} beta={47.4} />);
    expect(screen.getByLabelText('angle mesuré')).toHaveTextContent('47°');
    expect(screen.getByTestId('needle')).toBeInTheDocument();
    expect(screen.getByLabelText('angle attendu')).toHaveTextContent('45°');
  });
});
