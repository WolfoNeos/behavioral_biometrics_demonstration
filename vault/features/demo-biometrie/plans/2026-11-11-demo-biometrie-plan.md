# Démo biométrie comportementale — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'application web de démo où un attaquant (B) est bloqué malgré les bons identifiants, et le vrai utilisateur (A) validé, grâce à des mesures réelles (frappe, empreinte appareil, orientation).

**Architecture:** Une seule application TypeScript. Un serveur Node (Fastify + WebSocket) garde le profil de A, la configuration et l'état de session, et applique la logique d'authentification progressive (3 niveaux). Un front React (Vite) sert trois écrans : démo PC (connexion + console de sécurité), page mobile (PIN + capteurs), configuration. Le calcul de score est dans un module pur partagé, testé en isolation.

**Tech Stack:** TypeScript, Node 20+, Fastify + `@fastify/websocket`, React 18 + Vite, Chart.js (`react-chartjs-2`), `qrcode`, Vitest + Testing Library, mkcert (HTTPS local).

**Spec:** `vault/features/demo-biometrie/plans/2026-11-11-demo-biometrie-design.md`

## Global Constraints

- Un seul utilisateur (A) ; aucune sécurité réelle ; pas de base lourde (profil en `data/profile.json`).
- Trois niveaux : 1 frappe (ID + mot de passe, PC) ; 2 empreinte appareil (+ tactile indicatif) via PIN sur téléphone ; 3 orientation (beta) sur téléphone.
- Signal conforme aux seuils → accès accordé immédiatement, à tout niveau ; suspect → niveau suivant ; niveau 3 échoue → session bloquée. Pas de moyenne entre signaux.
- Tous les seuils réglables en configuration ; ~10 saisies du mot de passe, nombre réglable.
- Un PIN faux est un échec dur, indépendant du score.
- Orientation : beta comparé (alpha/gamma en information), moyenne sur ~2 s, validation par bouton « Valider » sur le téléphone ; exemple de profil 42° ± 5°.
- Couleurs : vert ≥ `accept`, orange ≥ `warn`, rouge sinon ; scores de 0 à 100.
- Interface en français, lisible de loin (1080p, vidéoprojecteur) ; Panneaux Direct / Profil de A ne montrent que le signal de l'étape en cours.
- Le QR code encode l'URL de session ; au niveau 3 le téléphone de A rescanne le même QR.
- Gyroscope : HTTPS obligatoire sur mobile ; iOS exige une autorisation explicite (`DeviceOrientationEvent.requestPermission`).
- Mode God : touches `A` / `B` injectent des mesures synthétiques passant par le score normal. Boutons de niveau : sauter à un niveau, niveaux précédents considérés non validés. Bouton « Recommencer ».
- Réseau : partage de connexion ; localhost d'abord.

## Review Focus

- Mot de passe saisi avec correction (Backspace) ou collé : la frappe ne doit pas planter ni donner NaN ; coller est rejeté ou noté suspect.
- Moins de saisies de profil que prévu (ex. 3) ou une seule touche : le score reste défini (pas de division par zéro).
- Téléphone qui se déconnecte en cours de challenge puis rescanne le QR : la session reprend au même niveau.
- Capteur d'orientation absent ou refus d'autorisation iOS : message clair et repli, pas d'écran vide.
- Deux QR scannés simultanément ou session expirée : le serveur n'accepte qu'un téléphone actif par niveau.

---

