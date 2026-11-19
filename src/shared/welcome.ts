/** Contenu de l'écran affiché une fois la sécurité passée : modifiable depuis la configuration. */
export interface WelcomeTransaction {
  icon: string;
  label: string;
  amount: string;
}

export interface WelcomeContent {
  /** Prénom ou surnom affiché dans la salutation (facultatif). */
  name: string;
  accountLabel: string;
  balance: string;
  currency: string;
  /** Message du « conseiller » : l'endroit idéal pour une petite blague. */
  notice: string;
  transactions: WelcomeTransaction[];
}

export const MAX_TRANSACTIONS = 5;

export const DEFAULT_WELCOME: WelcomeContent = {
  name: '',
  accountLabel: 'Compte courant · •••• 4821',
  balance: '12 480,35',
  currency: 'CHF',
  notice: 'Votre conseiller : « Le code PIN, c’est comme une brosse à dents : on ne le prête pas. »',
  transactions: [
    { icon: '💼', label: 'Salaire — Octobre', amount: '+ 4 850,00' },
    { icon: '☕', label: 'Café du matin', amount: '− 4,50' },
    { icon: '🎓', label: 'Cadeau pour réussir l’examen', amount: '− 120,00' },
    { icon: '📺', label: 'Abonnement jamais utilisé', amount: '− 13,90' },
  ],
};

const text = (v: unknown, max: number, fallback: string): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;

/** Normalise un contenu quelconque (fichier, requête) : champ invalide -> valeur par défaut. */
export function sanitizeWelcome(raw: unknown): WelcomeContent {
  const o = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_WELCOME;
  const list = Array.isArray(o.transactions)
    ? o.transactions
        .filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object')
        .slice(0, MAX_TRANSACTIONS)
        .map((t) => ({
          icon: text(t.icon, 8, ''),
          label: text(t.label, 60, ''),
          amount: text(t.amount, 20, ''),
        }))
        .filter((t) => t.label !== '' || t.amount !== '')
    : d.transactions;
  return {
    name: text(o.name, 40, d.name),
    accountLabel: text(o.accountLabel, 60, d.accountLabel),
    balance: text(o.balance, 20, d.balance),
    currency: text(o.currency, 6, d.currency),
    notice: text(o.notice, 200, d.notice),
    transactions: list,
  };
}
