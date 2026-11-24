import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttemptHistory } from '../../../src/web/components/AttemptHistory';
import { ControlBar } from '../../../src/web/components/ControlBar';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

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
      secret: i !== 2,
      granted: i % 2 === 0 && i !== 2,
    }));
    render(<AttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    expect(items[0]).toHaveTextContent('#3');
    expect(items[7]).toHaveTextContent('#10');
    expect(items[0]).toHaveClass('ko'); // essai 3 : secret faux
    expect(items[1]).toHaveClass('warn'); // refusé mais secret bon
    expect(items[2]).toHaveClass('ok'); // essai 5
  });
});

describe('ControlBar : simuler une saisie', () => {
  it('Play A / Play B appellent onSimulate', async () => {
    const onSimulate = vi.fn();
    render(
      <MemoryRouter>
        <ControlBar onJump={() => undefined} onReset={() => undefined} onSimulate={onSimulate} level={1} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Play A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play B' }));
    expect(onSimulate.mock.calls).toEqual([['A'], ['B']]);
  });
});
