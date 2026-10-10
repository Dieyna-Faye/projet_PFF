const { ADMIN_DOCS } = require('../config/constants');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function financialScore(amount, budget) {
  if (!amount || amount <= 0) return 0;
  if (!budget || budget <= 0) return 50;
  if (amount > budget) return clamp(round1(100 - (amount - budget) / budget * 100), 0, 40);
  const ratio = amount / budget;
  return clamp(round1(100 - Math.max(0, ratio - 0.8) * 200), 0, 100);
}

function experienceScore(years) {
  years = years || 0;
  if (years >= 10) return 100;
  if (years >= 5) return 90;
  if (years >= 2) return 70;
  if (years >= 1) return 55;
  return 40;
}

function delayScore(days) {
  days = days || 0;
  if (days <= 30) return 100;
  if (days <= 60) return 85;
  if (days <= 90) return 70;
  if (days <= 180) return 50;
  return 30;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function computeScores({ bid, tender, supplier, compliance, technicalAvg }) {
  const adminScore = compliance ? compliance.score : 0;
  const technicalScore = clamp(technicalAvg != null ? technicalAvg : 0, 0, 100);
  const finScore = financialScore(Number(bid.financialAmount), Number(tender.estimatedBudget));
  const expScore = experienceScore(supplier ? supplier.yearsExperience : 0);
  const delScore = delayScore(bid.executionDelayDays);

  const globalScore = round1(
    0.2 * adminScore + 0.3 * technicalScore + 0.25 * finScore + 0.15 * expScore + 0.1 * delScore
  );

  let riskLevel = 'faible';
  if (globalScore < 50) riskLevel = 'eleve';
  else if (globalScore < 70) riskLevel = 'moyen';

  if (!compliance || !compliance.isCompliant) riskLevel = 'eleve';

  let recommendation = 'Rejete';
  if (compliance && compliance.isCompliant) {
    if (globalScore >= 70) recommendation = 'Recommande';
    else if (globalScore >= 50) recommendation = 'Reserve';
    else recommendation = 'Rejete';
  }

  return {
    adminScore: round1(adminScore),
    technicalScore: round1(technicalScore),
    financialScore: round1(finScore),
    experienceScore: round1(expScore),
    delayScore: round1(delScore),
    globalScore,
    riskLevel,
    recommendation,
  };
}

module.exports = { computeScores, financialScore, experienceScore, delayScore };
