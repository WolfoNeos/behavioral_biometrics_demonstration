# Changelog du Vault

## 2026-11-11 — Démo biométrie : certificat HTTPS auto-signé
`npm run cert` génère un certificat OpenSSL auto-signé (30 jours, SAN LAN + localhost) sans mkcert ni changement du magasin de confiance ; à accepter une fois par appareil, non vérifié sur téléphones réels. [[core/03-devops-cicd]]

## 2026-11-11 — Démo biométrie : frappe en temps réel
Niveau 1 : graphe de frappe construit touche par touche pendant la saisie (barres colorées selon l'écart à A, courbe de maintien, jauge au score provisoire), remplacé à Entrée par le verdict du serveur. Snapshot : `expectedBars` (référence par position, sans caractère). Score partagé `scoreKeystrokeLive` (même formule que `scoreKeystroke`). Positions numérotées au lieu des touches sur le graphe. [[features/demo-biometrie/README]] et [[features/demo-biometrie/rehearsal-checklist]] mis à jour.

## 2026-11-11 — Démo biométrie : corrections de la revue finale
Plusieurs téléphones par session (plus de boucle de reconnexion), panneau « Direct » qui garde le niveau échoué avec un bandeau « Échec niveau N » et sa raison, jauge neutre sans mesure, indicateur « Téléphone connecté / en attente », aiguille d'angle en direct sur le PC, seuils transmis dans le snapshot, libellés français, message « rescannez le QR » après redémarrage du serveur, profil de frappe effacé au changement de mot de passe. Note de sécurité (API non authentifiée) dans `core/03-devops-cicd` et `scripts/dev-https.md`. [[features/demo-biometrie/rehearsal-checklist]] mis à jour.

## 2026-11-11 — Démo biométrie : HTTPS, réseau, scénario
Démo implémentée de bout en bout (scores, serveur WS, écran PC, page mobile, configuration). Ajout : HTTPS optionnel via certificats mkcert (`scripts/dev-https.md`), URL du QR sur l'IP LAN (`DEMO_BASE_URL`), `npm start`, test de scénario `tests/e2e`, script de répétition [[features/demo-biometrie/rehearsal-checklist]]. Reste : répétition sur téléphones réels. Notes `core/` complétées.

## 2026-11-11 — Initialisation
Création de la structure du vault (copiée de l'organisation du projet de référence `tour-convention-geneve`) et du `.gitignore`.
