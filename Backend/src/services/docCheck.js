const { ADMIN_DOCS } = require('../config/constants');

function checkCompliance(bidDocuments) {
  const docs = bidDocuments || [];
  const present = new Set(docs.map((d) => (d.category || '').toLowerCase()));

  const missing = ADMIN_DOCS.filter((doc) => !present.has(doc));
  const expired = docs.filter((d) => d.expiryDate && new Date(d.expiryDate) < new Date());
  const expiredCats = expired.map((d) => d.category);

  const isCompliant = missing.length === 0 && expired.length === 0;
  const score = Math.max(0, 100 - missing.length * 14 - expired.length * 14);

  let summary = 'Dossier ' + (isCompliant ? 'CONFORME' : 'NON CONFORME') + '. ';
  if (missing.length) summary += 'Pieces manquantes : ' + missing.join(', ') + '. ';
  if (expired.length) summary += 'Pieces expirees : ' + expiredCats.join(', ') + '. ';
  if (isCompliant) summary += 'Toutes les pieces administratives obligatoires sont presentes et valides.';

  return { isCompliant, missing, expired: expiredCats, score, complianceSummary: summary };
}

module.exports = { checkCompliance, ADMIN_DOCS };
