import { randomUUID } from 'node:crypto';
import { applyVerdict, hardFail, jumpTo, startState } from '../shared/auth/machine';
import { compareFingerprint } from '../shared/scoring/device';
import { normalizeKey, scoreKeystroke } from '../shared/scoring/keystroke';
import { buildExpectedBars } from '../shared/scoring/keystrokeLive';
import { scoreOrientation } from '../shared/scoring/orientation';
import { summarizeTouch } from '../shared/scoring/tactile';
import type {
  AuthState,
  FailReason,
  Fingerprint,
  KeyEvent,
  LastVerdict,
  Level,
  LiveResults,
  OrientationReading,
  PhoneView,
  Profile,
  Snapshot,
  SubmitPayload,
  Thresholds,
  Verdict,
} from '../shared/types';
import { LIVE_ORIENTATION_INTERVAL_MS } from '../shared/types';

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
  /** Tous les telephones attaches : chacun peut soumettre (B puis A sur le meme QR). */
  phones: Set<WsLike>;
  pcs: Set<WsLike>;
  lastVerdict: LastVerdict | null;
  liveOrientation: OrientationReading | null;
  /** Dernier écran annoncé par le téléphone (reflet affiché sur le PC). */
  phoneView: PhoneView | null;
  /** Secret correct ou non, par étape soumise (affiché dans le bilan). */
  secrets: Partial<Record<Level, boolean>>;
  /** Horodatage de la derniere diffusion due a l'orientation en direct. */
  liveSentAt: number;
  liveTimer: ReturnType<typeof setTimeout> | null;
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
    // alpha et gamma peuvent etre null cote navigateur : normalises a 0 ; beta doit etre fini.
    const angle = (v: unknown) => v == null || fin(v);
    const ok = arrOf(msg.readings, (r) => fin(r.beta) && angle(r.alpha) && angle(r.gamma));
    if (!ok) return null;
    const readings = (msg.readings as Record<string, unknown>[]).map(
      (r): OrientationReading => ({
        alpha: (r.alpha as number | null | undefined) ?? 0,
        beta: r.beta as number,
        gamma: (r.gamma as number | null | undefined) ?? 0,
      }),
    );
    // un PIN absent compte comme faux : la page téléphone l'envoie toujours
    return { kind: 'orientation', readings, pin: typeof msg.pin === 'string' ? msg.pin : '' };
  }
  return null;
}

const PHONE_SCREENS = ['connecting', 'pin', 'checking', 'step', 'done'];

/** Valide un message `phoneView` : écran connu, nombre de chiffres borné, touche valide. */
function parsePhoneView(msg: Record<string, unknown>): PhoneView | null {
  const { screen, digits, pressed, again } = msg;
  if (typeof screen !== 'string' || !PHONE_SCREENS.includes(screen)) return null;
  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 8) return null;
  if (pressed !== null && !(typeof pressed === 'string' && /^([0-9]|erase)$/.test(pressed))) return null;
  if (typeof again !== 'boolean') return null;
  return { screen: screen as PhoneView['screen'], digits, pressed, again };
}

/** Valide un message `orientationLive` : beta fini, alpha/gamma finis ou null (-> 0). */
function parseLiveOrientation(msg: Record<string, unknown>): OrientationReading | null {
  const angle = (v: unknown) => v == null || fin(v);
  if (!fin(msg.beta) || !angle(msg.alpha) || !angle(msg.gamma)) return null;
  return {
    alpha: (msg.alpha as number | null | undefined) ?? 0,
    beta: msg.beta,
    gamma: (msg.gamma as number | null | undefined) ?? 0,
  };
}

const isLevel = (v: unknown): v is Level => v === 1 || v === 2 || v === 3;

