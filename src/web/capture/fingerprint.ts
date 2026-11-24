import { CRITERIA } from '../../shared/criteria';
import type { Fingerprint } from '../../shared/types';

/**
 * Relevé de l'empreinte de l'appareil : on collecte TOUS les critères du catalogue
 * (`shared/criteria.ts`) ; la configuration choisit ensuite lesquels comptent. Chaque critère
 * est isolé : un navigateur qui refuse une API donne « unknown », jamais une erreur.
 * Les critères relevés par le serveur (adresse, en-têtes) ne sont pas collectés ici.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

async function sha256Hex(s: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return simpleHash(s);
  try {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return simpleHash(s);
  }
}

const orUnknown = (v: string | undefined | null): string => (v ? v : 'unknown');
const nav = (): Loose => (typeof navigator !== 'undefined' ? navigator : {});
const win = (): Loose => (typeof window !== 'undefined' ? window : {});
const mq = (q: string): string => (win().matchMedia?.(q).matches ? '1' : '0');
const hashList = (items: string[]): string => `${items.length}:${simpleHash(items.join(','))}`;

// ------------------------------------------------------------------ canvas / WebGL / audio

function canvasData(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 5, 80, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Biometrie demo 1.0', 4, 15);
    ctx.strokeStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.arc(150, 25, 15, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL() || 'no-canvas';
  } catch {
    return 'no-canvas';
  }
}

function canvasEmoji(): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 'no-canvas';
  ctx.font = '32px sans-serif';
  const w = ctx.measureText('😀🧑‍🚀🏳️‍🌈🦄').width;
  ctx.fillText('😀🧑‍🚀🏳️‍🌈🦄', 2, 36);
  return `${w}|${simpleHash(ctx.canvas.toDataURL())}`;
}

function canvasGeometry(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'no-canvas';
  const g = ctx.createLinearGradient(0, 0, 120, 60);
  g.addColorStop(0, '#f0a');
  g.addColorStop(1, '#0af');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(60, 30, 50, 20, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'multiply';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#fa0';
  ctx.fillRect(20, 10, 40, 30);
  return simpleHash(canvas.toDataURL());
}

function glContext(kind: 'webgl' | 'webgl2'): Loose {
  const canvas = document.createElement('canvas');
  return canvas.getContext(kind) || (kind === 'webgl' ? canvas.getContext('experimental-webgl') : null);
}

function webglInfo(): string {
  const gl = glContext('webgl');
  if (!gl) return 'no-webgl';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return `${vendor}|${renderer}|${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`;
}

function webglParams(): string {
  const gl = glContext('webgl');
  if (!gl) return 'no-webgl';
  const names = ['MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS'];
  const values = names.map((n) => String(gl.getParameter(gl[n])));
  values.push(String(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)), String(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)), String(gl.getParameter(gl.MAX_VIEWPORT_DIMS)));
  values.push(String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)), String(gl.getParameter(gl.VERSION)));
  return simpleHash(values.join('|'));
}

function webglExtensions(): string {
  const gl = glContext('webgl');
  if (!gl) return 'no-webgl';
  return hashList((gl.getSupportedExtensions() ?? []).sort());
}

function webglPrecision(): string {
  const gl = glContext('webgl');
  if (!gl) return 'no-webgl';
  const out: string[] = [];
  for (const shader of [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER]) {
    for (const type of [gl.LOW_FLOAT, gl.MEDIUM_FLOAT, gl.HIGH_FLOAT, gl.LOW_INT, gl.MEDIUM_INT, gl.HIGH_INT]) {
      const p = gl.getShaderPrecisionFormat(shader, type);
      out.push(p ? `${p.rangeMin},${p.rangeMax},${p.precision}` : 'n/a');
    }
  }
  return simpleHash(out.join('|'));
}

/** Rendu réel d'un dégradé en WebGL : dépend du GPU et du pilote. */
function webglHash(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as Loose;
  if (!gl) return 'no-webgl';
  const compile = (type: number, src: string): Loose => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;void main(){gl_FragColor=vec4(sin(v.x*12.9898)*.5+.5,cos(v.y*78.233)*.5+.5,fract(v.x*v.y*43758.5453),1.);}'));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const pixels = new Uint8Array(64 * 64 * 4);
  gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let h = 0;
  for (let i = 0; i < pixels.length; i += 7) h = (h * 31 + pixels[i]) >>> 0;
  return h.toString(16);
}

