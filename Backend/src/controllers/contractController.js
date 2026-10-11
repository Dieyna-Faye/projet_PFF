const asyncHandler = require('express-async-handler');
const path = require('path');
const models = require('../models');
const { Tender, Bid, Contract, Payment, Supplier, Score, Deliverable, ContractMilestone } = models;
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

  const days = bid.executionDelayDays || 90;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + days * 24 * 3600 * 1000);

  const contract = await Contract.create({
    reference: generateRef('MARCHE'),
    tenderId: bid.tenderId,
    bidId: bid.id,
    supplierId: bid.supplierId,
    amount: bid.financialAmount,
    currency: bid.currency,
    startDate,
    endDate,
    status: 'actif',
    delayRiskPredicted: bid.score ? bid.score.riskLevel === 'eleve' : false,
  });

  // cloturer l'appel d'offres
  if (tender) {
    tender.status = 'attribue';
    await tender.save();
  }
  bid.status = 'attribuee';
  await bid.save();

  await writeAudit({ user: req.user, action: 'AWARD_CONTRACT', entity: 'Contract', entityId: contract.id, req });
  res.status(201).json(contract);
});

const listContracts = asyncHandler(async (req, res) => {
  const contracts = await Contract.findAll({
    include: [
      { model: Supplier, as: 'supplier' },
      { model: Tender, as: 'tender' },
      { model: Payment, as: 'payments' },
      { model: Deliverable, as: 'deliverables' },
      { model: ContractMilestone, as: 'milestones' },
    ],
    order: [['createdAt', 'DESC']],
  });
  res.json(contracts);
});

const getContract = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, {
    include: [
      { model: Payment, as: 'payments' },
      { model: Supplier, as: 'supplier' },
      { model: Tender, as: 'tender' },
      { model: Deliverable, as: 'deliverables' },
      { model: ContractMilestone, as: 'milestones' },
    ],
  });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(contract);
});

const updateProgress = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  contract.progress = Math.max(0, Math.min(100, req.body.progress || 0));
  if (contract.progress >= 100) contract.status = 'termine';

  // Prédiction dynamique de retard : comparaison avancement réel vs temps écoulé
  if (contract.endDate && contract.startDate && contract.progress < 100) {
    const totalTime = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
    const elapsedTime = Date.now() - new Date(contract.startDate).getTime();
    if (totalTime > 0 && elapsedTime > 0) {
      const expectedProgress = Math.min(100, Math.round((elapsedTime / totalTime) * 100));
      // Si le retard d'avancement dépasse 20 points de pourcentage par rapport au temps écoulé
      if (contract.progress < expectedProgress - 20) {
        contract.delayRiskPredicted = true;
      } else if (contract.progress >= expectedProgress - 10) {
        contract.delayRiskPredicted = false;
      }
    }
  }

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

const addDeliverable = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!req.body.title) return res.status(400).json({ error: 'Titre du livrable requis' });

  const deliverable = await Deliverable.create({
    contractId: contract.id,
    title: req.body.title,
    description: req.body.description || null,
    filePath: req.file ? path.relative(process.cwd(), req.file.path) : null,
    originalName: req.file ? req.file.originalname : null,
    status: 'en_attente',
    submissionDate: new Date(),
  });

  await writeAudit({ user: req.user, action: 'ADD_DELIVERABLE', entity: 'Deliverable', entityId: deliverable.id, req });
  res.status(201).json(deliverable);
});

const listDeliverables = asyncHandler(async (req, res) => {
  const deliverables = await Deliverable.findAll({
    where: { contractId: req.params.id },
    order: [['createdAt', 'DESC']],
  });
  res.json(deliverables);
});

const validateDeliverable = asyncHandler(async (req, res) => {
  const deliverable = await Deliverable.findByPk(req.params.id);
  if (!deliverable) return res.status(404).json({ error: 'Livrable introuvable' });

  const { status, validationComment } = req.body;
  if (!['valide', 'rejete', 'en_attente'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide (valide, rejete, en_attente)' });
  }

  deliverable.status = status;
  deliverable.validationComment = validationComment || null;
  deliverable.validationDate = status === 'valide' ? new Date() : null;
  await deliverable.save();

  await writeAudit({ user: req.user, action: 'VALIDATE_DELIVERABLE', entity: 'Deliverable', entityId: deliverable.id, req });
  res.json(deliverable);
});

const addMilestone = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!req.body.title) return res.status(400).json({ error: 'Titre de l\'etape requis' });

  const milestone = await ContractMilestone.create({
    contractId: contract.id,
    title: req.body.title,
    dueDate: req.body.dueDate || null,
    status: req.body.status || 'a_faire',
    notes: req.body.notes || null,
  });

  await writeAudit({ user: req.user, action: 'ADD_MILESTONE', entity: 'ContractMilestone', entityId: milestone.id, req });
  res.status(201).json(milestone);
});

const listMilestones = asyncHandler(async (req, res) => {
  const milestones = await ContractMilestone.findAll({
    where: { contractId: req.params.id },
    order: [['dueDate', 'ASC']],
  });
  res.json(milestones);
});

const updateMilestone = asyncHandler(async (req, res) => {
  const milestone = await ContractMilestone.findByPk(req.params.id);
  if (!milestone) return res.status(404).json({ error: 'Etape introuvable' });

  const { status, notes } = req.body;
  if (status) {
    milestone.status = status;
    if (status === 'valide') milestone.validatedAt = new Date();
  }
  if (notes !== undefined) milestone.notes = notes;
  await milestone.save();

  await writeAudit({ user: req.user, action: 'UPDATE_MILESTONE', entity: 'ContractMilestone', entityId: milestone.id, req });
  res.json(milestone);
});

module.exports = {
  awardContract,
  listContracts,
  getContract,
  updateProgress,
  addPayment,
  applyPenalty,
  finalRating,
  addDeliverable,
  listDeliverables,
  validateDeliverable,
  addMilestone,
  listMilestones,
  updateMilestone,
};
