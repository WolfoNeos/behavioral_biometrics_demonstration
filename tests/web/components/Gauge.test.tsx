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
  it('sans mesure : neutre, « — », pas de rouge', () => {
    render(<Gauge score={null} accept={80} warn={50} />);
    const g = screen.getByRole('meter');
    expect(g).toHaveAttribute('data-color', 'neutral');
    expect(g).not.toHaveClass('red');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });
  it('couleur coherente avec la valeur arrondie affichee', () => {
    const { container } = render(<Gauge score={79.7} accept={80} warn={50} />);
    expect(container.querySelector('.gauge-score')).toHaveTextContent('80');
    expect(screen.getByRole('meter')).toHaveAttribute('data-color', 'green');
  });
  it('affiche les marqueurs de seuils', () => {
    render(<Gauge score={30} accept={80} warn={50} />);
    expect(screen.getByLabelText('seuil acceptation 80')).toBeInTheDocument();
    expect(screen.getByLabelText('seuil alerte 50')).toBeInTheDocument();
  });
});
