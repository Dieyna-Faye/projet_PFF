# Marchés publics — installation et démarrage

La plateforme comprend une API Express/SQLite, une interface React et un service IA FastAPI. Le service IA ajoute des fonctions d’extraction et de détection de signaux; il ne remplace pas l’examen de la commission ni les décisions d’attribution.

## Prérequis

- Node.js 20 ou plus récent et npm.
- Python 3.10 ou plus récent.
- Tesseract OCR est facultatif; sans lui, l’extraction du texte PDF reste disponible quand le PDF contient du texte.

## Installation Windows (PowerShell)

Ouvrir trois terminaux PowerShell dans le dossier du projet.

### 1. API

```powershell
Set-Location C:\laragon\www\Projet_PFF\Backend
npm install
Copy-Item .env.example .env
```

Dans `Backend\.env`, remplacer `JWT_SECRET` par une valeur aléatoire privée d’au moins 32 caractères. L’API utilise par défaut `Backend\ data\marches.db` et `Backend\uploads`.

Pour une première base vide, initialiser les tables puis démarrer:

```powershell
node -e "require('./src/models').sequelize.sync().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })"
npm start
```

Sur une base déjà utilisée, faire une copie de sauvegarde de `Backend\data\marches.db`, puis appliquer les migrations additives une par une avant de démarrer la nouvelle version:

```powershell
Copy-Item .\data\marches.db ('.\data\marches.db.backup-' + (Get-Date -Format yyyyMMdd-HHmmss))
node src/migrations/20261011-score-data-availability.js
node src/migrations/20261011-bid-document-review.js
node src/migrations/20261011-bid-analysis-fields.js
node src/migrations/20261011-authority-audit-permission.js
node src/migrations/20261012-committee-decisions.js
node src/migrations/20261012-contract-view-permission.js
node src/migrations/20261012-score-coverage.js
node src/migrations/20261012-commission-rbac.js
npm start
```

Les migrations ajoutent ou ajustent les colonnes utilisées par l’analyse et la revue documentaire; elles ne remplacent pas la base. Ne pas lancer `sequelize.sync({ force: true })` sur une base contenant des données.

### 2. Interface web

```powershell
Set-Location C:\laragon\www\Projet_PFF\marche_publics
npm install
Copy-Item .env.example .env
npm run dev
```

Ouvrir l’adresse Vite affichée dans le terminal (par défaut `http://localhost:5173`). `VITE_API_URL` pointe par défaut vers `http://localhost:4000/api`.

### 3. Service IA

```powershell
Set-Location C:\laragon\www\Projet_PFF\IA\AI_Service
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --host 127.0.0.1 --port 5000
```

Une clé Gemini est facultative. Sans clé, le chatbot utilise une réponse de repli prudente. Garder le service IA lié à `127.0.0.1` sauf si un déploiement contrôlé exige une autre configuration; ne pas exposer l’API sans pare-feu et authentification adaptés.

Pour activer les réponses libres du chatbot, créer `IA\AI_Service\.env` depuis `.env.example` s’il n’existe pas, puis renseigner `GEMINI_API_KEY`. Le service charge maintenant ce fichier au démarrage; après modification, redémarrer le service IA.

## Compte de démonstration

Les données de démonstration ne sont pas créées automatiquement. `npm run seed` est réservé à une base vide. Pour ajouter des cas de parcours à une base locale existante sans l’effacer, lancer depuis `Backend`:

```powershell
npm run seed:scenarios
```

Le script est réexécutable et crée quatre appels d’offres, des offres en examen, rejetées, attribuées et perdues, deux contrats (un actif et un terminé), des paiements, jalons, livrables et entrées d’audit. Les pièces sont des PDF synthétiques de démonstration et ne représentent pas des documents authentiques.

Comptes ajoutés par les scénarios, avec le mot de passe local commun `Scenario-2026!`:

- `autorite.scenario@marche.gov`
- `commission.scenario@marche.gov`
- `scenario.fournisseur1@demo.sn`
- `scenario.fournisseur2@demo.sn`
- `scenario.fournisseur3@demo.sn`

## Contrôles

Compilation frontend:

```powershell
Set-Location C:\laragon\www\Projet_PFF\marche_publics
npm run build
```

Tests API sur une base SQLite temporaire:

```powershell
Set-Location C:\laragon\www\Projet_PFF\Backend
$env:DB_STORAGE = Join-Path $env:TEMP ('pff-test-' + [guid]::NewGuid().ToString('N') + '.db')
npm test
```

L’analyse de conformité reste « à vérifier » tant qu’un membre habilité n’a pas examiné les pièces requises. La note globale reste absente jusqu’à ce que tous les critères nécessaires au calcul soient disponibles.
