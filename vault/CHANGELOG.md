# Changelog du Vault

## 2026-11-11 — Démo biométrie : HTTPS, réseau, scénario
Démo implémentée de bout en bout (scores, serveur WS, écran PC, page mobile, configuration). Ajout : HTTPS optionnel via certificats mkcert (`scripts/dev-https.md`), URL du QR sur l'IP LAN (`DEMO_BASE_URL`), `npm start`, test de scénario `tests/e2e`, script de répétition [[features/demo-biometrie/rehearsal-checklist]]. Reste : répétition sur téléphones réels. Notes `core/` complétées.

## 2026-11-11 — Initialisation
Création de la structure du vault (copiée de l'organisation du projet de référence `tour-convention-geneve`) et du `.gitignore`.
