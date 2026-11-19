import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { attachKeystrokeCapture } from '../capture/keystroke';
import { DEFAULT_THRESHOLDS } from '../../shared/types';
import type { KeyEvent, Profile, Thresholds } from '../../shared/types';
import { DEFAULT_WELCOME, MAX_TRANSACTIONS, sanitizeWelcome } from '../../shared/welcome';
import type { WelcomeContent } from '../../shared/welcome';

const QUICK_SAMPLES = 3;
const POLL_MS = 2000;

type FormValues = Record<string, string>;

const FIELDS: { key: string; label: string }[] = [
  { key: 'ks.accept', label: 'Frappe : seuil d’acceptation' },
  { key: 'ks.warn', label: 'Frappe : seuil d’alerte' },
  { key: 'dev.accept', label: 'Appareil : seuil d’acceptation' },
  { key: 'dev.warn', label: 'Appareil : seuil d’alerte' },
  { key: 'ori.accept', label: 'Posture : seuil d’acceptation' },
  { key: 'ori.warn', label: 'Posture : seuil d’alerte' },
  { key: 'ori.tol', label: 'Posture : tolérance (degrés)' },
  { key: 'n', label: "Nombre d'échantillons d'enrôlement" },
];

const toForm = (t: Thresholds): FormValues => ({
  'ks.accept': String(t.keystroke.accept),
  'ks.warn': String(t.keystroke.warn),
  'dev.accept': String(t.device.accept),
  'dev.warn': String(t.device.warn),
  'ori.accept': String(t.orientation.accept),
  'ori.warn': String(t.orientation.warn),
  'ori.tol': String(t.orientation.toleranceDeg),
  n: String(t.enrollSamples),
});

