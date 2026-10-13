const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, EvaluationCriteria, Evaluation, Bid, BidDocument, Supplier, Score } = models;
const { writeAudit } = require('../middleware/audit');
const { computeScores, computeTechnicalAverage } = require('../services/scoring');
const { checkCompliance } = require('../services/docCheck');
const { generateSummary } = require('../services/summary');

async function canViewBidEvaluations(user, bid) {
  if (['admin', 'authority', 'commission', 'auditor'].includes(user.role)) return true;
  if (user.role !== 'supplier') return false;
  const supplier = await Supplier.findOne({ where: { userId: user.id } });
  return Boolean(supplier && supplier.id === bid.supplierId);
}

const createCriteria = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  const body = req.validated;
  const criteria = await EvaluationCriteria.create({
    tenderId: tender.id,
    label: body.label,
    description: body.description,
    weight: body.weight || 0,
    maxScore: body.maxScore || 20,
    category: body.category || 'technique',
  });
  await writeAudit({ user: req.user, action: 'CREATE_CRITERIA', entity: 'EvaluationCriteria', entityId: criteria.id, req });
  res.status(201).json(criteria);
});

const listCriteria = asyncHandler(async (req, res) => {
  const criteria = await EvaluationCriteria.findAll({ where: { tenderId: req.params.id } });
  res.json(criteria);
});

const setEvaluation = asyncHandler(async (req, res) => {
  const body = req.validated;
  const bid = await Bid.findByPk(body.bidId);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas être notée' });
  if (['attribuee', 'perdue'].includes(bid.status)) return res.status(409).json({ error: 'La notation est verrouillée après la décision définitive du marché.' });
  const criteria = await EvaluationCriteria.findByPk(body.criteriaId);
  if (!criteria || criteria.tenderId !== bid.tenderId) return res.status(400).json({ error: 'Critère absent ou rattaché à un autre appel d’offres' });
  if (Number(body.score) > Number(criteria.maxScore)) return res.status(400).json({ error: `La note ne peut pas dépasser ${criteria.maxScore}` });

  const [evaluation] = await Evaluation.findOrCreate({
    where: { bidId: body.bidId, criteriaId: body.criteriaId },
    defaults: { score: body.score, comment: body.comment, status: 'valide' },
  });
  if (!evaluation.isNewRecord) {
    evaluation.score = body.score;
    evaluation.comment = body.comment;
    evaluation.status = 'valide';
    await evaluation.save();
  }
  await writeAudit({ user: req.user, action: 'SET_EVALUATION', entity: 'Bid', entityId: bid.id, req, details: { bidId: bid.id, evaluationId: evaluation.id, criterionId: criteria.id, criterion: criteria.label, score: evaluation.score, maximum: criteria.maxScore, weight: criteria.weight, comment: evaluation.comment } });
  res.json(evaluation);
});

const listEvaluations = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas être consultée par la commission' });
  if (!(await canViewBidEvaluations(req.user, bid))) return res.status(403).json({ error: 'Acces refuse' });
  const evals = await Evaluation.findAll({
    where: { bidId: req.params.id },
    include: [{ model: EvaluationCriteria, as: 'criteria' }],
  });
  res.json(evals);
});

const recomputeBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: BidDocument, as: 'documents' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'brouillon') return res.status(409).json({ error: 'Une offre en brouillon ne peut pas être recalculée' });
  if (['attribuee', 'perdue'].includes(bid.status)) return res.status(409).json({ error: 'Le recalcul est verrouillé après la décision définitive du marché.' });
  const compliance = checkCompliance(bid.documents);
  bid.isCompliant = compliance.isCompliant;
  bid.complianceSummary = compliance.complianceSummary;
  bid.complianceDetails = JSON.stringify(compliance.checklist || []);

  const tender = await Tender.findByPk(bid.tenderId);
  const supplier = await Supplier.findByPk(bid.supplierId);
  const evals = await Evaluation.findAll({ where: { bidId: bid.id }, include: [{ model: EvaluationCriteria, as: 'criteria' }] });
  const technicalAvg = computeTechnicalAverage(evals);
  const scores = computeScores({ bid, tender, supplier, compliance, technicalAvg });

  const summary = generateSummary({ bid, supplier, tender, compliance, scores });
  bid.automaticSummary = summary;
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
  await writeAudit({ user: req.user, action: 'RECOMPUTE_SCORE', entity: 'Bid', entityId: bid.id, req });
  res.json({ message: 'Score recalcule', compliance, scores, summary, bid });
});

module.exports = { createCriteria, listCriteria, setEvaluation, listEvaluations, recomputeBid };
