import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { KeyEvent } from '../../shared/types';
import { attachKeystrokeCapture } from '../capture/keystroke';
import type { ClientMessage } from '../ws';

/**
 * Côté gauche de la démo : un portail d'e-banking (banque fictive). Aucune raison de refus n'y
 * apparaît : un doute sur l'identité se traduit seulement par une vérification supplémentaire.
 */

export const BANK_NAME = 'Vérane';

export function Logo() {
  return (
    <svg className="bank-logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" />
      <path d="M8 11 L16 23 L24 11" />
    </svg>
  );
}

export function Lock() {
  return (
    <svg className="bank-lock" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7" />
    </svg>
  );
}

/** Cadre commun : en-tête, contenu centré, pied de page. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <Logo />
          <span className="portal-name">{BANK_NAME}</span>
          <span className="portal-tag">e-banking</span>
        </div>
        <span className="portal-secure">
          <Lock /> Connexion sécurisée
        </span>
      </header>
      <div className="portal-body">{children}</div>
      <footer className="portal-footer">
        <span>Aide</span>
        <span>Sécurité</span>
        <span>Contact</span>
        <span className="portal-demo">Maquette de démonstration — banque fictive</span>
      </footer>
    </div>
  );
}

type Progress = (events: KeyEvent[]) => void;

export function LoginForm({
  send,
  onProgress,
  onSubmit,
  busy,
}: {
  send: (msg: ClientMessage) => void;
  onProgress: Progress;
  onSubmit: Progress;
  /** Frappe envoyée, réponse du serveur attendue. */
  busy: boolean;
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

  // le bouton passe par le même chemin que la touche Entrée (frappe capturée)
  const submit = (): void => {
    pwd.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  return (
    <form
      className="login-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2>Connexion à votre espace</h2>
      <p className="login-sub">Accédez à vos comptes en toute sécurité.</p>
      <label>
        Identifiant
        <input type="text" name="id" autoComplete="off" placeholder="N° de contrat" />
      </label>
      <label>
        Mot de passe
        <input ref={pwd} type="password" name="password" autoComplete="off" placeholder="••••••••" />
      </label>
      <button type="submit" className="login-btn" disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> Vérification en cours…
          </>
        ) : (
          'Se connecter'
        )}
      </button>
      <span className="login-link">Mot de passe oublié ?</span>
    </form>
  );
}

/** Vérification supplémentaire : QR code à scanner, sans détail sur ce qui l'a déclenchée. */
export function StepUp({
  url,
  level,
  phoneConnected,
}: {
  url: string;
  level: 2 | 3;
  phoneConnected: boolean;
}) {
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
    <div className="login-card stepup" key={level}>
      <div className="stepup-badge" aria-hidden="true">
        <Lock />
      </div>
      <h2>{level === 2 ? 'Vérification supplémentaire' : 'Une dernière vérification'}</h2>
      <p className="login-sub">
        {level === 2
          ? 'Par mesure de sécurité, confirmez votre identité avec votre téléphone. Scannez ce code puis saisissez votre code PIN.'
          : 'Pour finaliser votre connexion, scannez à nouveau ce code avec votre appareil habituel et suivez les instructions.'}
      </p>
      <div className="qr-frame">
        {src ? (
          <img src={src} alt={`QR code de la session ${url}`} width={260} height={260} />
        ) : (
          <div className="qr-skeleton" />
        )}
      </div>
      <p className={phoneConnected ? 'stepup-status ok' : 'stepup-status'} role="status">
        {phoneConnected ? (
          'Appareil connecté — suivez les instructions sur votre téléphone'
        ) : (
          <>
            En attente de votre confirmation
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </>
        )}
      </p>
    </div>
  );
}

const TRANSACTIONS = [
  { label: 'Salaire — Octobre', amount: '+ 4 850,00', credit: true },
  { label: 'Loyer', amount: '− 1 620,00', credit: false },
  { label: 'Supermarché', amount: '− 86,40', credit: false },
];

/** Accès accordé : animation de validation puis aperçu de l'espace client. */
export function Welcome() {
  return (
    <div className="welcome" role="status" aria-label="verdict">
      <svg className="success-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27 L23 35 L38 18" />
      </svg>
      <h2>Connexion réussie</h2>
      <p className="login-sub">Bienvenue dans votre espace {BANK_NAME}.</p>
      <div className="account-card">
        <span className="account-label">Compte courant · •••• 4821</span>
        <span className="account-balance">
          12 480,35 <small>CHF</small>
        </span>
        <ul>
          {TRANSACTIONS.map((t) => (
            <li key={t.label}>
              <span>{t.label}</span>
              <span className={t.credit ? 'credit' : undefined}>{t.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Accès refusé : aucune raison, seulement la marche à suivre. */
export function Suspended() {
  return (
    <div className="welcome suspended" role="status" aria-label="verdict">
      <svg className="success-check warn" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        <path d="M26 14 V29 M26 36 V37" />
      </svg>
      <h2>Accès suspendu</h2>
      <p className="login-sub">
        Par mesure de sécurité, votre accès a été suspendu. Contactez votre conseiller ou notre service client.
      </p>
      <p className="suspended-phone">0800 000 000</p>
    </div>
  );
}

/** Cadre de la page téléphone : même marque que le portail, un seul contenu au centre. */
export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <main className="m-app">
      <header className="m-head">
        <div className="portal-brand">
          <Logo />
          <span className="portal-name">{BANK_NAME}</span>
        </div>
        <span className="portal-secure">
          <Lock /> Sécurisé
        </span>
      </header>
      <div className="m-body">{children}</div>
    </main>
  );
}
