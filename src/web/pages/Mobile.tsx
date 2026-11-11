import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collectFingerprint } from '../capture/fingerprint';
import { collectOrientation, requestOrientation } from '../capture/orientation';
import type { Snapshot, Verdict } from '../../shared/types';
import { usePhoneSession } from '../ws';

const MAX_PIN = 8;
const UNAVAILABLE =
  "Capteur d'orientation indisponible — ouvrez la page en HTTPS et autorisez l'accès au capteur";

type Tap = { down: number; up: number };

function Keypad({ onSend }: { onSend: (pin: string, taps: Tap[]) => Promise<void> }) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (digits.length === 0 || busy) return;
    setBusy(true);
    await onSend(digits, taps.current.slice());
    taps.current = [];
    setDigits('');
    setBusy(false);
  };

  return (
    <div className="pin">
      <h1 className="m-title">Saisissez votre code PIN</h1>
      <div className="pin-dots" role="status" aria-label={`${digits.length} chiffres saisis`}>
        {Array.from({ length: Math.max(4, digits.length) }, (_, i) => (
          <span key={i} className={i < digits.length ? 'dot filled' : 'dot'} />
        ))}
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="key"
            onPointerDown={() => {
              pending.current = performance.now();
            }}
            onPointerUp={() => press(d)}
            onClick={(e) => {
              // clavier / lecteur d'ecran : pas d'evenement pointeur
              if (e.detail === 0) press(d);
            }}
          >
            {d}
          </button>
        ))}
        <button type="button" className="key key-aux" aria-label="Effacer" onClick={erase}>
          ⌫
        </button>
        <button
          type="button"
          className="key"
          onPointerDown={() => {
            pending.current = performance.now();
          }}
          onPointerUp={() => press('0')}
          onClick={(e) => {
            if (e.detail === 0) press('0');
          }}
        >
          0
        </button>
        <button type="button" className="key key-ok" onClick={() => void validate()} disabled={busy}>
          Valider
        </button>
      </div>
    </div>
  );
}

function Posture({ onSend }: { onSend: (readings: Awaited<ReturnType<typeof collectOrientation>>) => void }) {
  const [perm, setPerm] = useState<'idle' | 'granted' | 'failed'>('idle');
  const [beta, setBeta] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (perm !== 'granted') return;
    const onEvent = (e: Event): void => {
      const b = (e as DeviceOrientationEvent).beta;
      if (b !== null && b !== undefined && Number.isFinite(b)) setBeta(b);
    };
    window.addEventListener('deviceorientation', onEvent);
    return () => window.removeEventListener('deviceorientation', onEvent);
  }, [perm]);

  const authorize = async (): Promise<void> => {
    const result = await requestOrientation();
    setPerm(result === 'granted' ? 'granted' : 'failed');
  };

  const validate = async (): Promise<void> => {
    setBusy(true);
    setEmpty(false);
    const readings = await collectOrientation(2000);
    setBusy(false);
    if (readings.length === 0) {
      setEmpty(true);
      return;
    }
    onSend(readings);
  };

  if (perm === 'failed') {
    return (
      <div className="posture">
        <h1 className="m-title">Posture</h1>
        <p className="m-error" role="alert">
          {UNAVAILABLE}
        </p>
        <button type="button" className="m-btn" onClick={() => void authorize()}>
          Réessayer
        </button>
      </div>
    );
  }

  if (perm === 'idle') {
    return (
      <div className="posture">
        <h1 className="m-title">Tenez le téléphone comme d&apos;habitude</h1>
        <button type="button" className="m-btn" onClick={() => void authorize()}>
          Autoriser le capteur
        </button>
      </div>
    );
  }

  return (
    <div className="posture">
      <h1 className="m-title">Gardez la posture, puis validez</h1>
      <div className="beta-value" aria-label="angle beta">
        {beta === null ? '—' : `${Math.round(beta)}°`}
      </div>
      {empty && (
        <p className="m-error" role="alert">
          Aucune mesure reçue, réessayez
        </p>
      )}
      <button type="button" className="m-btn" onClick={() => void validate()} disabled={busy}>
        {busy ? 'Mesure en cours…' : 'Valider'}
      </button>
    </div>
  );
}

function VerdictView({ verdict, granted }: { verdict: Verdict; granted: boolean }) {
  return (
    <div className={`m-verdict ${granted ? 'granted' : 'denied'}`} role="status">
      <div className="m-verdict-icon" aria-hidden="true">
        {granted ? '✓' : '✗'}
      </div>
      <h1 className="m-title">{granted ? 'Accès accordé' : 'Accès refusé'}</h1>
      <p className="m-sub">Score : {Math.round(verdict.score)} / 100</p>
    </div>
  );
}

function Content({
  snapshot,
  send,
}: {
  snapshot: Snapshot | null;
  send: ReturnType<typeof usePhoneSession>['send'];
}) {
  if (snapshot === null) return <p className="m-sub">Connexion à la session…</p>;
  const { state } = snapshot;
  if (state.status === 'granted') return <VerdictView verdict={state.verdict} granted />;
  if (state.status === 'blocked') return <VerdictView verdict={state.verdict} granted={false} />;
  if (state.level === 2) {
    return (
      <Keypad
        onSend={async (pin, taps) => {
          send({ type: 'pin', pin, fingerprint: await collectFingerprint(), taps });
        }}
      />
    );
  }
  if (state.level === 3) {
    return <Posture onSend={(readings) => send({ type: 'orientation', readings })} />;
  }
  return <h1 className="m-title">Saisissez le mot de passe sur l&apos;ordinateur</h1>;
}

export function Mobile() {
  const { id = '' } = useParams();
  const { snapshot, connected, send } = usePhoneSession(id);
  return (
    <main className="mobile">
      <div className={connected ? 'conn ok' : 'conn'} role="status">
        {connected ? 'Connecté' : 'Reconnexion…'}
      </div>
      <Content snapshot={snapshot} send={send} />
    </main>
  );
}
