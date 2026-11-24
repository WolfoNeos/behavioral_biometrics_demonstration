/**
 * Banc d'essai du score de frappe : rejoue toutes les frappes journalisées (data/attempts.json,
 * une entrée par Entrée sur la page de connexion) avec le calcul actuel et le profil enrôlé.
 *
 *   npm run bench                         liste les essais et leur score
 *   npm run bench -- A=1-7 B=8-12         nomme des plages d'essais (numéros de la liste) et
 *                                         donne, par nom, le minimum, la moyenne et le maximum
 *
 * Seuil conseillé : entre le pire score de A et le meilleur score des imitateurs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoreKeystroke } from '../src/shared/scoring/keystroke';
import type { KeyEvent, Profile } from '../src/shared/types';

interface Logged {
  at: string;
  score: number;
  secret: boolean;
  events: KeyEvent[];
}

const read = <T>(file: string): T | null => {
  const p = resolve('data', file);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null;
};

const profile = read<Profile>('profile.json');
const attempts = read<Logged[]>('attempts.json') ?? [];
if (!profile?.keystroke) {
  console.error('Pas de profil de frappe enrôlé (data/profile.json).');
  process.exit(1);
}
if (attempts.length === 0) {
  console.error('Aucun essai journalisé : tape le mot de passe sur la page de démo, puis relance.');
  process.exit(1);
}

const groups = process.argv.slice(2).map((arg) => {
  const m = /^(\w+)=(\d+)(?:-(\d+))?$/.exec(arg);
  if (!m) throw new Error(`Plage invalide : ${arg} (attendu : A=1-7)`);
  return { name: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]) };
});

const scored = attempts.map((a, i) => ({
  n: i + 1,
  at: a.at,
  logged: Math.round(a.score),
  now: scoreKeystroke(profile.keystroke!, a.events).score,
  secret: a.secret,
}));

console.log('  #  heure                     enregistré  recalculé  mot de passe');
for (const s of scored) {
  console.log(
    `${String(s.n).padStart(3)}  ${s.at.slice(0, 19).replace('T', ' ')}  ${String(s.logged).padStart(10)}  ${String(s.now).padStart(9)}  ${s.secret ? 'bon' : 'faux'}`,
  );
}
for (const g of groups) {
  const xs = scored.filter((s) => s.n >= g.from && s.n <= g.to).map((s) => s.now);
  if (xs.length === 0) continue;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`${g.name}: ${xs.length} essais, min ${Math.min(...xs)}, moyenne ${avg.toFixed(1)}, max ${Math.max(...xs)}`);
}
