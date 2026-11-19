import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { collectFingerprint } from '../capture/fingerprint';
import { requestOrientation } from '../capture/orientation';
import { LIVE_ORIENTATION_INTERVAL_MS } from '../../shared/types';
import type { OrientationReading } from '../../shared/types';
import { usePhoneSession } from '../ws';

/**
 * Page mobile : un seul écran, la demande du code PIN. Aucun verdict, aucun score, aucune
 * mesure d'orientation n'y apparaît : l'acceptation et le rejet ne s'affichent que sur le PC,
 * et la posture (niveau 3) est mesurée en silence pendant la saisie.
 */

const MAX_PIN = 8;
const WINDOW_MS = 2000;

type Tap = { down: number; up: number };

/**
 * Mesure d'orientation silencieuse. L'autorisation du capteur (iOS) est demandée au premier
 * appui sur le pavé ; les ~2 dernières secondes sont gardées pour la validation du niveau 3,
 * et l'angle est transmis au PC en direct (aiguille du cadran).
 */
function useSilentOrientation(onLive: (reading: OrientationReading) => void) {
  const [armed, setArmed] = useState(false);
  const asked = useRef(false);
  const buffer = useRef<{ t: number; r: OrientationReading }[]>([]);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => {
    if (!armed) return;
    let lastSent = -Infinity;
    const onEvent = (e: Event): void => {
      const { alpha, beta, gamma } = e as DeviceOrientationEvent;
      if (beta === null || beta === undefined || !Number.isFinite(beta)) return;
      const now = performance.now();
      const r = { alpha: alpha ?? 0, beta, gamma: gamma ?? 0 };
      buffer.current.push({ t: now, r });
      while (buffer.current.length > 0 && now - buffer.current[0].t > WINDOW_MS) buffer.current.shift();
      if (now - lastSent < LIVE_ORIENTATION_INTERVAL_MS) return;
      lastSent = now;
      onLiveRef.current(r);
    };
    window.addEventListener('deviceorientation', onEvent);
    return () => window.removeEventListener('deviceorientation', onEvent);
  }, [armed]);

  return {
    /** À appeler depuis un geste utilisateur (exigence iOS). */
    arm: (): void => {
      if (asked.current) return;
      asked.current = true;
      void requestOrientation().then((r) => {
        if (r === 'granted') setArmed(true);
        else asked.current = false; // nouvel essai au prochain appui
      });
    },
    readings: (): OrientationReading[] => buffer.current.map((b) => b.r),
  };
}

function Keypad({
  onSubmit,
  onTouch,
  connected,
}: {
  onSubmit: (pin: string, taps: Tap[]) => Promise<boolean>;
  onTouch: () => void;
  connected: boolean;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const taps = useRef<Tap[]>([]);
  const pending = useRef<number | null>(null);

  const press = (d: string): void => {
    if (digits.length >= MAX_PIN) return;
    const up = performance.now();
    taps.current.push({ down: pending.current ?? up, up });
    pending.current = null;
    setDigits((v) => v + d);
  };

  const erase = (): void => {
    taps.current.pop();
    setDigits((v) => v.slice(0, -1));
  };

  const validate = async (): Promise<void> => {
    if (digits.length === 0 || busy || !connected) return;
    setBusy(true);
    const sent = await onSubmit(digits, taps.current.slice());
    setBusy(false);
    setUnsent(!sent);
    if (!sent) return; // PIN conservé : réessayer
    taps.current = [];
    setDigits('');
  };

  const digitProps = (d: string) => ({
    onPointerDown: () => {
      pending.current = performance.now();
      onTouch();
    },
    onPointerUp: () => press(d),
    onClick: (e: MouseEvent) => {
      // clavier / lecteur d'écran : pas d'événement pointeur
      if (e.detail === 0) press(d);
    },
  });

  return (
    <div className="pin">
      <h1 className="m-title">Code PIN</h1>
      <div className="pin-dots" role="status" aria-label={`${digits.length} chiffres saisis`}>
        {Array.from({ length: Math.max(4, digits.length) }, (_, i) => (
          <span key={i} className={i < digits.length ? 'dot filled' : 'dot'} />
        ))}
      </div>
      {unsent && (
        <p className="m-error" role="alert">
          Réessayez
        </p>
      )}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="key" {...digitProps(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="key key-aux" aria-label="Effacer" onClick={erase}>
          ⌫
        </button>
        <button type="button" className="key" {...digitProps('0')}>
          0
        </button>
        <button
          type="button"
          className="key key-ok"
          onClick={() => void validate()}
          disabled={busy || !connected || digits.length === 0}
        >
          Valider
        </button>
      </div>
    </div>
  );
}

export function Mobile() {
  const { id = '' } = useParams();
  const { snapshot, connected, lost, send } = usePhoneSession(id);
  const levelRef = useRef<number | undefined>(undefined);
  levelRef.current = snapshot?.level;

  const sensor = useSilentOrientation((reading) => {
    // l'aiguille du PC n'a de sens qu'au niveau 3
    if (levelRef.current === 3) send({ type: 'orientationLive', ...reading });
  });

  if (lost) {
    return (
      <main className="mobile">
        <p className="m-sub">Session introuvable. Rescannez le QR code.</p>
      </main>
    );
  }

  // aucun état à l'écran : le résultat se lit sur le PC
  if (snapshot === null || snapshot.state.status !== 'pending') {
    return (
      <main className="mobile">
        <p className="m-sub">{snapshot === null ? 'Connexion…' : 'Regardez l’écran'}</p>
      </main>
    );
  }

  return (
    <main className="mobile">
      <Keypad
        connected={connected}
        onTouch={sensor.arm}
        onSubmit={async (pin, taps) => {
          const level = levelRef.current;
          if (level === 2) return send({ type: 'pin', pin, fingerprint: await collectFingerprint(), taps });
          if (level === 3) {
            const readings = sensor.readings();
            if (readings.length === 0) return false; // capteur muet : même message neutre
            return send({ type: 'orientation', readings });
          }
          return true; // niveau 1 : la saisie se fait sur le PC, le pavé est ignoré
        }}
      />
    </main>
  );
}