function webgl2Info(): string {
  const gl = glContext('webgl2');
  if (!gl) return 'no-webgl2';
  return simpleHash(['MAX_3D_TEXTURE_SIZE', 'MAX_ARRAY_TEXTURE_LAYERS', 'MAX_DRAW_BUFFERS', 'MAX_SAMPLES', 'MAX_UNIFORM_BUFFER_BINDINGS'].map((n) => String(gl.getParameter(gl[n]))).join('|'));
}

async function audioHash(): Promise<string | undefined> {
  const Offline = win().OfflineAudioContext || win().webkitOfflineAudioContext;
  if (!Offline) return undefined;
  const ctx = new Offline(1, 44100, 44100);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 10000;
  const comp = ctx.createDynamicsCompressor();
  for (const [k, v] of [['threshold', -50], ['knee', 40], ['ratio', 12], ['attack', 0], ['release', 0.25]] as const) comp[k].value = v;
  osc.connect(comp);
  comp.connect(ctx.destination);
  osc.start(0);
  const buffer = await ctx.startRendering();
  const data = buffer.getChannelData(0);
  let sum = 0;
  for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
  return sum.toFixed(6);
}

/** Un seul contexte audio partagé par les trois critères (iOS limite leur nombre). */
let sharedAudio: Loose = null;

function audioContextInfo(key: 'sampleRate' | 'latency' | 'channels'): string {
  const Ctx = win().AudioContext || win().webkitAudioContext;
  if (!Ctx) return 'unavailable';
  sharedAudio ??= new Ctx();
  const ctx = sharedAudio;
  if (key === 'sampleRate') return String(ctx.sampleRate);
  if (key === 'channels') return String(ctx.destination.maxChannelCount);
  return `${ctx.baseLatency ?? 'n/a'}|${ctx.outputLatency ?? 'n/a'}`;
}

// ------------------------------------------------------------------ polices, texte

const FONTS_A = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Palatino', 'Garamond', 'Menlo', 'Monaco', 'Roboto', 'Segoe UI', 'Calibri', 'Cambria', 'Optima', 'Avenir', 'Futura', 'Gill Sans', 'American Typewriter', 'Noto Sans'];
const FONTS_B = ['SF Pro', 'SF Mono', 'Helvetica Neue', 'Arial Narrow', 'Baskerville', 'Didot', 'Hoefler Text', 'Marker Felt', 'Noteworthy', 'Papyrus', 'Rockwell', 'Copperplate', 'Bradley Hand', 'Chalkboard', 'Charter', 'Cochin', 'Damascus', 'Geneva', 'Lucida Grande', 'Apple Color Emoji', 'Open Sans', 'Lato', 'Ubuntu', 'Fira Sans', 'Source Sans Pro', 'Droid Sans', 'Cantarell', 'DejaVu Sans'];

function fontsInfo(list: string[]): string {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 'no-canvas';
  const sample = 'mmmmmmmmmmlli0Oo';
  const bases = ['monospace', 'sans-serif', 'serif'];
  const width = (font: string): number => {
    ctx.font = `64px ${font}`;
    return ctx.measureText(sample).width;
  };
  const baseWidths = bases.map((b) => width(b));
  const found = list.filter((f) => bases.some((b, i) => width(`'${f}', ${b}`) !== baseWidths[i]));
  return `${found.length}:${simpleHash(found.join(','))}`;
}

/** Taille du texte réglée sur l'appareil (Dynamic Type sur iPhone, taille de police ailleurs). */
function textSizeInfo(): string {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body;';
  probe.textContent = 'A';
  document.body.appendChild(probe);
  const apple = getComputedStyle(probe).fontSize;
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:medium;';
  const medium = getComputedStyle(probe).fontSize;
  probe.remove();
  return `${apple}|${medium}`;
}

// ------------------------------------------------------------------ navigateur et moteur

