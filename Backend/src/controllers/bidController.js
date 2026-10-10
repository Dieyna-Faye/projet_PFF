const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, Bid, BidDocument, Supplier, Score, Evaluation, EvaluationCriteria, User } = models;
const { ROLES } = require('../config/constants');
const { writeAudit } = require('../middleware/audit');
const { checkCompliance } = require('../services/docCheck');
const { computeScores } = require('../services/scoring');
const { generateSummary } = require('../services/summary');
const { extractText } = require('../services/pdfExtract');
const path = require('path');

function generateBidReference() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `OFFRE-${rand}`;
}

async function getSupplierForUser(userId) {
  return Supplier.findOne({ where: { userId } });
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
  if (bid.status !== 'brouillon')
    return res.status(400).json({ error: 'Soumission verrouillee apres depot' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoye' });

  let extractedText = '';
  try {
    extractedText = await extractText(req.file.path, req.file.mimetype);
  } catch (e) {
    console.error('[PDF]', e.message);
  }

  const doc = await BidDocument.create({
    bidId: bid.id,
    category: req.body.category || 'autre',
    label: req.body.label || req.file.originalname,
    filePath: path.relative(process.cwd(), req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    expiryDate: req.body.expiryDate || null,
    extractedText,
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
  if (bid.status !== 'brouillon')
    return res.status(400).json({ error: 'Soumission deja deposee' });
  bid.status = 'deposee';
  bid.submittedAt = new Date();
  await bid.save();
  await writeAudit({ user: req.user, action: 'SUBMIT_BID', entity: 'Bid', entityId: bid.id, req });
  res.json({ message: 'Offre deposee. Accuse de reception genere.', bid, receipt: { reference: bid.reference, date: bid.submittedAt } });
});

const analyzeBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: BidDocument, as: 'documents' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });

  const compliance = checkCompliance(bid.documents);
  bid.isCompliant = compliance.isCompliant;
  bid.complianceSummary = compliance.complianceSummary;
  await bid.save();

  const tender = await Tender.findByPk(bid.tenderId);
  const supplier = await Supplier.findByPk(bid.supplierId);

  // moyenne technique a partir des evaluations de la commission
  const evals = await Evaluation.findAll({ where: { bidId: bid.id } });
  let technicalAvg = null;
  if (evals.length) {
    const sum = evals.reduce((a, e) => a + Number(e.score), 0);
    technicalAvg = Math.round((sum / evals.length) * 10) / 10;
  }

  const scores = computeScores({ bid, tender, supplier, compliance, technicalAvg });

  const summary = generateSummary({ bid, supplier, tender, compliance, scores });
  bid.automaticSummary = summary;
  await bid.save();

  const [score] = await Score.findOrCreate({ where: { bidId: bid.id }, defaults: {} });
  Object.assign(score, {
    adminScore: scores.adminScore,
    technicalScore: scores.technicalScore,
    financialScore: scores.financialScore,
    globalScore: scores.globalScore,
    riskLevel: scores.riskLevel,
    recommendation: scores.recommendation,
  });
  await score.save();

  await writeAudit({ user: req.user, action: 'ANALYZE_BID', entity: 'Bid', entityId: bid.id, req });
  res.json({ message: 'Analyse terminee', compliance, scores, summary, bid });
});

const getBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, {
    include: [
      { model: BidDocument, as: 'documents' },
      { model: Supplier, as: 'supplier' },
      { model: Score, as: 'score' },
      { model: Tender, as: 'tender' },
    ],
  });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  res.json(bid);
});

const listBidsByTender = asyncHandler(async (req, res) => {
  const bids = await Bid.findAll({
    where: { tenderId: req.params.id },
    include: [{ model: Supplier, as: 'supplier' }, { model: Score, as: 'score' }, { model: BidDocument, as: 'documents' }],
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
  analyzeBid,
  getBid,
  listBidsByTender,
  listMyBids,
};
