import { describe, it, expect } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../../src/shared/types';
import {
  colorFor,
  startState,
  applyVerdict,
  hardFail,
  jumpTo,
  reset,
} from '../../../src/shared/auth/machine';

const T = DEFAULT_THRESHOLDS;

describe('colorFor', () => {
  it('maps score to color', () => {
    const t = { accept: 80, warn: 50 };
    expect(colorFor(85, t)).toBe('green');
    expect(colorFor(60, t)).toBe('orange');
    expect(colorFor(30, t)).toBe('red');
  });
});

describe('machine', () => {
  it('starts pending at level 1', () => {
    expect(startState()).toEqual({ status: 'pending', level: 1 });
  });

  it('grants at level 1 on high score', () => {
    const r = applyVerdict(startState(), 1, 85, T);
    expect(r.state).toMatchObject({ status: 'granted', level: 1 });
    expect(r.verdict).toEqual({ level: 1, score: 85, color: 'green', granted: true });
  });

  it('escalates to level 2 on low score', () => {
    const r = applyVerdict(startState(), 1, 30, T);
    expect(r.state).toEqual({ status: 'pending', level: 2 });
    expect(r.verdict).toMatchObject({ color: 'red', granted: false });
  });

  it('grants at level 2 on high score', () => {
    const r = applyVerdict(jumpTo(2), 2, 85, T);
    expect(r.state).toMatchObject({ status: 'granted', level: 2 });
  });

  it('blocks at level 3 on low score', () => {
    const r = applyVerdict(jumpTo(3), 3, 30, T);
    expect(r.state.status).toBe('blocked');
    expect(r.verdict.granted).toBe(false);
  });

  it('uses per-level thresholds', () => {
    const t = {
      ...T,
      keystroke: { accept: 90, warn: 50 },
      device: { accept: 60, warn: 40 },
      orientation: { ...T.orientation, accept: 70, warn: 30 },
    };
    expect(applyVerdict(jumpTo(1), 1, 85, t).state.status).toBe('pending');
    expect(applyVerdict(jumpTo(2), 2, 65, t).state.status).toBe('granted');
    expect(applyVerdict(jumpTo(3), 3, 65, t).state.status).toBe('blocked');
    expect(applyVerdict(jumpTo(3), 3, 40, t).verdict.color).toBe('orange');
  });

  it('hardFail escalates or blocks', () => {
    expect(hardFail(jumpTo(2), 2)).toEqual({ status: 'pending', level: 3 });
    const b = hardFail(jumpTo(3), 3);
    expect(b).toEqual({
      status: 'blocked',
      verdict: { level: 3, score: 0, color: 'red', granted: false },
    });
  });

  it('jumpTo and reset', () => {
    expect(jumpTo(3)).toEqual({ status: 'pending', level: 3 });
    expect(reset()).toEqual(startState());
  });

  it('final states do not change', () => {
    const granted = applyVerdict(startState(), 1, 85, T).state;
    expect(applyVerdict(granted, 1, 0, T).state).toBe(granted);
    expect(hardFail(granted, 1)).toBe(granted);
    const blocked = hardFail(jumpTo(3), 3);
    expect(applyVerdict(blocked, 3, 99, T).state).toBe(blocked);
  });
});
