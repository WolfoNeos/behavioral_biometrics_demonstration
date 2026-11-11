import { useCallback, useEffect, useRef, useState } from 'react';
import type { Level, Snapshot } from '../shared/types';
import type { KeyEvent } from '../shared/types';

export type ClientMessage =
  | { type: 'keystroke'; events: KeyEvent[]; password: string }
  | { type: 'jump'; level: Level }
  | { type: 'reset' }
  | { type: 'god'; who: 'A' | 'B' };

const STORAGE_KEY = 'demo-session-id';
const MAX_BACKOFF_MS = 3000;

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // stockage indisponible : la session ne survivra pas au rechargement
  }
}

async function createSession(): Promise<string> {
  const res = await fetch('/api/session', { method: 'POST' });
  if (!res.ok) throw new Error(`creation de session impossible (${res.status})`);
  const body = (await res.json()) as { id: string };
  writeStored(body.id);
  return body.id;
}

/** Session de demo cote PC : WebSocket role=pc, reconnexion automatique. */
export function useSession(): { snapshot: Snapshot | null; send: (msg: ClientMessage) => void } {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const retry = (): void => {
      if (disposed) return;
      const delay = Math.min(300 * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      timer = setTimeout(connect, delay);
    };

    const connect = async (): Promise<void> => {
      let id = readStored();
      try {
        if (id === null) id = await createSession();
      } catch (err) {
        console.error(err);
        retry();
        return;
      }
      if (disposed) return;
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}/ws?session=${id}&role=pc`);
      wsRef.current = ws;
      let received = false;
      ws.onmessage = (ev) => {
        try {
          const { type, ...rest } = JSON.parse(String(ev.data)) as { type: string } & Snapshot;
          if (type !== 'state') return;
          received = true;
          attempt = 0;
          setSnapshot(rest as Snapshot);
        } catch (err) {
          console.error('message ws illisible', err);
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        // Refus immediat : le serveur ne connait plus cette session, on en recree une.
        if (!received) writeStored(null);
        retry();
      };
    };

    void connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { snapshot, send };
}
