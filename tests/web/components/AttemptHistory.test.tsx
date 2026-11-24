import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttemptHistory } from '../../../src/web/components/AttemptHistory';

describe('AttemptHistory', () => {
  it('rien sans essai', () => {
    const { container } = render(<AttemptHistory attempts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('liste étape, score et verdict de chaque essai ; les 8 derniers seulement', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      n: i + 1,
      level: 1 as const,
      score: 90 - i,
      secret: i !== 6,
      granted: i % 2 === 0 && i !== 6,
    }));
    render(<AttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    expect(items[0]).toHaveTextContent('#3');
    expect(items[7]).toHaveTextContent('#10');
    expect(items[2]).toHaveClass('ok'); // essai 5
    expect(items[3]).toHaveClass('warn'); // essai 6 : refusé mais secret bon
    expect(items[4]).toHaveClass('ko'); // essai 7 : secret faux
  });
});
