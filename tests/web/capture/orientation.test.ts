import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestOrientation, collectOrientation } from '../../../src/web/capture/orientation';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requestOrientation', () => {
  it("returns 'unavailable' when DeviceOrientationEvent is absent", async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    expect(await requestOrientation()).toBe('unavailable');
  });

  it("returns 'granted' without requestPermission", async () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    expect(await requestOrientation()).toBe('granted');
  });

  it('maps requestPermission results and errors', async () => {
    const make = (impl: () => Promise<string>) => {
      const C = class {} as unknown as { requestPermission: () => Promise<string> };
      C.requestPermission = impl;
      return C;
    };
    vi.stubGlobal('DeviceOrientationEvent', make(async () => 'granted'));
    expect(await requestOrientation()).toBe('granted');
    vi.stubGlobal('DeviceOrientationEvent', make(async () => 'denied'));
    expect(await requestOrientation()).toBe('denied');
    vi.stubGlobal('DeviceOrientationEvent', make(async () => { throw new Error('x'); }));
    expect(await requestOrientation()).toBe('denied');
  });
});

describe('collectOrientation', () => {
  function fire(alpha: number | null, beta: number | null, gamma: number | null) {
    const ev = new Event('deviceorientation') as Event & Record<string, unknown>;
    Object.assign(ev, { alpha, beta, gamma });
    window.dispatchEvent(ev);
  }

  it('collects readings, normalizes null alpha/gamma, skips null beta', async () => {
    vi.useFakeTimers();
    const p = collectOrientation(1000);
    fire(1, 2, 3);
    fire(null, 5, null);
    fire(1, null, 1);
    vi.advanceTimersByTime(1000);
    expect(await p).toEqual([
      { alpha: 1, beta: 2, gamma: 3 },
      { alpha: 0, beta: 5, gamma: 0 },
    ]);
  });

  it('resolves [] when no event arrives and stops listening', async () => {
    vi.useFakeTimers();
    const p = collectOrientation(500);
    vi.advanceTimersByTime(500);
    expect(await p).toEqual([]);
    fire(1, 1, 1);
  });
});
