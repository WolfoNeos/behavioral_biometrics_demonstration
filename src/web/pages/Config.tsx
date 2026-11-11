import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { attachKeystrokeCapture } from '../capture/keystroke';
import { DEFAULT_THRESHOLDS } from '../../shared/types';
import type { KeyEvent, Profile, Thresholds } from '../../shared/types';

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

function Identity({ profile, onSaved }: { profile: Profile | null; onSaved: (password: string, pin: string) => void }) {
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
        onSaved(password, pin);
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
        <button type="submit" className="primary">
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
        <button type="button" onClick={() => reset(false)}>
          Recommencer l&apos;enrôlement
        </button>
        <button type="button" onClick={() => reset(true)}>
          Recalibrage rapide
        </button>
      </div>
    </section>
  );
}

function PhoneEnrol({ profile }: { profile: Profile | null }) {
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
  }, []);

  const enrolled = profile && profile.fingerprint && profile.beta !== null;

  return (
    <section className="card cfg-section">
      <h2>Enrôlement du téléphone de A</h2>
      <p className="hint">Scannez ce code avec le téléphone de A, tenu comme d&apos;habitude.</p>
      <div className="qr-block">
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
          <button type="submit" className="primary">
            Enregistrer les seuils
          </button>
          <button
            type="button"
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

export function Config() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);

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
        <h1>Configuration</h1>
        <Link to="/">← Retour à la démo</Link>
      </header>
      <div className="cfg-columns">
        <Identity
          profile={profile}
          onSaved={(password, pin) => setProfile((p) => (p ? { ...p, password, pin } : p))}
        />
        {thresholds ? (
          <KeystrokeEnrol profile={profile} target={thresholds.enrollSamples} />
        ) : (
          <section className="card cfg-section">
            <p className="hint">Chargement…</p>
          </section>
        )}
        <PhoneEnrol profile={profile} />
        {thresholds && <ThresholdsForm thresholds={thresholds} onSaved={setThresholds} />}
      </div>
    </main>
  );
}
