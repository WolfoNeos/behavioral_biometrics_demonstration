# Répétition sur téléphones réels — script du présentateur

Non automatisable : à faire une fois sur le réseau réel avec les deux téléphones (A et B) et le vidéoprojecteur. Prérequis : `scripts/dev-https.md` suivi (HTTPS, réseau, certificat).

## 0. Préparation
1. `npm start` ; vérifier la ligne `URL de base (QR)` (IP du PC, `https`).
2. Ouvrir `https://<IP>:5173/config` sur le PC : enrôler le profil de A (mot de passe, 10 saisies, PIN), puis le téléphone de A (`/m-enroll`, posture ~42°).
3. Régler les seuils (défauts : frappe 80/50, appareil 80/50, orientation 80/50 ± 5°).
4. Ouvrir `https://<IP>:5173/` sur le PC en plein écran (1920x1080).

## 1. Étape 1 — B tape les identifiants de A (niveau 1)
- Action : B tape ID + mot de passe de A, volontairement différemment (saccadé).
- Attendu : jauge rouge/orange sous le seuil, code-barres de frappe différent du profil de A, passage au niveau 2 avec QR code.

## 2. Étape 2 — B scanne avec son téléphone (niveau 2)
- Action : B scanne le QR (son téléphone), accepte la permission capteurs, tape le PIN de A.
- Attendu : PIN correct mais tableau « Appareil » avec ✗ (navigateur, OS, écran, canvas) ; score bas ; passage au niveau 3.

## 3. Étape 3 — B pose le téléphone de A à plat (niveau 3)
- Action : A scanne le même QR avec son téléphone ; B le pose à plat (~0-2°), puis « Valider ».
- Attendu : cadran d'angle, aiguille hors de la zone verte (42° ± 5°) ; carte « Échec », session bloquée.

## 4. Étape 4 — A réussit chaque niveau séparément
Après « Recommencer » à chaque fois :
1. Niveau 1 : A tape son mot de passe -> « Authentifié ».
2. Bouton « Niveau 2 » : A scanne, PIN, appareil reconnu (✓) -> « Authentifié ».
3. Bouton « Niveau 3 » : A tient son téléphone à ~42° -> « Authentifié ».

## Mode God (hors champ de saisie)
- `A` : injecte des mesures de A (passe) ; `B` : mesures de B (échoue) au niveau courant.
- « Recommencer » : réinitialise la session ; boutons « Niveau 1/2/3 » : saut direct.

## Vérifications projecteur
- [ ] Chiffres et libellés lisibles depuis le fond de la salle
- [ ] Rendu à 1920x1080, aucun défilement vertical ni horizontal
- [ ] Couleurs vert/orange/rouge distinguables au projecteur
- [ ] Gyroscope fonctionnel sur chaque téléphone (l'aiguille bouge en direct)
- [ ] Les trois niveaux de A passent sans faux rejet (sinon recalibrer ou ajuster les seuils)
