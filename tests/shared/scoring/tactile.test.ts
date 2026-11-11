import { describe, it, expect } from 'vitest';
import { summarizeTouch } from '../../../src/shared/scoring/tactile';

describe('summarizeTouch', () => {
  it('returns zeros for no taps', () => {
    expect(summarizeTouch([])).toEqual({ meanDwell: 0, meanInterval: 0 });
  });

  it('single tap has dwell and zero interval', () => {
    expect(summarizeTouch([{ down: 100, up: 160 }])).toEqual({ meanDwell: 60, meanInterval: 0 });
  });

  it('averages dwell and down-to-down intervals', () => {
    const r = summarizeTouch([
      { down: 0, up: 50 },
      { down: 200, up: 270 },
      { down: 500, up: 560 },
    ]);
    expect(r.meanDwell).toBeCloseTo(60);
    expect(r.meanInterval).toBeCloseTo(250);
  });
});
