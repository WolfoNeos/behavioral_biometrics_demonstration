import { useEffect, useRef, useState } from 'react';
import type { FailReason, KeyEvent, LastVerdict, Level, Snapshot, Thresholds } from '../../shared/types';
import { AngleDial } from '../components/AngleDial';
import { LoginForm, PortalShell, StepUp, Suspended, Welcome } from '../components/BankPortal';
import { Barcode } from '../components/Barcode';
import { ConsoleHeader } from '../components/ConsoleHeader';
import { SessionRecap } from '../components/SessionRecap';
import { ControlBar } from '../components/ControlBar';
import { DeviceTable, FIELD_LABELS } from '../components/DeviceTable';
import { Gauge } from '../components/Gauge';
import { ThresholdChart } from '../components/ThresholdChart';
import { liveView, rowsFromLive, rowsFromPerKey, summarize } from '../components/keystrokeRows';
import type { KeyRow } from '../components/keystrokeRows';
import { angleScore } from '../../shared/scoring/orientation';
import { buildRecap } from '../../shared/trust';
import { DEFAULT_WELCOME, sanitizeWelcome } from '../../shared/welcome';
import type { WelcomeContent } from '../../shared/welcome';
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
      <span className="fail-icon" aria-hidden="true">
        !
      </span>
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

const msText = (v: number | null) => (v === null ? '–' : `${Math.round(v)} ms`);

/** Frappe : direct (pendant la saisie), mesure du serveur, ou reference seule. */
type KeystrokeMode = 'live' | 'server' | 'reference';

function KeystrokeSignal({ rows, mode, note }: { rows: KeyRow[]; mode: KeystrokeMode; note: string | null }) {
  const sum = summarize(rows);
  return (
    <div className="keystroke-signal" data-testid="keystroke-view" data-mode={mode}>
      <div className="ks-stats">
        <div className="ks-stat">
          <span className="dial-caption">Écart moyen</span>
          <strong>{msText(sum.dwellGap)}</strong>
        </div>
        <div className="ks-stat">
          <span className="dial-caption">Vol moyen</span>
          <strong>{msText(sum.flight)}</strong>
          {sum.expectedFlight !== null && <span className="summary-ref">A : {msText(sum.expectedFlight)}</span>}
        </div>
        <div className="ks-stat">
          <span className="dial-caption">Touches</span>
          <strong>{sum.expected ? `${sum.typed} / ${sum.expected}` : sum.typed}</strong>
        </div>
      </div>
      <ThresholdChart rows={rows} />
      <Barcode rows={rows} />
      {note && <p className="hint ks-note">{note}</p>}
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
    return <KeystrokeSignal rows={rows} mode={mode} note={profileNote(snap)} />;
  }
  if (level === 2) {
    return <DeviceTable lines={snap.live.device?.lines ?? []} expected={snap.expected.fingerprint} />;
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

/** Résumé du profil de frappe de A (affiché sous la signature de référence). */
function profileNote(snap: Snapshot): string {
  const ks = snap.expected.keystroke;
  if (!ks || !snap.expectedBars) return 'Aucun profil de frappe enregistré.';
  const sum = summarize(rowsFromLive(snap.expectedBars, []));
  const dwell = snap.expectedBars.filter((b) => b.known).map((b) => b.dwell);
  const meanDwell = dwell.length ? dwell.reduce((x, y) => x + y, 0) / dwell.length : null;
  return `Profil de A appris sur ${ks.samples} saisies · ${snap.expectedBars.length} touches · maintien moyen ${msText(meanDwell)} · vol moyen ${msText(sum.expectedFlight)}`;
}

/** Score mesure pour ce niveau ; null si aucune mesure (jauge neutre). */
function liveScore(snap: Snapshot, level: Level): number | null {
  const l = snap.live;
  if (level === 1) return l.keystroke?.score ?? null;
  if (level === 2) return l.device?.score ?? null;
  if (l.orientation) return l.orientation.score;
  // avant « Valider » : le score suit l'angle du téléphone en direct
  if (snap.liveOrientation && snap.expected.beta !== null) {
    const t = snap.thresholds.orientation;
    return angleScore(snap.liveOrientation.beta - snap.expected.beta, t.toleranceDeg, t.accept);
  }
  return null;
}

function levelThresholds(level: Level, t: Thresholds): { accept: number; warn: number } {
  return level === 1 ? t.keystroke : level === 2 ? t.device : t.orientation;
}

/** Contenu de l'écran de réussite, relu à chaque nouvelle réussite (modifiable en configuration). */
function useWelcome(active: boolean): WelcomeContent {
  const [content, setContent] = useState<WelcomeContent>(DEFAULT_WELCOME);
  useEffect(() => {
    if (!active || typeof fetch !== 'function') return;
    let live = true;
    fetch('/api/welcome')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (live && j) setContent(sanitizeWelcome(j));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [active]);
  return content;
}

export function Demo() {
  const { snapshot, send } = useSession();
  const welcome = useWelcome(snapshot?.state.status === 'granted');
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
          <PortalShell>
            <p className="login-sub">Connexion au serveur…</p>
          </PortalShell>
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
  if (state.status === 'granted') {
    main = <Welcome content={welcome} />;
  } else if (state.status === 'blocked') {
    main = <Suspended />;
  } else if (level === 1) {
    main = <LoginForm send={send} onProgress={onProgress} onSubmit={onSubmit} busy={awaiting} />;
  } else {
    main = <StepUp url={snapshot.sessionUrl} level={level} phoneConnected={snapshot.phoneConnected} />;
  }

  const caption = provisional
    ? awaiting
      ? 'En attente du serveur'
      : provisional.score !== null
        ? 'Score provisoire'
        : ''
    : officialScore !== null
      ? shown.level === 3 && !snapshot.live.orientation
        ? 'Score en direct'
        : 'Score officiel'
      : '';
  const recap = buildRecap(snapshot);
  const gauge = (
    <div className="gauge-col">
      <Gauge score={provisional ? provisional.score : officialScore} accept={th.accept} warn={th.warn} />
      <p className="gauge-caption" data-testid="gauge-caption">
        {caption}
      </p>
    </div>
  );
  return (
    <div className="demo">
      <main className="main-zone" data-testid="main-zone">
        <PortalShell>{main}</PortalShell>
      </main>
      <aside className="side side-wide" data-state={state.status}>
        <ConsoleHeader state={state} />
        <section className="panel" data-testid="panel-direct" aria-label="Direct">
          <h2>Direct — {SIGNAL_NAME[shown.level]}</h2>
          {shown.failed && <FailBanner verdict={shown.failed} />}
          <div className="direct-body direct-wide" key={shown.level}>
            <div className="signal">
              <DirectSignal snap={snapshot} level={shown.level} liveRows={provisional?.rows ?? null} />
            </div>
          </div>
        </section>
        {recap ? (
          <section className="panel panel-score panel-recap" data-testid="panel-score" aria-label="Bilan de la session">
            <h2>Bilan de la session</h2>
            <SessionRecap recap={recap} />
          </section>
        ) : (
          <section className="panel panel-score" data-testid="panel-score" aria-label="Score">
            <h2>Score</h2>
            {gauge}
          </section>
        )}
        <div className="control-zone">
          <PhoneStatus connected={snapshot.phoneConnected} />
          <ControlBar onJump={onJump} onReset={onReset} level={level} />
        </div>
      </aside>
    </div>
  );
}
