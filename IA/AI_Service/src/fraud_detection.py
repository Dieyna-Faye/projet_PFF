"""
Module de Détection de Fraude & Collusion (Section 5.5 & 7.4)
Détection d'anomalies via Isolation Forest (Scikit-learn) et analyse de graphes de collusion.
"""

from typing import List, Dict, Any
import numpy as np
import re

def _canonical(value: Any, phone: bool = False) -> str:
    raw = str(value or "").strip().casefold()
    if phone:
        return re.sub(r"\D", "", raw)
    return " ".join(raw.split())

def detect_financial_anomalies(bids: List[Dict[str, Any]], estimated_budget: float) -> List[Dict[str, Any]]:
    """
    Utilise Isolation Forest pour identifier statistiquement les offres financières aberrantes.
    """
    alerts = []
    valid_bids = []
    for bid in bids:
        try:
            amount = float(bid.get("financialAmount") or 0)
        except (TypeError, ValueError):
            continue
        if np.isfinite(amount) and amount > 0:
            valid_bids.append({**bid, "financialAmount": amount})
    if not valid_bids:
        return alerts

    amounts = [float(b["financialAmount"]) for b in valid_bids]

    # Détection par règles de seuils standards
    for b in valid_bids:
        amt = float(b["financialAmount"])
        ratio = amt / estimated_budget if estimated_budget > 0 else 1.0
        if ratio < 0.55:
            alerts.append({
                "type": "prix_anormalement_bas",
                "severity": "eleve",
                "message": f"Signal à examiner : montant inférieur à 55 % du budget estimatif ({amt} / {estimated_budget}); ce seuil ne démontre pas une irrégularité.",
                "metadata": {"bidId": b.get("id"), "amount": amt, "budget": estimated_budget, "ratio": round(ratio, 2), "reviewRequired": True}
            })
        elif ratio > 1.25:
            alerts.append({
                "type": "prix_anormalement_eleve",
                "severity": "moyen",
                "message": f"Signal à examiner : offre dépassant de {round((ratio - 1)*100)}% le budget estimatif.",
                "metadata": {"bidId": b.get("id"), "amount": amt, "budget": estimated_budget, "ratio": round(ratio, 2), "reviewRequired": True}
            })

    # Machine Learning : Détection d'anomalies avec Isolation Forest (si >= 4 offres)
    if len(valid_bids) >= 4:
        try:
            from sklearn.ensemble import IsolationForest
            X = np.array(amounts).reshape(-1, 1)
            clf = IsolationForest(contamination=0.25, random_state=42)
            preds = clf.fit_predict(X)  # -1 pour anomalie, 1 pour normal

            for i, pred in enumerate(preds):
                if pred == -1:
                    b = valid_bids[i]
                    amt = amounts[i]
                    alerts.append({
                        "type": "anomalie_statistique_prix_isolation_forest",
                        "severity": "moyen",
                        "message": f"Signal statistique à examiner pour le montant {amt}; la comparaison porte uniquement sur les offres fournies.",
                        "metadata": {"bidId": b.get("id"), "amount": amt, "algorithm": "IsolationForest", "reviewRequired": True}
                    })
        except Exception:
            pass

    return alerts

def detect_collusion_network(suppliers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Construit le graphe de connexions entre soumissionnaires (adresses, téléphones, emails, SIRET).
    """
    alerts = []
    n = len(suppliers)
    for i in range(n):
        for j in range(i + 1, n):
            s1 = suppliers[i]
            s2 = suppliers[j]
            links = []
            if _canonical(s1.get("phone"), phone=True) and _canonical(s1.get("phone"), phone=True) == _canonical(s2.get("phone"), phone=True):
                links.append("Même numéro de téléphone")
            if _canonical(s1.get("address")) and _canonical(s1.get("address")) == _canonical(s2.get("address")):
                links.append("Même adresse postale")
            if _canonical(s1.get("email")) and _canonical(s1.get("email")) == _canonical(s2.get("email")):
                links.append("Même adresse email")
            if _canonical(s1.get("registreCommerce")) and _canonical(s1.get("registreCommerce")) == _canonical(s2.get("registreCommerce")):
                links.append("Même registre de commerce")

            if links:
                alerts.append({
                    "type": "collusion_reseau",
                    "severity": "moyen",
                    "message": f"Signal à vérifier : des coordonnées sont partagées par '{s1.get('companyName') or s1.get('id')}' et '{s2.get('companyName') or s2.get('id')}' ({', '.join(links)})",
                    "metadata": {
                        "supplier1_id": s1.get("id"),
                        "supplier2_id": s2.get("id"),
                        "shared_links": links
                    }
                })
    return alerts

def detect_win_rotation(historical_contracts: List[Dict[str, Any]], current_supplier_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Détecte une rotation suspecte des gagnants (Bid Rigging) parmi les soumissionnaires actuels.
    """
    alerts = []
    if not historical_contracts or len(historical_contracts) < 3:
        return alerts

    wins = {}
    for c in historical_contracts:
        sup_id = c.get("supplierId")
        if sup_id:
            wins[sup_id] = wins.get(sup_id, 0) + 1

    common_winners = [sup_id for sup_id in current_supplier_ids if wins.get(sup_id, 0) >= 2]
    # Repeated wins alone do not establish rotation; require time-ordered awards
    # and multiple suppliers alternating in the observed sequence.
    ordered = [c.get("supplierId") for c in sorted(historical_contracts, key=lambda c: str(c.get("startDate") or c.get("createdAt") or "")) if c.get("supplierId") in current_supplier_ids]
    alternations = sum(1 for a, b in zip(ordered, ordered[1:]) if a != b)
    if len(common_winners) >= 2 and len(ordered) >= 4 and alternations >= 3:
        alerts.append({
            "type": "rotation_suspecte_gagnants",
            "severity": "moyen",
            "message": f"Signal à vérifier : {len(common_winners)} fournisseurs récurrents alternent dans les contrats observés",
            "metadata": {"recurring_winners": common_winners, "observed_awards": len(ordered), "alternations": alternations}
        })
    return alerts
