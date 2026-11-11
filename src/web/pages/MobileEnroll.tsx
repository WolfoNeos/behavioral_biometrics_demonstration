import { useEffect, useState } from 'react';
import { collectFingerprint } from '../capture/fingerprint';
import { collectOrientation, requestOrientation } from '../capture/orientation';
import type { Fingerprint } from '../../shared/types';

const UNAVAILABLE =
  "Capteur d'orientation indisponible — ouvrez la page en HTTPS et autorisez l'accès au capteur";

type Saved = { beta: number; fingerprint: Fingerprint };

export function MobileEnroll() {
  const [perm, setPerm] = useState<'idle' | 'granted' | 'failed'>('idle');
  const [beta, setBeta] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    if (perm !== 'granted') return;
    const onEvent = (e: Event): void => {
      const b = (e as DeviceOrientationEvent).beta;
      if (b !== null && b !== undefined && Number.isFinite(b)) setBeta(b);
    };
    window.addEventListener('deviceorientation', onEvent);
    return () => window.removeEventListener('deviceorientation', onEvent);
  }, [perm]);

  const authorize = (): void => {
    // requestOrientation doit etre appelee de facon synchrone dans le geste utilisateur
    void requestOrientation().then((result) => setPerm(result === 'granted' ? 'granted' : 'failed'));
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const readings = await collectOrientation(2000);
      if (readings.length === 0) {
        setError('Aucune mesure reçue');
        return;
      }
      const mean = readings.reduce((s, r) => s + r.beta, 0) / readings.length;
      const fingerprint = await collectFingerprint();
      const res = await fetch('/api/enroll/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, beta: mean }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Échec de l'enregistrement");
        return;
      }
      setSaved({ beta: mean, fingerprint });
    } catch {
      setError("Échec de l'enregistrement");
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <main className="mobile">
        <div className="m-verdict granted" role="status">
          <div className="m-verdict-icon" aria-hidden="true">
            ✓
          </div>
          <h1 className="m-title">Téléphone de A enregistré ✓</h1>
          <p className="m-sub">Inclinaison naturelle : {Math.round(saved.beta)}°</p>
          <p className="m-sub">
            Empreinte : {saved.fingerprint.platform}, {saved.fingerprint.userAgent}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mobile">
      <h1 className="m-title">Enrôlement du téléphone de A</h1>
      {perm === 'idle' && (
        <>
          <p className="m-sub">Tenez le téléphone comme d&apos;habitude, puis autorisez le capteur.</p>
          <button type="button" className="m-btn" onClick={authorize}>
            Autoriser le capteur
          </button>
        </>
      )}
      {perm === 'failed' && (
        <>
          <p className="m-error" role="alert">
            {UNAVAILABLE}
          </p>
          <button type="button" className="m-btn" onClick={authorize}>
            Réessayer
          </button>
        </>
      )}
      {perm === 'granted' && (
        <>
          <div className="beta-value" aria-label="angle beta">
            {beta === null ? '—' : `${Math.round(beta)}°`}
          </div>
          {error && (
            <p className="m-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="m-btn" onClick={() => void save()} disabled={busy}>
            {busy ? 'Mesure en cours…' : 'Enregistrer cette inclinaison'}
          </button>
        </>
      )}
    </main>
  );
}
