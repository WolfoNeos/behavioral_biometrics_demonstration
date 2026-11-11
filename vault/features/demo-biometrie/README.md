# Démo biométrie comportementale

## Vue d'ensemble
Démo live (PC + 2 smartphones) : B connaît les identifiants de A mais est bloqué par la biométrie comportementale (frappe, empreinte appareil, orientation) ; A passe. Authentification progressive en 3 niveaux, seuils réglables, Mode God.

## État actuel
- ✅ Scores (frappe, appareil, orientation, tactile) et machine d'états
- ✅ Serveur Fastify + WebSocket, stockage JSON, sessions
- ✅ Captures navigateur, composants de visualisation, écran de démo, page mobile
- ✅ Configuration et enrôlement du profil de A
- ✅ HTTPS local optionnel, URL du QR sur l'IP du PC, test de scénario
- 📋 Répétition sur téléphones réels (voir [[rehearsal-checklist]])

## Fichiers clés
| Fichier | Rôle |
|---|---|
| `src/shared/scoring/*` | Scores frappe, appareil, orientation, tactile |
| `src/shared/auth/machine.ts` | Machine d'états des niveaux |
| `src/server/sessions.ts` | Sessions, WebSocket, Mode God, `jump`/`inject` |
| `src/server/index.ts`, `baseUrl.ts` | API REST, WS, URL de base du QR |
| `src/web/pages/*` | Demo, Mobile, Config, MobileEnroll |
| `vite.config.ts` | Proxy `/api` `/ws`, HTTPS optionnel |
| `scripts/dev-https.md` | Procédure HTTPS / réseau |
| `tests/e2e/scenario.test.ts` | Scénario complet sans navigateur |

## Contexte lié
- [[plans/2026-11-11-demo-biometrie-design]]
- [[plans/2026-11-11-demo-biometrie-plan]]
- [[rehearsal-checklist]]
- [[../../core/02-architecture]], [[../../core/03-devops-cicd]], [[../../core/04-development]]
