import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachKeystrokeCapture } from '../../../src/web/capture/keystroke';
import type { KeyEvent } from '../../../src/shared/types';

function key(input: HTMLInputElement, type: 'keydown' | 'keyup', k: string, repeat = false, code?: string) {
  const c = code ?? (k.length === 1 ? `Key${k.toUpperCase()}` : k);
  input.dispatchEvent(new KeyboardEvent(type, { key: k, code: c, repeat, cancelable: true, bubbles: true }));
}

describe('attachKeystrokeCapture', () => {
  let input: HTMLInputElement;
  let now: number;
  beforeEach(() => {
    input = document.createElement('input');
    document.body.appendChild(input);
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    input.remove();
  });

  function type(k: string, downAt: number, upAt: number) {
    now = downAt;
    key(input, 'keydown', k);
    now = upAt;
    key(input, 'keyup', k);
  }

  it('produces ordered KeyEvents with up > down on Enter', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    type('a', 10, 60);
    type('b', 100, 170);
    expect(onDone).not.toHaveBeenCalled();
    now = 200;
    key(input, 'keydown', 'Enter');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toEqual([
      { key: 'a', down: 10, up: 60 },
      { key: 'b', down: 100, up: 170 },
    ]);
  });

  it('ignores auto-repeat', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    now = 10;
    key(input, 'keydown', 'a');
    now = 30;
    key(input, 'keydown', 'a', true);
    now = 60;
    key(input, 'keyup', 'a');
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0]).toEqual([{ key: 'a', down: 10, up: 60 }]);
  });

  it('Backspace removes the last key and is not recorded', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    type('a', 10, 50);
    type('b', 60, 90);
    type('Backspace', 100, 120);
    type('c', 130, 160);
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0].map((e) => e.key)).toEqual(['a', 'c']);
  });

  it('cancels paste', () => {
    attachKeystrokeCapture(input, () => {});
    const ev = new Event('paste', { cancelable: true, bubbles: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('detach removes all listeners', () => {
    const onDone = vi.fn();
    const detach = attachKeystrokeCapture(input, onDone);
    detach();
    type('a', 1, 2);
    key(input, 'keydown', 'Enter');
    const ev = new Event('paste', { cancelable: true });
    input.dispatchEvent(ev);
    expect(onDone).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("matches by physical key: 'A' down then 'a' up gives one 'a' event", () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    now = 10;
    key(input, 'keydown', 'A');
    now = 70;
    key(input, 'keyup', 'a');
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0]).toEqual([{ key: 'a', down: 10, up: 70 }]);
  });

  it('never records modifiers', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    now = 0;
    key(input, 'keydown', 'Shift');
    now = 10;
    key(input, 'keydown', 'A');
    now = 20;
    key(input, 'keyup', 'Shift');
    now = 50;
    key(input, 'keyup', 'A');
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0]).toEqual([{ key: 'a', down: 10, up: 50 }]);
  });

  it('Backspace after a capital removes the character, not a modifier', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    type('b', 1, 5);
    key(input, 'keydown', 'Shift');
    type('A', 10, 40);
    key(input, 'keyup', 'Shift');
    type('Backspace', 50, 60);
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0].map((e) => e.key)).toEqual(['b']);
  });

  it('Backspace does not drop other held keys', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    type('a', 1, 5);
    now = 10;
    key(input, 'keydown', 'b');
    type('Backspace', 12, 14);
    now = 30;
    key(input, 'keyup', 'b');
    key(input, 'keydown', 'Enter');
    expect(onDone.mock.calls[0][0]).toEqual([{ key: 'b', down: 10, up: 30 }]);
  });

  it('is reusable: each entry reports only its own events', () => {
    const onDone = vi.fn<(e: KeyEvent[]) => void>();
    attachKeystrokeCapture(input, onDone);
    type('a', 1, 5);
    type('b', 10, 15);
    key(input, 'keydown', 'Enter');
    type('c', 30, 35);
    key(input, 'keydown', 'Enter');
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(onDone.mock.calls[0][0].map((e) => e.key)).toEqual(['a', 'b']);
    expect(onDone.mock.calls[1][0].map((e) => e.key)).toEqual(['c']);
  });

  it('a held Enter (repeat) does not fire twice', () => {
    const onDone = vi.fn();
    attachKeystrokeCapture(input, onDone);
    type('a', 1, 5);
    key(input, 'keydown', 'Enter');
    type('b', 10, 15);
    key(input, 'keydown', 'Enter', true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Enter on an empty buffer does not call onDone', () => {
    const onDone = vi.fn();
    attachKeystrokeCapture(input, onDone);
    key(input, 'keydown', 'Enter');
    type('a', 1, 5);
    key(input, 'keydown', 'Enter');
    key(input, 'keydown', 'Enter');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
