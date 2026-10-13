const { ADMIN_DOCS } = require('../config/constants');

function checkCompliance(bidDocuments) {
  const docs = bidDocuments || [];
  const now = new Date();
  const checklist = ADMIN_DOCS.map((category) => {
    const matching = docs.filter((doc) => String(doc.category || '').toLowerCase() === category);
    const present = matching.length > 0;
    const current = matching.filter((doc) => !doc.expiryDate || new Date(doc.expiryDate) >= now);
    const expired = present && current.length === 0;
    const reviewed = current.find((doc) => doc.reviewStatus === 'conforme') || current[0];
    const reviewStatus = present ? (expired ? 'non_conforme' : (reviewed?.reviewStatus || 'a_verifier')) : 'non_conforme';
    return {
      category,
      present,
      expired,
      reviewStatus,
      status: !present || expired || reviewStatus === 'non_conforme' ? 'non_conforme' : reviewStatus === 'conforme' ? 'conforme' : 'a_verifier',
      fileName: reviewed ? reviewed.originalName : matching[0]?.originalName || null,
      expiryDate: reviewed?.expiryDate || null,
      reviewComment: reviewed?.reviewComment || null,
    };
  });

  const missing = checklist.filter((item) => !item.present).map((item) => item.category);
  const expired = checklist.filter((item) => item.expired).map((item) => item.category);
  const rejected = checklist.filter((item) => item.present && !item.expired && item.reviewStatus === 'non_conforme').map((item) => item.category);
  const unverified = checklist.filter((item) => item.present && item.reviewStatus === 'a_verifier').map((item) => item.category);
  const status = missing.length || expired.length || rejected.length ? 'non_conforme' : unverified.length ? 'a_verifier' : 'conforme';
  const isCompliant = status === 'conforme';
  // Keep the automated document-presence score separate from validation. Until
  // the commission reviews every required document, the administrative score
  // is unknown rather than a fabricated zero or a claim of validity.
  const score = status === 'a_verifier' ? null : Math.max(0, 100 - missing.length * 14 - expired.length * 14 - rejected.length * 14);

  let complianceSummary = status === 'conforme'
    ? 'Pièces requises présentes et examinées comme conformes par un utilisateur habilité.'
    : status === 'non_conforme'
      ? 'Dossier non conforme. ' + [missing.length ? `Pièces absentes : ${missing.join(', ')}.` : '', expired.length ? `Pièces expirées : ${expired.join(', ')}.` : '', rejected.length ? `Pièces marquées non conformes : ${rejected.join(', ')}.` : ''].filter(Boolean).join(' ')
      : `Dossier à vérifier. Les fichiers requis sont présents, mais leur contenu, leur validité et leurs signatures restent à examiner : ${unverified.join(', ')}.`;

  return { status, isCompliant, missing, expired, rejected, unverified, score, complianceSummary, checklist };
}

module.exports = { checkCompliance, ADMIN_DOCS };