const WEB_APIS = ['Bluetooth', 'USB', 'Serial', 'HID', 'XRSystem', 'Gamepad', 'WakeLock', 'CredentialsContainer', 'Clipboard', 'MediaSession', 'Presentation', 'ContactsManager', 'NDEFReader', 'BarcodeDetector', 'ShareData', 'PaymentRequest', 'PushManager', 'Notification', 'ServiceWorker', 'SharedWorker', 'BroadcastChannel', 'IntersectionObserver', 'ResizeObserver', 'PerformanceObserver', 'OffscreenCanvas', 'ImageBitmap', 'WebTransport', 'WebSocket', 'RTCPeerConnection', 'MediaRecorder', 'SpeechSynthesis', 'SpeechRecognition', 'webkitSpeechRecognition', 'Accelerometer', 'Gyroscope', 'AmbientLightSensor', 'Magnetometer', 'DeviceMotionEvent', 'DeviceOrientationEvent', 'TouchEvent', 'PointerEvent', 'Worklet', 'WebAssembly', 'SharedArrayBuffer', 'FileSystemHandle', 'ShowOpenFilePicker', 'EyeDropper', 'Highlight', 'ViewTransition', 'CookieStore', 'LockManager', 'StorageManager'];

function featuresInfo(): string {
  const w = win();
  return hashList(WEB_APIS.filter((n) => n in w || n in nav()));
}

const CSS_TESTS: [string, string][] = [['display', 'grid'], ['display', 'subgrid'], ['aspect-ratio', '1/1'], ['backdrop-filter', 'blur(1px)'], ['color', 'color(display-p3 1 0 0)'], ['color', 'oklch(0.5 0.1 100)'], ['selector(:has(a))', ''], ['container-type', 'inline-size'], ['overscroll-behavior', 'contain'], ['scroll-snap-type', 'x mandatory'], ['text-wrap', 'balance'], ['gap', '1px'], ['inset', '0'], ['accent-color', 'red'], ['font-variation-settings', '"wght" 400'], ['mask-image', 'none'], ['-webkit-touch-callout', 'none'], ['-webkit-text-size-adjust', '100%'], ['contain', 'paint'], ['content-visibility', 'auto'], ['dynamic-range-limit', 'standard'], ['view-transition-name', 'a'], ['animation-timeline', 'scroll()'], ['field-sizing', 'content']];

function cssInfo(): string {
  const supports = (CSS as Loose)?.supports;
  if (!supports) return 'no-css-supports';
  return hashList(CSS_TESTS.map(([p, v]) => (v === '' ? supports(p) : supports(p, v)) ? '1' : '0'));
}

function mathHash(): string {
  const values = [Math.tan(-1e300), Math.sinh(1), Math.cosh(10.5), Math.expm1(1), Math.atanh(0.5), Math.cbrt(100), Math.log1p(1e-10), Math.pow(Math.PI, -100), Math.acosh(1e10), Math.sin(1e22)];
  return simpleHash(values.map(String).join('|'));
}

function timerResolution(): string {
  let min = Infinity;
  let last = performance.now();
  for (let i = 0; i < 2000 && min > 0.001; i++) {
    const now = performance.now();
    if (now > last) min = Math.min(min, now - last);
    last = now;
  }
  return min === Infinity ? 'coarse' : String(Math.round(min * 1000) / 1000);
}

async function uaDetails(): Promise<string | undefined> {
  const data = nav().userAgentData;
  if (!data?.getHighEntropyValues) return undefined;
  const v = await data.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'wow64']);
  return [v.architecture, v.bitness, v.model, v.platformVersion, v.wow64].join('|');
}

function pluginsInfo(): string {
  const list: string[] = Array.from(nav().plugins ?? [], (p: Loose) => String(p.name));
  return hashList(list.sort());
}

function codecsInfo(): string {
  const v = document.createElement('video');
  const types = ['video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="av01.0.05M.08"', 'video/webm; codecs="vp8"', 'video/webm; codecs="vp9"', 'video/ogg; codecs="theora"', 'audio/mpeg', 'audio/mp4; codecs="mp4a.40.2"', 'audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"', 'audio/wav', 'audio/flac', 'application/vnd.apple.mpegurl'];
  return hashList(types.map((t) => v.canPlayType(t) || 'no'));
}

