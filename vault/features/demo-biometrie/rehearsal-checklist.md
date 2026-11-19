# Répétition sur téléphones réels — script du présentateur

Non automatisable : à faire une fois sur le réseau réel avec les deux téléphones (A et B) et le vidéoprojecteur. Prérequis : `scripts/dev-https.md` suivi (HTTPS, réseau, certificat).

## 0. Préparation
0. Certificat : `npm run cert` (ou `npm run cert -- --force <IP du point d'accès>` si l'IP a changé), puis relancer `npm start`. Sur chaque téléphone et sur le PC, ouvrir `https://<IP>:5173` une fois et accepter l'avertissement. Vérifier : le gyroscope est disponible après l'acceptation de l'avertissement, et la connexion WebSocket (`wss`) s'établit (« Téléphone connecté »).
1. `npm start` ; vérifier la ligne `URL de base (QR)` (IP du PC, `https`). Réseau privé obligatoire : l'API n'est pas authentifiée (voir `scripts/dev-https.md`).
2. Ouvrir `https://<IP>:5173/config` sur le PC : enrôler le profil de A (mot de passe, 10 saisies, PIN), puis le téléphone de A (`/m-enroll`, posture ~42°).
3. Régler les seuils (défauts : frappe 80/50, appareil 80/50, orientation 80/50 ± 5°).
4. Ouvrir `https://<IP>:5173/` sur le PC en plein écran (1920x1080).

## 1. Étape 1 — B tape les identifiants de A (niveau 1)
- Avant la frappe : le panneau « Direct » montre la référence de A (courbe attendue + zone d'incertitude, code-barres de référence), jauge « — ».
- Action : B tape ID + mot de passe de A, volontairement différemment (saccadé).
- Pendant la frappe (avant Entrée) : à chaque touche relâchée, une barre apparaît sous sa référence (largeur = maintien, espace = vol) et un point sur la courbe ; couleur = écart à A : vert (dans la zone, ≤ 2σ), orange (≤ 3σ), rouge (au-delà, ou touche en trop), gris (position sans référence). La jauge bouge à chaque touche (« Score provisoire »). Backspace retire la dernière barre. Aucun caractère n'est affiché (positions 1, 2, 3…).
- À Entrée : le score officiel du serveur remplace la vue provisoire (« Score officiel »).
- Attendu : la zone principale passe au QR code (niveau 2) ; le panneau « Direct » reste sur la frappe de B (graphe, code-barres, jauge rouge/orange) avec le bandeau « Échec niveau 1 — passage au niveau suivant » et la raison (« Signal hors seuil (score N / 100) » ou « Mot de passe incorrect »). Sous le QR : « Téléphone en attente ».

## 2. Étape 2 — B scanne avec son téléphone (niveau 2)
- Action : B scanne le QR (son téléphone), accepte la permission capteurs, tape le PIN de A.
- Attendu : « Téléphone connecté » sur le PC dès le scan ; PIN correct mais tableau « Appareil » avec ✗ (navigateur, système, écran, canvas) ; score bas ; bandeau « Échec niveau 2 » ; passage au niveau 3 (consigne posture). Un PIN faux affiche « PIN incorrect » sur le PC ; le téléphone affiche seulement « Vérification refusée, regardez l'écran ».

## 3. Étape 3 — B pose le téléphone de A à plat (niveau 3)
- Action : A scanne le même QR avec son téléphone (le téléphone de B reste connecté : plusieurs téléphones par session sont acceptés) ; « Autoriser le capteur » ; B le pose à plat (~0-2°), puis « Valider ».
- Attendu : dès l'autorisation du capteur, le PC passe au cadran d'angle et l'aiguille suit le téléphone en direct ; après « Valider » (moyenne sur 2 s), aiguille hors de la zone verte (42° ± 5°) ; carte « Échec », session bloquée.

## 4. Étape 4 — A réussit chaque niveau séparément
Après « Recommencer » à chaque fois :
1. Niveau 1 : A tape son mot de passe -> « Authentifié ».
2. Bouton « Niveau 2 » : A scanne, PIN, appareil reconnu (✓) -> « Authentifié ».
3. Bouton « Niveau 3 » : A tient son téléphone à ~42° -> « Authentifié ».

## Incidents
- Téléphone affichant « Pas de connexion — réessayez » : le PIN saisi est conservé, réappuyer sur « Valider » une fois « Connecté » revenu (« Valider » est grisé hors connexion).
- Serveur redémarré : le téléphone affiche « Session introuvable — rescannez le QR code » ; recharger le PC puis rescanner le nouveau QR.
- Indicateur « Téléphone connecté / en attente » : sous le QR (niveaux 2-3) et à côté des boutons de contrôle.

## Mode God (hors champ de saisie)
- `A` : injecte des mesures de A (passe) ; `B` : mesures de B (échoue) au niveau courant.
- « Recommencer » : réinitialise la session ; boutons « Niveau 1/2/3 » : saut direct.

## Vérifications projecteur
- [ ] Chiffres et libellés lisibles depuis le fond de la salle
- [ ] Rendu à 1920x1080, aucun défilement vertical ni horizontal
- [ ] Couleurs vert/orange/rouge distinguables au projecteur
- [ ] Gyroscope fonctionnel sur chaque téléphone (l'aiguille du PC bouge en direct avant « Valider »)
- [ ] Bandeau « Échec niveau N » lisible au projecteur, sans défilement
- [ ] Niveau 1 : barres et jauge bougent pendant la frappe, couleurs lisibles, aucun caractère du mot de passe à l'écran
- [ ] Les trois niveaux de A passent sans faux rejet (sinon recalibrer ou ajuster les seuils)
