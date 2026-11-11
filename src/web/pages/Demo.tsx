import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THRESHOLDS } from '../../shared/types';
import type { Level, Snapshot, Thresholds, Verdict } from '../../shared/types';
import { attachKeystrokeCapture } from '../capture/keystroke';
import { AngleDial } from '../components/AngleDial';
import { Barcode } from '../components/Barcode';
import { ControlBar } from '../components/ControlBar';
import { DeviceTable } from '../components/DeviceTable';
import { Gauge } from '../components/Gauge';
import { ThresholdChart } from '../components/ThresholdChart';
import { VerdictCard } from '../components/VerdictCard';
import { useSession } from '../ws';
import type { ClientMessage } from '../ws';

type Send = (msg: ClientMessage) => void;

const SIGNAL_NAME: Record<Level, string> = {
  1: 'Dynamique de frappe',
  2: "Empreinte de l'appareil",
  3: 'Posture du téléphone',
};

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

/** Mode "dieu" : A / B hors champ de saisie simulent l'utilisateur legitime / l'imposteur. */
function useGodMode(send: Send): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'b') send({ type: 'god', who: k === 'a' ? 'A' : 'B' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);
}

function useThresholds(): Thresholds {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  useEffect(() => {
    let alive = true;
    fetch('/api/thresholds')
      .then((r) => (r.ok ? (r.json() as Promise<Thresholds>) : null))
      .then((t) => {
        if (alive && t) setThresholds(t);
      })
      .catch((err) => console.error('seuils indisponibles', err));
    return () => {
      alive = false;
    };
  }, []);
  return thresholds;
}

function LoginForm({ send }: { send: Send }) {
  const pwd = useRef<HTMLInputElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const input = pwd.current;
    if (!input) return;
    return attachKeystrokeCapture(input, (events) => {
      sendRef.current({ type: 'keystroke', events, password: input.value });
      input.value = '';
    });
  }, []);

  return (
    <form className="login-form" onSubmit={(e) => e.preventDefault()}>
      <h2>Connexion</h2>
      <label>
        Identifiant
        <input type="text" name="id" autoComplete="off" />
      </label>
      <label>
        Mot de passe
        <input ref={pwd} type="password" name="password" autoComplete="off" />
      </label>
      <p className="hint">Tapez le mot de passe puis appuyez sur Entrée.</p>
    </form>
  );
}

function QrBlock({ url, level }: { url: string; level: 2 | 3 }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 360, margin: 1 })
      .then((d) => {
        if (alive) setSrc(d);
      })
      .catch((err) => console.error('QR code impossible', err));
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="qr-block">
      {src && <img src={src} alt={`QR code de la session ${url}`} width={360} height={360} />}
      <p className="instruction">
        {level === 2
          ? 'Scannez le QR code et saisissez le code PIN sur le téléphone'
          : 'Reprenez le téléphone de A et validez la posture'}
      </p>
    </div>
  );
}

function FinalVerdict({ verdict, onReset }: { verdict: Verdict; onReset: () => void }) {
  return (
    <div className="final-verdict">
      <VerdictCard verdict={verdict} />
      <p className="level-reached">Niveau atteint : {verdict.level}</p>
      <button type="button" className="primary" onClick={onReset}>
        Recommencer
      </button>
    </div>
  );
}

function DirectSignal({ snap, thresholds }: { snap: Snapshot; thresholds: Thresholds }) {
  if (snap.level === 1) {
    const perKey = snap.live.keystroke?.perKey ?? [];
    const dev = perKey.length
      ? perKey.reduce((a, p) => a + Math.abs(p.dwell - p.expectedDwell), 0) / perKey.length
      : null;
    return (
      <>
        <div className="summary">
          <span>
            Écart moyen : <strong>{dev === null ? '–' : `${Math.round(dev)} ms`}</strong>
          </span>
          <span>
            Touches : <strong>{perKey.length}</strong>
          </span>
        </div>
        <ThresholdChart perKey={perKey} />
        <Barcode live={perKey.map((p) => p.dwell)} expected={perKey.map((p) => p.expectedDwell)} />
      </>
    );
  }
  if (snap.level === 2) {
    return <DeviceTable lines={snap.live.device?.lines ?? []} />;
  }
  const o = snap.live.orientation;
  return (
    <AngleDial
      expectedBeta={snap.expected.beta ?? 0}
      tolerance={thresholds.orientation.toleranceDeg}
      beta={o ? o.beta : null}
    />
  );
}

function ProfileSignal({ snap, thresholds }: { snap: Snapshot; thresholds: Thresholds }) {
  if (snap.level === 1) {
    const ks = snap.expected.keystroke;
    if (!ks) return <p className="hint">Aucun profil de frappe enregistré.</p>;
    return (
      <>
        <Barcode live={[]} expected={Object.values(ks.mean).map((m) => m.dwell)} />
        <p className="hint">Profil appris sur {ks.samples} saisies.</p>
      </>
    );
  }
  if (snap.level === 2) {
    const fp = snap.expected.fingerprint;
    if (!fp) return <p className="hint">Aucune empreinte enregistrée.</p>;
    return (
      <dl className="profile-list">
        {(Object.keys(fp) as (keyof typeof fp)[]).map((field) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>{fp[field]}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return snap.expected.beta === null ? (
    <p className="hint">Aucune posture enregistrée.</p>
  ) : (
    <p className="profile-beta">
      Angle attendu : {Math.round(snap.expected.beta)}° ± {thresholds.orientation.toleranceDeg}°
    </p>
  );
}

function liveScore(snap: Snapshot): number {
  const l = snap.live;
  if (snap.level === 1) return l.keystroke?.score ?? 0;
  if (snap.level === 2) return l.device?.score ?? 0;
  return l.orientation?.score ?? 0;
}

function levelThresholds(level: Level, t: Thresholds): { accept: number; warn: number } {
  return level === 1 ? t.keystroke : level === 2 ? t.device : t.orientation;
}

export function Demo() {
  const { snapshot, send } = useSession();
  const thresholds = useThresholds();
  useGodMode(send);

  const onJump = (level: Level): void => send({ type: 'jump', level });
  const onReset = (): void => send({ type: 'reset' });

  if (!snapshot) {
    return (
      <div className="demo">
        <main className="main-zone" data-testid="main-zone">
          <p className="instruction">Connexion au serveur…</p>
        </main>
      </div>
    );
  }

  const { state, level } = snapshot;
  const th = levelThresholds(level, thresholds);

  let main;
  if (state.status === 'granted' || state.status === 'blocked') {
    main = <FinalVerdict verdict={state.verdict} onReset={onReset} />;
  } else if (level === 1) {
    main = <LoginForm send={send} />;
  } else {
    main = <QrBlock url={snapshot.sessionUrl} level={level} />;
  }

  return (
    <div className="demo">
      <main className="main-zone" data-testid="main-zone">
        {main}
      </main>
      <aside className="side">
        <section className="panel" data-testid="panel-direct" aria-label="Direct">
          <h2>Direct — {SIGNAL_NAME[level]}</h2>
          <div className="direct-body">
            <Gauge score={liveScore(snapshot)} accept={th.accept} warn={th.warn} />
            <div className="signal">
              <DirectSignal snap={snapshot} thresholds={thresholds} />
            </div>
          </div>
        </section>
        <section className="panel panel-profil" data-testid="panel-profil" aria-label="Profil de A">
          <h2>Profil de A</h2>
          <ProfileSignal snap={snapshot} thresholds={thresholds} />
        </section>
        <div className="control-zone">
          <ControlBar onJump={onJump} onReset={onReset} />
        </div>
      </aside>
    </div>
  );
}
