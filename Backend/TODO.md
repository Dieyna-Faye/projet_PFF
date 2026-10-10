# TODO - Projet Plateforme IA de gestion des marchés publics

## Objectif
Continuer le projet en alignant l’implémentation backend avec le cahier de charge (Modules + MVP1/MVP2/MVP3).

---

## Étape 1 — Cartographie & gaps (MVP1)
- [ ] Vérifier routes/controllers existants : Auth, rôles, tenders (CRUD + publish + archive), soumission, dépôt PDF, dashboard, audit logging.
- [ ] Lister les endpoints manquants ou partiellement couverts vs : Authentification, gestion des rôles/permissions, création/publication AO, soumission, dépôt documents, analyse/compliance, scoring, dashboard, journalisation.

## Étape 2 — IA minimale (MVP2)
- [ ] Confirmer que `docCheck` + `scoring` + `summary` couvrent : conformité/noconformité, scoring rule-based, résumé automatique.
- [ ] Structurer le stockage du résultat d’analyse (conformité, pièces manquantes/expirées, score, résumé) pour qu’il soit re-consultable.
- [ ] Ajouter/adapter une “grille de conformité” persistée côté bid.

## Étape 3 — Détection de fraude (MVP3 “améliorée mais contrôlée”)
- [x] Améliorer la persistance d’alerts : lier les alertes à un tender (implémenté dans `src/controllers/fraudController.js`).
- [ ] Ajouter une couche de signalisation de collusion simplifiée (graph/connexions via attributs partagés), sans introduire de dépendances IA lourdes.


## Étape 4 — Suivi exécution marchés (Module 6)
- [ ] Vérifier `Contract`/`Payment` : création automatique après attribution.
- [ ] Implémenter ou compléter endpoints : étapes/progrès, pénalités, validation, évaluation finale, prédiction retard.

## Étape 5 — Dashboard décisionnel (Module 7)
- [ ] Compléter les indicateurs : appels publiés, taux participation, économies, marchés en retard, marchés à risque, taux conformité.

## Étape 6 — Qualité & tests
- [ ] Lancer `npm run seed` et valider les endpoints de scoring/fraude sur données de démonstration.
- [ ] Lancer `npm test` si applicable.

---

## Notes
- Le projet est actuellement orienté “rule-based” pour l’IA (conforme/noconforme, scoring, résumé, similarité/fraude).
- Le cahier de charge mentionne OCR/IA avancée : pour le MVP, l’extraction PDF actuelle via `pdf-parse` sert de base.

