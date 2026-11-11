import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { FailReason, LastVerdict, Level, Snapshot, Thresholds, Verdict } from '../../shared/types';
import { attachKeystrokeCapture } from '../capture/keystroke';
import { AngleDial } from '../components/AngleDial';
import { Barcode } from '../components/Barcode';
import { ControlBar } from '../components/ControlBar';
import { DeviceTable, FIELD_LABELS } from '../components/DeviceTable';
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

const REASON_LABEL: Record<FailReason, string> = {
  'password incorrect': 'Mot de passe incorrect',
  'PIN incorrect': 'PIN incorrect',
  'signal hors seuil': 'Signal hors seuil',
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

function PhoneStatus({ connected }: { connected: boolean }) {
  return (
    <p className={connected ? 'phone-status ok' : 'phone-status'} role="status">
      {connected ? 'Téléphone connecté' : 'Téléphone en attente'}
    </p>
  );
}

function FailBanner({ verdict }: { verdict: LastVerdict }) {
  const reason = verdict.reason ? REASON_LABEL[verdict.reason] : null;
  const detail =
    verdict.reason === 'signal hors seuil'
      ? `${reason} (score ${Math.round(verdict.score)} / 100)`
      : reason;
  return (
    <div className="fail-banner" role="alert" data-testid="fail-banner">
      <strong>Échec niveau {verdict.level} — passage au niveau suivant</strong>
      {detail && <span> · {detail}</span>}
    </div>
  );
}

/**
 * Niveau dont on montre le signal : apres un echec, le niveau echoue reste affiche (avec un
 * bandeau) tant que le nouveau niveau n'a pas de mesure ; l'orientation en direct en est une.
 */
function shownLevel(snap: Snapshot): { level: Level; failed: LastVerdict | null } {
  const v = snap.lastVerdict;
  const measuring = snap.level === 3 && snap.liveOrientation !== null;
  if (snap.state.status === 'pending' && v && !v.granted && v.level < snap.level && !measuring) {
    return { level: v.level, failed: v };
  }
  return { level: snap.level, failed: null };
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

function DirectSignal({ snap, level }: { snap: Snapshot; level: Level }) {
  if (level === 1) {
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
  if (level === 2) {
    return <DeviceTable lines={snap.live.device?.lines ?? []} />;
  }
  // avant « Valider » : l'aiguille suit le telephone en direct ; apres : la mesure notee
  const beta = snap.liveOrientation?.beta ?? snap.live.orientation?.beta ?? null;
  return (
    <AngleDial
      expectedBeta={snap.expected.beta ?? 0}
      tolerance={snap.thresholds.orientation.toleranceDeg}
      beta={beta}
    />
  );
}

function ProfileSignal({ snap, level }: { snap: Snapshot; level: Level }) {
  if (level === 1) {
    const ks = snap.expected.keystroke;
    if (!ks) return <p className="hint">Aucun profil de frappe enregistré.</p>;
    return (
      <>
        <Barcode live={[]} expected={Object.values(ks.mean).map((m) => m.dwell)} />
        <p className="hint">Profil appris sur {ks.samples} saisies.</p>
      </>
    );
  }
  if (level === 2) {
    const fp = snap.expected.fingerprint;
    if (!fp) return <p className="hint">Aucune empreinte enregistrée.</p>;
    return (
      <dl className="profile-list">
        {(Object.keys(fp) as (keyof typeof fp)[]).map((field) => (
          <div key={field}>
            <dt>{FIELD_LABELS[field] ?? field}</dt>
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
      Angle attendu : {Math.round(snap.expected.beta)}° ± {snap.thresholds.orientation.toleranceDeg}°
    </p>
  );
}

/** Score mesure pour ce niveau ; null si aucune mesure (jauge neutre). */
function liveScore(snap: Snapshot, level: Level): number | null {
  const l = snap.live;
  if (level === 1) return l.keystroke?.score ?? null;
  if (level === 2) return l.device?.score ?? null;
  return l.orientation?.score ?? null;
}

function levelThresholds(level: Level, t: Thresholds): { accept: number; warn: number } {
  return level === 1 ? t.keystroke : level === 2 ? t.device : t.orientation;
}

export function Demo() {
  const { snapshot, send } = useSession();
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
  const shown = shownLevel(snapshot);
  const th = levelThresholds(shown.level, snapshot.thresholds);

  let main;
  if (state.status === 'granted' || state.status === 'blocked') {
    main = <FinalVerdict verdict={state.verdict} onReset={onReset} />;
  } else if (level === 1) {
    main = <LoginForm send={send} />;
  } else {
    main = (
      <div className="qr-zone">
        <QrBlock url={snapshot.sessionUrl} level={level} />
        <PhoneStatus connected={snapshot.phoneConnected} />
      </div>
    );
  }

  return (
    <div className="demo">
      <main className="main-zone" data-testid="main-zone">
        {main}
      </main>
      <aside className="side">
        <section className="panel" data-testid="panel-direct" aria-label="Direct">
          <h2>Direct — {SIGNAL_NAME[shown.level]}</h2>
          {shown.failed && <FailBanner verdict={shown.failed} />}
          <div className="direct-body">
            <Gauge score={liveScore(snapshot, shown.level)} accept={th.accept} warn={th.warn} />
            <div className="signal">
              <DirectSignal snap={snapshot} level={shown.level} />
            </div>
          </div>
        </section>
        <section className="panel panel-profil" data-testid="panel-profil" aria-label="Profil de A">
          <h2>Profil de A</h2>
          <ProfileSignal snap={snapshot} level={shown.level} />
        </section>
        <div className="control-zone">
          <PhoneStatus connected={snapshot.phoneConnected} />
          <ControlBar onJump={onJump} onReset={onReset} />
        </div>
      </aside>
    </div>
  );
}
