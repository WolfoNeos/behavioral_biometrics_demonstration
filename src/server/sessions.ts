import { randomUUID } from 'node:crypto';
import { applyVerdict, hardFail, jumpTo, startState } from '../shared/auth/machine';
import { compareFingerprint } from '../shared/scoring/device';
import { scoreKeystroke } from '../shared/scoring/keystroke';
import { scoreOrientation } from '../shared/scoring/orientation';
import { summarizeTouch } from '../shared/scoring/tactile';
import type {
  AuthState,
  Fingerprint,
  KeyEvent,
  Level,
  LiveResults,
  OrientationReading,
  Profile,
  Snapshot,
  SubmitPayload,
  Thresholds,
  Verdict,
} from '../shared/types';

/** Sous-ensemble de WebSocket utilise ici (facilite les faux dans les tests). */
export interface WsLike {
  send(data: string): void;
  close(): void;
  on(event: 'message', cb: (data: unknown) => void): unknown;
  on(event: 'close', cb: () => void): unknown;
  on(event: 'error', cb: (err: unknown) => void): unknown;
}

export interface Session {
  id: string;
  state: AuthState;
  live: LiveResults;
  phone: WsLike | null;
  pcs: Set<WsLike>;
}

export interface SessionManagerOptions {
  getProfile: () => Profile;
  getThresholds: () => Thresholds;
  baseUrl: string;
}

const KIND_LEVEL: Record<SubmitPayload['kind'], Level> = { keystroke: 1, pin: 2, orientation: 3 };

const currentLevel = (s: AuthState): Level => (s.status === 'blocked' ? s.verdict.level : s.level);

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const arrOf = (v: unknown, ok: (x: Record<string, unknown>) => boolean): boolean =>
  Array.isArray(v) && v.every((x) => isObj(x) && ok(x));
const FP_FIELDS = ['userAgent', 'platform', 'language', 'screen', 'timezone', 'canvasHash'];

/** Valide la forme d'un message entrant ; null si invalide. */
function parsePayload(msg: Record<string, unknown>): SubmitPayload | null {
  if (msg.type === 'keystroke') {
    const ok =
      typeof msg.password === 'string' &&
      arrOf(msg.events, (e) => typeof e.key === 'string' && fin(e.down) && fin(e.up));
    return ok
      ? { kind: 'keystroke', events: msg.events as KeyEvent[], password: msg.password as string }
      : null;
  }
  if (msg.type === 'pin') {
    const fp = msg.fingerprint;
    const ok =
      typeof msg.pin === 'string' &&
      isObj(fp) &&
      FP_FIELDS.every((f) => typeof fp[f] === 'string') &&
      arrOf(msg.taps, (t) => fin(t.down) && fin(t.up));
    return ok
      ? {
          kind: 'pin',
          pin: msg.pin as string,
          fingerprint: fp as unknown as Fingerprint,
          taps: msg.taps as { down: number; up: number }[],
        }
      : null;
  }
  if (msg.type === 'orientation') {
    const ok = arrOf(msg.readings, (r) => fin(r.alpha) && fin(r.beta) && fin(r.gamma));
    return ok ? { kind: 'orientation', readings: msg.readings as OrientationReading[] } : null;
  }
  return null;
}

const isLevel =(v: unknown): v is Level => v === 1 || v === 2 || v === 3;

/** Frappe synthetique du mot de passe ; `offset` en ecarts-types ajoute a dwell et flight. */
function syntheticKeystroke(profile: Profile, offset: number): KeyEvent[] {
  const ks = profile.keystroke;
  if (!ks) return [];
  const events: KeyEvent[] = [];
  let t = 1000;
  [...profile.password].forEach((key, i) => {
    const m = ks.mean[key];
    const s = ks.std[key];
    if (!m || !s) return;
    const down = t + (i === 0 ? 0 : m.flight + offset * s.flight);
    const up = down + m.dwell + offset * s.dwell;
    events.push({ key, down, up });
    t = up;
  });
  return events;
}

