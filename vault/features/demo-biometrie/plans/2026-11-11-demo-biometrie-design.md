# Design — Démonstration de biométrie comportementale

**Date** : 2026-11-11
**Statut** : Brouillon (en attente de validation)

## 1. Intention

Montrer à un public technique (étudiants et professeurs, en salle de cours, au vidéoprojecteur, juste après un exposé sur le sujet) que **même avec les identifiants corrects, un attaquant reste bloqué** par ce qu'il ne peut pas copier : sa façon de taper, son appareil, sa posture. Le vrai utilisateur, lui, passe sans friction.

Le présentateur commente à l'oral. L'interface doit rendre le fonctionnement **compréhensible par le public** : si elle ne le permet pas, c'est un échec, même si tout marche techniquement.

## 2. Objectifs / non-objectifs / anti-objectifs

**Objectifs**
- Tout est **réellement mesuré en direct** : dynamique de frappe, empreinte appareil, orientation (gyroscope).
- Authentification **progressive** (voir §4) avec seuils réglables.
- Console de sécurité lisible depuis le fond de la salle (chiffres gros, graphes avec zone d'incertitude).
- Une route de **configuration** pour enregistrer le profil de A en amont et régler tous les seuils.

**Non-objectifs**
- Un seul utilisateur (A). Pas de comptes multiples, pas d'inscription.
- Aucune sécurité réelle : c'est une démo.
- Pas de base de données lourde (fichier JSON ou SQLite).

**Anti-objectif (échec)**
- Une interface qui ne permet pas au public de comprendre ce qui se passe, ou qui est peu pratique à présenter.

## 3. Acteurs et appareils

- **A** : le vrai utilisateur. Son téléphone est l'appareil enregistré.
- **B** : l'attaquant. Connaît l'ID, le mot de passe et le PIN de A. Possède son propre téléphone.
- **2 téléphones** sur scène (celui de A, celui de B) + 1 PC branché au vidéoprojecteur.

## 4. Logique d'authentification (progressive)

Trois niveaux, chacun mesure un signal :

| Niveau | Challenge | Signal | Support |
|---|---|---|---|
| 1 | ID + mot de passe | Dynamique de frappe (dwell / flight) | PC |
| 2 | Code PIN | Empreinte appareil (navigateur, OS, hash canvas) + tactile | Téléphone (via QR code) |
| 3 | Validation finale | Orientation (alpha, beta, gamma) | Téléphone |

Règles :
- Si le signal du niveau est **conforme aux seuils**, l'accès est **accordé immédiatement**, quel que soit le niveau.
- S'il est **suspect**, le système déclenche le **challenge du niveau suivant**.
- Si le niveau 3 échoue, la session est **bloquée**.
- Un challenge réussi par A suffit à valider l'authentification : chaque signal décide seul (pas de moyenne).
- Tous les seuils sont **réglables dans l'interface de configuration**.

Une jauge de confiance (0–100 %) affiche le score du signal de l'étape en cours, comparé à son seuil. Couleurs indicatives : vert / orange / rouge (seuils à régler).

## 5. Scénario de démonstration

1. **B (niveau 1)** tape ID + mot de passe de A. Frappe différente → score bas (rouge) → QR code affiché.
2. **B (niveau 2)** scanne le QR avec **son propre** téléphone, tape le PIN de A. PIN correct, mais appareil inconnu → alerte → niveau 3.
3. **B (niveau 3)** prend le téléphone de **A** (appareil reconnu), le pose à plat (~0–2°) alors que le profil de A est à ~42° → posture anormale → session bloquée.
4. **A** réussit **chacun des niveaux séparément** (clavier, appareil, posture), l'accès est validé à chaque fois.
   Pour atteindre les niveaux 2 et 3 avec A : soit B rejoue son comportement (échoue volontairement les niveaux précédents), soit le présentateur utilise les **boutons de niveau** (§7).

## 6. Interface de démo (écran PC)

Écran unique, au vidéoprojecteur :

- **Zone principale (gauche, grande)** : connexion, QR code, challenge en cours.
- **Panneau « Direct » (haut droite)** : mesures en temps réel du signal de l'étape en cours.
- **Panneau « Profil de A » (milieu droite)** : valeurs attendues, pour comparaison côte à côte.
- **Barre de contrôle (bas droite)** : boutons de niveau + navigation vers les autres pages (config, etc.).

Les panneaux Direct et Profil de A n'affichent **que le signal de l'étape en cours**.

Visuels par signal (**partie proposée par moi, à valider**) :
- **Clavier** : signature de frappe en « code-barres », comparée au profil de A ; courbes avec **zone d'incertitude** ; valeurs numériques (ms par touche, etc.).
- **Appareil** : liste de critères (navigateur, OS, empreinte canvas) avec ✓/✗ par ligne, profil de A face à la mesure.
- **Posture** : cadran d'angle avec zone verte de tolérance (ex. 40° ± 5°) et aiguille en direct ; valeurs numériques.
- **Verdict** : carte claire « Authentifié / Échec » (grosse icône), score, appareil.

Style : sobre, lisible de loin, joli. Référence visuelle fournie : démo TypingDNA (empreinte code-barres, carte verdict).

## 7. Contrôles du présentateur

- **Boutons de niveau** (zone basse droite, visibles mais discrets) pour sauter directement à un niveau.
- **Mode God** (filet de sécurité en cas de crise, à ne normalement pas utiliser) : raccourcis clavier, `A` force le profil de A, `B` celui de B.

## 8. Configuration (route dédiée, avant la présentation)

- Enregistrer le **profil de A** : environ **10 saisies** du mot de passe (nombre réglable), enregistrement du téléphone de A (empreinte), de l'inclinaison naturelle (~42°).
- Régler **tous les seuils** (confiance, écart de frappe, tolérance d'angle, etc.).

## 9. Contraintes techniques

- Application web unique, **localhost pour l'instant** ; déploiement VPS envisagé plus tard.
- **Réseau** : partage de connexion (recommandé : les wifi d'université isolent souvent les appareils) ; PC et téléphones sur le même réseau.
- Le **gyroscope exige HTTPS** sur mobile : certificat local (type mkcert) ou tunnel ; sur iOS, autorisation explicite du capteur.
- **Choix de stack par défaut (mon choix, modifiable)** : TypeScript partout ; React + Vite ; serveur Node avec WebSocket pour relier PC et téléphone ; profil de A en JSON ou SQLite ; Chart.js (ou équivalent) pour les graphes en direct.
- Modèle de téléphone (iOS / Android) : non précisé à ce jour.

## 10. Laissé au constructeur

- Algorithme exact de score de frappe, tant qu'il distingue A de B de façon crédible et reste explicable au public.
- Choix de la bibliothèque de graphes et de l'organisation du code.
- Format de stockage du profil.
- Détails d'interface non précisés ci-dessus.

## 11. Choix du rédacteur (à relire, modifiables)

Issus de la relecture par un constructeur indépendant. Ce sont des choix de Claude, non validés par l'utilisateur.

- **Appairage (niv. 2 et 3)** : le QR code encode l'URL d'une session ; la page mobile s'ouvre sur le téléphone, le **PIN se tape sur le téléphone** (pavé numérique), les données partent au serveur par WebSocket. Au niveau 3, le téléphone de A rescanne le **même QR** (même session). La page mobile affiche le pavé PIN, puis l'étape de posture.
- **PIN** : un PIN faux est un **échec dur**, distinct du score ; le PIN est réglable en configuration. Le score du niveau 2 porte sur l'empreinte appareil.
- **Tactile** : la dynamique tactile du pavé PIN (durée, intervalle des appuis) est **mesurée et affichée à titre indicatif**, non notée par défaut.
- **Décision par niveau** : un seul seuil par niveau (accepté / niveau suivant) ; couleurs vert > seuil haut, orange entre les deux, rouge sous le seuil bas (les trois valeurs réglables). Après un succès ou un blocage, un bouton **« Recommencer »** réinitialise la session. Le succès du niveau 3 donne « accès accordé » comme aux niveaux 1 et 2.
- **Orientation** : on compare **beta** (inclinaison), alpha et gamma affichés en information ; mesure moyennée sur une fenêtre courte (~2 s) puis validée par un bouton « Valider » sur le téléphone.
- **Frappe** : profil = moyenne et écart-type du temps de maintien (dwell) et d'intervalle (flight) par touche, calculés sur les ~10 saisies ; la **zone d'incertitude** est issue de cet écart-type. Une option de recalibration rapide est prévue contre un faux rejet de A le jour J.
- **Mode God** : injecte des **mesures synthétiques** (profil A ou B) qui passent par le calcul de score normal, pour garder des graphes dynamiques.
- **Boutons de niveau** : sauter à un niveau considère les niveaux précédents comme non validés et affiche directement le signal du niveau choisi.
- **Téléphones** : en cas d'absence de capteur ou de problème de certificat, prévoir un tunnel HTTPS en repli ; instructions d'installation du certificat local sur chaque téléphone.
- **Langue** : interface en français ; projecteur supposé en 1080p.

## 12. Décision de l'utilisateur sur l'empreinte appareil

- **Empreinte seule**, sans jeton stocké. Les deux téléphones sont de modèles différents, et même à modèle égal, navigateur, version, paramètres et configuration diffèrent. Aucune question ouverte restante.
