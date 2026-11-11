import type { KeyEvent } from '../../shared/types';

/** Capture la dynamique de frappe sur un champ ; renvoie la fonction de détachement. */
export function attachKeystrokeCapture(
  input: HTMLInputElement,
  onDone: (events: KeyEvent[]) => void,
): () => void {
  const events: KeyEvent[] = [];
  const pending = new Map<string, number>();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === 'Enter') {
      onDone(events.slice());
      return;
    }
    if (e.key === 'Backspace') {
      events.pop();
      pending.clear();
      return;
    }
    pending.set(e.key, performance.now());
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === 'Backspace') return;
    const down = pending.get(e.key);
    if (down === undefined) return;
    pending.delete(e.key);
    events.push({ key: e.key, down, up: performance.now() });
  };

  const onPaste = (e: Event): void => e.preventDefault();

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('keyup', onKeyUp);
  input.addEventListener('paste', onPaste);

  return () => {
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('keyup', onKeyUp);
    input.removeEventListener('paste', onPaste);
  };
}
