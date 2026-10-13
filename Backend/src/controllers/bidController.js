const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, TenderDocument, Bid, BidDocument, Supplier, Score, Evaluation, EvaluationCriteria, User } = models;
const { ROLES } = require('../config/constants');
const { writeAudit } = require('../middleware/audit');
const { checkCompliance } = require('../services/docCheck');
const { computeScores, computeTechnicalAverage } = require('../services/scoring');
const { generateSummary } = require('../services/summary');
const { extractText } = require('../services/pdfExtract');
const { extractTextWithOCR } = require('../services/aiClient');
const { similarity } = require('../services/similarity');
const path = require('path');
const crypto = require('crypto');
const { Op } = require('sequelize');

function generateBidReference() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `OFFRE-${rand}`;
}

async function getSupplierForUser(userId) {
  return Supplier.findOne({ where: { userId } });
}

const SUPERVISOR_ROLES = ['admin', 'authority', 'commission', 'auditor'];

async function canAccessBid(req, bid) {
  if (SUPERVISOR_ROLES.includes(req.user.role)) return bid.status !== 'brouillon';
  const supplier = await getSupplierForUser(req.user.id);
  return Boolean(supplier && supplier.id === bid.supplierId);
}

const createBid = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  if (tender.status !== 'publie')
    return res.status(400).json({ error: 'Appel d\'offres non ouvert aux soumissions' });
  if (tender.submissionDeadline && new Date(tender.submissionDeadline) < new Date())
    return res.status(400).json({ error: 'Delai de soumission depasse' });

  const supplier = await getSupplierForUser(req.user.id);
  if (!supplier) return res.status(400).json({ error: 'Profil fournisseur requis' });

  const existing = await Bid.findOne({ where: { tenderId: tender.id, supplierId: supplier.id } });
  if (existing) return res.status(409).json({ error: 'Vous avez deja soumis une offre pour cet appel' });

  const body = req.validated;
  const bid = await Bid.create({
    reference: generateBidReference(),
    tenderId: tender.id,
    supplierId: supplier.id,
    status: 'brouillon',
    technicalProposal: body.technicalProposal,
    financialAmount: body.financialAmount,
    currency: body.currency || tender.currency,
    executionDelayDays: body.executionDelayDays,
  });
  await writeAudit({ user: req.user, action: 'CREATE_BID', entity: 'Bid', entityId: bid.id, req });
  res.status(201).json(bid);
});

const uploadBidDocument = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (!(await canAccessBid(req, bid))) return res.status(403).json({ error: 'Acces refuse' });
  if (bid.status !== 'brouillon')
    return res.status(400).json({ error: 'Soumission verrouillee apres depot' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoye' });

  let extractedText = '';
  let ocrCategory = 'autre';
  let detectedFields = {};
  try {
    const ocrResult = await extractTextWithOCR(req.file.path, req.file.mimetype);
    extractedText = ocrResult.text || '';
    detectedFields = ocrResult.detectedFields || {};
    if (ocrResult.detectedCategory && ocrResult.detectedCategory !== 'autre') {
      ocrCategory = ocrResult.detectedCategory;
    }
  } catch (e) {
    console.error('[OCR/PDF]', e.message);
  }

  const doc = await BidDocument.create({
    bidId: bid.id,
    category: req.body.category || ocrCategory,
    label: req.body.label || req.file.originalname,
    filePath: path.relative(process.cwd(), req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    expiryDate: req.body.expiryDate || null,
    extractedText,
    extractedFields: JSON.stringify(detectedFields),
  });
  // accumulate extracted text from all documents for similarity analysis
  const allDocs = await BidDocument.findAll({ where: { bidId: bid.id } });
  const aggregated = allDocs.map((d) => d.extractedText || '').join('\n');
  bid.extractedText = aggregated;
  await bid.save();
  await writeAudit({ user: req.user, action: 'ADD_BID_DOC', entity: 'BidDocument', entityId: doc.id, req });
  res.status(201).json(doc);
});

const submitBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (!(await canAccessBid(req, bid))) return res.status(403).json({ error: 'Acces refuse' });
  if (bid.status !== 'brouillon')
    return res.status(400).json({ error: 'Soumission deja deposee' });
  const tender = await Tender.findByPk(bid.tenderId);
  if (!tender || tender.status !== 'publie' || (tender.submissionDeadline && new Date(tender.submissionDeadline) < new Date())) {
    return res.status(400).json({ error: 'Le délai ou la période de soumission est terminé' });
  }

  const submittedAt = new Date();
  const receiptPayload = `${bid.id}:${bid.reference}:${bid.supplierId}:${bid.financialAmount}:${submittedAt.toISOString()}`;
  const receiptHash = crypto.createHash('sha256').update(receiptPayload).digest('hex');

  bid.status = 'deposee';
  bid.submittedAt = submittedAt;
  bid.receiptHash = receiptHash;
  await bid.save();

  await writeAudit({
    user: req.user,
    action: 'SUBMIT_BID',
    entity: 'Bid',
    entityId: bid.id,
    req,
    details: { receiptHash, reference: bid.reference },
  });

  res.json({
    message: 'Offre deposee. Accuse de reception genere.',
    bid,
    receipt: {
      reference: bid.reference,
      date: bid.submittedAt,
      hash: bid.receiptHash,
      supplierId: bid.supplierId,
      amount: bid.financialAmount,
    },
  });
});

