import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { KeyEvent } from '../../shared/types';
import { DEFAULT_WELCOME } from '../../shared/welcome';
import type { WelcomeContent } from '../../shared/welcome';
import { attachKeystrokeCapture } from '../capture/keystroke';
import type { ClientMessage } from '../ws';

/**
 * Côté gauche de la démo : un portail d'e-banking (banque fictive). Aucune raison de refus n'y
 * apparaît : un doute sur l'identité se traduit seulement par une vérification supplémentaire.
 */

export const BRAND = 'e-Banking';

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
          <span className="portal-name">{BRAND}</span>
        </div>
        <span className="portal-secure">
          <Lock /> Secure connection
        </span>
      </header>
      <div className="portal-body">{children}</div>
      <footer className="portal-footer">
        <span>Help</span>
        <span>Security</span>
        <span>Contact</span>
        <span className="portal-demo">Demo mockup — fictitious bank</span>
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
      <h2>Sign in to your account</h2>
      <p className="login-sub">Access your accounts securely.</p>
      <label>
        User ID
        <input type="text" name="id" autoComplete="off" placeholder="Contract no." />
      </label>
      <label>
        Password
        <input ref={pwd} type="password" name="password" autoComplete="off" placeholder="••••••••" />
      </label>
      <button type="submit" className="login-btn" disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> Verifying…
          </>
        ) : (
          'Sign in'
        )}
      </button>
      <span className="login-link">Forgot your password?</span>
    </form>
  );
}

/** Additional verification : QR code à scanner, sans détail sur ce qui l'a déclenchée. */
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
      <h2>{level === 2 ? 'Additional verification' : 'One last verification'}</h2>
      <p className="login-sub">
        {level === 2
          ? 'For your security, confirm your identity with your phone. Scan this code, then enter your PIN.'
          : 'To complete your sign-in, scan this code again with your usual device and follow the instructions.'}
      </p>
      <div className="qr-frame">
        {src ? (
          <img src={src} alt={`QR code for session ${url}`} width={260} height={260} />
        ) : (
          <div className="qr-skeleton" />
        )}
      </div>
      <p className={phoneConnected ? 'stepup-status ok' : 'stepup-status'} role="status">
        {phoneConnected ? (
          'Device connected — follow the instructions on your phone'
        ) : (
          <>
            Waiting for your confirmation
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

const isCredit = (amount: string): boolean => amount.trim().startsWith('+');

/** Accès accordé : validation animée puis aperçu de l'espace client (contenu réglable en configuration). */
export function Welcome({ content = DEFAULT_WELCOME }: { content?: WelcomeContent }) {
  const item = (i: number) => ({ '--i': i }) as CSSProperties;
  return (
    <div className="welcome" role="status" aria-label="verdict">
      <div className="welcome-top">
        <svg className="success-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27 L23 35 L38 18" />
        </svg>
        <div>
          <h2>Sign-in successful</h2>
          <p className="login-sub">
            {content.name ? `Hello ${content.name}, welcome` : 'Welcome'} to your online banking.
          </p>
        </div>
      </div>

      <div className="account-card" style={item(0)}>
        <div className="account-main">
          <span className="account-label">{content.accountLabel}</span>
          <span className="account-balance">
            {content.balance} <small>{content.currency}</small>
          </span>
        </div>
        <svg className="spark" viewBox="0 0 120 44" aria-hidden="true">
          <path d="M2 36 L20 30 L38 33 L56 20 L74 24 L92 10 L118 6" />
        </svg>
      </div>

      {content.transactions.length > 0 && (
        <div className="txn-card" style={item(1)}>
          <h3>Recent transactions</h3>
          <ul>
            {content.transactions.map((t, i) => (
              <li key={`${t.label}-${i}`} style={item(i + 2)}>
                <span className="txn-icon" aria-hidden="true">
                  {t.icon || '•'}
                </span>
                <span className="txn-label">{t.label}</span>
                <span className={isCredit(t.amount) ? 'txn-amount credit' : 'txn-amount'}>{t.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.notice && (
        <div className="notice" style={item(content.transactions.length + 3)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1.5 4-1.5 5h12c0-1-1.5-2-1.5-5A4.5 4.5 0 0 0 10 3zM8.3 15.5a1.8 1.8 0 0 0 3.4 0" />
          </svg>
          <p>{content.notice}</p>
        </div>
      )}
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
      <h2>Access suspended</h2>
      <p className="login-sub">
        For your security, your access has been suspended. Please contact your advisor or our customer service.
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
          <span className="portal-name">{BRAND}</span>
        </div>
        <span className="portal-secure">
          <Lock /> Secure
        </span>
      </header>
      <div className="m-body">{children}</div>
    </main>
  );
}
