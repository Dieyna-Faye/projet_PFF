"""Explainable contract delay-risk rules; no trained model or probabilities are claimed."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional


def _date(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except (TypeError, ValueError):
        return None


def predict_execution_delay(contract_data: Dict[str, Any]) -> Dict[str, Any]:
    """Return an evidence-based risk classification from supplied contract facts.

    Unknown facts stay unknown. The score is a transparent rule indicator, not a
    probability and not the output of a trained model.
    """
    factors: List[str] = []
    score = 0
    missing: List[str] = []

    progress = contract_data.get("progress")
    start = _date(contract_data.get("startDate"))
    end = _date(contract_data.get("endDate"))
    today = _date(contract_data.get("asOfDate")) or date.today()
    if progress is None:
        missing.append("avancement")
    if not start or not end:
        missing.append("dates du contrat")

    if progress is not None and start and end and end > start:
        elapsed = max(0, min((today - start).days, (end - start).days))
        expected = elapsed / (end - start).days * 100
        lag = expected - float(progress)
        if lag >= 25:
            score += 2
            factors.append(f"Avancement inférieur de {round(lag)} points à la progression calendaire attendue")
        elif lag >= 10:
            score += 1
            factors.append(f"Avancement inférieur de {round(lag)} points à la progression calendaire attendue")
        if today > end and float(progress) < 100:
            score += 2
            factors.append("Date de fin dépassée alors que le contrat n’est pas achevé")

    milestones = contract_data.get("milestones") or []
    late_milestones = [m for m in milestones if m.get("status") == "en_retard"]
    if late_milestones:
        score += min(2, len(late_milestones))
        factors.append(f"{len(late_milestones)} jalon(s) marqué(s) en retard")

    overdue_deliverables = contract_data.get("overdueDeliverables") or 0
    if overdue_deliverables:
        score += 1
        factors.append(f"{overdue_deliverables} livrable(s) en retard")

    historical_delays = contract_data.get("historicalDelays")
    if historical_delays:
        score += min(2, len(historical_delays))
        factors.append(f"Historique disponible : {len(historical_delays)} contrat(s) antérieur(s) en retard")
    elif historical_delays == []:
        factors.append("Aucun retard historique fourni")

    if missing and not (progress is not None or late_milestones or overdue_deliverables or historical_delays):
        level = "a_verifier"
        score_value = None
        factors.append("Données insuffisantes pour estimer le risque")
    else:
        score_value = min(6, score)
        level = "eleve" if score >= 4 else "moyen" if score >= 2 else "faible"

    recommendations = []
    if level == "eleve":
        recommendations.append("Organiser une revue rapprochée des jalons et demander un plan de rattrapage")
    elif level == "moyen":
        recommendations.append("Vérifier les prochains jalons et la remise des livrables")
    elif level == "a_verifier":
        recommendations.append("Compléter les dates, l’avancement et les informations de suivi avant toute estimation")
    else:
        recommendations.append("Poursuivre le suivi contractuel prévu")

    return {
        "risk_level": level,
        "rule_score": score_value,
        "risk_factors": factors,
        "missing_data": missing,
        "recommendations": recommendations,
        "method": "Règles explicites basées sur l’avancement, les dates, les jalons et les retards historiques; aucun modèle entraîné.",
    }
