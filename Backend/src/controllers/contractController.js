const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, Bid, Contract, Payment, Supplier, Score } = models;
const { writeAudit } = require('../middleware/audit');

function generateRef(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

const awardContract = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: Score, as: 'score' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });

  const tender = await Tender.findByPk(bid.tenderId);
  const existing = await Contract.findOne({ where: { bidId: bid.id } });
  if (existing) return res.status(409).json({ error: 'Contrat deja cree pour cette offre' });

  const contract = await Contract.create({
    reference: generateRef('MARCHE'),
    tenderId: bid.tenderId,
    bidId: bid.id,
    supplierId: bid.supplierId,
    amount: bid.financialAmount,
    currency: bid.currency,
    startDate: new Date(),
    status: 'actif',
    delayRiskPredicted: bid.score ? bid.score.riskLevel === 'eleve' : false,
  });

  // cloturer l'appel d'offres
  tender.status = 'attribue';
  await tender.save();
  bid.status = 'attribuee';
  await bid.save();

  await writeAudit({ user: req.user, action: 'AWARD_CONTRACT', entity: 'Contract', entityId: contract.id, req });
  res.status(201).json(contract);
});

const listContracts = asyncHandler(async (req, res) => {
  const contracts = await Contract.findAll({
    include: [{ model: Supplier, as: 'supplier' }, { model: Tender, as: 'tender' }, { model: Payment, as: 'payments' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(contracts);
});

const getContract = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, {
    include: [{ model: Payment, as: 'payments' }, { model: Supplier, as: 'supplier' }, { model: Tender, as: 'tender' }],
  });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(contract);
});

const updateProgress = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  contract.progress = Math.max(0, Math.min(100, req.body.progress || 0));
  if (contract.progress >= 100) contract.status = 'termine';
  await contract.save();
  await writeAudit({ user: req.user, action: 'UPDATE_PROGRESS', entity: 'Contract', entityId: contract.id, req });
  res.json(contract);
});

const addPayment = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  const payment = await Payment.create({
    contractId: contract.id,
    amount: req.body.amount,
    currency: req.body.currency || contract.currency,
    dueDate: req.body.dueDate,
    status: req.body.status || 'en_attente',
    paidAt: req.body.status === 'paye' ? new Date() : null,
  });
  await writeAudit({ user: req.user, action: 'ADD_PAYMENT', entity: 'Payment', entityId: payment.id, req });
  res.status(201).json(payment);
});

const applyPenalty = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  contract.penaltyApplied = Number(contract.penaltyApplied || 0) + Number(req.body.amount || 0);
  await contract.save();
  await writeAudit({ user: req.user, action: 'APPLY_PENALTY', entity: 'Contract', entityId: contract.id, req });
  res.json(contract);
});

const finalRating = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  contract.finalSupplierRating = req.body.rating;
  await contract.save();
  await writeAudit({ user: req.user, action: 'FINAL_RATING', entity: 'Contract', entityId: contract.id, req });
  res.json(contract);
});

module.exports = {
  awardContract,
  listContracts,
  getContract,
  updateProgress,
  addPayment,
  applyPenalty,
  finalRating,
};