function otherFingerprint(): Fingerprint {
  return {
    userAgent: 'intrus',
    platform: 'intrus',
    language: 'xx',
    screen: '0x0',
    timezone: 'UTC',
    canvasHash: 'intrus',
  };
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  constructor(private opts: SessionManagerOptions) {}

  create(): Session {
    const session: Session = {
      id: randomUUID(),
      state: startState(),
      live: {},
      phone: null,
      pcs: new Set(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  url(id: string): string {
    return `${this.opts.baseUrl}/m/${id}`;
  }

  private get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Session inconnue : ${id}`);
    return s;
  }

  snapshot(id: string): Snapshot {
    const s = this.get(id);
    const p = this.opts.getProfile();
    return {
      state: s.state,
      level: currentLevel(s.state),
      live: s.live,
      expected: { keystroke: p.keystroke, fingerprint: p.fingerprint, beta: p.beta },
      phoneConnected: s.phone !== null,
      sessionUrl: this.url(id),
    };
  }

  private broadcast(id: string): void {
    const s = this.get(id);
    const msg = JSON.stringify({ type: 'state', ...this.snapshot(id) });
    for (const ws of [...s.pcs, ...(s.phone ? [s.phone] : [])]) {
      try {
        ws.send(msg);
      } catch (err) {
        console.error('envoi ws impossible', err);
      }
    }
  }

  attachPc(id: string, ws: WsLike): void {
    const s = this.get(id);
    s.pcs.add(ws);
    ws.on('message', (data) => this.handleMessage(id, data));
    ws.on('close', () => s.pcs.delete(ws));
    ws.on('error', (err) => console.error('erreur ws pc', err));
    this.broadcast(id);
  }

  /** Un seul telephone actif : le nouveau remplace (et ferme) l'ancien. */
  attachPhone(id: string, ws: WsLike): void {
    const s = this.get(id);
    const previous = s.phone;
    s.phone = ws;
    previous?.close();
    ws.on('message', (data) => {
      if (s.phone === ws) this.handleMessage(id, data);
    });
    ws.on('close', () => {
      if (s.phone !== ws) return;
      s.phone = null;
      this.broadcast(id);
    });
    ws.on('error', (err) => console.error('erreur ws telephone', err));
    this.broadcast(id);
  }

  submit(id: string, level: Level, payload: SubmitPayload): Verdict {
    const s = this.get(id);
    const profile = this.opts.getProfile();
    const th = this.opts.getThresholds();
    let score = 0;
    let failed = false;

    if (payload.kind === 'keystroke') {
      const result = profile.keystroke ? scoreKeystroke(profile.keystroke, payload.events) : null;
      if (result) s.live.keystroke = result;
      score = result?.score ?? 0;
      failed = payload.password !== profile.password;
    } else if (payload.kind === 'pin') {
      const result = profile.fingerprint
        ? compareFingerprint(profile.fingerprint, payload.fingerprint)
        : null;
      if (result) s.live.device = result;
      s.live.tactile = summarizeTouch(payload.taps);
      score = result?.score ?? 0;
      failed = payload.pin !== profile.pin;
    } else {
      const result =
        profile.beta !== null
          ? scoreOrientation(profile.beta, payload.readings, th.orientation.toleranceDeg)
          : null;
      if (result) s.live.orientation = result;
      score = result?.score ?? 0;
    }

    let verdict: Verdict;
    if (failed) {
      const before = s.state;
      s.state = hardFail(before, level);
      verdict =
        before.status === 'pending'
          ? { level, score: 0, color: 'red', granted: false }
          : before.verdict;
    } else {
      const r = applyVerdict(s.state, level, score, th);
      s.state = r.state;
      verdict = r.verdict;
    }
    this.broadcast(id);
    return verdict;
  }

  jump(id: string, level: Level): void {
    this.get(id).state = jumpTo(level);
    this.broadcast(id);
  }

  reset(id: string): void {
    const s = this.get(id);
    s.state = startState();
    s.live = {};
    this.broadcast(id);
  }

  /** A = mesures qui passent le score normal ; B = mesures de l'imposteur. */
  inject(id: string, who: 'A' | 'B', level: Level): Verdict {
    const profile = this.opts.getProfile();
    const tol = this.opts.getThresholds().orientation.toleranceDeg;
    const a = who === 'A';
    if (level === 1) {
      const events = syntheticKeystroke(profile, a ? 0 : 8);
      return this.submit(id, 1, { kind: 'keystroke', events, password: profile.password });
    }
    if (level === 2) {
      const fingerprint = a && profile.fingerprint ? profile.fingerprint : otherFingerprint();
      const taps = [...profile.pin].map((_, i) => ({ down: i * 300, up: i * 300 + 90 }));
      return this.submit(id, 2, { kind: 'pin', pin: profile.pin, fingerprint, taps });
    }
    const beta = (profile.beta ?? 0) + (a ? 0 : 4 * tol);
    return this.submit(id, 3, {
      kind: 'orientation',
      readings: [{ alpha: 0, beta, gamma: 0 }],
    });
  }

  /** Ne lance jamais : tout message invalide ou en erreur est journalise puis ignore. */
  handleMessage(id: string, raw: unknown): void {
    try {
      if (!this.sessions.has(id)) return;
      const msg: unknown = JSON.parse(String(raw));
      if (!isObj(msg) || typeof msg.type !== 'string') return;
      const state = this.get(id).state;
      switch (msg.type) {
        case 'keystroke':
        case 'pin':
        case 'orientation': {
          const level = KIND_LEVEL[msg.type];
          if (state.status !== 'pending' || state.level !== level) return;
          const payload = parsePayload(msg);
          if (payload) this.submit(id, level, payload);
          return;
        }
        case 'jump':
          if (isLevel(msg.level)) this.jump(id, msg.level);
          return;
        case 'reset':
          this.reset(id);
          return;
        case 'god':
          if (state.status === 'pending' && (msg.who === 'A' || msg.who === 'B')) {
            this.inject(id, msg.who, state.level);
          }
          return;
      }
    } catch (err) {
      console.error('message ws ignore', err);
    }
  }
}
