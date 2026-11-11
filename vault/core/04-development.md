# Développement

## Setup
Node >= 20. `npm install`.

## Commandes
| Commande | Rôle |
|---|---|
| `npm start` | serveur + front ensemble |
| `npm run server` | serveur Fastify (3001), journalise l'URL de base du QR |
| `npm run dev` | front Vite (5173) |
| `npm test` | Vitest (shared, serveur, web, e2e) |
| `npm run build` | `tsc --noEmit` + build Vite |

## Tests
`tests/shared`, `tests/server`, `tests/web` (jsdom), `tests/e2e/scenario.test.ts` (scénario de démo via `SessionManager`, seuils par défaut).

Voir [[02-architecture]], [[03-devops-cicd]].
