const asyncHandler = require('express-async-handler');
const { Supplier, User, Bid, BidDocument, Score } = require('../models');

const listSuppliers = asyncHandler(async (_req, res) => {
  const suppliers = await Supplier.findAll({
    include: [
      { model: User, as: 'user', attributes: ['id', 'isActive'] },
      { model: Bid, as: 'bids', attributes: ['id', 'status'], include: [
        { model: BidDocument, as: 'documents', attributes: ['id'] },
        { model: Score, as: 'score', attributes: ['globalScore', 'riskLevel'] },
      ] },
    ],
    order: [['companyName', 'ASC']],
  });
  res.json(suppliers.map((supplier) => {
    const bids = supplier.bids || [];
    const knownScores = bids.filter((bid) => bid.score?.globalScore !== null && bid.score?.globalScore !== undefined).map((bid) => Number(bid.score.globalScore)).filter(Number.isFinite);
    return {
      id: supplier.id,
      nom: supplier.companyName,
      email: supplier.email,
      telephone: supplier.phone,
      secteur: supplier.activitySector,
      experience: supplier.yearsExperience,
      actif: Boolean(supplier.user?.isActive),
      nombreDocuments: bids.reduce((count, bid) => count + (bid.documents?.length || 0), 0),
      nombreOffres: bids.length,
      offresAcceptees: bids.filter((bid) => ['attribuee', 'conforme'].includes(bid.status)).length,
      score: knownScores.length ? Math.round(knownScores.reduce((sum, value) => sum + value, 0) / knownScores.length) : null,
      risque: bids.some((bid) => bid.score?.riskLevel === 'eleve') ? 'ELEVE' : bids.some((bid) => bid.score?.riskLevel === 'moyen') ? 'MOYEN' : null,
    };
  }));
});

module.exports = { listSuppliers };
