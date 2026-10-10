"""
Module de Détection de Fraude & Collusion (Section 5.5 & 7.4)
Détection d'anomalies via Isolation Forest (Scikit-learn) et analyse de graphes de collusion.
"""

from typing import List, Dict, Any
import numpy as np

def detect_financial_anomalies(bids: List[Dict[str, Any]], estimated_budget: float) -> List[Dict[str, Any]]:
    """
    Utilise Isolation Forest pour identifier statistiquement les offres financières aberrantes.
    """
    alerts = []
    valid_bids = [b for b in bids if b.get("financialAmount") and float(b["financialAmount"]) > 0]
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
                "message": f"Offre anormalement basse ({amt} vs budget {estimated_budget}) : risque de dumping ou défaillance",
                "metadata": {"bidId": b.get("id"), "amount": amt, "budget": estimated_budget, "ratio": round(ratio, 2)}
            })
        elif ratio > 1.25:
            alerts.append({
                "type": "prix_anormalement_eleve",
                "severity": "moyen",
                "message": f"Offre dépassant de {round((ratio - 1)*100)}% le budget estimatif",
                "metadata": {"bidId": b.get("id"), "amount": amt, "budget": estimated_budget, "ratio": round(ratio, 2)}
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
                        "severity": "eleve",
                        "message": f"Offre financière de {amt} classée comme aberrante statistiquement par le modèle Isolation Forest",
                        "metadata": {"bidId": b.get("id"), "amount": amt, "algorithm": "IsolationForest"}
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
            if s1.get("phone") and s1.get("phone") == s2.get("phone"):
                links.append(f"Même numéro de téléphone : {s1.get('phone')}")
            if s1.get("address") and s1.get("address") == s2.get("address"):
                links.append(f"Même adresse postale : {s1.get('address')}")
            if s1.get("email") and s1.get("email") == s2.get("email"):
                links.append(f"Même adresse email : {s1.get('email')}")
            if s1.get("registreCommerce") and s1.get("registreCommerce") == s2.get("registreCommerce"):
                links.append(f"Même registre de commerce : {s1.get('registreCommerce')}")

            if links:
                alerts.append({
                    "type": "collusion_reseau",
                    "severity": "critique",
                    "message": f"Liaison directe détectée entre concurrents '{s1.get('companyName')}' et '{s2.get('companyName')}' ({', '.join(links)})",
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
    if len(common_winners) >= 2:
        alerts.append({
            "type": "rotation_suspecte_gagnants",
            "severity": "moyen",
            "message": f"Suspicion de partage cyclique de marchés : {len(common_winners)} fournisseurs concurrents sont des gagnants récurrents passés",
            "metadata": {"recurring_winners": common_winners}
        })
    return alerts
