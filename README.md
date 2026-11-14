# Agent IA — chat multi-fournisseurs

Agent conversationnel web où **chaque utilisateur apporte sa propre clé API** (Groq, OpenAI, Mistral, Google Gemini, Anthropic Claude, OpenRouter, DeepSeek, Together AI, ou toute API compatible OpenAI comme Ollama).

- 100 % statique : aucun serveur, aucune base de données, hébergement Firebase gratuit (plan Spark).
- La clé API reste **dans le navigateur de l'utilisateur** et part directement chez son fournisseur.
- Réponses affichées au fil de l'eau, mise en forme Markdown (titres, listes, tableaux, code avec bouton « Copier »), choix du modèle, instructions système, historique conservé localement.

## Structure

```
agent-ia-chat/
├── public/              ← le site (ce que Firebase publie)
│   ├── index.html
│   ├── style.css
│   ├── app.js           ← toute la logique (fournisseurs, chat, rendu)
│   └── favicon.svg
├── firebase.json        ← configuration de l'hébergement + en-têtes de sécurité
├── .firebaserc          ← l'identifiant de VOTRE projet Firebase (à modifier)
├── .gitignore
└── README.md
```

---

## Guide de mise en ligne, étape par étape

### Étape 0 — Prérequis (une seule fois)

1. Un compte **GitHub** : https://github.com/signup
2. Un compte **Google** (pour Firebase).
3. **Node.js** (version LTS) : https://nodejs.org → téléchargez, installez, puis vérifiez dans un terminal :
   ```bash
   node -v
   ```
4. **Git** : https://git-scm.com/downloads (sous Windows, installez « Git for Windows », qui fournit aussi « Git Bash »).

### Étape 1 — Mettre le code sur GitHub

1. Sur GitHub, cliquez sur **New repository**.
2. Nom : `agent-ia-chat`, visibilité Public ou Private, **ne cochez pas** « Add a README ». Cliquez sur **Create repository**.
3. Dans un terminal, placez-vous dans le dossier décompressé `agent-ia-chat`, puis :
   ```bash
   git init
   git add .
   git commit -m "Première version de l'agent IA"
   git branch -M main
   git remote add origin https://github.com/VOTRE-PSEUDO/agent-ia-chat.git
   git push -u origin main
   ```
   > Variante sans terminal : sur la page du dépôt vide, cliquez sur **uploading an existing file**, puis glissez-déposez le contenu du dossier. Attention : les fichiers commençant par un point (`.firebaserc`, `.gitignore`) sont parfois masqués par l'explorateur de fichiers. Affichez les fichiers cachés avant de les glisser.

### Étape 2 — Créer le projet Firebase

1. Allez sur https://console.firebase.google.com → **Créer un projet**.
2. Donnez un nom (ex. `agent-ia-chat`). Google Analytics n'est pas nécessaire.
3. Une fois le projet créé, notez son **ID de projet** (dans ⚙ Paramètres du projet, par ex. `agent-ia-chat-1a2b3`).
4. Dans le menu de gauche : **Créer → Hosting → Commencer**. Vous pouvez passer les écrans d'explication (on fait tout avec la CLI).

### Étape 3 — Renseigner votre ID de projet

Ouvrez `.firebaserc` et remplacez `VOTRE-ID-DE-PROJET-FIREBASE` par votre ID :
```json
{ "projects": { "default": "agent-ia-chat-1a2b3" } }
```
Enregistrez puis envoyez la modification sur GitHub :
```bash
git commit -am "Configuration du projet Firebase"
```
```bash
git push
```

### Étape 4 — Installer l'outil Firebase et se connecter

```bash
npm install -g firebase-tools
```
```bash
firebase login
```
Une page Google s'ouvre : connectez-vous avec le compte utilisé à l'étape 2.

> ⚠️ **Ne lancez pas `firebase init hosting`** : les fichiers de configuration sont déjà fournis, et cette commande proposerait d'écraser `index.html`.

### Étape 5 — (Facultatif) Tester en local

```bash
firebase emulators:start --only hosting
```
Ouvrez http://localhost:5000, testez avec votre clé Groq, puis faites `Ctrl+C` pour arrêter.

### Étape 6 — Publier le site

