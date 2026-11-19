import type { PhoneView } from '../../shared/types';
import { Lock, MobileShell } from './BankPortal';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Pavé PIN du téléphone, rejoué à l'identique (sans interaction) : les touches pressées s'allument. */
function PinReplica({ view }: { view: PhoneView }) {
  const key = (d: string) => (
    <span key={d} className={view.pressed === d ? 'key pressed' : 'key'}>
      {d}
    </span>
  );
  return (
    <div className="pin">
      <div className="pin-head">
        <h1>{view.again ? 'Enter your PIN again' : 'Enter your PIN'}</h1>
        <p>{view.again ? 'Additional verification' : 'To confirm your identity'}</p>
      </div>
      <div className="pin-dots" aria-hidden="true">
        {Array.from({ length: Math.max(4, view.digits) }, (_, i) => (
          <span key={i} className={i < view.digits ? 'dot filled' : 'dot'} />
        ))}
      </div>
      <p className="pin-error" />
      <div className="keypad">
        {DIGITS.map(key)}
        <span />
        {key('0')}
        <span className={view.pressed === 'erase' ? 'key key-aux pressed' : 'key key-aux'}>⌫</span>
      </div>
      <span className={view.digits > 0 ? 'pin-submit' : 'pin-submit disabled'}>Confirm</span>
    </div>
  );
}

function Interstitial({ step }: { step: boolean }) {
  return (
    <div className="m-inter">
      <div className={step ? 'inter-ring step' : 'inter-ring'}>{step && <Lock />}</div>
      <h1>{step ? 'Additional verification' : 'Verifying…'}</h1>
      <p>
        {step
          ? 'For your security, please confirm your identity again.'
          : 'Please wait a moment.'}
      </p>
    </div>
  );
}

/**
 * Reflet de l'écran du téléphone, affiché à côté du QR code : le public voit ce que fait la
 * personne qui tient le téléphone. Reprend exactement ce que le téléphone affiche (donc rien
 * sur la posture ni sur le résultat).
 */
export function PhoneMirror({ view, connected }: { view: PhoneView | null; connected: boolean }) {
  const live = connected && view !== null;
  return (
    <figure className="phone-mirror" aria-label="Phone screen">
      <div className="phone-frame">
        <div className="phone-viewport">
          <div className={live ? 'phone-screen' : 'phone-screen off'}>
            {live ? (
              <MobileShell>
                {view.screen === 'pin' && <PinReplica view={view} />}
                {view.screen === 'checking' && <Interstitial step={false} />}
                {view.screen === 'step' && <Interstitial step />}
                {view.screen === 'done' && (
                  <div className="m-done">
                    <Lock />
                    <p className="m-note">Look at the screen</p>
                  </div>
                )}
                {view.screen === 'connecting' && (
                  <p className="m-note">
                    <span className="spinner dark" aria-hidden="true" /> Connecting…
                  </p>
                )}
              </MobileShell>
            ) : (
              <p className="phone-wait">
                <span className="spinner" aria-hidden="true" />
                Waiting for the phone
              </p>
            )}
          </div>
        </div>
      </div>
      <figcaption>Phone screen</figcaption>
    </figure>
  );
}