/** Frappe synthetique du mot de passe ; `offset` en ecarts-types ajoute a dwell et flight. */
function syntheticKeystroke(profile: Profile, offset: number): KeyEvent[] {
  const ks = profile.keystroke;
  if (!ks) return [];
  const events: KeyEvent[] = [];
  let t = 1000;
  [...profile.password].forEach((ch, i) => {
    // meme normalisation que la capture : les majuscules ont une touche comme les autres
    const key = normalizeKey(ch);
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
      phones: new Set(),
      pcs: new Set(),
      lastVerdict: null,
      liveOrientation: null,
      phoneView: null,
      secrets: {},
      liveSentAt: 0,
      liveTimer: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** Nouvelle adresse du front (autre wifi) : les QR se mettent à jour à la prochaine diffusion. */
  setBaseUrl(baseUrl: string): void {
    this.opts.baseUrl = baseUrl;
    this.broadcastAll();
  }

  getBaseUrl(): string {
    return this.opts.baseUrl;
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
      phoneConnected: s.phones.size > 0,
      sessionUrl: this.url(id),
      lastVerdict: s.lastVerdict,
      liveOrientation: s.liveOrientation,
      phoneView: s.phoneView,
      secrets: s.secrets,
      thresholds: this.opts.getThresholds(),
      // reference par position, sans caractere : relue a chaque diffusion (profil modifie)
      expectedBars: buildExpectedBars(p.password, p.keystroke),
    };
  }

  /** Diffuse l'etat a toutes les sessions (seuils ou profil modifies). */
  broadcastAll(): void {
    for (const id of this.sessions.keys()) this.broadcast(id);
  }

  private broadcast(id: string): void {
    const s = this.get(id);
    if (s.liveTimer) {
      clearTimeout(s.liveTimer);
      s.liveTimer = null;
    }
    const msg = JSON.stringify({ type: 'state', ...this.snapshot(id) });
    for (const ws of [...s.pcs, ...s.phones]) {
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

  /** Plusieurs telephones possibles (B puis A sur le meme QR) : aucun n'en ferme un autre. */
  attachPhone(id: string, ws: WsLike): void {
    const s = this.get(id);
    s.phones.add(ws);
    ws.on('message', (data) => this.handleMessage(id, data));
    ws.on('close', () => {
      if (!s.phones.delete(ws)) return;
      if (s.phones.size === 0) {
        s.liveOrientation = null;
        s.phoneView = null;
      }
      if (this.sessions.has(id)) this.broadcast(id);
    });
    ws.on('error', (err) => console.error('erreur ws telephone', err));
    this.broadcast(id);
  }

  submit(id: string, level: Level, payload: SubmitPayload): Verdict {
    const s = this.get(id);
    const profile = this.opts.getProfile();
    const th = this.opts.getThresholds();
    let score = 0;
    let failed: FailReason | null = null;

    if (payload.kind === 'keystroke') {
      const result = profile.keystroke ? scoreKeystroke(profile.keystroke, payload.events) : null;
      if (result) s.live.keystroke = result;
      score = result?.score ?? 0;
      if (payload.password !== profile.password) failed = 'password incorrect';
    } else if (payload.kind === 'pin') {
      const result = profile.fingerprint
        ? compareFingerprint(profile.fingerprint, payload.fingerprint)
        : null;
      if (result) s.live.device = result;
      s.live.tactile = summarizeTouch(payload.taps);
      score = result?.score ?? 0;
      if (payload.pin !== profile.pin) failed = 'PIN incorrect';
    } else {
      const result =
        profile.beta !== null
          ? scoreOrientation(profile.beta, payload.readings, th.orientation.toleranceDeg, th.orientation.accept)
          : null;
      if (result) s.live.orientation = result;
      score = result?.score ?? 0;
      // le PIN est redemandé à cette étape : faux, même avec une bonne posture, on refuse
      if (payload.pin !== undefined && payload.pin !== profile.pin) failed = 'PIN incorrect';
    }
    s.secrets[level] = failed === null;

    const before = s.state;
    let verdict: Verdict;
    if (failed) {
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
    if (before.status === 'pending') {
      s.lastVerdict = {
        level,
        score: verdict.score,
        granted: verdict.granted,
        reason: verdict.granted ? null : (failed ?? 'signal hors seuil'),
      };
    }
    // une soumission quitte toujours l'etape en cours : l'orientation en direct n'a plus cours
    s.liveOrientation = null;
    this.broadcast(id);
    return verdict;
  }

  /** Saut direct : le niveau cible et les suivants repartent sans mesure. */
  jump(id: string, level: Level): void {
    const s = this.get(id);
    s.state = jumpTo(level);
    if (level <= 1) delete s.live.keystroke;
    if (level <= 2) {
      delete s.live.device;
      delete s.live.tactile;
    }
    delete s.live.orientation;
    for (const l of [1, 2, 3] as Level[]) if (l >= level) delete s.secrets[l];
    s.lastVerdict = null;
    s.liveOrientation = null;
    this.broadcast(id);
  }

  reset(id: string): void {
    const s = this.get(id);
    s.state = startState();
    s.live = {};
    s.secrets = {};
    s.lastVerdict = null;
    s.liveOrientation = null;
    this.broadcast(id);
  }

  /** Orientation en direct (niveau 3 en attente) ; diffusion limitee a une par intervalle. */
  private liveOrientationUpdate(id: string, reading: OrientationReading): void {
    const s = this.get(id);
    s.liveOrientation = reading;
    const wait = s.liveSentAt + LIVE_ORIENTATION_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      s.liveSentAt = Date.now();
      this.broadcast(id);
    } else if (!s.liveTimer) {
      s.liveTimer = setTimeout(() => {
        s.liveTimer = null;
        if (!this.sessions.has(id)) return;
        s.liveSentAt = Date.now();
        this.broadcast(id);
      }, wait);
    }
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
      pin: profile.pin,
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
        case 'orientationLive': {
          if (state.status !== 'pending' || state.level !== 3) return;
          const reading = parseLiveOrientation(msg);
          if (reading) this.liveOrientationUpdate(id, reading);
          return;
        }
        case 'phoneView': {
          const view = parsePhoneView(msg);
          if (view) {
            this.get(id).phoneView = view;
            this.broadcast(id);
          }
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
