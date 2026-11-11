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

const isLevel = (v: unknown): v is Level => v === 1 || v === 2 || v === 3;

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
    for (const ws of [...s.pcs, ...(s.phone ? [s.phone] : [])]) ws.send(msg);
  }

  attachPc(id: string, ws: WsLike): void {
    const s = this.get(id);
    s.pcs.add(ws);
    ws.on('message', (data) => this.handleMessage(id, data));
    ws.on('close', () => s.pcs.delete(ws));
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

  handleMessage(id: string, raw: unknown): void {
    if (!this.sessions.has(id)) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }
    const state = this.get(id).state;
    switch (msg.type) {
      case 'keystroke':
      case 'pin':
      case 'orientation': {
        const level = KIND_LEVEL[msg.type];
        if (state.status !== 'pending' || state.level !== level) return;
        this.submit(id, level, { ...msg, kind: msg.type } as SubmitPayload);
        return;
      }
      case 'jump':
        if (isLevel(msg.level)) this.jump(id, msg.level);
        return;
      case 'reset':
        this.reset(id);
        return;
      case 'god':
        if (msg.who === 'A' || msg.who === 'B') {
          this.inject(id, msg.who, currentLevel(state));
        }
        return;
    }
  }
}
