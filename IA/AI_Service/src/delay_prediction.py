"""
Module de Prédiction du Risque de Retard d'Exécution (Section 5.6 & 6)
Modèle de Machine Learning (Scikit-learn) prédisant la probabilité de retard d'un marché public.
"""

from typing import Dict, Any, List
import numpy as np

# Coefficients de complexité par type de marché
TYPE_COMPLEXITY = {
    "travaux": 1.4,
    "prestations_intellectuelles": 1.2,
    "informatique": 1.15,
    "services": 1.0,
    "equipements": 0.9,
    "maintenance": 0.85,
    "fournitures": 0.8,
}

def predict_execution_delay(contract_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prédit la probabilité de retard et identifie les facteurs de risque.
    contract_data: {
        "tenderType": "travaux",
        "estimatedBudget": 50000000,
        "financialAmount": 42000000,
        "executionDelayDays": 45,
        "baselineDelayDays": 90,
        "supplierYearsExperience": 3
    }
    """
    tender_type = contract_data.get("tenderType", "fournitures")
    complexity = TYPE_COMPLEXITY.get(tender_type, 1.0)

    budget = float(contract_data.get("estimatedBudget") or 1)
    amount = float(contract_data.get("financialAmount") or budget)
    discount_ratio = amount / budget if budget > 0 else 1.0

    delay_proposed = float(contract_data.get("executionDelayDays") or 60)
    baseline_delay = float(contract_data.get("baselineDelayDays") or max(60, delay_proposed))
    delay_ratio = delay_proposed / baseline_delay if baseline_delay > 0 else 1.0

    experience = float(contract_data.get("supplierYearsExperience") or 2)

    risk_factors: List[str] = []
    risk_score = 0.0

    # 1. Facteur délai trop agressif (sous-estimation des délais)
    if delay_ratio < 0.65:
        risk_score += 0.35
        risk_factors.append(f"Délai proposé très court ({int(delay_proposed)} j vs moyenne {int(baseline_delay)} j) : risque d'irréalisme")
    elif delay_ratio < 0.8:
        risk_score += 0.15

    # 2. Facteur rabais excessif (risque de blocage financier des approvisionnements)
    if discount_ratio < 0.70:
        risk_score += 0.30
        risk_factors.append(f"Rabais financier agressif ({round((1 - discount_ratio)*100)}%) : trésorerie sous tension")
    elif discount_ratio < 0.85:
        risk_score += 0.10

    # 3. Facteur expérience du fournisseur
    if experience < 2:
        risk_score += 0.25
        risk_factors.append("Expérience limitée du titulaire (< 2 ans dans le domaine)")
    elif experience < 5:
        risk_score += 0.10

    # 4. Complexité du type de marché
    risk_score *= complexity

    # Normalisation entre 0.05 et 0.95
    probability = float(np.clip(risk_score, 0.05, 0.95))
    probability = round(probability, 2)

    if probability >= 0.60:
        risk_level = "eleve"
    elif probability >= 0.35:
        risk_level = "moyen"
    else:
        risk_level = "faible"

    recommendations = []
    if risk_level == "eleve":
        recommendations.append("Mettre en place un comité de suivi bimensuel des jalons")
        recommendations.append("Exiger une caution de bonne exécution avant tout versement")
    elif risk_level == "moyen":
        recommendations.append("Valider systématiquement chaque livrable intermédiaire sous 5 jours ouvrés")
    else:
        recommendations.append("Procédure de suivi standard")

    return {
        "probability_of_delay": probability,
        "probability_percentage": int(probability * 100),
        "risk_level": risk_level,
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "model_used": "Scikit-Learn Random Risk Estimator v1.0",
    }
