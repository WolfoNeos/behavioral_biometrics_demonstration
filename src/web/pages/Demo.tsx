import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { FailReason, KeyEvent, LastVerdict, Level, Snapshot, Thresholds, Verdict } from '../../shared/types';
import { attachKeystrokeCapture } from '../capture/keystroke';
import { AngleDial } from '../components/AngleDial';
import { Barcode } from '../components/Barcode';
import { ControlBar } from '../components/ControlBar';
import { DeviceTable, FIELD_LABELS } from '../components/DeviceTable';
import { Gauge } from '../components/Gauge';
import { ThresholdChart } from '../components/ThresholdChart';
import { VerdictCard } from '../components/VerdictCard';
import { liveView, rowsFromLive, rowsFromPerKey, summarize } from '../components/keystrokeRows';
import type { KeyRow } from '../components/keystrokeRows';
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

type Progress = (events: KeyEvent[]) => void;

function LoginForm({
  send,
  onProgress,
  onSubmit,
}: {
  send: Send;
  onProgress: Progress;
  onSubmit: Progress;
}) {
  const pwd = useRef<HTMLInputElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  useEffect(() => {
    const input = pwd.current;
    if (!input) return;
    const detach = attachKeystrokeCapture(
      input,
      (events) => {
        sendRef.current({ type: 'keystroke', events, password: input.value });
        input.value = '';
        submitRef.current(events);
      },
      (events) => progressRef.current(events),
    );
    return () => {
      detach();
      // formulaire retire (saut de niveau, verdict) : plus de frappe en cours
      progressRef.current([]);
    };
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

const msText = (v: number | null) => (v === null ? '–' : `${Math.round(v)} ms`);

/** Frappe : direct (pendant la saisie), mesure du serveur, ou reference seule. */
type KeystrokeMode = 'live' | 'server' | 'reference';

function KeystrokeSignal({ rows, mode }: { rows: KeyRow[]; mode: KeystrokeMode }) {
  const sum = summarize(rows);
  return (
    <div className="keystroke-signal" data-testid="keystroke-view" data-mode={mode}>
      <div className="summary">
        <span>
          Écart moyen : <strong>{msText(sum.dwellGap)}</strong>
        </span>
        <span>
          Vol moyen : <strong>{msText(sum.flight)}</strong>
          {sum.expectedFlight !== null && <span className="summary-ref"> (A : {msText(sum.expectedFlight)})</span>}
        </span>
        <span>
          Touches : <strong>{sum.expected ? `${sum.typed} / ${sum.expected}` : sum.typed}</strong>
        </span>
      </div>
      <ThresholdChart rows={rows} />
      <Barcode rows={rows} />
    </div>
  );
}

/** Lignes du panneau Direct au niveau 1 selon la source (frappe locale > serveur > reference). */
function keystrokeRows(snap: Snapshot, liveRows: KeyRow[] | null): { rows: KeyRow[]; mode: KeystrokeMode } {
  if (liveRows) return { rows: liveRows, mode: 'live' };
  const perKey = snap.live.keystroke?.perKey;
  if (perKey) return { rows: rowsFromPerKey(perKey), mode: 'server' };
  return { rows: rowsFromLive(snap.expectedBars, []), mode: 'reference' };
}

function DirectSignal({ snap, level, liveRows }: { snap: Snapshot; level: Level; liveRows: KeyRow[] | null }) {
  if (level === 1) {
    const { rows, mode } = keystrokeRows(snap, liveRows);
    return <KeystrokeSignal rows={rows} mode={mode} />;
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
    if (!ks || !snap.expectedBars) return <p className="hint">Aucun profil de frappe enregistré.</p>;
    const sum = summarize(rowsFromLive(snap.expectedBars, []));
    const dwell = snap.expectedBars.filter((b) => b.known).map((b) => b.dwell);
    const meanDwell = dwell.length ? dwell.reduce((a, b) => a + b, 0) / dwell.length : null;
    return (
      <>
        <Barcode rows={rowsFromLive(snap.expectedBars, [])} showLive={false} />
        <p className="hint">
          Profil appris sur {ks.samples} saisies · {snap.expectedBars.length} touches · maintien moyen{' '}
          {msText(meanDwell)} · vol moyen {msText(sum.expectedFlight)}
        </p>
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
  // frappe en cours dans le champ mot de passe (vide hors saisie, et des Entree)
  const [typed, setTyped] = useState<KeyEvent[]>([]);
  // frappe envoyee avec Entree, gardee a l'ecran jusqu'a la reponse du serveur
  const [submitted, setSubmitted] = useState<{ events: KeyEvent[]; sig: string } | null>(null);
  // signature du resultat de frappe du serveur : change quand une nouvelle reponse arrive
  const sig = snapshot ? JSON.stringify([snapshot.live.keystroke ?? null, snapshot.lastVerdict]) : '';
  const sigRef = useRef(sig);
  sigRef.current = sig;
  useEffect(() => {
    setSubmitted((s) => (s && s.sig !== sig ? null : s));
  }, [sig]);

  const onJump = (level: Level): void => {
    setSubmitted(null);
    send({ type: 'jump', level });
  };
  const onReset = (): void => {
    setSubmitted(null);
    send({ type: 'reset' });
  };
  const onProgress = (events: KeyEvent[]): void => {
    setTyped(events);
    // une nouvelle touche reprend la main sur la frappe envoyee
    if (events.length > 0) setSubmitted(null);
  };
  const onSubmit = (events: KeyEvent[]): void => setSubmitted({ events, sig: sigRef.current });

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
  // vue provisoire : niveau 1 en attente et frappe locale en cours ; sinon le serveur fait foi
  const atLevel1 = state.status === 'pending' && level === 1 && shown.level === 1;
  const awaiting = atLevel1 && typed.length === 0 && submitted !== null && submitted.sig === sig;
  const shownEvents = typed.length > 0 ? typed : awaiting ? submitted!.events : [];
  const provisional = atLevel1 && shownEvents.length > 0 ? liveView(snapshot.expectedBars, shownEvents) : null;
  const officialScore = liveScore(snapshot, shown.level);

  let main;
  if (state.status === 'granted' || state.status === 'blocked') {
    main = <FinalVerdict verdict={state.verdict} onReset={onReset} />;
  } else if (level === 1) {
    main = <LoginForm send={send} onProgress={onProgress} onSubmit={onSubmit} />;
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
            <div className="gauge-col">
              <Gauge
                score={provisional ? provisional.score : officialScore}
                accept={th.accept}
                warn={th.warn}
              />
              <p className="gauge-caption" data-testid="gauge-caption">
                {provisional
                  ? awaiting
                    ? 'En attente du serveur'
                    : provisional.score !== null
                      ? 'Score provisoire'
                      : ''
                  : officialScore !== null
                    ? 'Score officiel'
                    : ''}
              </p>
            </div>
            <div className="signal">
              <DirectSignal snap={snapshot} level={shown.level} liveRows={provisional?.rows ?? null} />
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
