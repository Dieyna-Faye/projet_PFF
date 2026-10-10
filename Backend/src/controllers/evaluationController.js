const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, EvaluationCriteria, Evaluation, Bid, Score } = models;
const { writeAudit } = require('../middleware/audit');
const { computeScores } = require('../services/scoring');
const { checkCompliance } = require('../services/docCheck');
const { generateSummary } = require('../services/summary');

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
  await writeAudit({ user: req.user, action: 'SET_EVALUATION', entity: 'Evaluation', entityId: evaluation.id, req });
  res.json(evaluation);
});

const listEvaluations = asyncHandler(async (req, res) => {
  const evals = await Evaluation.findAll({ where: { bidId: req.params.id } });
  res.json(evals);
});

const recomputeBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: BidDocument, as: 'documents' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  const compliance = checkCompliance(bid.documents);
  const tender = await Tender.findByPk(bid.tenderId);
  const supplier = await (require('../models').Supplier).findByPk(bid.supplierId);
  const evals = await Evaluation.findAll({ where: { bidId: bid.id } });
  const technicalAvg = evals.length
    ? Math.round((evals.reduce((a, e) => a + Number(e.score), 0) / evals.length) * 10) / 10
    : null;
  const scores = computeScores({ bid, tender, supplier, compliance, technicalAvg });
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
  await writeAudit({ user: req.user, action: 'RECOMPUTE_SCORE', entity: 'Bid', entityId: bid.id, req });
  res.json({ scores });
});

module.exports = { createCriteria, listCriteria, setEvaluation, listEvaluations, recomputeBid };