## Structure des fichiers

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts
src/shared/types.ts          Types partagés (profil, config, mesures, états)
src/shared/scoring/keystroke.ts   buildKeystrokeProfile, scoreKeystroke
src/shared/scoring/device.ts      compareFingerprint
src/shared/scoring/orientation.ts scoreOrientation
src/shared/scoring/tactile.ts     summarizeTouch (indicatif)
src/shared/auth/machine.ts   Machine d'état des niveaux (pure)
src/server/store.ts          Lecture/écriture profile.json + config
src/server/sessions.ts       Sessions, appairage, relais WebSocket
src/server/index.ts          Fastify : API REST + /ws
src/web/capture/keystroke.ts Capture dwell/flight dans un champ
src/web/capture/fingerprint.ts Empreinte navigateur/OS/canvas
src/web/capture/orientation.ts Capteur + permission iOS
src/web/pages/Demo.tsx       Écran PC (zones vert/bleu/violet/orange)
src/web/pages/Mobile.tsx     Page téléphone
src/web/pages/Config.tsx     Configuration + enrôlement
src/web/components/          Gauge, Barcode, ThresholdChart, AngleDial, DeviceTable, VerdictCard, ControlBar
tests/ (miroir de src/)
scripts/dev-https.md         Procédure mkcert + réseau
```

---

### Task 1: Socle du projet et types partagés

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src/shared/types.ts`, `tests/shared/types.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  - `type Level = 1 | 2 | 3`
  - `interface KeyEvent { key: string; down: number; up: number }` (ms, `performance.now()`)
  - `interface KeystrokeProfile { mean: Record<string, {dwell:number; flight:number}>; std: Record<string,{dwell:number; flight:number}>; samples: number }`
  - `interface Fingerprint { userAgent:string; platform:string; language:string; screen:string; timezone:string; canvasHash:string }`
  - `interface OrientationReading { alpha:number; beta:number; gamma:number }`
  - `interface Thresholds { keystroke:{accept:number;warn:number}; device:{accept:number;warn:number}; orientation:{accept:number;warn:number; toleranceDeg:number}; enrollSamples:number }`
  - `interface Profile { password:string; pin:string; keystroke:KeystrokeProfile|null; fingerprint:Fingerprint|null; beta:number|null }`
  - `interface Verdict { level:Level; score:number; color:'green'|'orange'|'red'; granted:boolean }`
  - `const DEFAULT_THRESHOLDS: Thresholds` (accept 80 / warn 50 ; toleranceDeg 5 ; enrollSamples 10)

- [ ] **Step 1: Écrire le test** `tests/shared/types.test.ts` : `DEFAULT_THRESHOLDS.enrollSamples === 10`, `.orientation.toleranceDeg === 5`, `.keystroke.accept > .keystroke.warn`.
- [ ] **Step 2: Lancer `npx vitest run`** — attendu : échec (module absent).
- [ ] **Step 3: Initialiser le projet** (TypeScript strict, scripts `dev`, `build`, `test`, `server`) et écrire `types.ts` avec les signatures ci-dessus.
- [ ] **Step 4: Lancer `npx vitest run`** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: socle du projet et types partagés`.

### Task 2: Score de frappe (dwell / flight) avec zone d'incertitude

**Files:**
- Create: `src/shared/scoring/keystroke.ts`, `tests/shared/scoring/keystroke.test.ts`

**Interfaces:**
- Consumes: `KeyEvent`, `KeystrokeProfile` (Task 1)
- Produces:
  - `extractTimings(events: KeyEvent[]): {key:string; dwell:number; flight:number}[]` (flight = down[i] − up[i−1], 0 pour la première touche)
  - `buildKeystrokeProfile(samples: KeyEvent[][]): KeystrokeProfile` (moyenne + écart-type par touche, `std` plancher à 5 ms)
  - `scoreKeystroke(profile: KeystrokeProfile, events: KeyEvent[]): { score:number; perKey: {key:string; dwell:number; flight:number; expectedDwell:number; expectedFlight:number; bandDwell:number; bandFlight:number}[] }` — score 0–100 décroissant avec l'écart normalisé moyen ; `band` = écart-type (zone d'incertitude).

- [ ] **Step 1: Tests** : `buildKeystrokeProfile` sur 10 échantillons à ~110 ms donne `mean.dwell≈110` ; `scoreKeystroke` d'un échantillon identique au profil ≥ 90 ; d'un échantillon à ~240 ms saccadé < 50 ; une seule saisie de profil (`samples:1`) donne un score défini (pas de NaN) ; saisie avec touche absente du profil → score défini et pénalisé ; tableau d'événements vide → score 0.
- [ ] **Step 2: Lancer** `npx vitest run tests/shared/scoring/keystroke.test.ts` — attendu : FAIL.
- [ ] **Step 3: Implémenter** les trois fonctions : écart normalisé par touche = |valeur − moyenne| / std ; score = `100 · exp(−moyenne_normalisée / 2)` arrondi.
- [ ] **Step 4: Lancer les tests** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: score de frappe avec zone d'incertitude`.