const fromForm = (f: FormValues): Thresholds => ({
  keystroke: { accept: Number(f['ks.accept']), warn: Number(f['ks.warn']) },
  device: { accept: Number(f['dev.accept']), warn: Number(f['dev.warn']) },
  orientation: {
    accept: Number(f['ori.accept']),
    warn: Number(f['ori.warn']),
    toleranceDeg: Number(f['ori.tol']),
  },
  enrollSamples: Number(f.n),
});

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Erreur ${res.status}`;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function Identity({ profile, onSaved }: { profile: Profile | null; onSaved: (saved: Profile) => void }) {
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (profile && !initialised.current) {
      initialised.current = true;
      setPassword(profile.password);
      setPin(profile.pin);
    }
  }, [profile]);

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setMsg(null);
    try {
      const current = (await (await fetch('/api/profile')).json()) as Profile;
      const res = await fetch('/api/profile', jsonInit('PUT', { ...current, password, pin }));
      if (res.ok) {
        // le serveur efface le profil de frappe si le mot de passe a change
        onSaved((await res.json()) as Profile);
        setMsg({ ok: true, text: 'Identité enregistrée' });
      } else {
        setMsg({ ok: false, text: await errorMessage(res) });
      }
    } catch {
      setMsg({ ok: false, text: 'Serveur injoignable' });
    }
  };

  return (
    <section className="card cfg-section">
      <h2>Identité de A</h2>
      <form className="cfg-form" onSubmit={(e) => void save(e)}>
        <label>
          Mot de passe
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Code PIN
          <input type="text" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary">
          Enregistrer l&apos;identité
        </button>
        {msg && (
          <p className={msg.ok ? 'cfg-ok' : 'cfg-error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}

function KeystrokeEnrol({ profile, target: configured }: { profile: Profile | null; target: number }) {
  const [quick, setQuick] = useState(false);
  const [count, setCount] = useState(0);
  const [done, setDone] = useState<{ n: number; keys: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const samples = useRef<KeyEvent[][]>([]);
  const collectedFor = useRef<string | null>(null);
  const finished = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const target = quick ? QUICK_SAMPLES : configured;
  const latest = useRef({ password: profile?.password ?? '', target });
  latest.current = { password: profile?.password ?? '', target };

  const reset = useCallback((nextQuick: boolean): void => {
    samples.current = [];
    collectedFor.current = null;
    finished.current = false;
    generation.current += 1;
    setCount(0);
    setDone(null);
    setError(null);
    setQuick(nextQuick);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  useEffect(() => {
    samples.current = [];
    collectedFor.current = null;
    finished.current = false;
    generation.current += 1;
    setCount(0);
    setDone(null);
  }, [configured]);

  // mot de passe modifie : les echantillons deja collectes ne valent plus
  const savedPassword = profile?.password;
  useEffect(() => {
    if (samples.current.length > 0 && collectedFor.current !== savedPassword) {
      samples.current = [];
      collectedFor.current = null;
      finished.current = false;
    generation.current += 1;
      setCount(0);
      setDone(null);
      setError(null);
    }
  }, [savedPassword]);

  const submit = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    const gen = generation.current;
    const all = samples.current.slice();
    try {
      const res = await fetch('/api/enroll/keystroke', jsonInit('POST', { samples: all }));
      const failure = res.ok ? null : await errorMessage(res);
      if (gen !== generation.current) return; // echantillons reinitialises entre-temps
      if (failure !== null) {
        setError(failure);
        return;
      }
      const keys = all.reduce((s, a) => s + a.length, 0) / all.length;
      finished.current = true;
      setError(null);
      setDone({ n: all.length, keys: Math.round(keys) });
    } catch {
      if (gen === generation.current) setError('Serveur injoignable');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    return attachKeystrokeCapture(input, (events) => {
      const typed = input.value;
      input.value = '';
      const { password, target: goal } = latest.current;
      if (samples.current.length >= goal) {
        // envoi precedent echoue : l'Entree suivante retente le POST
        if (!finished.current) void submit();
        return;
      }
      if (typed !== password) {
        setError('Le texte saisi ne correspond pas au mot de passe : échantillon refusé');
        return;
      }
      setError(null);
      collectedFor.current = password;
      samples.current.push(events);
      setCount(samples.current.length);
      if (samples.current.length === goal) void submit();
    });
  }, [submit]);

  return (
    <section className="card cfg-section">
      <h2>Enrôlement de la frappe</h2>
      <p className="hint">
        Saisissez le mot de passe puis appuyez sur Entrée, à chaque échantillon.
        {quick && ' Recalibrage rapide : moins précis, remplace le profil de frappe.'}
      </p>
      {profile?.keystroke && count === 0 && (
        <p className="cfg-ok" role="status">
          {`Frappe déjà enrôlée (${profile.keystroke.samples} échantillons). Ré-enrôler ou « Recalibrage rapide » la remplace.`}
        </p>
      )}
      <p className="hint">
        Le texte saisi doit correspondre au mot de passe enregistré (modifiez-le d&apos;abord dans « Identité » puis
        enregistrez).
      </p>
      <div className="cfg-counter" aria-live="polite">
        <span className="cfg-count">{`${count} / ${target}`}</span>
      </div>
      <label className="cfg-form">
        Saisie du mot de passe
        <input ref={inputRef} type="password" autoComplete="off" className="cfg-capture" />
      </label>
      {error && (
        <p className="cfg-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="cfg-ok" role="status">
          Enrôlement terminé ✓ : {done.n} échantillons, environ {done.keys} touches par saisie
        </p>
      )}
      <div className="cfg-actions">
        <button type="button" className="btn btn-secondary" onClick={() => reset(false)}>
          Recommencer l&apos;enrôlement
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => reset(true)}>
          Recalibrage rapide
        </button>
      </div>
    </section>
  );
}

function PhoneEnrol({ profile, netVersion }: { profile: Profile | null; netVersion: number }) {
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      let origin = window.location.origin;
      try {
        const res = await fetch('/api/session', { method: 'POST' });
        const body = (await res.json()) as { url: string };
        origin = new URL(body.url).origin;
      } catch {
        // repli sur l'origine courante
      }
      const url = `${origin}/m-enroll`;
      if (!live) return;
      setLink(url);
      try {
        const data = await QRCode.toDataURL(url, { width: 240, margin: 1 });
        if (live) setQr(data);
      } catch {
        // le lien texte reste utilisable
      }
    })();
    return () => {
      live = false;
    };
  }, [netVersion]);

  const enrolled = profile && profile.fingerprint && profile.beta !== null;

  return (
    <section className="card cfg-section">
      <h2>Enrôlement du téléphone de A</h2>
      <p className="hint">Scannez ce code avec le téléphone de A, tenu comme d&apos;habitude.</p>
      <div className="cfg-qr">
        {qr && <img src={qr} alt="QR code vers la page d'enrôlement du téléphone" width={240} height={240} />}
        {link && <code className="cfg-link">{link}</code>}
      </div>
      {enrolled ? (
        <p className="cfg-ok" role="status">
          {`Téléphone enregistré ✓ (inclinaison ${Math.round(profile.beta as number)}°)`}
        </p>
      ) : (
        <p className="hint">Téléphone non enregistré</p>
      )}
    </section>
  );
}

function ThresholdsForm({
  thresholds,
  onSaved,
}: {
  thresholds: Thresholds;
  onSaved: (t: Thresholds) => void;
}) {
  const [form, setForm] = useState<FormValues>(() => toForm(thresholds));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (values: Thresholds): Promise<void> => {
    setMsg(null);
    try {
      const res = await fetch('/api/thresholds', jsonInit('PUT', values));
      if (!res.ok) {
        setMsg({ ok: false, text: await errorMessage(res) });
        return;
      }
      const saved = (await res.json()) as Thresholds;
      setForm(toForm(saved));
      onSaved(saved);
      setMsg({ ok: true, text: 'Seuils enregistrés' });
    } catch {
      setMsg({ ok: false, text: 'Serveur injoignable' });
    }
  };

  return (
    <section className="card cfg-section">
      <h2>Seuils</h2>
      <form
        className="cfg-form cfg-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save(fromForm(form));
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <div className="cfg-actions">
          <button type="submit" className="btn btn-primary">
            Enregistrer les seuils
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setForm(toForm(DEFAULT_THRESHOLDS));
              void save(DEFAULT_THRESHOLDS);
            }}
          >
            Valeurs par défaut
          </button>
        </div>
        {msg && (
          <p className={msg.ok ? 'cfg-ok' : 'cfg-error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}

interface NetCandidate {
  name: string;
  address: string;
  url: string;
  active: boolean;
  covered: boolean | null;
}
interface NetInfo {
  baseUrl: string;
  source: 'env' | 'auto' | 'manual';
  https: boolean;
  candidates: NetCandidate[];
  certValidTo: string | null;
  covered: boolean | null;
  certCommand: string;
}

const SOURCE_LABEL = { env: 'variable DEMO_BASE_URL', auto: 'détection automatique', manual: 'saisie manuelle' } as const;

/** Réseau : adresse encodée dans les QR, à changer en un clic quand on change de wifi. */
function NetworkCard({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/network');
      if (!res.ok) throw new Error('indisponible');
      setInfo((await res.json()) as NetInfo);
    } catch {
      setMsg({ ok: false, text: 'Réseau indisponible' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (request: Promise<Response>, okText: string): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await request;
      if (!res.ok) {
        setMsg({ ok: false, text: await errorMessage(res) });
        return;
      }
      setInfo((await res.json()) as NetInfo);
      setMsg({ ok: true, text: okText });
      onChanged();
    } catch {
      setMsg({ ok: false, text: 'Serveur injoignable' });
    } finally {
      setBusy(false);
    }
  };

  const use = (baseUrl: string): Promise<void> =>
    apply(fetch('/api/network', jsonInit('PUT', { baseUrl })), 'Adresse mise à jour : les QR codes pointent vers le nouveau réseau');

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // presse-papiers indisponible : la commande reste affichée
    }
  };

  return (
    <section className="card cfg-section cfg-network" aria-label="Réseau">
      <div className="cfg-head">
        <h2>Réseau</h2>
        <p className="hint">Adresse des QR codes : à changer quand la démo passe sur un autre wifi.</p>
      </div>
      {info && (
        <>
          <div className="net-current">
            <code className="net-url" data-testid="net-url">
              {info.baseUrl}
            </code>
            <div className="net-chips">
              <span className={info.https ? 'chip chip-ok' : 'chip'}>{info.https ? 'HTTPS' : 'HTTP'}</span>
              {info.covered !== null && (
                <span className={info.covered ? 'chip chip-ok' : 'chip chip-warn'}>
                  {info.covered ? 'Certificat valide pour cette adresse' : 'Certificat non valable pour cette adresse'}
                </span>
              )}
              <span className="chip">{SOURCE_LABEL[info.source]}</span>
            </div>
          </div>
          {info.covered === false && (
            <div className="net-alert" role="alert">
              <p>
                Le certificat HTTPS ne couvre pas cette adresse : les téléphones afficheront une alerte et le
                capteur de mouvement sera bloqué. Régénérez-le puis relancez la démo :
              </p>
              <div className="net-cmd">
                <code>{info.certCommand}</code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(info.certCommand)}>
                  {copied ? 'Copié ✓' : 'Copier'}
                </button>
              </div>
            </div>
          )}
          <div className="net-list">
            <h3>Réseaux détectés</h3>
            {info.candidates.length === 0 && <p className="hint">Aucun réseau détecté : branchez-vous puis actualisez.</p>}
            {info.candidates.map((c) => (
              <div key={c.url} className={c.active ? 'net-row active' : 'net-row'}>
                <div className="net-row-main">
                  <strong>{c.address}</strong>
                  <span>{c.name}</span>
                </div>
                {c.covered === false && <span className="chip chip-warn">Certificat à régénérer</span>}
                {c.active ? (
                  <span className="chip chip-ok">Utilisé</span>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void use(c.url)}>
                    Utiliser
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <form
        className="net-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void use(manual.trim());
        }}
      >
        <label>
          Adresse manuelle
          <input
            type="text"
            value={manual}
            placeholder="192.168.1.20 ou https://…"
            onChange={(e) => setManual(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy || !manual.trim()}>
          Appliquer
        </button>
      </form>
      <div className="cfg-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void apply(fetch('/api/network/detect', { method: 'POST' }), 'Réseau détecté automatiquement')}
        >
          Détecter automatiquement
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load()}>
          Actualiser la liste
        </button>
      </div>
      {msg && (
        <p className={msg.ok ? 'cfg-ok' : 'cfg-error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

/** Écran affiché une fois la sécurité passée : textes, solde et petites blagues à régler. */
function WelcomeEditor() {
  const [form, setForm] = useState<WelcomeContent>(DEFAULT_WELCOME);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/welcome')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (live && j) setForm(sanitizeWelcome(j));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const set = (patch: Partial<WelcomeContent>): void => setForm((f) => ({ ...f, ...patch }));
  const setTxn = (i: number, patch: Partial<WelcomeContent['transactions'][number]>): void =>
    setForm((f) => ({ ...f, transactions: f.transactions.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));

  const save = async (content: WelcomeContent): Promise<void> => {
    setMsg(null);
    try {
      const res = await fetch('/api/welcome', jsonInit('PUT', content));
      if (!res.ok) {
        setMsg({ ok: false, text: await errorMessage(res) });
        return;
      }
      setForm(sanitizeWelcome(await res.json()));
      setMsg({ ok: true, text: 'Écran de réussite enregistré' });
    } catch {
      setMsg({ ok: false, text: 'Serveur injoignable' });
    }
  };

  return (
    <section className="card cfg-section" aria-label="Écran de réussite">
      <div className="cfg-head">
        <h2>Écran de réussite</h2>
        <p className="hint">Ce que voit le public une fois la sécurité passée : place aux petites blagues.</p>
      </div>
      <form
        className="cfg-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(form);
        }}
      >
        <label>
          Prénom ou surnom (salutation)
          <input type="text" value={form.name} placeholder="ex. Professeur" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="cfg-grid">
          <label>
            Intitulé du compte
            <input type="text" value={form.accountLabel} onChange={(e) => set({ accountLabel: e.target.value })} />
          </label>
          <label>
            Solde
            <input type="text" value={form.balance} onChange={(e) => set({ balance: e.target.value })} />
          </label>
        </div>
        <label>
          Message du conseiller
          <textarea rows={2} value={form.notice} onChange={(e) => set({ notice: e.target.value })} />
        </label>
        <fieldset className="cfg-txns">
          <legend>Dernières opérations</legend>
          {form.transactions.map((t, i) => (
            <div className="cfg-txn" key={i}>
              <input
                type="text"
                className="txn-in-icon"
                aria-label={`Icône ${i + 1}`}
                value={t.icon}
                onChange={(e) => setTxn(i, { icon: e.target.value })}
              />
              <input
                type="text"
                className="txn-in-label"
                aria-label={`Libellé ${i + 1}`}
                value={t.label}
                onChange={(e) => setTxn(i, { label: e.target.value })}
              />
              <input
                type="text"
                className="txn-in-amount"
                aria-label={`Montant ${i + 1}`}
                value={t.amount}
                onChange={(e) => setTxn(i, { amount: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Supprimer l’opération ${i + 1}`}
                onClick={() => setForm((f) => ({ ...f, transactions: f.transactions.filter((_, k) => k !== i) }))}
              >
                ✕
              </button>
            </div>
          ))}
          {form.transactions.length < MAX_TRANSACTIONS && (
            <button
              type="button"
              className="btn btn-secondary btn-sm cfg-add"
              onClick={() =>
                setForm((f) => ({ ...f, transactions: [...f.transactions, { icon: '💸', label: '', amount: '' }] }))
              }
            >
              + Ajouter une opération
            </button>
          )}
        </fieldset>
        <div className="cfg-actions">
          <button type="submit" className="btn btn-primary">
            Enregistrer
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setForm(DEFAULT_WELCOME);
              void save(DEFAULT_WELCOME);
            }}
          >
            Textes par défaut
          </button>
        </div>
        {msg && (
          <p className={msg.ok ? 'cfg-ok' : 'cfg-error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}

export function Config() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [netVersion, setNetVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const refresh = (): void => {
      fetch('/api/profile')
        .then((r) => r.json() as Promise<Profile>)
        .then((p) => {
          if (live) setProfile(p);
        })
        .catch(() => undefined);
    };
    refresh();
    fetch('/api/thresholds')
      .then((r) => r.json() as Promise<Thresholds>)
      .then((t) => {
        if (live) setThresholds(t);
      })
      .catch(() => undefined);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="config">
      <header className="cfg-header">
        <div>
          <h1>Configuration</h1>
          <p>Préparer la démo : réseau, identité de A, enrôlements et seuils</p>
        </div>
        <Link to="/" className="btn btn-light">
          ← Retour à la démo
        </Link>
      </header>
      <NetworkCard onChanged={() => setNetVersion((v) => v + 1)} />
      <div className="cfg-columns">
        <div className="cfg-col">
          <Identity profile={profile} onSaved={setProfile} />
          <PhoneEnrol profile={profile} netVersion={netVersion} />
        </div>
        <div className="cfg-col">
          {thresholds ? (
            <KeystrokeEnrol profile={profile} target={thresholds.enrollSamples} />
          ) : (
            <section className="card cfg-section">
              <p className="hint">Chargement…</p>
            </section>
          )}
          {thresholds && <ThresholdsForm thresholds={thresholds} onSaved={setThresholds} />}
          <WelcomeEditor />
        </div>
      </div>
    </main>
  );
}
