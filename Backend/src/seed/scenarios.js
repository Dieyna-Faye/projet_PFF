require('dotenv').config();
const fs = require('fs');
const path = require('path');
const models = require('../models');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { ADMIN_DOCS } = require('../config/constants');
const { hashPassword } = require('../utils/security');
const { computeScores, computeTechnicalAverage } = require('../services/scoring');
const { checkCompliance } = require('../services/docCheck');

const {
  sequelize, Role, User, Supplier, Tender, TenderDocument, EvaluationCriteria,
  Bid, BidDocument, Evaluation, Score, Contract, Payment, Deliverable,
  ContractMilestone, AuditLog, Alert,
} = models;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const PASSWORD = 'Scenario-2026!';
const ROLE_LABEL = { authority: 'Autorité contractante', supplier: 'Fournisseur', commission: 'Commission d’évaluation' };
function demoPdf(name, text) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, name);
  const escaped = String(text).normalize('NFKD').replace(/[^\x20-\x7E]/g, ' ').replace(/[\\()]/g, '\\$&').slice(0, 170);
  const stream = `BT /F1 12 Tf 48 740 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, 'ascii');
  return { filePath: path.relative(process.cwd(), filePath), size: fs.statSync(filePath).size };
}

async function ensureRole(name) {
  const [role] = await Role.findOrCreate({
    where: { name },
    defaults: { name, label: ROLE_LABEL[name] || name, permissions: JSON.stringify(ROLE_PERMISSIONS[name] || []) },
  });
  return role;
}

async function ensureAccount({ email, firstName, lastName, roleName, companyName, experience = 5, sector = 'Services et fournitures' }) {
  const role = await ensureRole(roleName);
  let user = await User.findOne({ where: { email } });
  if (!user) user = await User.create({ firstName, lastName, email, passwordHash: await hashPassword(PASSWORD), phone: '770000000', address: 'Dakar', roleId: role.id });
  let supplier = null;
  if (roleName === 'supplier') {
    supplier = await Supplier.findOne({ where: { userId: user.id } });
    if (!supplier) supplier = await Supplier.create({
      userId: user.id, companyName, registreCommerce: `SN-${companyName.replace(/\W+/g, '').slice(0, 10).toUpperCase()}`,
      activitySector: sector, yearsExperience: experience, address: 'Dakar', phone: user.phone, email: user.email,
    });
  }
  return { user, supplier };
}

async function ensureTender(authority, reference, spec) {
  const [tender] = await Tender.findOrCreate({ where: { reference }, defaults: { ...spec, reference, createdBy: authority.id } });
  if (!(await TenderDocument.findOne({ where: { tenderId: tender.id } }))) {
    const file = demoPdf(`${reference}-cahier.pdf`, `CAHIER DE CHARGES DE DEMONSTRATION ${tender.title}`);
    await TenderDocument.create({ tenderId: tender.id, label: 'Cahier des charges synthétique de démonstration', filePath: file.filePath, originalName: `${reference}-cahier.pdf`, mimeType: 'application/pdf', size: file.size });
  }
  return tender;
}

async function ensureCriteria(tender) {
  const definitions = [
    { label: 'Adéquation et qualité technique', description: 'Conformité au cahier des charges et qualité de la solution proposée.', weight: 60, maxScore: 20, category: 'technique' },
    { label: 'Méthode et organisation', description: 'Organisation des moyens et réalisme de la méthode de livraison.', weight: 40, maxScore: 20, category: 'technique' },
  ];
  const criteria = [];
  for (const definition of definitions) {
    const [item] = await EvaluationCriteria.findOrCreate({ where: { tenderId: tender.id, label: definition.label }, defaults: { tenderId: tender.id, ...definition } });
    criteria.push(item);
  }
  return criteria;
}

async function ensureBid({ tender, supplier, commission, reference, amount, delay, status, reviewStatus = 'conforme', decision = null, comment = null, technicalScore = null, analyzed = true }) {
  const submittedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const [bid] = await Bid.findOrCreate({ where: { reference }, defaults: {
    tenderId: tender.id, supplierId: supplier.id, status, submittedAt, financialAmount: amount, currency: 'XOF', executionDelayDays: delay,
    technicalProposal: `Proposition synthétique ${supplier.companyName} pour ${tender.title}. Le matériel respecte les spécifications et les délais annoncés.`,
    extractedText: `Offre ${supplier.companyName}; matériel conforme; délai ${delay} jours; maintenance et garantie incluses.`,
    complianceDetails: '[]',
    committeeDecision: decision, committeeComment: comment, committeeDecidedAt: decision ? new Date() : null, committeeDecidedBy: decision ? commission.id : null,
  } });
  Object.assign(bid, { tenderId: tender.id, supplierId: supplier.id, status, financialAmount: amount, currency: 'XOF', executionDelayDays: delay, committeeDecision: decision, committeeComment: comment, committeeDecidedAt: decision ? (bid.committeeDecidedAt || new Date()) : null, committeeDecidedBy: decision ? commission.id : null });
  await bid.save();

  for (const category of ADMIN_DOCS) {
    const needsReview = category === 'references_techniques' && reviewStatus !== 'conforme';
    const docStatus = needsReview ? reviewStatus : 'conforme';
    let savedDocument = await BidDocument.findOne({ where: { bidId: bid.id, category } });
    if (!savedDocument) {
      const file = demoPdf(`${reference}-${category}.pdf`, `DOCUMENT SYNTHETIQUE ${category} POUR ${supplier.companyName}; VERIFICATION HUMAINE OBLIGATOIRE`);
      savedDocument = await BidDocument.create({
        bidId: bid.id, category, label: category, filePath: file.filePath, originalName: `${category}.pdf`, mimeType: 'application/pdf', size: file.size,
        extractedText: `Document synthétique de démonstration ${category} pour ${supplier.companyName}.`, extractedFields: '{}',
      });
    }
    savedDocument.reviewStatus = docStatus;
    savedDocument.reviewComment = needsReview ? null : docStatus === 'non_conforme' ? 'Pièce non conforme dans ce scénario synthétique; vérifier le dossier original.' : 'Pièce consultée dans le scénario de démonstration; authenticité non certifiée.';
    savedDocument.reviewedAt = needsReview ? null : new Date();
    savedDocument.reviewedBy = needsReview ? null : commission.id;
    await savedDocument.save();
  }

  const criteria = await ensureCriteria(tender);
  for (const [index, criterion] of criteria.entries()) {
    if (technicalScore == null) continue;
    const scoreValue = technicalScore * 0.2;
    const [evaluation] = await Evaluation.findOrCreate({ where: { bidId: bid.id, criteriaId: criterion.id }, defaults: {
      score: scoreValue, comment: 'Note synthétique de démonstration; à examiner selon les critères publiés.', status: 'valide',
    } });
    evaluation.score = scoreValue;
    evaluation.comment = 'Note synthétique de démonstration; à examiner selon les critères publiés.';
    evaluation.status = 'valide';
    await evaluation.save();
  }

  const bidDocuments = await BidDocument.findAll({ where: { bidId: bid.id } });
  const evaluations = await Evaluation.findAll({ where: { bidId: bid.id }, include: [{ model: EvaluationCriteria, as: 'criteria' }] });
  const compliance = checkCompliance(bidDocuments);
  const actualScores = computeScores({ bid, tender, supplier, compliance, technicalAvg: computeTechnicalAverage(evaluations) });
  bid.isCompliant = compliance.isCompliant;
  bid.complianceSummary = compliance.complianceSummary;
  bid.complianceDetails = JSON.stringify(compliance.checklist);
  bid.analysisStatus = compliance.status;
  bid.analyzedAt = analyzed ? (bid.analyzedAt || new Date()) : null;
  bid.aiAnalysis = analyzed ? JSON.stringify({ status: compliance.status, analyzedAt: bid.analyzedAt, summary: 'Exemple de dossier synthétique; contrôle humain requis.', anomalies: compliance.missing.length || compliance.expired.length || compliance.rejected.length ? [{ type: 'conformite', items: [...compliance.missing, ...compliance.expired, ...compliance.rejected] }] : [], recommendations: ['Vérifier les pièces et appliquer les critères du cahier des charges.'] }) : null;
  bid.automaticSummary = analyzed ? `Score de démonstration ${actualScores.globalScore ?? 'provisoire'}; couverture ${actualScores.scoreCoveragePercent}%.` : null;
  await bid.save();

  if (analyzed && actualScores.globalScore != null) {
    const [score] = await Score.findOrCreate({ where: { bidId: bid.id }, defaults: {} });
    Object.assign(score, {
      adminScore: actualScores.adminScore, technicalScore: actualScores.technicalScore, financialScore: actualScores.financialScore,
      experienceScore: actualScores.experienceScore, delayScore: actualScores.delayScore, globalScore: actualScores.globalScore,
      scoreCoveragePercent: actualScores.scoreCoveragePercent, scoreComplete: actualScores.scoreComplete,
      riskLevel: actualScores.riskLevel, recommendation: actualScores.recommendation,
      details: JSON.stringify({ ...actualScores.justifications, source: 'Données synthétiques de démonstration; recalculer après toute modification.', weights: { administrative: 20, technical: 30, financial: 25, experience: 15, delay: 10 } }),
    });
    await score.save();
  } else if (!analyzed) {
    await Score.destroy({ where: { bidId: bid.id } });
  }
  return bid;
}

async function ensureContract({ tender, bid, supplier, reference, startDate, endDate, status, progress, penaltyApplied = 0, finalSupplierRating = null }) {
  const [contract] = await Contract.findOrCreate({ where: { reference }, defaults: {
    tenderId: tender.id, bidId: bid.id, supplierId: supplier.id, amount: bid.financialAmount, currency: 'XOF',
    startDate, endDate, status, progress, penaltyApplied, finalSupplierRating,
  } });
  return contract;
}

async function ensureAudit({ user, action, entity, entityId, details }) {
  const [log] = await AuditLog.findOrCreate({ where: { action, entity, entityId }, defaults: { userId: user.id, details: JSON.stringify(details), ipAddress: '127.0.0.1' } });
  log.userId = user.id;
  log.details = JSON.stringify(details);
  log.ipAddress = '127.0.0.1';
  await log.save();
}

async function main() {
  await sequelize.sync();
  const authorityAccount = await ensureAccount({ email: 'autorite.scenario@marche.gov', firstName: 'Awa', lastName: 'Scenario', roleName: 'authority' });
  const commissionAccount = await ensureAccount({ email: 'commission.scenario@marche.gov', firstName: 'Moussa', lastName: 'Evaluation', roleName: 'commission' });
  const suppliers = [];
  for (const item of [
    { email: 'scenario.fournisseur1@demo.sn', firstName: 'Mariam', lastName: 'Sarr', companyName: 'Sahel Equipements', experience: 12, sector: 'Informatique et équipements' },
    { email: 'scenario.fournisseur2@demo.sn', firstName: 'Ibrahima', lastName: 'Ndao', companyName: 'Teranga Services', experience: 7, sector: 'Services et maintenance' },
    { email: 'scenario.fournisseur3@demo.sn', firstName: 'Aminata', lastName: 'Sy', companyName: 'Bati Sénégal Demo', experience: 9, sector: 'Travaux et bâtiment' },
  ]) suppliers.push((await ensureAccount({ ...item, roleName: 'supplier' })).supplier);
  const now = new Date();
  const addDays = (days) => new Date(now.getTime() + days * 86400000);

  const openTender = await ensureTender(authorityAccount.user, 'AO-SCENARIO-2026-EVALUATION', {
    title: 'Équipements numériques pour les centres de formation — en évaluation', description: 'Scénario de démonstration : offres reçues, pièces et analyse à compléter par la commission.',
    type: 'informatique', estimatedBudget: 48000000, currency: 'XOF', submissionDeadline: addDays(20), status: 'publie', publishedAt: addDays(-25),
  });
  const awardTender = await ensureTender(authorityAccount.user, 'AO-SCENARIO-2026-MARCHE-EN-COURS', {
    title: 'Maintenance des équipements et assistance technique — attribué', description: 'Scénario de marché attribué et suivi pendant son exécution.',
    type: 'maintenance', estimatedBudget: 26000000, currency: 'XOF', submissionDeadline: addDays(-25), status: 'attribue', publishedAt: addDays(-70),
  });
  const doneTender = await ensureTender(authorityAccount.user, 'AO-SCENARIO-2025-MARCHE-TERMINE', {
    title: 'Réhabilitation de salles informatiques — marché terminé', description: 'Scénario clôturé avec offres perdantes, livrables validés et note finale fournisseur.',
    type: 'travaux', estimatedBudget: 62000000, currency: 'XOF', submissionDeadline: addDays(-300), status: 'archive', publishedAt: addDays(-390), archivedAt: addDays(-210),
  });
  const emptyTender = await ensureTender(authorityAccount.user, 'AO-SCENARIO-2026-OUVERT-SANS-OFFRE', {
    title: 'Fourniture de mobilier scolaire — appel ouvert', description: 'Scénario d’appel d’offres publié et ouvert sans soumission reçue.',
    type: 'fournitures', estimatedBudget: 18000000, currency: 'XOF', submissionDeadline: addDays(45), status: 'publie', publishedAt: now,
  });

  const pendingBid = await ensureBid({ tender: openTender, supplier: suppliers[0], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-EVAL-001', amount: 44500000, delay: 50, status: 'en_evaluation', reviewStatus: 'a_verifier', technicalScore: null });
  const unreviewedBid = await ensureBid({ tender: openTender, supplier: suppliers[2], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-EVAL-003', amount: 46200000, delay: 60, status: 'deposee', reviewStatus: 'a_verifier', analyzed: false });
  const rejectedBid = await ensureBid({ tender: openTender, supplier: suppliers[1], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-EVAL-002', amount: 52000000, delay: 95, status: 'rejetee', reviewStatus: 'non_conforme', decision: 'rejetee', comment: 'Rejet motivé dans le scénario : pièce administrative non conforme et montant supérieur au budget estimatif.', technicalScore: 58 });
  const awardedBid = await ensureBid({ tender: awardTender, supplier: suppliers[1], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-ACTIF-001', amount: 23800000, delay: 40, status: 'attribuee', decision: 'validee', comment: 'Offre conforme et note complète après examen de la commission.', technicalScore: 84 });
  const lostBid = await ensureBid({ tender: awardTender, supplier: suppliers[0], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-ACTIF-002', amount: 24900000, delay: 55, status: 'perdue', decision: 'rejetee', comment: 'Offre non retenue après comparaison des offres et procès-verbal de la commission.', technicalScore: 72 });
  const completedBid = await ensureBid({ tender: doneTender, supplier: suppliers[2], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-TERMINE-001', amount: 57400000, delay: 120, status: 'attribuee', decision: 'validee', comment: 'Offre retenue; exécution terminée et réception finale enregistrée.', technicalScore: 84 });
  const completedLost = await ensureBid({ tender: doneTender, supplier: suppliers[0], commission: commissionAccount.user, reference: 'OFFRE-SCENARIO-TERMINE-002', amount: 60800000, delay: 150, status: 'perdue', decision: 'rejetee', comment: 'Offre non retenue au terme de l’évaluation comparative.', technicalScore: 84 });

  const activeContract = await ensureContract({ tender: awardTender, bid: awardedBid, supplier: suppliers[1], reference: 'MARCHE-SCENARIO-2026-ACTIF', startDate: addDays(-35), endDate: addDays(45), status: 'actif', progress: 58, penaltyApplied: 0 });
  const finishedContract = await ensureContract({ tender: doneTender, bid: completedBid, supplier: suppliers[2], reference: 'MARCHE-SCENARIO-2025-TERMINE', startDate: addDays(-370), endDate: addDays(-230), status: 'termine', progress: 100, penaltyApplied: 850000, finalSupplierRating: 4.4 });

  for (const [contract, title, dueDate, status] of [
    [activeContract, 'Livraison du premier lot d’équipements', addDays(-5), 'valide'],
    [activeContract, 'Installation et recette technique', addDays(18), 'en_cours'],
    [activeContract, 'Formation des utilisateurs', addDays(38), 'a_faire'],
    [finishedContract, 'Réception provisoire des travaux', addDays(-260), 'valide'],
    [finishedContract, 'Réception définitive et clôture', addDays(-230), 'valide'],
  ]) await ContractMilestone.findOrCreate({ where: { contractId: contract.id, title }, defaults: { contractId: contract.id, title, dueDate, status, validatedAt: status === 'valide' ? dueDate : null } });
  await Payment.findOrCreate({ where: { contractId: activeContract.id, amount: 7140000, status: 'paye' }, defaults: { contractId: activeContract.id, amount: 7140000, currency: 'XOF', dueDate: addDays(-15), status: 'paye', paidAt: addDays(-13) } });
  await Payment.findOrCreate({ where: { contractId: activeContract.id, amount: 7140000, status: 'en_attente' }, defaults: { contractId: activeContract.id, amount: 7140000, currency: 'XOF', dueDate: addDays(25), status: 'en_attente' } });
  await Payment.findOrCreate({ where: { contractId: finishedContract.id, amount: 5740000 }, defaults: { contractId: finishedContract.id, amount: 5740000, currency: 'XOF', dueDate: addDays(-250), status: 'paye', paidAt: addDays(-248) } });
  await Deliverable.findOrCreate({ where: { contractId: activeContract.id, title: 'Rapport d’installation du premier lot' }, defaults: { contractId: activeContract.id, title: 'Rapport d’installation du premier lot', description: 'Démonstration : rapport reçu et en attente de validation.', status: 'en_attente', submissionDate: addDays(-4) } });
  await Deliverable.findOrCreate({ where: { contractId: finishedContract.id, title: 'Procès-verbal de réception définitive' }, defaults: { contractId: finishedContract.id, title: 'Procès-verbal de réception définitive', description: 'Livrable synthétique de démonstration reçu et validé.', status: 'valide', submissionDate: addDays(-235), validationDate: addDays(-230), validationComment: 'Livrable réceptionné dans le scénario de démonstration.' } });

  await ensureAudit({ user: commissionAccount.user, action: 'ANALYZE_BID', entity: 'Bid', entityId: pendingBid.id, details: { reference: pendingBid.reference, status: 'a_verifier', scoreCoveragePercent: 50, source: 'scenario_demo' } });
  await ensureAudit({ user: { id: suppliers[2].userId }, action: 'SUBMIT_BID', entity: 'Bid', entityId: unreviewedBid.id, details: { reference: unreviewedBid.reference, status: 'deposee', source: 'scenario_demo' } });
  await ensureAudit({ user: commissionAccount.user, action: 'REVIEW_BID_DOCUMENT', entity: 'Bid', entityId: pendingBid.id, details: { reference: pendingBid.reference, status: 'a_verifier', document: 'references_techniques', comment: 'Exemple de pièce en attente de la revue de la commission.', source: 'scenario_demo' } });
  await ensureAudit({ user: commissionAccount.user, action: 'COMMITTEE_DECISION', entity: 'Bid', entityId: rejectedBid.id, details: { reference: rejectedBid.reference, decision: 'rejetee', comment: rejectedBid.committeeComment, source: 'scenario_demo' } });
  await ensureAudit({ user: commissionAccount.user, action: 'COMMITTEE_DECISION', entity: 'Bid', entityId: awardedBid.id, details: { reference: awardedBid.reference, decision: 'validee', comment: awardedBid.committeeComment, source: 'scenario_demo' } });
  await ensureAudit({ user: authorityAccount.user, action: 'AWARD_CONTRACT', entity: 'Bid', entityId: awardedBid.id, details: { reference: activeContract.reference, amount: activeContract.amount, source: 'scenario_demo' } });
  await ensureAudit({ user: authorityAccount.user, action: 'CLOSE_CONTRACT', entity: 'Contract', entityId: finishedContract.id, details: { reference: finishedContract.reference, finalRating: finishedContract.finalSupplierRating, progress: 100, source: 'scenario_demo' } });
  const alertMetadata = { tenderId: openTender.id, detectedAt: now.toISOString(), reviewRequired: true, recommendations: ['Comparer les informations des entreprises et documenter la conclusion; un signal partagé ne constitue pas une preuve.'], source: 'scenario_demo' };
  await Alert.findOrCreate({ where: { type: 'meme_adresse', message: 'Scénario de démonstration : deux fournisseurs déclarent la même adresse; vérification humaine requise.', entityId: openTender.id }, defaults: { severity: 'moyen', status: 'ouverte', metadata: JSON.stringify(alertMetadata) } });
  await ensureAudit({ user: authorityAccount.user, action: 'FRAUD_SCAN', entity: 'Tender', entityId: openTender.id, details: { reference: openTender.reference, alertsRecorded: 1, source: 'scenario_demo' } });

  console.log('[SCENARIOS] Données ajoutées ou déjà présentes : 4 appels d’offres, offres en attente/rejetées/attribuées/perdues, contrats actif et terminé, livrables, paiements, jalons, alerte de risque et événements d’audit.');
  console.log(`Mot de passe des nouveaux comptes de démonstration : ${PASSWORD}`);
  console.log('autorite.scenario@marche.gov');
  console.log('commission.scenario@marche.gov');
  console.log('scenario.fournisseur1@demo.sn');
  console.log('scenario.fournisseur2@demo.sn');
  console.log('scenario.fournisseur3@demo.sn');
  console.log('Remarque : seules les pièces synthétiques de démonstration sont utilisées; elles ne certifient aucun document réel.');
  void emptyTender;
  void lostBid;
  void completedLost;
}

main().catch((error) => {
  console.error('[SCENARIOS] Échec :', error.message);
  process.exitCode = 1;
}).finally(async () => sequelize.close());
