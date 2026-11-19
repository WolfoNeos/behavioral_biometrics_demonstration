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

describe('AngleDial : verdict lisible', () => {
  it('dans la zone de A', () => {
    render(<AngleDial expectedBeta={42} tolerance={5} beta={40} />);
    expect(screen.getByTestId('dial-verdict')).toHaveTextContent('Dans la zone de A (écart 2°)');
  });

  it('hors de la zone de A', () => {
    render(<AngleDial expectedBeta={42} tolerance={5} beta={2} />);
    expect(screen.getByTestId('dial-verdict')).toHaveTextContent('Hors de la zone de A (écart 40°)');
  });

  it('sans mesure : en attente', () => {
    render(<AngleDial expectedBeta={42} tolerance={5} beta={null} />);
    expect(screen.getByTestId('dial-verdict')).toHaveTextContent('En attente');
  });
});
