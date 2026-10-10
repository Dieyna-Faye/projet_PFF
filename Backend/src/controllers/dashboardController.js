const asyncHandler = require('express-async-handler');
const { Op } = require('sequelize');
const models = require('../models');
const { Tender, Bid, Supplier, Contract, Score, AuditLog, Alert } = models;

const getDashboard = asyncHandler(async (req, res) => {
  const tenders = await Tender.findAll();
  const bids = await Bid.findAll({ include: [{ model: Score, as: 'score' }] });
  const suppliers = await Supplier.findAll();
  const contracts = await Contract.findAll();
  const alerts = await Alert.findAll({ where: { status: 'ouverte' } });

  const published = tenders.filter((t) => t.status === 'publie').length;
  const totalBudget = tenders.reduce((a, t) => a + Number(t.estimatedBudget || 0), 0);
  const contractAmount = contracts.reduce((a, c) => a + Number(c.amount || 0), 0);
  const awardedCount = contracts.length;
  const savings = totalBudget - contractAmount;

  const compliant = bids.filter((b) => b.isCompliant).length;
  const complianceRate = bids.length ? Math.round((compliant / bids.length) * 100) : 0;

  const lateContracts = contracts.filter(
    (c) => c.progress < 100 && c.endDate && new Date(c.endDate) < new Date()
  ).length;
  const atRisk = contracts.filter((c) => c.delayRiskPredicted || Number(c.penaltyApplied || 0) > 0).length;

  const topSuppliers = bids.reduce((acc, b) => {
    acc[b.supplierId] = (acc[b.supplierId] || 0) + 1;
    return acc;
  }, {});
  const activeSuppliers = Object.entries(topSuppliers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ supplierId: id, bids: count }));

  res.json({
    kpis: {
      appelOffresPublies: published,
      offresRecues: bids.length,
      tauxParticipation: tenders.length ? Math.round((bids.length / Math.max(1, tenders.length)) * 100) : 0,
      montantTotalMarches: Math.round(contractAmount),
      budgetTotal: Math.round(totalBudget),
      economiesRealisees: Math.round(savings > 0 ? savings : 0),
      fournisseursActifs: suppliers.length,
      marchesEnRetard: lateContracts,
      marchesARisque: atRisk,
      tauxConformite: complianceRate,
      alertesOuvertes: alerts.length,
    },
    topSuppliers: activeSuppliers,
  });
});

module.exports = { getDashboard };

