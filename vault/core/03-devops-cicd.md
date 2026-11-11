# DevOps / CI-CD

## Localhost
`npm start` lance serveur (3001) et front (5173). Sans certificat : HTTP, suffisant pour le PC.

## HTTPS (capteurs mobiles)
Le gyroscope exige HTTPS sur mobile. Vite lit des certificats optionnels `certs/dev.pem` et `certs/dev-key.pem` (mkcert, ignorés par git). Procédure complète : `scripts/dev-https.md`.

## Réseau
Partage de connexion d'un téléphone recommandé (les Wi-Fi de campus isolent les appareils). URL du QR : `DEMO_BASE_URL` si défini, sinon `<https|http>://<IP LAN du PC>:5173` (https ssi `certs/dev.pem` existe) ; journalisée au démarrage. Repli : tunnel HTTPS + `DEMO_BASE_URL`.

## VPS (plus tard)
Non déployé. Prévoir un reverse proxy HTTPS (certificat réel), le serveur Node derrière, `DEMO_BASE_URL` sur le domaine public. Pas de CI pour l'instant.

Voir [[04-development]], [[../features/demo-biometrie/rehearsal-checklist]].
