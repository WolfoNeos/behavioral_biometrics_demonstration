import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhoneSession } from '../../src/web/ws';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('usePhoneSession', () => {
  it('send renvoie false hors connexion, true une fois ouvert', () => {
    const { result } = renderHook(() => usePhoneSession('abc'));
    const msg = { type: 'orientationLive' as const, alpha: 0, beta: 10, gamma: 0 };
    expect(result.current.send(msg)).toBe(false);
    act(() => FakeSocket.instances[0].open());
    expect(result.current.connected).toBe(true);
    expect(result.current.send(msg)).toBe(true);
    expect(JSON.parse(FakeSocket.instances[0].sent[0])).toEqual(msg);
  });

  it('fermeture ordinaire : reconnexion', () => {
    renderHook(() => usePhoneSession('abc'));
    act(() => FakeSocket.instances[0].serverClose(1006));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('session inconnue (1008) : plus de reconnexion, lost = true', () => {
    const { result } = renderHook(() => usePhoneSession('abc'));
    act(() => FakeSocket.instances[0].serverClose(1008));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(FakeSocket.instances).toHaveLength(1);
    expect(result.current.lost).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});
