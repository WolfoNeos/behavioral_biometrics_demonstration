import type { KeyEvent } from '../../shared/types';

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Process', 'Unidentified']);

const normalize = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

/** Capture la dynamique de frappe sur un champ ; renvoie la fonction de détachement. */
export function attachKeystrokeCapture(
  input: HTMLInputElement,
  onDone: (events: KeyEvent[]) => void,
): () => void {
  const events: KeyEvent[] = [];
  const pending = new Map<string, { key: string; down: number }>();
  let done = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === 'Enter') {
      if (done) return;
      done = true;
      onDone(events.slice());
      return;
    }
    if (e.key === 'Backspace') {
      events.pop();
      return;
    }
    if (IGNORED_KEYS.has(e.key)) return;
    pending.set(e.code, { key: normalize(e.key), down: performance.now() });
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    const start = pending.get(e.code);
    if (start === undefined) return;
    pending.delete(e.code);
    events.push({ key: start.key, down: start.down, up: performance.now() });
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