const reviewBidDocument = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas être examinée' });
  if (['attribuee', 'perdue'].includes(bid.status)) return res.status(409).json({ error: 'La revue est verrouillée après la décision définitive du marché.' });
  const document = await BidDocument.findOne({ where: { id: req.params.documentId, bidId: bid.id } });
  if (!document) return res.status(404).json({ error: 'Document introuvable' });
  const { status, comment } = req.validated;
  document.reviewStatus = status;
  document.reviewComment = comment || null;
  document.reviewedAt = new Date();
  document.reviewedBy = req.user.id;
  await document.save();
  bid.committeeDecision = null;
  bid.committeeComment = null;
  bid.committeeDecidedAt = null;
  bid.committeeDecidedBy = null;
  if (['conforme', 'non_conforme', 'rejetee'].includes(bid.status)) bid.status = 'en_evaluation';
  await bid.save();
  await writeAudit({ user: req.user, action: 'REVIEW_BID_DOCUMENT', entity: 'Bid', entityId: bid.id, req, details: { bidId: bid.id, documentId: document.id, document: document.originalName || document.label, status, comment: document.reviewComment } });
  res.json(document);
});

const analyzeBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: BidDocument, as: 'documents' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas être analysée' });
  if (['attribuee', 'perdue'].includes(bid.status)) return res.status(409).json({ error: 'L’analyse est verrouillée après la décision définitive du marché.' });

  const compliance = checkCompliance(bid.documents);
  bid.isCompliant = compliance.isCompliant;
  bid.complianceSummary = compliance.complianceSummary;
  bid.complianceDetails = JSON.stringify(compliance.checklist || []);
  await bid.save();

  const tender = await Tender.findByPk(bid.tenderId);
  const supplier = await Supplier.findByPk(bid.supplierId);

  const tenderDocuments = await TenderDocument.findAll({ where: { tenderId: bid.tenderId } });
  const specificationTexts = [tender?.description || ''];
  const specificationSources = [];
  for (const document of tenderDocuments.slice(0, 10)) {
    try {
      const extracted = await extractTextWithOCR(document.filePath, document.mimeType);
      if (extracted.text?.trim()) {
        specificationTexts.push(extracted.text);
        specificationSources.push(document.originalName || document.label || `Document ${document.id}`);
      }
    } catch (error) {
      specificationSources.push(`${document.originalName || document.label || 'Document'} (texte indisponible)`);
    }
  }
  const specification = specificationTexts.filter(Boolean).join('\n');
  const submittedText = [bid.technicalProposal || '', bid.extractedText || ''].filter(Boolean).join('\n');
  const specificationComparison = specification.trim() && submittedText.trim()
    ? { available: true, termSimilarity: similarity(specification, submittedText), sources: specificationSources, method: 'Similarité lexicale indicative', limitation: 'Une similarité faible ou élevée ne prouve pas à elle seule la conformité technique; la commission doit examiner le cahier des charges et l’offre.' }
    : { available: false, termSimilarity: null, sources: specificationSources, method: 'Comparaison indisponible', limitation: 'Le texte du cahier des charges ou de l’offre est manquant ou inexploitable.' };

  // moyenne technique a partir des evaluations de la commission
  const evals = await Evaluation.findAll({ where: { bidId: bid.id }, include: [{ model: EvaluationCriteria, as: 'criteria' }] });
  const technicalAvg = computeTechnicalAverage(evals);

  const scores = computeScores({ bid, tender, supplier, compliance, technicalAvg });

  const summary = generateSummary({ bid, supplier, tender, compliance, scores });
  bid.automaticSummary = summary;
  const anomalies = [];
  if (compliance.missing.length) anomalies.push({ type: 'pieces_manquantes', items: compliance.missing, status: 'non_conforme' });
  if (compliance.expired.length) anomalies.push({ type: 'pieces_expirees', items: compliance.expired, status: 'non_conforme' });
  if (compliance.rejected.length) anomalies.push({ type: 'pieces_rejetees_apres_examen', items: compliance.rejected, status: 'non_conforme' });
  if (Number(tender?.estimatedBudget) > 0 && Number(bid.financialAmount) > Number(tender.estimatedBudget)) {
    anomalies.push({ type: 'montant_superieur_au_budget', amount: Number(bid.financialAmount), budget: Number(tender.estimatedBudget), status: 'a_verifier' });
  }
  const documentsExamined = (bid.documents || []).map((document) => {
    let extractedFields = {};
    try { extractedFields = JSON.parse(document.extractedFields || '{}'); } catch { /* keep empty extraction metadata */ }
    return { id: document.id, fileName: document.originalName, category: document.category, reviewStatus: document.reviewStatus, extractedTextAvailable: Boolean((document.extractedText || '').trim()), extractedFields };
  });
  const cannotVerify = [
    ...compliance.unverified.map((category) => `Contenu et validité à examiner pour ${category}`),
    'L’extraction automatique ne prouve ni la signature ni l’authenticité des documents.',
  ];
  if (!tender?.executionDelayDays && bid.executionDelayDays) cannotVerify.push('Aucun délai maximal d’exécution du marché n’est enregistré pour comparer le délai proposé.');
  if ((bid.documents || []).some((document) => !(document.extractedText || '').trim())) cannotVerify.push('Texte absent ou illisible pour au moins un document; extraction PDF/OCR à vérifier.');
  const recommendations = [];
  if (compliance.missing.length) recommendations.push(`Demander les pièces manquantes : ${compliance.missing.join(', ')}.`);
  if (compliance.expired.length) recommendations.push(`Faire examiner les pièces expirées : ${compliance.expired.join(', ')}.`);
  if (compliance.unverified.length) recommendations.push('Faire examiner les documents par la commission avant toute attribution.');
  if (anomalies.some((item) => item.type === 'montant_superieur_au_budget')) recommendations.push('Faire vérifier l’écart budgétaire et les règles de la consultation.');
  if (!recommendations.length) recommendations.push('Confirmer manuellement les pièces, le montant et les critères de la consultation avant décision.');
  const analysisStatus = compliance.status === 'non_conforme' ? 'non_conforme' : anomalies.length || cannotVerify.length ? 'a_verifier' : 'conforme';
  const report = {
    bidId: bid.id,
    supplier: supplier?.companyName || null,
    analyzedAt: new Date().toISOString(),
    status: analysisStatus,
    documentsExamined,
    missingDocuments: compliance.missing,
    compliantElements: compliance.checklist.filter((item) => item.status === 'conforme').map((item) => item.category),
    anomalies,
    cannotVerify,
    summary,
    recommendations,
    specificationComparison,
  };
  if (analysisStatus !== 'non_conforme' && compliance.status === 'conforme' && anomalies.length === 0 && cannotVerify.length === 1) report.status = 'conforme';
  bid.analysisStatus = report.status;
  bid.analyzedAt = report.analyzedAt;
  bid.aiAnalysis = JSON.stringify(report);
  bid.committeeDecision = null;
  bid.committeeComment = null;
  bid.committeeDecidedAt = null;
  bid.committeeDecidedBy = null;
  if (!['attribuee', 'perdue'].includes(bid.status)) bid.status = 'en_evaluation';
  await bid.save();

  const [score] = await Score.findOrCreate({ where: { bidId: bid.id }, defaults: {} });
  Object.assign(score, {
    adminScore: scores.adminScore,
    technicalScore: scores.technicalScore,
    financialScore: scores.financialScore,
    experienceScore: scores.experienceScore,
    delayScore: scores.delayScore,
    globalScore: scores.globalScore,
    scoreCoveragePercent: scores.scoreCoveragePercent,
    scoreComplete: scores.scoreComplete,
    riskLevel: scores.riskLevel,
    recommendation: scores.recommendation,
    details: JSON.stringify(scores.justifications),
  });
  await score.save();

  await writeAudit({ user: req.user, action: 'ANALYZE_BID', entity: 'Bid', entityId: bid.id, req, details: { bidId: bid.id, reference: bid.reference, status: report.status, compliant: bid.isCompliant, globalScore: scores.globalScore, scoreCoveragePercent: scores.scoreCoveragePercent, recommendation: scores.recommendation } });
  res.json({ message: 'Analyse terminee', compliance, scores, summary, report, bid });
});

