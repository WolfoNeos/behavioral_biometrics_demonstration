/**
 * Catalogue des critères d'empreinte de l'appareil (niveau 2). Tous sont relevés ; ceux qui
 * comptent dans le score se règlent dans la configuration (actif, poids, critère d'identité).
 */
export type CriterionGroup =
  | 'core'
  | 'hardware'
  | 'display'
  | 'graphics'
  | 'audio'
  | 'media'
  | 'browser'
  | 'locale'
  | 'privacy'
  | 'storage'
  | 'sensors'
  | 'network';

export const GROUP_LABELS: Record<CriterionGroup, string> = {
  core: 'Core',
  hardware: 'Hardware',
  display: 'Display & input',
  graphics: 'Graphics',
  audio: 'Audio',
  media: 'Media & codecs',
  browser: 'Browser & engine',
  locale: 'Language & region',
  privacy: 'Privacy & permissions',
  storage: 'Storage & identity',
  sensors: 'Sensors',
  network: 'Network (seen by the server)',
};

export interface CriterionDef {
  key: string;
  label: string;
  group: CriterionGroup;
  /** Poids par défaut dans le score. */
  weight: number;
  /** Critère d'identité : s'il diffère, le score est plafonné (autre navigateur ou autre appareil). */
  identity?: boolean;
  /** Valeur susceptible de changer d'un instant à l'autre : désactivé par défaut. */
  volatile?: boolean;
  /** Relevé par le serveur (en-têtes, adresse) et non par le navigateur. */
  server?: boolean;
}

const c = (
  key: string,
  label: string,
  group: CriterionGroup,
  weight = 1,
  flags: Partial<Pick<CriterionDef, 'identity' | 'volatile' | 'server'>> = {},
): CriterionDef => ({ key, label, group, weight, ...flags });

export const CRITERIA: CriterionDef[] = [
  // --- historiques
  c('userAgent', 'Browser', 'core', 1, { identity: true }),
  c('platform', 'System', 'core'),
  c('language', 'Language', 'core'),
  c('screen', 'Screen', 'core'),
  c('timezone', 'Time zone', 'core'),
  c('canvasHash', 'Canvas fingerprint', 'graphics', 3, { identity: true }),
  // --- matériel
  c('pixelRatio', 'Pixel ratio', 'hardware'),
  c('cores', 'CPU cores', 'hardware'),
  c('memory', 'Memory', 'hardware'),
  c('touchPoints', 'Touch points', 'hardware'),
  c('touchSupport', 'Touch APIs', 'hardware'),
  c('screenAvail', 'Available screen', 'hardware'),
  c('jsHeap', 'JS heap limit', 'hardware'),
  c('battery', 'Battery', 'hardware', 1, { volatile: true }),
  c('connection', 'Connection', 'hardware', 1, { volatile: true }),
  c('screenOrientation', 'Screen orientation', 'hardware', 1, { volatile: true }),
  c('viewport', 'Viewport', 'hardware', 1, { volatile: true }),
  // --- affichage et saisie
  c('colorGamut', 'Color gamut', 'display'),
  c('dynamicRange', 'Dynamic range (HDR)', 'display'),
  c('pointer', 'Pointer & hover', 'display'),
  c('reducedMotion', 'Reduced motion', 'display', 2),
  c('contrast', 'High contrast', 'display', 2),
  c('reducedTransparency', 'Reduced transparency', 'display', 2),
  c('reducedData', 'Reduced data', 'display', 2),
  c('invertedColors', 'Inverted colors', 'display', 2),
  c('forcedColors', 'Forced colors', 'display', 2),
  c('colorScheme', 'Dark mode', 'display', 1, { volatile: true }),
  c('textSize', 'Text size', 'display', 2),
  // --- graphismes
  c('webgl', 'GPU (WebGL)', 'graphics'),
  c('webglParams', 'WebGL limits', 'graphics'),
  c('webglExtensions', 'WebGL extensions', 'graphics'),
  c('webglPrecision', 'WebGL precision', 'graphics'),
  c('webglHash', 'WebGL rendering', 'graphics', 2),
  c('webgl2', 'WebGL 2', 'graphics'),
  c('canvasEmoji', 'Emoji rendering', 'graphics', 2),
  c('canvasGeometry', 'Canvas geometry', 'graphics', 2),
  c('fonts', 'Installed fonts', 'graphics', 2),
  c('fontsExtra', 'More fonts', 'graphics', 2),
  // --- audio
  c('audioHash', 'Audio rendering', 'audio', 2),
  c('audioRate', 'Audio sample rate', 'audio'),
  c('audioLatency', 'Audio latency', 'audio', 1, { volatile: true }),
  c('audioChannels', 'Audio channels', 'audio'),
  c('voices', 'Installed voices', 'audio', 2),
  c('speechRecognition', 'Speech recognition', 'audio'),
  // --- médias
  c('media', 'Media devices', 'media'),
  c('codecs', 'Playable codecs', 'media'),
  c('recorderTypes', 'Recorder formats', 'media'),
  c('drm', 'DRM systems', 'media'),
  // --- navigateur et moteur
  c('vendor', 'Browser vendor', 'browser'),
  c('appVersion', 'App version', 'browser'),
  c('oscpu', 'OS / CPU string', 'browser'),
  c('plugins', 'Plugins', 'browser'),
  c('mimeTypes', 'MIME types', 'browser'),
  c('uaBrands', 'UA brands', 'browser'),
  c('uaDetails', 'UA details (model…)', 'browser', 2),
  c('features', 'Web APIs available', 'browser'),
  c('css', 'CSS features', 'browser'),
  c('windowProps', 'Window properties', 'browser', 1, { volatile: true }),
  c('navProps', 'Navigator properties', 'browser'),
  c('mathHash', 'Math engine', 'browser'),
  c('evalLength', 'JS engine signature', 'browser'),
  c('timerResolution', 'Timer resolution', 'browser', 1, { volatile: true }),
  // --- langue et région
  c('languages', 'Languages', 'locale', 2),
  c('hourCycle', 'Hour cycle', 'locale', 2),
  c('calendar', 'Calendar', 'locale', 2),
  c('numbering', 'Numbering system', 'locale', 2),
  c('numberFormat', 'Number format', 'locale', 2),
  c('dateFormat', 'Date format', 'locale', 2),
  c('tzOffsets', 'DST offsets', 'locale'),
  // --- vie privée et autorisations
  c('cookiesEnabled', 'Cookies enabled', 'privacy', 2),
  c('doNotTrack', 'Do Not Track', 'privacy', 2),
  c('pdfViewer', 'PDF viewer', 'privacy', 2),
  c('webdriver', 'Automation flag', 'privacy', 1),
  c('permissions', 'Granted permissions', 'privacy', 2),
  c('permissionsExtra', 'More permissions', 'privacy', 2),
  // --- stockage et identité
  c('installId', 'Browser-stored ID', 'storage', 3, { identity: true }),
  c('cookieId', 'Cookie ID', 'storage', 3),
  c('idbId', 'IndexedDB ID', 'storage', 3),
  c('storage', 'Storage quota', 'storage'),
  c('storageApis', 'Storage APIs', 'storage'),
  // --- capteurs
  c('sensorApis', 'Sensor APIs', 'sensors'),
  c('motionPermission', 'Motion permission API', 'sensors'),
  c('webrtc', 'WebRTC candidates', 'sensors'),
  // --- réseau (relevé par le serveur)
  c('ip', 'IP address', 'network', 3, { server: true }),
  c('ipVersion', 'IP version', 'network', 1, { server: true }),
  c('acceptLanguage', 'Accept-Language header', 'network', 2, { server: true }),
];

