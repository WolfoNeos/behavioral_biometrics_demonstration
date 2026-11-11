# DevOps / CI-CD

## Localhost
`npm start` lance serveur (3001) et front (5173). Sans certificat : HTTP, suffisant pour le PC.

## HTTPS (capteurs mobiles)
Le gyroscope exige HTTPS sur mobile. Vite lit des certificats optionnels `certs/dev.pem` et `certs/dev-key.pem` (mkcert, ignorés par git). Procédure complète : `scripts/dev-https.md`.

## Réseau
Partage de connexion d'un téléphone recommandé (les Wi-Fi de campus isolent les appareils). URL du QR : `DEMO_BASE_URL` si défini, sinon `<https|http>://<IP LAN du PC>:5173` (https ssi `certs/dev.pem` existe) ; journalisée au démarrage. Repli : tunnel HTTPS + `DEMO_BASE_URL`.

## Sécurité
**Sécurité : aucune.** L'API REST et le WebSocket ne sont pas authentifiés : n'importe quel appareil du même réseau peut lire et modifier le profil de A (mot de passe et PIN en clair via `GET/PUT /api/profile`), les seuils et l'état des sessions. Acceptable pour une démo en classe uniquement : utiliser un partage de connexion privé (mot de passe Wi-Fi non communiqué au public) et des identifiants de démo jetables.

## VPS (plus tard)
Non déployé. Prévoir un reverse proxy HTTPS (certificat réel), le serveur Node derrière, `DEMO_BASE_URL` sur le domaine public. Pas de CI pour l'instant.

Voir [[04-development]], [[../features/demo-biometrie/rehearsal-checklist]].
