import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Gauge } from '../../../src/web/components/Gauge';

describe('Gauge', () => {
  it('affiche 85 en vert', () => {
    render(<Gauge score={85} accept={80} warn={50} />);
    const g = screen.getByRole('meter');
    expect(g).toHaveClass('green');
    expect(g).toHaveAttribute('data-color', 'green');
    expect(screen.getByText('85')).toBeInTheDocument();
  });
  it('orange entre warn et accept', () => {
    render(<Gauge score={60} accept={80} warn={50} />);
    expect(screen.getByRole('meter')).toHaveClass('orange');
  });
  it('rouge à 30', () => {
    render(<Gauge score={30} accept={80} warn={50} />);
    expect(screen.getByRole('meter')).toHaveClass('red');
  });
  it('affiche les marqueurs de seuils', () => {
    render(<Gauge score={30} accept={80} warn={50} />);
    expect(screen.getByLabelText('seuil acceptation 80')).toBeInTheDocument();
    expect(screen.getByLabelText('seuil alerte 50')).toBeInTheDocument();
  });
});
