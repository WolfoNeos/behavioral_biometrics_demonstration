import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, MobileShell } from '../components/BankPortal';
import { collectFingerprint } from '../capture/fingerprint';
import { requestOrientation } from '../capture/orientation';
import { LIVE_ORIENTATION_INTERVAL_MS } from '../../shared/types';
import type { OrientationReading, PhoneScreen } from '../../shared/types';
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

  /** Demande l'autorisation (iOS : seulement depuis un geste utilisateur). */
  const arm = (): void => {
    if (asked.current) return;
    asked.current = true;
    void requestOrientation().then((r) => {
      if (r === 'granted') setArmed(true);
      else asked.current = false; // nouvel essai au prochain appui
    });
  };
  const armRef = useRef(arm);
  armRef.current = arm;

  useEffect(() => {
    // sans autorisation à demander (Android, etc.) : le capteur démarre dès l'ouverture de la page
    const ctor =
      typeof DeviceOrientationEvent === 'undefined'
        ? null
        : (DeviceOrientationEvent as unknown as { requestPermission?: unknown });
    if (ctor && typeof ctor.requestPermission !== 'function') {
      asked.current = true;
      setArmed(true);
      return;
    }
    // iOS : la demande d'autorisation n'est acceptée que dans un « clic » ou un « touchend »
    // (pas dans pointerdown) ; le premier contact avec la page, n'importe où, la déclenche
    const onTap = (): void => armRef.current();
    const events = ['click', 'touchend'] as const;
    for (const ev of events) window.addEventListener(ev, onTap, { capture: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, onTap, { capture: true });
    };
  }, []);

  return {
    arm,
    readings: (): OrientationReading[] => buffer.current.map((b) => b.r),
  };
}

function Keypad({
  onSubmit,
  connected,
  again,
  onPad,
}: {
  onSubmit: (pin: string, taps: Tap[]) => Promise<boolean>;
  connected: boolean;
  /** Étape suivante : même pavé, demande reformulée (vérification supplémentaire). */
  again: boolean;
  /** Reflet pour le PC : nombre de digits entered et touche pressée (jamais les chiffres). */
  onPad: (pad: { digits: number; pressed: string | null }) => void;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const taps = useRef<Tap[]>([]);
  const pending = useRef<number | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onPad({ digits: digits.length, pressed });
  }, [digits.length, pressed, onPad]);

  /** Allume brièvement la touche (reflet sur le PC). */
  const lit = (k: string): void => {
    setPressed(k);
    if (flash.current) clearTimeout(flash.current);
    flash.current = setTimeout(() => setPressed(null), 220);
  };

  const press = (d: string): void => {
    if (digits.length >= MAX_PIN) return;
    const up = performance.now();
    taps.current.push({ down: pending.current ?? up, up });
    pending.current = null;
    setDigits((v) => v + d);
  };

  const erase = (): void => {
    lit('erase');
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
      lit(d);
    },
    onPointerUp: () => {
      press(d);
      navigator.vibrate?.(6); // léger retour haptique (Android)
    },
    onClick: (e: MouseEvent) => {
      // clavier / lecteur d'écran : pas d'événement pointeur
      if (e.detail === 0) {
        press(d);
        lit(d);
      }
    },
  });

  return (
    <div className="pin">
      <div className="pin-head">
        <h1>{again ? 'Enter your PIN again' : 'Enter your PIN'}</h1>
        <p>{again ? 'Additional verification' : 'To confirm your identity'}</p>
      </div>
      <div className={unsent ? 'pin-dots shake' : 'pin-dots'} role="status" aria-label={`${digits.length} digits entered`}>
        {Array.from({ length: Math.max(4, digits.length) }, (_, i) => (
          <span key={i} className={i < digits.length ? 'dot filled' : 'dot'} />
        ))}
      </div>
      <p className="pin-error" role="alert" aria-hidden={!unsent}>
        {unsent ? 'Try again' : ''}
      </p>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="key" {...digitProps(d)}>
            {d}
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className="key" {...digitProps('0')}>
          0
        </button>
        <button type="button" className="key key-aux" aria-label="Delete" onClick={erase}>
          ⌫
        </button>
      </div>
      <button
        type="button"
        className="pin-submit"
        onClick={() => void validate()}
        disabled={busy || !connected || digits.length === 0}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> Verifying…
          </>
        ) : (
          'Confirm'
        )}
      </button>
    </div>
  );
}

type Phase = 'input' | 'checking' | 'step';

/** Screen intermédiaire neutre : ni résultat, ni raison, seulement l'avancement. */
function Interstitial({ phase }: { phase: 'checking' | 'step' }) {
  return (
    <div className="m-inter" role="status" key={phase}>
      <div className={phase === 'checking' ? 'inter-ring' : 'inter-ring step'} aria-hidden="true">
        {phase === 'step' && <Lock />}
      </div>
      <h1>{phase === 'checking' ? 'Verifying…' : 'Additional verification'}</h1>
      <p>
        {phase === 'checking'
          ? 'Please wait a moment.'
          : 'For your security, please confirm your identity again.'}
      </p>
    </div>
  );
}