const setCommitteeDecision = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas recevoir de décision.' });
  if (['attribuee', 'perdue'].includes(bid.status)) return res.status(409).json({ error: 'Cette offre fait déjà partie d’une décision finale.' });
  if (bid.committeeDecision) return res.status(409).json({ error: 'Une décision est déjà enregistrée. Réouvrez explicitement le dossier avant de la modifier.' });
  if (!bid.analyzedAt) return res.status(409).json({ error: 'Analysez le dossier avant de rendre une décision.' });
  const { decision, comment } = req.validated;
  if (decision === 'validee') {
    const score = await Score.findOne({ where: { bidId: bid.id } });
    if (bid.isCompliant !== true || !score || score.globalScore == null || score.scoreComplete !== true) {
      return res.status(409).json({ error: 'La validation nécessite un dossier conforme, toutes les pièces examinées et un score complet.' });
    }
  }
  bid.committeeDecision = decision;
  bid.committeeComment = comment;
  bid.committeeDecidedAt = new Date();
  bid.committeeDecidedBy = req.user.id;
  bid.status = decision === 'validee' ? 'conforme' : 'rejetee';
  await bid.save();
  await writeAudit({ user: req.user, action: 'COMMITTEE_DECISION', entity: 'Bid', entityId: bid.id, req, details: { decision, comment } });
  res.json({ id: bid.id, status: bid.status, committeeDecision: bid.committeeDecision, committeeComment: bid.committeeComment, committeeDecidedAt: bid.committeeDecidedAt });
});

const getBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, {
    include: [
      { model: BidDocument, as: 'documents', include: [{ model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] }] },
      { model: Supplier, as: 'supplier' },
      { model: Score, as: 'score' },
      { model: Tender, as: 'tender' },
      { model: User, as: 'committeeReviewer', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (!(await canAccessBid(req, bid))) return res.status(403).json({ error: 'Acces refuse' });
  res.json(bid);
});

const listBidsByTender = asyncHandler(async (req, res) => {
  if (!SUPERVISOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Seuls les rôles habilités peuvent consulter les offres reçues' });
  }
  const bids = await Bid.findAll({
    where: { tenderId: req.params.id, status: { [Op.ne]: 'brouillon' } },
    include: [{ model: Supplier, as: 'supplier' }, { model: Score, as: 'score' }, { model: BidDocument, as: 'documents', include: [{ model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] }] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(bids);
});

const listMyBids = asyncHandler(async (req, res) => {
  const supplier = await getSupplierForUser(req.user.id);
  if (!supplier) return res.status(400).json({ error: 'Profil fournisseur requis' });
  const bids = await Bid.findAll({
    where: { supplierId: supplier.id },
    include: [{ model: Tender, as: 'tender' }, { model: Score, as: 'score' }],
  });
  res.json(bids);
});

module.exports = {
  createBid,
  uploadBidDocument,
  submitBid,
  reviewBidDocument,
  analyzeBid,
  setCommitteeDecision,
  getBid,
  listBidsByTender,
  listMyBids,
};
