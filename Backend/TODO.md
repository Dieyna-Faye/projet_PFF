# TODO - Projet Plateforme IA de gestion des marchés publics

## Objectif
Continuer le projet en alignant l’implémentation backend avec le cahier de charge (Modules + MVP1/MVP2/MVP3).

---

## Étape 1 — Cartographie & gaps (MVP1)
- [x] Vérifier routes/controllers existants : Auth, rôles, tenders (CRUD + publish + archive), soumission, dépôt PDF, dashboard, audit logging.
- [x] Corriger les collisions et confusions de routes REST (`/api/tenders/:id/bids`, `/api/bids/:id/evaluations`, etc.).
- [x] Sécuriser le téléchargement des fichiers (`/api/files`) avec contrôle d'accès strict par propriétaire/rôle.

## Étape 2 — IA minimale (MVP2)
- [x] Confirmer que `docCheck` + `scoring` + `summary` couvrent : conformité/noconformité, scoring rule-based, résumé automatique.
- [x] Structurer le stockage du résultat d’analyse (conformité, pièces manquantes/expirées, 5 sous-scores, résumé).
- [x] Ajouter/adapter une “grille de conformité” persistée côté bid (`complianceDetails`).
- [x] Générer et persister l'empreinte cryptographique de reçu numérique (`receiptHash`).

## Étape 3 — Détection de fraude (MVP3 “améliorée mais contrôlée”)
- [x] Améliorer la persistance d’alerts : lier les alertes à un tender (implémenté dans `src/controllers/fraudController.js`).
- [x] Ajouter l'analyse de réseau de collusion (graphe de connexions via téléphone, adresse, email, registre de commerce).
- [x] Détection de rotation suspecte des gagnants (Win Rotation / Bid Rigging historique).
- [x] Corriger le champ `extractedText` manquant dans `BidDocument` pour permettre la similarité documentaire.

## Étape 4 — Suivi exécution marchés (Module 6)
- [x] Vérifier `Contract`/`Payment` : création automatique après attribution avec calcul de la date d'échéance.
- [x] Implémenter les contrôleurs et routes pour les **Livrables** (`Deliverable`) : dépôt, consultation, validation/rejet.
- [x] Implémenter les contrôleurs et routes pour les **Jalons / Étapes** (`ContractMilestone`) : création, consultation, mise à jour statut.
- [x] Implémenter la prédiction dynamique du retard d'exécution comparant l'avancement réel au temps écoulé.

## Étape 5 — Dashboard décisionnel (Module 7)
- [x] Compléter les indicateurs : appels publiés, taux participation, économies, marchés en retard, marchés à risque, taux conformité, alertes ouvertes.

## Étape 6 — Intégration IA Python (Conforme Sections 6, 7.4, 8)
- [x] Connecter le service IA Python FastAPI (`src/services/aiClient.js` avec repli automatique Node.js local).
- [x] Unifier le Backend Node.js et éliminer le dossier doublon `IA/Backend`.

## Étape 7 — Interface Frontend
- [ ] Développer l'interface Frontend web (React / Tailwind / HTML5) pour les 5 rôles.

