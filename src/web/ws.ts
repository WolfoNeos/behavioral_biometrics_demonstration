import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fingerprint, KeyEvent, Level, OrientationReading, PhoneView, Snapshot } from '../shared/types';

export type PhoneMessage =
  | { type: 'pin'; pin: string; fingerprint: Fingerprint; taps: { down: number; up: number }[] }
  | { type: 'orientation'; pin: string; readings: OrientationReading[] }
  | ({ type: 'orientationLive' } & OrientationReading)
  | ({ type: 'phoneView' } & PhoneView);

export type ClientMessage =
  | { type: 'keystroke'; events: KeyEvent[]; password: string }
  | { type: 'jump'; level: Level }
  | { type: 'reset' }
  | { type: 'god'; who: 'A' | 'B' };

const STORAGE_KEY = 'demo-session-id';
/** Code de fermeture du serveur pour une session ou un role inconnus. */
export const CLOSE_UNKNOWN_SESSION = 1008;
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

const backoffDelay = (attempt: number): number => Math.min(300 * 2 ** attempt, MAX_BACKOFF_MS);

function socketUrl(id: string, role: 'pc' | 'phone'): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws?session=${id}&role=${role}`;
}

/** Decode un message `state` du serveur ; null pour tout autre message. */
function parseState(data: unknown): Snapshot | null {
  const { type, ...rest } = JSON.parse(String(data)) as { type: string } & Snapshot;
  return type === 'state' ? (rest as Snapshot) : null;
}

async function createSession(): Promise<string> {
  const res = await fetch('/api/session', { method: 'POST' });
  if (!res.ok) throw new Error(`unable to create session (${res.status})`);
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
      const delay = backoffDelay(attempt);
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
      const ws = new WebSocket(socketUrl(id, 'pc'));
      wsRef.current = ws;
      let received = false;
      ws.onmessage = (ev) => {
        try {
          const next = parseState(ev.data);
          if (!next) return;
          received = true;
          attempt = 0;
          setSnapshot(next);
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

/**
 * Session de demo cote telephone : WebSocket role=phone, reconnexion automatique,
 * sauf si le serveur ne connait pas la session (1008, ex. apres un redemarrage) : `lost`.
 * `send` renvoie false quand le message n'a pas pu partir.
 */
export function usePhoneSession(id: string): {
  snapshot: Snapshot | null;
  connected: boolean;
  lost: boolean;
  send: (msg: PhoneMessage) => boolean;
} {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [lost, setLost] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = (): void => {
      const ws = new WebSocket(socketUrl(id, 'phone'));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const next = parseState(ev.data);
          if (!next) return;
          attempt = 0;
          setSnapshot(next);
        } catch (err) {
          console.error('message ws illisible', err);
        }
      };
      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        if (disposed) return;
        if (ev.code === CLOSE_UNKNOWN_SESSION) {
          setLost(true);
          return;
        }
        timer = setTimeout(connect, backoffDelay(attempt));
        attempt += 1;
      };
    };

    setLost(false);
    connect();
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
  }, [id]);

  const send = useCallback((msg: PhoneMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.error('envoi ws impossible', err);
      return false;
    }
  }, []);

  return { snapshot, connected, lost, send };
}
