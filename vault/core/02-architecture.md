# Architecture

## Composants
- **Front React/Vite** (`src/web`) : `/` écran de démo (PC), `/m/:id` page mobile (PIN, posture), `/config` configuration, `/m-enroll` enrôlement du téléphone de A.
- **Serveur Fastify** (`src/server`) : API REST (`/api/profile`, `/api/thresholds`, `/api/enroll/*`, `/api/session`) et WebSocket `/ws?session=&role=pc|phone`.
- **Partagé** (`src/shared`) : types, scores (`scoring/`), machine d'états (`auth/machine.ts`).

## Flux PC <-> serveur <-> téléphone
Le PC crée une session (`POST /api/session`) et affiche un QR vers `<baseUrl>/m/<id>`. PC et téléphone ouvrent chacun un WebSocket sur la même session ; le serveur calcule les scores, met à jour l'état et diffuse un `state` (snapshot) aux deux. Vite proxifie `/api` et `/ws` vers le serveur.

## Scoring
Frappe (dwell/flight par touche vs profil, avec écart-type), appareil (comparaison d'empreinte), orientation (beta vs profil, tolérance en degrés), tactile (indicatif). Chaque signal décide seul, sur seuils accept/warn réglables.

## Machine d'états
`pending(niveau 1..3)` -> `granted` si score >= accept ; sinon niveau suivant ; échec au niveau 3 -> `blocked`. PIN ou mot de passe faux = échec dur. `jump` saute à un niveau, `reset` recommence. **Mode God** : `A`/`B` injectent des mesures synthétiques via le calcul normal.

Voir [[../features/demo-biometrie/README]], [[03-devops-cicd]].