Depuis le dossier `agent-ia-chat` :
```bash
firebase deploy --only hosting
```
À la fin, la commande affiche l'adresse publique, par exemple :
`Hosting URL: https://agent-ia-chat-1a2b3.web.app` 🎉

Partagez ce lien : chaque personne saisira son fournisseur et sa clé.

### Étape 7 — (Recommandé) Déploiement automatique à chaque push sur GitHub

```bash
firebase init hosting:github
```
Répondez aux questions :
- **For which GitHub repository…** → `VOTRE-PSEUDO/agent-ia-chat`
- **Set up the workflow to run a build script before every deploy?** → **No**
- **Set up automatic deployment to your site's live channel when a PR is merged?** → **Yes**
- **What is the name of the GitHub branch…** → `main`

L'outil crée automatiquement la clé secrète dans GitHub et deux fichiers dans `.github/workflows/`. Envoyez-les :
```bash
git add .
git commit -m "Déploiement automatique Firebase"
git push
```
Désormais, chaque modification poussée sur `main` est publiée automatiquement (suivi dans l'onglet **Actions** de GitHub). Chaque Pull Request obtient aussi une adresse d'aperçu.

### Étape 8 — (Facultatif) Nom de domaine personnalisé

Console Firebase → **Hosting → Ajouter un domaine personnalisé**, puis suivez les instructions DNS (enregistrements A/TXT chez votre registraire).

---

## Utilisation (côté utilisateur)

1. Ouvrir le site → choisir le **fournisseur** (ex. Groq).
2. Coller sa **clé API** (lien « Obtenir une clé » sous le champ ; pour Groq : https://console.groq.com/keys).
3. Cocher « Mémoriser ma clé » seulement sur un appareil personnel.
4. Choisir le modèle dans la liste en haut, puis discuter.
5. **⚙ Paramètres** : changer de fournisseur, de clé, d'instructions système ou de température.
6. **⎋ Déconnexion** : efface la clé et l'historique du navigateur.

## Fournisseurs

| Fournisseur | Remarque |
|---|---|
| Groq | Gratuit avec limites, très rapide. |
| OpenAI, Mistral, Gemini, OpenRouter, Together | Fonctionnent directement depuis le navigateur. |
| Anthropic (Claude) | Utilise l'en-tête officiel d'accès direct depuis le navigateur. |
| DeepSeek | Peut bloquer les appels depuis un navigateur (CORS) selon la période. Si c'est le cas, passez par OpenRouter. |
| Autre (Ollama…) | Saisir l'URL de base, ex. `http://localhost:11434/v1`. Pour Ollama, lancez-le avec `OLLAMA_ORIGINS=*` afin d'autoriser le site. |

Pour **ajouter un fournisseur**, ajoutez une entrée dans l'objet `PROVIDERS` en haut de `public/app.js` (le nom, l'URL de base et le modèle par défaut suffisent s'il est compatible OpenAI).

## Sécurité : ce qu'il faut savoir

- La clé n'est **jamais** envoyée à votre site ni à Firebase : elle est stockée dans le navigateur (`sessionStorage` par défaut, `localStorage` si « Mémoriser » est coché), puis envoyée uniquement au fournisseur choisi.
- Les en-têtes de `firebase.json` (Content-Security-Policy) interdisent tout script externe, ce qui limite fortement le risque de vol de clé par injection de code.
- Chaque utilisateur paie (ou consomme le quota gratuit de) **sa propre** clé. Conseillez de fixer une limite de dépense chez le fournisseur.

## Dépannage

| Problème | Solution |
|---|---|
| « Clé API invalide » | Vérifiez la clé (pas d'espace) et que le bon fournisseur est sélectionné. |
| « Impossible de joindre le fournisseur… CORS » | Le fournisseur refuse les appels depuis un navigateur. Utilisez OpenRouter, ou un autre fournisseur. |
| « Modèle introuvable » | Choisissez un autre modèle dans la liste, ou utilisez « ✎ Autre modèle… ». |
| « Limite de requêtes / quota » | Attendez un peu (offres gratuites) ou vérifiez votre facturation. |
| Le site n'est pas à jour après un déploiement | Rechargez sans cache : `Ctrl+Maj+R` (`Cmd+Maj+R` sur Mac). |
| `firebase: command not found` | Fermez et rouvrez le terminal après `npm install -g firebase-tools`. |
