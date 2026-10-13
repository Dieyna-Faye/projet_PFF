const asyncHandler = require('express-async-handler');
const path = require('path');
const models = require('../models');
const { Tender, Bid, Contract, Payment, Supplier, Score, Deliverable, ContractMilestone } = models;
const { writeAudit } = require('../middleware/audit');
const { predictDelayRisk } = require('../services/aiClient');

function generateRef(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function canAccessContract(contract, user) {
  if (['admin', 'commission', 'auditor'].includes(user.role)) return true;
  if (user.role === 'authority') {
    const tender = await Tender.findByPk(contract.tenderId);
    return Boolean(tender && tender.createdBy === user.id);
  }
  if (user.role !== 'supplier') return false;
  const supplier = await Supplier.findOne({ where: { userId: user.id } });
  return Boolean(supplier && supplier.id === contract.supplierId);
}

const awardContract = asyncHandler(async (req, res) => {
  const bid = await Bid.findByPk(req.params.id, { include: [{ model: Score, as: 'score' }] });
  if (!bid) return res.status(404).json({ error: 'Soumission introuvable' });
  if (bid.status === 'attribuee') return res.status(409).json({ error: 'Cette offre est déjà attribuée' });
  if (bid.committeeDecision !== 'validee') return res.status(409).json({ error: 'La commission doit valider cette offre avant son attribution.' });
  if (bid.isCompliant !== true) return res.status(409).json({ error: 'Une analyse de conformité complète est requise avant attribution' });
  if (!bid.score || bid.score.globalScore == null || bid.score.scoreComplete !== true) return res.status(409).json({ error: 'Un score complet enregistré est requis avant attribution' });

  const tender = await Tender.findByPk(bid.tenderId);
  if (!tender) return res.status(404).json({ error: 'Appel d’offres introuvable' });
  if (req.user.role === 'authority' && tender.createdBy !== req.user.id) return res.status(403).json({ error: 'Vous ne pouvez attribuer que vos propres marchés.' });
  const existing = await Contract.findOne({ where: { tenderId: bid.tenderId } });
  if (existing) return res.status(409).json({ error: 'Un seul contrat peut être attribué pour cet appel d’offres.' });

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
  const where = {};
  if (req.user.role === 'supplier') {
    const supplier = await Supplier.findOne({ where: { userId: req.user.id } });
    if (!supplier) return res.json([]);
    where.supplierId = supplier.id;
  } else if (req.user.role === 'authority') {
    const tenders = await Tender.findAll({ where: { createdBy: req.user.id }, attributes: ['id'] });
    if (!tenders.length) return res.json([]);
    where.tenderId = tenders.map((tender) => tender.id);
  }
  const contracts = await Contract.findAll({
    where,
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
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Acces refuse' });
  res.json(contract);
});

const updateProgress = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
  const progress = Number(req.body.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return res.status(400).json({ error: 'L’avancement doit être compris entre 0 et 100.' });
  contract.progress = progress;
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
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
  const amount = Number(req.body.amount);
  const status = req.body.status || 'en_attente';
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Le montant du paiement doit être supérieur à zéro.' });
  if (!['en_attente', 'paye', 'annule'].includes(status)) return res.status(400).json({ error: 'Statut de paiement invalide.' });
  const payment = await Payment.create({
    contractId: contract.id,
    amount,
    currency: req.body.currency || contract.currency,
    dueDate: req.body.dueDate || null,
    status,
    paidAt: status === 'paye' ? new Date() : null,
  });
  await writeAudit({ user: req.user, action: 'ADD_PAYMENT', entity: 'Payment', entityId: payment.id, req });
  res.status(201).json(payment);
});

const applyPenalty = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'La pénalité doit être supérieure à zéro.' });
  contract.penaltyApplied = Number(contract.penaltyApplied || 0) + amount;
  await contract.save();
  await writeAudit({ user: req.user, action: 'APPLY_PENALTY', entity: 'Contract', entityId: contract.id, req });
  res.json(contract);
});

const finalRating = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
  const rating = Number(req.body.rating);
  if (contract.status !== 'termine') return res.status(409).json({ error: 'L’évaluation finale est disponible après clôture du contrat.' });
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return res.status(400).json({ error: 'La note doit être comprise entre 0 et 5.' });
  contract.finalSupplierRating = rating;
  await contract.save();
  await writeAudit({ user: req.user, action: 'FINAL_RATING', entity: 'Contract', entityId: contract.id, req });
  res.json(contract);
});