const STEP_MS = 1800;
const CHECK_TIMEOUT_MS = 5000;

export function Mobile() {
  const { id = '' } = useParams();
  const { snapshot, connected, lost, send } = usePhoneSession(id);
  const lastTryRef = useRef<number | undefined>(undefined);
  const levelRef = useRef<number | undefined>(undefined);
  levelRef.current = snapshot?.level;
  lastTryRef.current = snapshot?.attempts?.at(-1)?.n;
  const [phase, setPhase] = useState<Phase>('input');
  const [pad, setPad] = useState<{ digits: number; pressed: string | null }>({ digits: 0, pressed: null });
  const sentAt = useRef<number | undefined>(undefined); // niveau au moment de l'envoi
  const sentTry = useRef(0); // numéro du dernier essai connu au moment de l'envoi

  const sensor = useSilentOrientation((reading) => {
    // l'aiguille du PC n'a de sens qu'au niveau 3
    if (levelRef.current === 3) send({ type: 'orientationLive', ...reading });
  });

  const level = snapshot?.level;
  const status = snapshot?.state.status;
  const lastTry = snapshot?.attempts?.at(-1)?.n;

  // empreinte de l'appareil relevée dès l'ouverture du niveau 2, avant la saisie du PIN
  const deviceSent = useRef(false);
  useEffect(() => {
    if (!connected || lost || level !== 2 || status !== 'pending') {
      if (level !== 2 || !connected || status !== 'pending') deviceSent.current = false;
      return;
    }
    if (deviceSent.current) return;
    deviceSent.current = true;
    void collectFingerprint().then((fingerprint) => sendRef.current({ type: 'device', fingerprint }));
  }, [connected, lost, level, status]);

  // reflet de l'écran pour le PC (aide à la compréhension de la démo)
  const sendRef = useRef(send);
  sendRef.current = send;
  const screen: PhoneScreen =
    snapshot === null ? 'connecting' : status !== 'pending' ? 'done' : phase === 'input' ? 'pin' : phase;
  useEffect(() => {
    if (lost || !connected) return;
    sendRef.current({
      type: 'phoneView',
      screen,
      digits: screen === 'pin' ? pad.digits : 0,
      pressed: screen === 'pin' ? pad.pressed : null,
      again: level === 3,
    });
  }, [screen, pad.digits, pad.pressed, level, connected, lost]);

  // envoi accepté -> « vérification en cours » ; réponse du serveur -> étape suivante ou fin
  useEffect(() => {
    if (phase !== 'checking') return;
    if (status !== undefined && status !== 'pending') {
      setPhase('input');
      return;
    }
    if (level !== undefined && level !== sentAt.current) {
      setPhase('step');
      return;
    }
    // étape relancée seule : le résultat est arrivé sans changer d'étape, retour au pavé
    if ((lastTry ?? 0) > sentTry.current) {
      setPhase('input');
      return;
    }
    const t = setTimeout(() => setPhase('input'), CHECK_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, level, status, lastTry]);

  useEffect(() => {
    if (phase !== 'step') return;
    const t = setTimeout(() => setPhase('input'), STEP_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // saut de niveau ou remise à zéro par le présentateur : on revient à la saisie
  useEffect(() => {
    if (phase === 'step' && status !== 'pending') setPhase('input');
  }, [phase, status]);

  if (lost) {
    return (
      <MobileShell>
        <p className="m-note">Session not found. Please scan the QR code again.</p>
      </MobileShell>
    );
  }

  // aucun état à l'écran : le résultat se lit sur le PC
  if (snapshot === null || snapshot.state.status !== 'pending') {
    return (
      <MobileShell>
        {snapshot === null ? (
          <p className="m-note">
            <span className="spinner dark" aria-hidden="true" /> Connecting…
          </p>
        ) : (
          <div className="m-done">
            <Lock />
            <p className="m-note">Look at the screen</p>
          </div>
        )}
      </MobileShell>
    );
  }

  if (phase !== 'input') {
    return (
      <MobileShell>
        <Interstitial phase={phase} />
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <Keypad
        connected={connected}
        again={snapshot.level === 3}
        onPad={setPad}
        onSubmit={async (pin, taps) => {
          const lvl = levelRef.current;
          let sent = true;
          if (lvl === 2) sent = send({ type: 'pin', pin, fingerprint: await collectFingerprint(), taps });
          else if (lvl === 3) {
            const readings = sensor.readings();
            if (readings.length === 0) return false; // capteur muet : même message neutre
            sent = send({ type: 'orientation', pin, readings });
          } else return true; // niveau 1 : la saisie se fait sur le PC, le pavé est ignoré
          if (sent) {
            sentAt.current = lvl;
            sentTry.current = lastTryRef.current ?? 0;
            setPhase('checking');
          }
          return sent;
        }}
      />
    </MobileShell>
  );
}