function recorderTypes(): string {
  const R = win().MediaRecorder;
  if (!R?.isTypeSupported) return 'unavailable';
  return hashList(['video/webm', 'video/webm;codecs=vp9', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/ogg'].map((t) => (R.isTypeSupported(t) ? '1' : '0')));
}

async function drmInfo(): Promise<string | undefined> {
  const request = nav().requestMediaKeySystemAccess?.bind(navigator);
  if (!request) return undefined;
  const config = [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }];
  const out: string[] = [];
  for (const ks of ['com.widevine.alpha', 'com.apple.fps', 'com.microsoft.playready']) {
    try {
      await request(ks, config);
      out.push(`${ks}:1`);
    } catch {
      out.push(`${ks}:0`);
    }
  }
  return out.join('|');
}

// ------------------------------------------------------------------ langue et région

function intlOptions(): Intl.ResolvedDateTimeFormatOptions {
  return Intl.DateTimeFormat().resolvedOptions();
}

function dateFormat(): string {
  const d = new Date(Date.UTC(2020, 11, 31, 23, 59, 58));
  return `${d.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'full' })}|${d.toLocaleTimeString(undefined, { timeZone: 'UTC' })}`;
}

function tzOffsets(): string {
  return [0, 3, 6, 9].map((m) => new Date(2021, m, 1).getTimezoneOffset()).join(',');
}

// ------------------------------------------------------------------ stockage et identité

const INSTALL_KEY = 'demo-device-id';
const randomId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

/** Identifiant aléatoire gardé dans le navigateur : créé la première fois, retrouvé ensuite. */
function installId(): string {
  try {
    let id = localStorage.getItem(INSTALL_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(INSTALL_KEY, id);
    }
    return id;
  } catch {
    return 'unavailable';
  }
}

/** Même idée, gardé dans un cookie (autre mécanisme de stockage, autre règle d'effacement). */
function cookieId(): string {
  try {
    const m = document.cookie.match(/(?:^|; )demo-cookie-id=([^;]+)/);
    if (m) return m[1];
    const id = randomId();
    document.cookie = `demo-cookie-id=${id}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    return document.cookie.includes(id) ? id : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** Même idée, gardé dans IndexedDB. */
function idbId(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const idb = win().indexedDB;
    if (!idb) return resolve(undefined);
    const open = idb.open('demo-device', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => resolve('unavailable');
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const get = store.get('id');
      get.onsuccess = () => {
        if (get.result) return resolve(String(get.result));
        const id = randomId();
        store.put(id, 'id');
        tx.oncomplete = () => resolve(id);
      };
      get.onerror = () => resolve('unavailable');
    };
  });
}

async function storageQuota(): Promise<string | undefined> {
  const estimate = await nav().storage?.estimate?.();
  if (!estimate?.quota) return undefined;
  return `${Math.round(estimate.quota / 1e10) * 10}GB`;
}

function storageApis(): string {
  const test = (get: () => unknown): string => {
    try {
      return get() ? '1' : '0';
    } catch {
      return '0';
    }
  };
  return ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'serviceWorker'].map((n) => test(() => (n === 'serviceWorker' ? nav().serviceWorker : win()[n]))).join('');
}

// ------------------------------------------------------------------ autorisations, périphériques, capteurs

async function permissionStates(names: string[]): Promise<string | undefined> {
  if (!nav().permissions) return undefined;
  const states = await Promise.all(
    names.map(async (name) => {
      try {
        const status = await nav().permissions.query({ name });
        return `${name}:${status.state}`;
      } catch {
        return `${name}:n/a`;
      }
    }),
  );
  return states.join('|');
}

async function voicesInfo(): Promise<string | undefined> {
  const synth = globalThis.speechSynthesis;
  if (!synth) return undefined;
  let voices = synth.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      synth.addEventListener('voiceschanged', () => resolve(), { once: true });
      setTimeout(resolve, 400);
    });
    voices = synth.getVoices();
  }
  return `${voices.length}:${simpleHash(voices.map((v) => v.name).sort().join(','))}`;
}

async function mediaInfo(): Promise<string | undefined> {
  const devices = await nav().mediaDevices?.enumerateDevices();
  if (!devices) return undefined;
  const count = (kind: string): number => devices.filter((d: Loose) => d.kind === kind).length;
  return `in:${count('audioinput')}|video:${count('videoinput')}|out:${count('audiooutput')}`;
}

async function batteryInfo(): Promise<string | undefined> {
  const b = await nav().getBattery?.();
  return b ? `${Math.round(b.level * 100)}|${b.charging}` : undefined;
}

function connectionInfo(): string | undefined {
  const c = nav().connection;
  return c ? `${c.effectiveType}|${c.downlink}|${c.rtt}|${c.saveData}|${c.type ?? 'n/a'}` : undefined;
}

/** Types de candidats ICE (sans adresses : elles sont masquées par mDNS et changent à chaque fois). */
function webrtcInfo(): Promise<string | undefined> {
  const RTC = win().RTCPeerConnection;
  if (!RTC) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const pc = new RTC({ iceServers: [] });
    const types = new Set<string>();
    pc.createDataChannel('x');
    pc.onicecandidate = (e: Loose) => {
      if (!e.candidate) {
        pc.close();
        resolve([...types].sort().join(',') || 'none');
        return;
      }
      const m = /typ (\w+)/.exec(e.candidate.candidate);
      if (m) types.add(m[1]);
    };
    pc.createOffer().then((o: Loose) => pc.setLocalDescription(o));
    setTimeout(() => {
      pc.close();
      resolve([...types].sort().join(',') || 'none');
    }, 500);
  });
}

// ------------------------------------------------------------------ registre

type Collector = () => string | undefined | Promise<string | undefined>;

const COLLECTORS: Record<string, Collector> = {
  userAgent: () => nav().userAgent,
  platform: () => nav().platform,
  language: () => nav().language,
  screen: () => (typeof screen !== 'undefined' ? `${screen.width}x${screen.height}x${screen.colorDepth}` : undefined),
  timezone: () => intlOptions().timeZone,
  canvasHash: async () => sha256Hex(canvasData()),
  pixelRatio: () => String(win().devicePixelRatio),
  cores: () => String(nav().hardwareConcurrency),
  memory: () => (nav().deviceMemory === undefined ? 'unavailable' : String(nav().deviceMemory)),
  touchPoints: () => String(nav().maxTouchPoints ?? 0),
  touchSupport: () => `${'ontouchstart' in win() ? 1 : 0}|${typeof win().TouchEvent === 'function' ? 1 : 0}|${typeof win().PointerEvent === 'function' ? 1 : 0}`,
  screenAvail: () => `${screen.availWidth}x${screen.availHeight}`,
  jsHeap: () => (performance as Loose).memory?.jsHeapSizeLimit?.toString() ?? 'unavailable',
  battery: batteryInfo,
  connection: connectionInfo,
  screenOrientation: () => (screen.orientation ? `${screen.orientation.type}|${screen.orientation.angle}` : undefined),
  viewport: () => `${win().innerWidth}x${win().innerHeight}|${win().outerWidth}x${win().outerHeight}|${win().visualViewport?.scale ?? 1}`,
  colorGamut: () => (mq('(color-gamut: rec2020)') === '1' ? 'rec2020' : mq('(color-gamut: p3)') === '1' ? 'p3' : 'srgb'),
  dynamicRange: () => mq('(dynamic-range: high)'),
  pointer: () => `${mq('(pointer: coarse)')}${mq('(pointer: fine)')}${mq('(hover: hover)')}${mq('(any-pointer: fine)')}${mq('(any-hover: hover)')}`,
  reducedMotion: () => mq('(prefers-reduced-motion: reduce)'),
  contrast: () => mq('(prefers-contrast: more)'),
  reducedTransparency: () => mq('(prefers-reduced-transparency: reduce)'),
  reducedData: () => mq('(prefers-reduced-data: reduce)'),
  invertedColors: () => mq('(inverted-colors: inverted)'),
  forcedColors: () => mq('(forced-colors: active)'),
  colorScheme: () => mq('(prefers-color-scheme: dark)'),
  textSize: textSizeInfo,
  webgl: webglInfo,
  webglParams,
  webglExtensions,
  webglPrecision,
  webglHash,
  webgl2: webgl2Info,
  canvasEmoji,
  canvasGeometry,
  fonts: () => fontsInfo(FONTS_A),
  fontsExtra: () => fontsInfo(FONTS_B),
  audioHash,
  audioRate: () => audioContextInfo('sampleRate'),
  audioLatency: () => audioContextInfo('latency'),
  audioChannels: () => audioContextInfo('channels'),
  voices: voicesInfo,
  speechRecognition: () => (win().SpeechRecognition || win().webkitSpeechRecognition ? '1' : '0'),
  media: mediaInfo,
  codecs: codecsInfo,
  recorderTypes,
  drm: drmInfo,
  vendor: () => nav().vendor,
  appVersion: () => nav().appVersion,
  oscpu: () => nav().oscpu ?? 'unavailable',
  plugins: pluginsInfo,
  mimeTypes: () => String(nav().mimeTypes?.length ?? 0),
  uaBrands: () => (nav().userAgentData?.brands ? nav().userAgentData.brands.map((b: Loose) => `${b.brand} ${b.version}`).join(',') : 'unavailable'),
  uaDetails,
  features: featuresInfo,
  css: cssInfo,
  windowProps: () => String(Object.getOwnPropertyNames(win()).length),
  navProps: () => String(Object.getOwnPropertyNames(Object.getPrototypeOf(nav())).length),
  mathHash,
  evalLength: () => `${eval.toString().length}|${Function.prototype.toString.call(Function).length}`,
  timerResolution,
  languages: () => (nav().languages?.length ? nav().languages.join(',') : nav().language),
  hourCycle: () => intlOptions().hourCycle ?? 'default',
  calendar: () => intlOptions().calendar,
  numbering: () => intlOptions().numberingSystem,
  numberFormat: () => new Intl.NumberFormat().format(1234567.891),
  dateFormat,
  tzOffsets,
  cookiesEnabled: () => String(nav().cookieEnabled),
  doNotTrack: () => nav().doNotTrack ?? 'unset',
  pdfViewer: () => String(nav().pdfViewerEnabled ?? 'unavailable'),
  webdriver: () => String(nav().webdriver ?? false),
  permissions: () => permissionStates(['notifications', 'geolocation', 'camera', 'microphone']),
  permissionsExtra: () => permissionStates(['midi', 'persistent-storage', 'push', 'clipboard-read', 'accelerometer', 'gyroscope', 'magnetometer']),
  installId,
  cookieId,
  idbId,
  storage: storageQuota,
  storageApis,
  sensorApis: () => ['Accelerometer', 'Gyroscope', 'Magnetometer', 'AmbientLightSensor', 'DeviceMotionEvent', 'DeviceOrientationEvent'].map((n) => (n in win() ? '1' : '0')).join(''),
  motionPermission: () => `${typeof win().DeviceMotionEvent?.requestPermission === 'function' ? 1 : 0}${typeof win().DeviceOrientationEvent?.requestPermission === 'function' ? 1 : 0}`,
  webrtc: webrtcInfo,
};

/** Résultat d'un collecteur, ou « unknown » s'il échoue ou dépasse le délai (jamais bloquant). */
async function run(collector: Collector, ms = 900): Promise<string> {
  try {
    const value = await Promise.race([
      Promise.resolve().then(collector),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
    ]);
    return orUnknown(value);
  } catch {
    return 'unknown';
  }
}

export async function collectFingerprint(): Promise<Fingerprint> {
  const keys = CRITERIA.filter((d) => !d.server).map((d) => d.key);
  try {
    const values = await Promise.all(keys.map((k) => (COLLECTORS[k] ? run(COLLECTORS[k]) : Promise.resolve('unknown'))));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as unknown as Fingerprint;
  } finally {
    void sharedAudio?.close?.();
    sharedAudio = null;
  }
}
