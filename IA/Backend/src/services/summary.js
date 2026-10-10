function generateSummary({ bid, supplier, tender, compliance, scores }) {
  const parts = [];
  if (supplier) parts.push(`Fournisseur : ${supplier.companyName}`);
  if (tender) parts.push(`Appel d'offres : ${tender.title} (budget ${tender.estimatedBudget} ${tender.currency})`);
  if (bid.financialAmount) parts.push(`Montant propose : ${bid.financialAmount} ${bid.currency || 'XOF'}`);
  if (bid.executionDelayDays) parts.push(`Delai d'execution : ${bid.executionDelayDays} jours`);
  if (supplier) parts.push(`Experience : ${supplier.yearsExperience || 0} an(s)`);
  if (compliance)
    parts.push(
      compliance.isCompliant ? 'Conformite administrative : OK' : 'Conformite administrative : defauts detectes'
    );
  if (scores) parts.push(`Score global : ${scores.globalScore}/100 (risque ${scores.riskLevel})`);
  return parts.join(' | ');
}

module.exports = { generateSummary };