const addDeliverable = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Acces refuse' });
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
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Acces refuse' });
  const deliverables = await Deliverable.findAll({
    where: { contractId: req.params.id },
    order: [['createdAt', 'DESC']],
  });
  res.json(deliverables);
});

const validateDeliverable = asyncHandler(async (req, res) => {
  const deliverable = await Deliverable.findByPk(req.params.id, { include: [{ model: Contract, as: 'contract', include: [{ model: Tender, as: 'tender' }] }] });
  if (!deliverable) return res.status(404).json({ error: 'Livrable introuvable' });
  if (!(await canAccessContract(deliverable.contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });

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
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
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
  const contract = await Contract.findByPk(req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Acces refuse' });
  const milestones = await ContractMilestone.findAll({
    where: { contractId: req.params.id },
    order: [['dueDate', 'ASC']],
  });
  res.json(milestones);
});

const updateMilestone = asyncHandler(async (req, res) => {
  const milestone = await ContractMilestone.findByPk(req.params.id, { include: [{ model: Contract, as: 'contract', include: [{ model: Tender, as: 'tender' }] }] });
  if (!milestone) return res.status(404).json({ error: 'Etape introuvable' });
  if (!(await canAccessContract(milestone.contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });

  const { status, notes } = req.body;
  if (status) {
    if (!['a_faire', 'en_cours', 'valide', 'en_retard'].includes(status)) return res.status(400).json({ error: 'Statut de jalon invalide.' });
    milestone.status = status;
    if (status === 'valide') milestone.validatedAt = new Date();
  }
  if (notes !== undefined) milestone.notes = notes;
  await milestone.save();

  await writeAudit({ user: req.user, action: 'UPDATE_MILESTONE', entity: 'ContractMilestone', entityId: milestone.id, req });
  res.json(milestone);
});

const predictContractDelay = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, {
    include: [
      { model: Supplier, as: 'supplier' },
      { model: Tender, as: 'tender' },
      { model: ContractMilestone, as: 'milestones' },
    ],
  });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });

  const now = new Date();
  const milestones = (contract.milestones || []).map((m) => ({
    status: m.status === 'valide' ? 'valide' : m.dueDate && new Date(m.dueDate) < now ? 'en_retard' : m.status,
  }));
  const prediction = await predictDelayRisk({
    progress: contract.progress,
    startDate: contract.startDate,
    endDate: contract.endDate,
    asOfDate: now.toISOString(),
    milestones,
    overdueDeliverables: 0,
    historicalDelays: null,
  });
  if (!prediction) return res.status(503).json({ error: 'Service de prédiction indisponible; aucune prédiction n’a été enregistrée.' });

  const riskLevel = prediction.risk_level || 'a_verifier';
  const metadata = {
    contractId: contract.id,
    predictedAt: now.toISOString(),
    riskLevel,
    ruleScore: prediction.rule_score ?? null,
    riskFactors: prediction.risk_factors || [],
    missingData: prediction.missing_data || [],
    recommendations: prediction.recommendations || [],
    method: prediction.method,
  };
  const [alert] = await models.Alert.findOrCreate({
    where: { type: 'delay_prediction', entityId: contract.id },
    defaults: { severity: riskLevel, message: `Prédiction de retard : ${riskLevel}`, metadata: JSON.stringify(metadata), status: 'ouverte' },
  });
  alert.severity = riskLevel;
  alert.message = `Prédiction de retard : ${riskLevel}`;
  alert.metadata = JSON.stringify(metadata);
  alert.status = 'ouverte';
  await alert.save();
  contract.delayRiskPredicted = riskLevel === 'eleve';
  await contract.save();
  await writeAudit({ user: req.user, action: 'PREDICT_CONTRACT_DELAY', entity: 'Contract', entityId: contract.id, req, details: metadata });
  res.json({ id: alert.id, ...metadata });
});

const getContractDelayPrediction = asyncHandler(async (req, res) => {
  const contract = await Contract.findByPk(req.params.id, { include: [{ model: Tender, as: 'tender' }] });
  if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
  if (!(await canAccessContract(contract, req.user))) return res.status(403).json({ error: 'Accès refusé' });
  const alert = await models.Alert.findOne({ where: { type: 'delay_prediction', entityId: contract.id } });
  res.json(alert ? { id: alert.id, ...JSON.parse(alert.metadata || '{}') } : null);
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
  predictContractDelay,
  getContractDelayPrediction,
};
