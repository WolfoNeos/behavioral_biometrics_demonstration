# HTTPS local pour la démo (capteurs mobiles)

Le gyroscope (`DeviceOrientationEvent`) n'est disponible qu'en **contexte sécurisé (HTTPS)** sur mobile. Vite sert en HTTPS dès que `certs/dev.pem` et `certs/dev-key.pem` existent ; sinon il reste en HTTP (suffisant pour le PC seul). Le dossier `certs/` est ignoré par git. À faire **à la main, avant la présentation**.

## Méthode rapide : certificat auto-signé (sans mkcert)

Ne nécessite aucune installation (OpenSSL est fourni avec Git for Windows) et ne touche pas au magasin de certificats du système.

1. `npm run cert` : génère `certs/dev.pem` et `certs/dev-key.pem` (valables 30 jours) avec l'IP LAN du PC, `127.0.0.1` et `localhost`. Hôtes supplémentaires : `npm run cert -- 192.168.43.1 monhote.local`.
2. Relancer `npm start` : le QR et l'URL passent en `https` automatiquement.
3. Sur **chaque appareil** (chaque téléphone, et le navigateur du PC), ouvrir une fois l'URL https affichée et accepter l'avertissement :
   - Chrome Android : « Paramètres avancés » -> « Continuer vers ... ».
   - iOS Safari : « Afficher les détails » -> « Visiter ce site web ».
   - Navigateur du PC : « Avancé » -> « Continuer ».
4. Régénérer avec `npm run cert -- --force <ip>` dès que l'IP change (point d'accès !) ou après 30 jours. Sans `--force`, le script refuse d'écraser des certificats existants.

Limites, à dire honnêtement : **non vérifié sur de vrais téléphones**. À contrôler à la répétition : le WebSocket `wss` fonctionne et le capteur de mouvement reste disponible/autorisable après l'exception de certificat. Si ce n'est pas le cas, utiliser la méthode mkcert ci-dessous : elle installe une autorité racine de confiance sur les appareils (réglage de sécurité que seul l'utilisateur peut faire) et reste l'alternative la plus propre.

## 1. Installer mkcert et générer le certificat (PC)

1. Installer mkcert (ex. `choco install mkcert` ou `scoop install mkcert`).
2. `mkcert -install` (installe l'autorité racine locale sur le PC).
3. Trouver l'IP du PC sur le réseau de la démo : `ipconfig` -> « Adresse IPv4 » de la carte Wi-Fi (ex. `192.168.43.10`).
4. Dans la racine du projet :
   ```
   mkdir certs
   mkcert -key-file certs/dev-key.pem -cert-file certs/dev.pem <LAN_IP> localhost
   ```
5. Relancer `npm start` (ou `npm run server` + `npm run dev`). Le serveur journalise `URL de base (QR) : https://<LAN_IP>:5173`. Pour forcer une autre URL : variable `DEMO_BASE_URL`.

Si l'IP change (autre réseau), régénérer le certificat avec la nouvelle IP.

## 2. Faire approuver l'autorité racine par les téléphones

Le fichier `rootCA.pem` se trouve dans le dossier donné par `mkcert -CAROOT`.

**iOS**
1. Envoyer `rootCA.pem` au téléphone (AirDrop, mail, serveur local).
2. Ouvrir le fichier, puis Réglages -> Profil téléchargé -> Installer.
3. Réglages -> Général -> Informations -> **Réglages des certificats de confiance** -> activer la confiance totale pour l'autorité mkcert.

**Android**
1. Copier `rootCA.pem` sur le téléphone (renommer en `rootCA.crt` si besoin).
2. Réglages -> Sécurité -> Chiffrement et identifiants -> Installer un certificat -> **Certificat d'autorité (CA)**.
3. Chrome sur Android peut exiger le chemin « certificat utilisateur » : vérifier que le certificat est installé comme CA (et non « VPN et applis »), puis redémarrer Chrome.

## 3. Réseau : partage de connexion recommandé

Utiliser le **partage de connexion d'un téléphone** (point d'accès) : le PC et les deux téléphones y sont connectés. Les Wi-Fi de campus sont risqués : isolation des clients (les appareils ne se voient pas), portail captif, pare-feu. Vérifier aussi que le pare-feu Windows autorise Node sur le réseau privé (ports 5173 et 3001).

Sécurité : l'API REST et le WebSocket ne sont **pas authentifiés**. Tout appareil connecté au point d'accès peut lire et modifier le profil de A (mot de passe et PIN en clair via `GET/PUT /api/profile`), les seuils et les sessions. C'est acceptable uniquement pour une démo en classe : point d'accès privé (mot de passe non communiqué), identifiants de démo jetables. Un tunnel public expose la même chose à tout Internet tant qu'il est ouvert.

## 4. Repli : tunnel HTTPS

Si les capteurs restent bloqués (certificat non approuvé, Wi-Fi isolé) : ouvrir un tunnel HTTPS vers Vite (`allowedHosts` est activé dans `vite.config.ts`, donc le Host du tunnel est accepté). Commandes **non testées** :

- Vite en HTTP (pas de certificats) : `cloudflared tunnel --url http://localhost:5173` ou `ngrok http 5173`.
- Vite en HTTPS (certificats présents) : `cloudflared tunnel --url https://localhost:5173 --no-tls-verify` ou `ngrok http https://localhost:5173`. Plus simple : renommer `certs/` pour que Vite reste en HTTP.

Puis lancer serveur et front avec l'URL publique du tunnel :

- PowerShell : `$env:DEMO_BASE_URL='https://xxxx.trycloudflare.com'; npm start`
- bash : `DEMO_BASE_URL=https://xxxx.trycloudflare.com npm start`

`npm start` transmet l'environnement au serveur (même chose avec `npm run server`). Les téléphones n'ont alors besoin ni de certificat ni du même réseau.

## 5. Checklist avant la présentation

- [ ] PC et téléphones sur le même réseau (partage de connexion), IP du PC relevée
- [ ] Certificat généré pour cette IP ; autorité racine approuvée sur les deux téléphones
- [ ] `npm start` : le journal affiche la bonne URL de base ; le QR s'ouvre sur un téléphone sans avertissement
- [ ] Permission capteur de mouvement acceptée sur chaque téléphone
- [ ] Profil de A enrôlé sur `/config` (frappe, téléphone, posture ~42°)
- [ ] Seuils réglés après un essai réel de A et de B
- [ ] Rappel Mode God : touche `A` = profil de A, `B` = profil de B (hors champ de saisie)
- [ ] Urgence : bouton « Recommencer » (ou boutons de niveau pour sauter à une étape)

Répétition détaillée : `vault/features/demo-biometrie/rehearsal-checklist.md`.
