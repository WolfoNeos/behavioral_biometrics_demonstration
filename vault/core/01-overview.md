# Overview

**Projet** : Démonstration de biométrie comportementale (ISS)
**But** : Démo live devant public — un attaquant (B) échoue à se connecter avec les identifiants de A, détecté par la biométrie comportementale (frappe, empreinte appareil, orientation) ; le vrai propriétaire (A) passe sans friction.
**Format** : application web unique, PC (vidéoprojecteur) + 2 smartphones, en localhost le temps de la démo (VPS envisagé plus tard).

## Stack
TypeScript partout ; React 19 + Vite (front, port 5173) ; Fastify + `@fastify/websocket` (serveur, port 3001) ; Chart.js ; Vitest ; profil et seuils en JSON (`data/`, ignoré par git).

## Équipe / contexte
Projet ISS : démo présentée à des étudiants et professeurs, en salle de cours, juste après un exposé sur la biométrie comportementale. Interface en français, 1080p.

Voir [[../features/demo-biometrie/README]] et [[02-architecture]].
