const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, Bid, Supplier, Alert, Contract } = models;
const { detectFraud } = require('../services/fraud');
const { detectFraudAdvanced } = require('../services/aiClient');
const { writeAudit } = require('../middleware/audit');

const runFraudDetection = asyncHandler(async (req, res) => {
  const tenderId = req.params.id;
  const tender = await Tender.findByPk(tenderId);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });

  const bids = await Bid.findAll({ where: { tenderId }, include: [{ model: Supplier, as: 'supplier' }] });
  const supplierIds = [...new Set(bids.map((b) => b.supplierId))];
  const suppliers = await Supplier.findAll({ where: { id: supplierIds } });
  const bidPlain = bids.map((b) => ({
    id: b.id,
    financialAmount: b.financialAmount,
    extractedText: b.extractedText,
  }));

  const historicalContracts = await Contract.findAll();
  const aiResult = await detectFraudAdvanced({
    bids: bidPlain,
    tender: tender.toJSON ? tender.toJSON() : tender,
    suppliers: suppliers.map((s) => (s.toJSON ? s.toJSON() : s)),
    historicalContracts: historicalContracts.map((c) => (c.toJSON ? c.toJSON() : c)),
  });
  const detected = aiResult.alerts || [];

  // persist alerts (idempotent par type+message+tender)
  const created = [];
  for (const a of detected) {
    const [alert] = await Alert.findOrCreate({
      where: { type: a.type, message: a.message, entityId: tenderId },
      defaults: {
        severity: a.severity,
        metadata: JSON.stringify({ ...a.metadata, tenderId }),
        status: 'ouverte',
      },
    });
    created.push(alert);
  }
  await writeAudit({ user: req.user, action: 'FRAUD_SCAN', entity: 'Tender', entityId: tenderId, req });
  res.json({ scanned: bids.length, alerts: created, tenderId, totalDetected: detected.length });
});

const listAlerts = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.severity) where.severity = req.query.severity;
  if (req.query.tenderId) where.entityId = req.query.tenderId;
  const alerts = await Alert.findAll({
    where,
    include: [{ model: Tender, as: 'tender', attributes: ['id', 'reference', 'title'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(alerts);
});

const resolveAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findByPk(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alerte introuvable' });
  alert.status = req.body.status || 'resolue';
  await alert.save();
  await writeAudit({ user: req.user, action: 'RESOLVE_ALERT', entity: 'Alert', entityId: alert.id, req });
  res.json(alert);
});

module.exports = { runFraudDetection, listAlerts, resolveAlert };
