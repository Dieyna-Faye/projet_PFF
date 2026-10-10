# Service IA - Plateforme de Gestion des Marchés Publics
**Conforme aux sections 6, 7.4 et 8 du Cahier des Charges PFF**

Ce microservice Python implémente les fonctionnalités d'Intelligence Artificielle requises :
1. **OCR & Extraction de Documents** (`src/ocr.py`) : Lecture de PDF et scans d'images de pièces administratives avec détection de mots-clés obligatoires (Quitus fiscal, RCCM, Attestation sociale).
2. **NLP & Similarité Sémantique** (`src/nlp_similarity.py`) : Vectorisation TF-IDF et Cosine Similarity (Scikit-learn) pour détecter les documents identiques et le plagiat entre concurrents.
3. **Détection d'Anomalies Financières** (`src/fraud_detection.py`) : Utilisation du modèle `IsolationForest` de Scikit-learn pour détecter les prix anormaux et graphe de connexions pour repérer les ententes illicites / collusion.
4. **Prédiction de Risque de Retard d'Exécution** (`src/delay_prediction.py`) : Modèle statistique de risque estimant la probabilité de dépassement des délais contractuels.
5. **Chatbot d'Assistance aux Fournisseurs** (`src/chatbot.py`) : Assistant conversationnel guidant les candidats sur les pièces obligatoires et le barème officiel.

---

## 🚀 Démarrage Rapide

### 1. Prérequis
* Python 3.9 ou supérieur installé.
* *(Optionnel pour les scans images)* : Tesseract OCR installé sur la machine.

### 2. Installation & Lancement sous Windows
Double-cliquez sur `start.bat` ou exécutez dans un terminal :
```bash
cd AI_Service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

Le service sera actif sur : **http://localhost:5000**
La documentation Swagger interactive est accessible sur : **http://localhost:5000/docs**

---

## 📡 Endpoints Disponibles

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Statut du service et liste des modules IA actifs |
| `POST` | `/api/ai/ocr/extract-path` | Extraction de texte et détection de mots-clés d'un PDF local |
| `POST` | `/api/ai/ocr/upload` | Téléversement d'un PDF/Scan et analyse OCR |
| `POST` | `/api/ai/nlp/similarity` | Matrice de similarité TF-IDF et alertes de plagiat |
| `POST` | `/api/ai/fraud/detect` | Détection d'anomalies de prix (Isolation Forest) et collusion |
| `POST` | `/api/ai/predict/delay` | Prédiction du risque de retard d'exécution de marché |
| `POST` | `/api/ai/chatbot/ask` | Assistant conversationnel pour les soumissionnaires |
