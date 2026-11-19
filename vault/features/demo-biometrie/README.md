# Démo biométrie comportementale

## Vue d'ensemble
Démo live (PC + 2 smartphones) : B connaît les identifiants de A mais est bloqué par la biométrie comportementale (frappe, empreinte appareil, orientation) ; A passe. Authentification progressive en 3 niveaux, seuils réglables, Mode God.

## État actuel
- ✅ Scores (frappe, appareil, orientation, tactile) et machine d'états
- ✅ Serveur Fastify + WebSocket, stockage JSON, sessions
- ✅ Captures navigateur, composants de visualisation, écran de démo, page mobile
- ✅ Configuration et enrôlement du profil de A
- ✅ HTTPS local optionnel, URL du QR sur l'IP du PC, test de scénario
- ✅ Revue finale : plusieurs téléphones par session, échec du niveau précédent affiché (bandeau + raison, `lastVerdict`), indicateur de téléphone, aiguille d'angle en direct (`orientationLive`), seuils dans le snapshot, profil de frappe effacé au changement de mot de passe
- ✅ Frappe en temps réel (niveau 1) : pendant la saisie, une barre par touche relâchée (largeur = maintien, espace = vol) sur la référence de A en filigrane, couleur selon l'écart à A (≤ 2σ vert, ≤ 3σ orange, au-delà rouge, gris sans référence), courbe de maintien point par point avec la zone d'incertitude, jauge au score provisoire (`scoreKeystrokeLive`, même formule que le serveur). Backspace retire la dernière barre ; à Entrée le verdict du serveur remplace la vue provisoire. Référence par position `expectedBars` dans le snapshot (aucun caractère) ; positions numérotées sur le graphe (le mot de passe n'est jamais affiché)
- ✅ Correctifs d'affichage de la frappe : après Entrée les barres tapées restent (légende « En attente du serveur ») jusqu'à la réponse du serveur, saisie reprise, reset ou saut ; ecarts et maintiens affichés plafonnés (attendu + 3σ, sinon 400 ms) avec repère rouge « pause », barres en direct alignées sur la référence du même indice ; pas de légende sans référence ; mode God : les majuscules ont un événement
- ✅ Refonte de l'interface : style minimaliste commun ; téléphone = PIN seul, gyroscope secret (mesuré en silence au niveau 3), verdicts uniquement sur le PC
- ✅ Volet gauche en portail d'e-banking fictif (animations, retours neutres : « vérification supplémentaire », « accès suspendu »), détails techniques uniquement à droite
- 📋 Répétition sur téléphones réels (voir [[rehearsal-checklist]])

Sécurité : API et WebSocket non authentifiés (profil, mot de passe et PIN lisibles sur le réseau) ; démo en classe sur réseau privé uniquement, voir [[../../core/03-devops-cicd]].

## Fichiers clés
| Fichier | Rôle |
|---|---|
| `src/shared/scoring/*` | Scores frappe, appareil, orientation, tactile ; `keystrokeLive.ts` : référence par position et score provisoire |
| `src/web/components/keystrokeRows.ts` | Lignes par position (direct / serveur / référence) pour graphe et code-barres |
| `src/shared/auth/machine.ts` | Machine d'états des niveaux |
| `src/server/sessions.ts` | Sessions, WebSocket, Mode God, `jump`/`inject` |
| `src/server/index.ts`, `baseUrl.ts` | API REST, WS, URL de base du QR |
| `src/web/pages/*` | Demo, Mobile, Config, MobileEnroll |
| `src/web/components/BankPortal.tsx` | Portail e-banking du volet gauche (login, vérification supplémentaire, bienvenue, suspendu) |
| `vite.config.ts` | Proxy `/api` `/ws`, HTTPS optionnel |
| `scripts/dev-https.md` | Procédure HTTPS / réseau |
| `tests/e2e/scenario.test.ts` | Scénario complet sans navigateur |

## Contexte lié
- [[plans/2026-11-11-demo-biometrie-design]]
- [[plans/2026-11-11-demo-biometrie-plan]]
- [[rehearsal-checklist]]
- [[../../core/02-architecture]], [[../../core/03-devops-cicd]], [[../../core/04-development]]
