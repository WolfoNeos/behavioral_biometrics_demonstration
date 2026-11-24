import { normalizeKey as normalize } from '../../shared/scoring/keystroke';
import type { KeyEvent } from '../../shared/types';

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Process', 'Unidentified']);

/**
 * Capture la dynamique de frappe sur un champ ; renvoie la fonction de détachement.
 * onProgress (optionnel) reçoit une copie de la liste après chaque touche relâchée, après
 * Backspace, et [] quand Entrée termine la saisie.
 */
export function attachKeystrokeCapture(
  input: HTMLInputElement,
  onDone: (events: KeyEvent[]) => void,
  onProgress?: (events: KeyEvent[]) => void,
): () => void {
  const events: KeyEvent[] = [];
  const pending = new Map<string, { key: string; down: number }>();
  const progress = (): void => onProgress?.(events.slice());

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.key === 'Enter') {
      if (events.length === 0) return;
      const captured = events.slice();
      events.length = 0;
      pending.clear();
      progress();
      onDone(captured);
      return;
    }
    if (e.key === 'Backspace') {
      events.pop();
      progress();
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
    progress();
  };

  const onPaste = (e: Event): void => e.preventDefault();

  // champ vidé (tout sélectionné puis supprimé, couper, vidage programmatique) : on repart de zéro
  const onInput = (): void => {
    if (input.value !== '' || (events.length === 0 && pending.size === 0)) return;
    events.length = 0;
    pending.clear();
    progress();
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('keyup', onKeyUp);
  input.addEventListener('paste', onPaste);
  input.addEventListener('input', onInput);

  return () => {
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('keyup', onKeyUp);
    input.removeEventListener('paste', onPaste);
    input.removeEventListener('input', onInput);
  };
}
