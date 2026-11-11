# Guide du Vault — Règles de Documentation

Ce vault est la **source de vérité du contexte** du projet *Behavioral Biometrics Demonstration* (démo ISS). Chaque feature, décision et changement y est documenté pour qu'une personne (ou un agent) qui arrive comprenne d'où on vient et où on en est.

## Principes

1. **Une feature = un dossier** — `features/nom-feature/`
2. **Chaque travail documenté** — dès qu'un lot est terminé/mergé, on documente
3. **Historique visible** — `decisions/` et `changes/` racontent l'évolution
4. **Contexte clair** — nouveau venu = lit le vault, comprend

## Structure globale

```
vault/
├── 00-GUIDE.md        ← Ce fichier : règles + templates
├── MEMORY.md          ← Index : une ligne par feature/concept clé
├── CHANGELOG.md       ← Journal chronologique (le plus récent en haut)
├── core/              ← Fondamentaux : overview, architecture, devops, dev
├── conventions/       ← Guides transversaux (code, git, charte graphique…)
├── decisions/         ← Décisions transverses (ADR) : AAAA-MM-sujet.md
├── features/          ← UNE FOLDER PAR FEATURE
│   └── nom-feature/
│       ├── README.md          ← Vue d'ensemble, état, fichiers clés
│       ├── context.md         ← (majeure) contexte métier
│       ├── implementation.md  ← (majeure) état actuel du code
│       ├── plans/             ← Specs/plans datés AAAA-MM-JJ-sujet.md
│       ├── decisions/         ← Décisions propres à la feature
│       └── changes/           ← Changelog par sprint/lot
└── archive/           ← Contenu obsolète
```

Feature mineure : `README.md` + `changes.md` suffisent.

## Workflow

**Avant** : lire `features/<feature>/README.md`, `implementation.md` et `decisions/`.
**Après un lot terminé** :
1. Créer/mettre à jour `features/<feature>/changes/sprint-X.md`
2. Décision importante → `decisions/AAAA-MM-sujet.md`
3. Mettre à jour `implementation.md`
4. Mettre à jour `MEMORY.md` et `CHANGELOG.md`

## Templates

### README.md (feature)
```markdown
# Nom de la feature

## Vue d'ensemble
[2-3 lignes : quoi, pourquoi]

## État actuel
- ✅ Implémenté
- 🚧 En cours
- 📋 Planifié

## Fichiers clés
| Fichier | Rôle |
|---|---|

## Contexte lié
- [[autre-feature]]

## Progression
- [[changes/sprint-1]]
```

### changes/sprint-X.md
```markdown
# Sprint X — Nom-Feature

## Résumé
## Fichiers modifiés (clés)
## Décisions clés
## Points bloquants / à suivre
## Contexte (pour la prochaine personne)
```

### decisions/AAAA-MM-sujet.md
```markdown
# Décision : [titre court]

**Date** : AAAA-MM-JJ
**Feature** : [[lien]]
**Statut** : Acceptée / En révision / Rejetée

## Problème
## Options considérées
## Décision prise
Raison — Trade-offs acceptés
## Impacts
```

## Conventions d'écriture
- Français, liens Obsidian `[[...]]`
- Plans/specs datés : `AAAA-MM-JJ-sujet.md`
- Les valeurs de vérité vivent dans le code ; le vault explique le *pourquoi*