### Task 3: Scores appareil, orientation et tactile

**Files:**
- Create: `src/shared/scoring/device.ts`, `src/shared/scoring/orientation.ts`, `src/shared/scoring/tactile.ts`, `tests/shared/scoring/{device,orientation,tactile}.test.ts`

**Interfaces:**
- Consumes: `Fingerprint`, `OrientationReading`, `Thresholds` (Task 1)
- Produces:
  - `compareFingerprint(expected: Fingerprint, actual: Fingerprint): { score:number; lines: {field:keyof Fingerprint; expected:string; actual:string; match:boolean}[] }` — score = part de champs identiques × 100 ; `canvasHash` pèse double.
  - `scoreOrientation(expectedBeta:number, readings: OrientationReading[], toleranceDeg:number): { score:number; beta:number; alpha:number; gamma:number; deviation:number }` — moyenne des lectures ; score 100 si |écart| ≤ tolérance puis décroissance linéaire jusqu'à 0 à 4× la tolérance ; liste vide → score 0.
  - `summarizeTouch(taps: {down:number; up:number}[]): { meanDwell:number; meanInterval:number }` (indicatif, non noté)

- [ ] **Step 1: Tests** : empreintes identiques → 100 et toutes les lignes `match:true` ; `canvasHash` différent → score < 70 ; beta 42 attendu, lectures à 41–43 → ≥ 95 ; lectures à 2 (à plat) avec tolérance 5 → < 20 ; liste vide → 0 ; `summarizeTouch([])` → zéros sans NaN.
- [ ] **Step 2: Lancer les trois fichiers de test** — attendu : FAIL.
- [ ] **Step 3: Implémenter** les trois modules selon les formules ci-dessus.
- [ ] **Step 4: Lancer les tests** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: scores appareil, orientation et tactile`.

### Task 4: Machine d'état d'authentification progressive

**Files:**
- Create: `src/shared/auth/machine.ts`, `tests/shared/auth/machine.test.ts`

**Interfaces:**
- Consumes: `Level`, `Verdict`, `Thresholds` (Task 1)
- Produces:
  - `type AuthState = { status:'pending'; level:Level } | { status:'granted'; level:Level; verdict:Verdict } | { status:'blocked'; verdict:Verdict }`
  - `colorFor(score:number, t:{accept:number;warn:number}): 'green'|'orange'|'red'`
  - `startState(): AuthState` (pending niveau 1)
  - `applyVerdict(state: AuthState, level: Level, score: number, t: Thresholds): { state: AuthState; verdict: Verdict }` — score ≥ `accept` → granted ; sinon niveau < 3 → pending niveau+1 ; niveau 3 → blocked.
  - `hardFail(state: AuthState, level: Level): AuthState` — PIN faux : passe au niveau suivant (ou bloque au niveau 3) avec score 0.
  - `jumpTo(level: Level): AuthState` (pending à ce niveau, précédents non validés)
  - `reset(): AuthState`

- [ ] **Step 1: Tests** : score 85 au niveau 1 → granted niveau 1 ; score 30 au niveau 1 → pending niveau 2 ; score 30 au niveau 3 → blocked ; score 85 au niveau 2 → granted niveau 2 ; `colorFor(85)` green, `(60)` orange, `(30)` red ; `hardFail` niveau 2 → pending niveau 3 ; `jumpTo(3).level === 3` ; `reset()` renvoie `startState()` ; `applyVerdict` sur un état déjà granted ne change rien.
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** les fonctions pures.
- [ ] **Step 4: Lancer** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: machine d'état d'authentification progressive`.

### Task 5: Serveur — stockage, API de configuration, sessions WebSocket

