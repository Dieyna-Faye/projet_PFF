function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function financialScore(amount, budget) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(budget) || budget <= 0) return null;
  if (amount > budget) return clamp(round1(100 - ((amount - budget) / budget) * 100), 0, 40);
  // Near-budget offers score best; very low prices require human review and do
  // not automatically receive the maximum financial score.
  const ratio = amount / budget;
  return clamp(round1(100 - Math.max(0, ratio - 0.8) * 200 - Math.max(0, 0.8 - ratio) * 80), 0, 100);
}

function experienceScore(years) {
  if (years == null || !Number.isFinite(Number(years))) return null;
  years = Number(years);
  if (years === 0) return null;
  if (years >= 10) return 100;
  if (years >= 5) return 90;
  if (years >= 2) return 70;
  return 55;
}

function delayScore(days) {
  if (days == null || !Number.isFinite(Number(days)) || Number(days) <= 0) return null;
  days = Number(days);
  if (days <= 30) return 100;
  if (days <= 60) return 85;
  if (days <= 90) return 70;
  if (days <= 180) return 50;
  return 30;
}

const GLOBAL_WEIGHTS = { adminScore: 20, technicalScore: 30, financialScore: 25, experienceScore: 15, delayScore: 10 };

function calculateGlobalScore(scores) {
  const available = Object.entries(GLOBAL_WEIGHTS).filter(([key]) => scores[key] != null && Number.isFinite(Number(scores[key])));
  const availableWeight = available.reduce((sum, [key]) => sum + GLOBAL_WEIGHTS[key], 0);
  if (!availableWeight) return null;
  const weighted = available.reduce((sum, [key]) => sum + Number(scores[key]) * GLOBAL_WEIGHTS[key], 0);
  return round1(weighted / availableWeight);
}

function computeTechnicalAverage(evaluations) {
  const rows = (evaluations || []).filter((row) => row.status === 'valide' && row.criteria && row.criteria.category !== 'administratif' && row.criteria.category !== 'financier');
  if (!rows.length) return null;
  const normalized = rows.filter((row) => Number(row.criteria.maxScore) > 0).map((row) => ({
    value: clamp((Number(row.score) / Number(row.criteria.maxScore)) * 100, 0, 100),
    weight: Math.max(0, Number(row.criteria.weight || 0)),
  })).filter((row) => Number.isFinite(row.value));
  if (!normalized.length) return null;
  const totalWeight = normalized.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return round1(normalized.reduce((sum, row) => sum + row.value, 0) / normalized.length);
  return round1(normalized.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight);
}

function computeScores({ bid, tender, supplier, compliance, technicalAvg }) {
  const adminScore = compliance ? compliance.score : null;
  const technicalScore = technicalAvg == null ? null : clamp(Number(technicalAvg), 0, 100);
  const finScore = financialScore(Number(bid.financialAmount), Number(tender?.estimatedBudget));
  const expScore = experienceScore(supplier?.yearsExperience);
  const delScore = delayScore(bid.executionDelayDays);
  const components = { adminScore, technicalScore, financialScore: finScore, experienceScore: expScore, delayScore: delScore };
  const scoreCoveragePercent = Object.entries(GLOBAL_WEIGHTS).reduce((sum, [key, weight]) => sum + (components[key] == null ? 0 : weight), 0);
  const scoreComplete = scoreCoveragePercent === 100;
  const globalScore = calculateGlobalScore(components);
  const missingComponents = Object.keys(GLOBAL_WEIGHTS).filter((key) => components[key] == null);
  const justifications = {
    administrative: compliance ? (compliance.score == null ? 'Note administrative en attente de vérification humaine des pièces.' : `Indice de complétude calculé depuis ${compliance.missing.length} pièce(s) manquante(s), ${compliance.expired.length} expirée(s) et ${compliance.rejected.length} rejetée(s); cet indice ne prouve pas l’authenticité.`) : 'Données de conformité absentes.',
    technical: technicalAvg == null ? 'Aucune note technique validée par la commission.' : 'Moyenne normalisée des évaluations techniques validées.',
    financial: finScore == null ? 'Montant ou budget estimatif absent/invalide.' : 'Note calculée selon l’écart au budget; un prix anormalement bas n’est pas récompensé automatiquement.',
    experience: expScore == null ? 'Années d’expérience non renseignées.' : `Barème par paliers appliqué aux ${supplier.yearsExperience} année(s) déclarée(s).`,
    delay: delScore == null ? 'Délai d’exécution non renseigné.' : `Barème par paliers appliqué au délai proposé de ${bid.executionDelayDays} jour(s).`,
  };

  let riskLevel = 'a_verifier';
  if (scoreComplete && globalScore != null) riskLevel = globalScore < 50 ? 'eleve' : globalScore < 70 ? 'moyen' : 'faible';
  if (compliance?.status === 'non_conforme') riskLevel = 'eleve';
  else if (compliance?.status === 'a_verifier' && riskLevel === 'faible') riskLevel = 'a_verifier';

  let recommendation = scoreCoveragePercent ? `Score provisoire (${scoreCoveragePercent}% des poids renseignés); compléter les critères manquants.` : 'Evaluation en attente : aucun critère de score n’est renseigné.';
  if (compliance?.status === 'non_conforme') recommendation = 'Dossier non conforme : revue humaine requise';
  else if (compliance?.status === 'a_verifier') recommendation = 'Pièces à vérifier par la commission avant toute décision';
  else if (!scoreComplete && missingComponents.length) recommendation = `Score provisoire (${scoreCoveragePercent}% des poids renseignés). À compléter : ${missingComponents.join(', ')}.`;
  else if (scoreComplete && globalScore != null) {
    recommendation = globalScore >= 70 ? 'Recommande pour revue humaine' : globalScore >= 50 ? 'A examiner par la commission' : 'Risque élevé : revue humaine requise';
  }

  return {
    adminScore: adminScore == null ? null : round1(adminScore),
    technicalScore: technicalScore == null ? null : round1(technicalScore),
    financialScore: finScore == null ? null : round1(finScore),
    experienceScore: expScore == null ? null : round1(expScore),
    delayScore: delScore == null ? null : round1(delScore),
    globalScore,
    scoreCoveragePercent,
    scoreComplete,
    riskLevel,
    recommendation,
    justifications,
  };
}

module.exports = { computeScores, calculateGlobalScore, computeTechnicalAverage, financialScore, experienceScore, delayScore };