export const CRITERIA_BY_KEY: Record<string, CriterionDef> = Object.fromEntries(CRITERIA.map((d) => [d.key, d]));
export const CRITERIA_KEYS: string[] = CRITERIA.map((d) => d.key);
export const SERVER_KEYS: string[] = CRITERIA.filter((d) => d.server).map((d) => d.key);
/** Les six critères historiques : un client plus ancien n'envoie que ceux-là. */
export const CORE_KEYS = ['userAgent', 'platform', 'language', 'screen', 'timezone', 'canvasHash'] as const;

/** Réglage d'un critère dans la configuration (tout est facultatif : défaut = catalogue). */
export interface CriterionSetting {
  enabled: boolean;
  weight: number;
  identity: boolean;
}
export type CriteriaOverrides = Record<string, Partial<CriterionSetting>>;

/** Réglage effectif de chaque critère : le catalogue, surchargé par la configuration. */
export function resolveCriteria(overrides: CriteriaOverrides = {}): Record<string, CriterionSetting> {
  const out: Record<string, CriterionSetting> = {};
  for (const d of CRITERIA) {
    const o = overrides[d.key] ?? {};
    out[d.key] = {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : !d.volatile,
      weight: typeof o.weight === 'number' && Number.isFinite(o.weight) && o.weight >= 0 ? o.weight : d.weight,
      identity: typeof o.identity === 'boolean' ? o.identity : !!d.identity,
    };
  }
  return out;
}

/** Normalise des réglages reçus : critères connus seulement, valeurs valides seulement. */
export function sanitizeCriteria(raw: unknown): CriteriaOverrides {
  const out: CriteriaOverrides = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!CRITERIA_BY_KEY[key] || value === null || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const s: Partial<CriterionSetting> = {};
    if (typeof v.enabled === 'boolean') s.enabled = v.enabled;
    if (typeof v.weight === 'number' && Number.isFinite(v.weight) && v.weight >= 0) s.weight = Math.min(v.weight, 10);
    if (typeof v.identity === 'boolean') s.identity = v.identity;
    if (Object.keys(s).length > 0) out[key] = s;
  }
  return out;
}