**Files:**
- Create: `src/server/store.ts`, `src/server/sessions.ts`, `src/server/index.ts`, `tests/server/store.test.ts`, `tests/server/sessions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4
- Produces:
  - `loadProfile(path?:string): Profile`, `saveProfile(p: Profile, path?:string): void`, `loadThresholds(path?:string): Thresholds`, `saveThresholds(t: Thresholds, path?:string): void` (fichiers sous `data/`, valeurs par défaut si absents)
  - API REST : `GET/PUT /api/profile`, `GET/PUT /api/thresholds`, `POST /api/enroll/keystroke` (corps `{samples: KeyEvent[][]}` → construit et enregistre `profile.keystroke`), `POST /api/enroll/phone` (corps `{fingerprint: Fingerprint; beta:number}`), `POST /api/session` → `{id:string; url:string}` (l'URL pointe vers `/m/<id>`)
  - `class SessionManager`: `create(): Session`, `attachPhone(id:string, ws): void` (remplace un téléphone déjà attaché), `submit(id:string, level:Level, payload): Verdict` (calcule le score avec Tasks 2–3 puis `applyVerdict`/`hardFail`), `jump(id, level)`, `reset(id)`, `inject(id, who:'A'|'B', level)` (mesures synthétiques), `snapshot(id): {state:AuthState; level:Level; live:unknown; expected:unknown}`
  - WebSocket `/ws?session=<id>&role=pc|phone` : messages JSON `{type:'state', ...snapshot}` diffusés à tous les clients de la session à chaque changement ; entrants `{type:'keystroke'|'pin'|'orientation', ...}`, `{type:'jump'|'reset'|'god'}`.

- [ ] **Step 1: Tests** `store` : profil absent → profil vide par défaut ; aller-retour `saveProfile`/`loadProfile` identique. Tests `sessions` : `submit` niveau 1 avec frappe identique au profil → granted ; frappe de B → pending niveau 2 ; PIN faux au niveau 2 → pending niveau 3 ; un deuxième `attachPhone` remplace le premier ; session déconnectée puis rattachée garde son niveau ; `inject('B', 1)` donne un score < `warn` ; `inject('A', 1)` ≥ `accept`.
- [ ] **Step 2: Lancer** `npx vitest run tests/server` — attendu : FAIL.
- [ ] **Step 3: Implémenter** `store.ts`, `SessionManager`, puis `index.ts` (Fastify sur le port 3001, `@fastify/websocket`, routes ci-dessus).
- [ ] **Step 4: Lancer** — attendu : PASS ; `npm run server` démarre et `curl localhost:3001/api/thresholds` renvoie les seuils par défaut.
- [ ] **Step 5: Commit** `feat: serveur, stockage, sessions et WebSocket`.

### Task 6: Captures côté navigateur (frappe, empreinte, orientation)

**Files:**
- Create: `src/web/capture/keystroke.ts`, `src/web/capture/fingerprint.ts`, `src/web/capture/orientation.ts`, `tests/web/capture/*.test.ts`

**Interfaces:**
- Consumes: `KeyEvent`, `Fingerprint`, `OrientationReading` (Task 1)
- Produces:
  - `attachKeystrokeCapture(input: HTMLInputElement, onDone: (events: KeyEvent[]) => void): () => void` — enregistre `keydown`/`keyup`, ignore répétitions automatiques, retire un événement sur Backspace, bloque le collage (`paste` annulé) ; renvoie la fonction de détachement.
  - `collectFingerprint(): Promise<Fingerprint>` — UA, plateforme, langue, écran, fuseau, hash canvas (SHA-256 d'un dessin fixe).
  - `requestOrientation(): Promise<'granted'|'denied'|'unavailable'>` (gère `DeviceOrientationEvent.requestPermission` sur iOS)
  - `collectOrientation(durationMs:number): Promise<OrientationReading[]>`

- [ ] **Step 1: Tests (jsdom)** : une séquence simulée de `keydown`/`keyup` produit des `KeyEvent` ordonnés avec `up > down` ; Backspace retire la dernière touche ; un événement `paste` est annulé (`defaultPrevented`) ; `collectFingerprint` renvoie tous les champs non vides ; `requestOrientation` renvoie `'unavailable'` quand `DeviceOrientationEvent` est absent.
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** les trois modules.
- [ ] **Step 4: Lancer** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: captures frappe, empreinte et orientation`.

### Task 7: Composants de visualisation de la console

**Files:**
- Create: `src/web/components/{Gauge,Barcode,ThresholdChart,AngleDial,DeviceTable,VerdictCard}.tsx`, `tests/web/components/*.test.tsx`

**Interfaces:**
- Consumes: `Verdict`, résultats de `scoreKeystroke`, `compareFingerprint`, `scoreOrientation` (Tasks 2–3)
- Produces (props) :
  - `Gauge({score:number; accept:number; warn:number})` — jauge 0–100 colorée, valeur numérique grande
  - `Barcode({live: number[]; expected: number[]})` — signature de frappe en barres, profil de A face au direct
  - `ThresholdChart({perKey: ...})` — courbes direct vs attendu avec bande d'incertitude (Chart.js), valeurs en ms
  - `AngleDial({expectedBeta:number; tolerance:number; beta:number|null})` — cadran avec zone verte et aiguille
  - `DeviceTable({lines: {field:string; expected:string; actual:string; match:boolean}[]})` — ✓/✗ par ligne
  - `VerdictCard({verdict: Verdict|null})` — grosse icône (✓ vert / ✗ gris), score, texte « Authentifié » / « Échec »

- [ ] **Step 1: Tests** : `Gauge` à 85 affiche « 85 » et la classe `green`, à 30 la classe `red` ; `DeviceTable` rend une croix pour une ligne `match:false` ; `AngleDial` avec `beta:null` affiche « — » sans erreur ; `VerdictCard` avec `granted:true` affiche « Authentifié ».
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** les composants (CSS sobre, grands chiffres ; jetons de couleur vert/orange/rouge communs).
- [ ] **Step 4: Lancer** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: composants de visualisation`.

### Task 8: Écran de démo PC

**Files:**
- Create: `src/web/pages/Demo.tsx`, `src/web/components/ControlBar.tsx`, `src/web/ws.ts`, `src/web/App.tsx`, `tests/web/pages/Demo.test.tsx`

**Interfaces:**
- Consumes: composants (Task 7), `attachKeystrokeCapture` (Task 6), API/WebSocket (Task 5)
- Produces:
  - `ControlBar({onJump:(l:Level)=>void; onReset:()=>void})` — boutons Niveau 1/2/3, Recommencer, liens vers `/config`
  - `useSession(): { snapshot; send(msg): void }` (`ws.ts`) — connexion WebSocket `role=pc`, reconnexion automatique
  - Page `Demo` : zone principale (champ ID + mot de passe au niveau 1 ; QR code + consigne aux niveaux 2–3 ; `VerdictCard` en fin), panneau Direct (haut droite) et Profil de A (milieu droite) pour le **signal du niveau courant seulement**, `Gauge` du niveau courant, `ControlBar` en bas à droite ; écouteur global : touches `A` / `B` (hors champ de saisie) envoient `{type:'god', who}`.

- [ ] **Step 1: Tests** : au niveau 1 la page affiche les champs de connexion ; au niveau 2 elle affiche le QR (élément `img` ou `canvas` avec l'URL de session) et plus le champ mot de passe ; le panneau Direct n'affiche que le composant du niveau courant ; appuyer sur `B` hors champ envoie `{type:'god', who:'B'}` ; appuyer sur `B` dans le champ mot de passe n'envoie rien.
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** la page, le hook et le routage (`/` démo, `/m/:id` mobile, `/config`).
- [ ] **Step 4: Lancer** — attendu : PASS ; `npm run dev` + serveur : ouvrir `/` affiche les trois zones.
- [ ] **Step 5: Commit** `feat: écran de démo PC`.

### Task 9: Page mobile

**Files:**
- Create: `src/web/pages/Mobile.tsx`, `tests/web/pages/Mobile.test.tsx`

**Interfaces:**
- Consumes: Tasks 5, 6
- Produces: page `/m/:id` (WebSocket `role=phone`) avec : pavé numérique PIN (mesure `summarizeTouch`), envoi `{type:'pin', pin, fingerprint, taps}` ; étape posture : bouton « Autoriser le capteur », lecture en continu de l'angle, bouton « Valider » qui envoie `{type:'orientation', readings}` (moyenne sur ~2 s) ; message clair si capteur refusé ou absent.

- [ ] **Step 1: Tests** : saisir quatre chiffres et valider envoie un message `pin` contenant `fingerprint` et `taps` ; refus de permission affiche « Capteur d'orientation indisponible » ; au niveau 3 le bouton « Valider » est présent ; si le serveur renvoie une reprise de session au niveau 3, la page affiche directement l'étape posture.
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** la page mobile (grandes touches, lisible).
- [ ] **Step 4: Lancer** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: page mobile PIN et posture`.

### Task 10: Page de configuration et enrôlement

**Files:**
- Create: `src/web/pages/Config.tsx`, `tests/web/pages/Config.test.tsx`

**Interfaces:**
- Consumes: Task 5 (API), Task 6 (captures)
- Produces: page `/config` : (a) définir ID, mot de passe, PIN ; (b) enrôlement frappe : saisie répétée du mot de passe avec compteur « n / N » (N = `enrollSamples`), puis `POST /api/enroll/keystroke` ; (c) enrôlement du téléphone de A : QR vers une page de configuration mobile qui envoie empreinte et angle naturel (`POST /api/enroll/phone`) ; (d) réglage de tous les seuils (`Thresholds`) avec valeurs par défaut restaurables ; (e) bouton de recalibration rapide de la frappe.

- [ ] **Step 1: Tests** : la page affiche le compteur « 0 / 10 » ; après 10 saisies simulées, l'API d'enrôlement est appelée avec 10 échantillons ; modifier `enrollSamples` à 5 change le compteur en « 0 / 5 » ; enregistrer les seuils appelle `PUT /api/thresholds` avec les valeurs saisies ; une saisie avec collage est refusée.
- [ ] **Step 2: Lancer** — attendu : FAIL.
- [ ] **Step 3: Implémenter** la page.
- [ ] **Step 4: Lancer** — attendu : PASS.
- [ ] **Step 5: Commit** `feat: configuration et enrôlement du profil de A`.

### Task 11: HTTPS local, réseau et répétition de bout en bout

**Files:**
- Create: `scripts/dev-https.md`, `tests/e2e/scenario.test.ts`; Modify: `vite.config.ts`, `vault/core/03-devops-cicd.md`, `vault/core/04-development.md`, `vault/MEMORY.md`, `vault/CHANGELOG.md`

**Interfaces:**
- Consumes: toutes les tâches précédentes.

- [ ] **Step 1: Test de scénario (Vitest, sans navigateur)** via `SessionManager` : B (frappe fausse) → niveau 2 ; B (empreinte inconnue) → niveau 3 ; B à plat (beta 2) → blocked ; puis A à chaque niveau séparément → granted ; la configuration par défaut produit exactement ces issues.
- [ ] **Step 2: Lancer** `npx vitest run tests/e2e` — attendu : PASS (sinon ajuster seuils par défaut, pas la logique).
- [ ] **Step 3: HTTPS** : configurer Vite en HTTPS avec certificat mkcert, proxy `/api` et `/ws` vers le serveur ; l'URL du QR utilise l'IP locale du PC ; documenter dans `scripts/dev-https.md` l'installation du certificat sur les téléphones (iOS : profil + approbation complète ; Android), l'usage du partage de connexion, et le repli tunnel HTTPS.
- [ ] **Step 4: Répétition manuelle** sur le réseau réel avec les deux téléphones : exécuter les 4 étapes du scénario du design ; vérifier le gyroscope sur chaque téléphone et la lisibilité des panneaux au vidéoprojecteur.
- [ ] **Step 5: Documenter dans le vault** (core/03, core/04, `MEMORY.md`, `CHANGELOG.md`, `features/demo-biometrie/README.md`) puis **commit** `docs: HTTPS local, réseau et vault`.

---

## Auto-relecture

- **Couverture du design** : §4 → Tasks 2–5 ; §5 scénario → Task 11 ; §6 interface → Tasks 7–8 ; §7 contrôles → Task 8 (ControlBar, Mode God) et Task 5 (`jump`, `inject`) ; §8 configuration → Task 10 ; §9 contraintes → Task 11 ; §11 choix (PIN dur, beta, appairage) → Tasks 4, 5, 9.
- **Cohérence des types** : `Thresholds`, `Verdict`, `AuthState` définis aux Tasks 1 et 4, repris tels quels ensuite.
- **Proportion** : plan en signatures et noms de tests, pas de corps de fonction hors formule de score.
