const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, TenderDocument, User } = models;
const { TENDER_TYPES, TENDER_STATUSES } = require('../config/constants');
const { writeAudit } = require('../middleware/audit');
const { UPLOAD_DIR } = require('../middleware/upload');
const path = require('path');

function generateReference() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AO-${year}-${rand}`;
}

const createTender = asyncHandler(async (req, res) => {
  const body = req.validated;
  if (!TENDER_TYPES.includes(body.type)) return res.status(400).json({ error: 'Type de marche invalide' });
  const tender = await Tender.create({
    reference: generateReference(),
    title: body.title,
    description: body.description,
    type: body.type,
    estimatedBudget: body.estimatedBudget,
    currency: body.currency || 'XOF',
    submissionDeadline: body.submissionDeadline,
    status: 'brouillon',
    createdBy: req.user.id,
  });
  await writeAudit({ user: req.user, action: 'CREATE_TENDER', entity: 'Tender', entityId: tender.id, req });
  res.status(201).json(tender);
});

const listTenders = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const tenders = await Tender.findAll({
    where,
    include: [{ model: TenderDocument, as: 'documents' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(tenders);
});

const listPublishedTenders = asyncHandler(async (req, res) => {
  const tenders = await Tender.findAll({
    where: { status: 'publie' },
    include: [{ model: TenderDocument, as: 'documents' }],
    order: [['publishedAt', 'DESC']],
  });
  res.json(tenders);
});

const getTender = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id, {
    include: [
      { model: TenderDocument, as: 'documents' },
      { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
    ],
  });
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  res.json(tender);
});

const updateTender = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  if (tender.status === 'publie' || tender.status === 'cloture')
    return res.status(400).json({ error: 'Appel d\'offres deja publie, modification impossible' });
  const body = req.validated;
  Object.assign(tender, body);
  await tender.save();
  await writeAudit({ user: req.user, action: 'UPDATE_TENDER', entity: 'Tender', entityId: tender.id, req });
  res.json(tender);
});

const publishTender = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  tender.status = 'publie';
  tender.publishedAt = new Date();
  await tender.save();
  await writeAudit({ user: req.user, action: 'PUBLISH_TENDER', entity: 'Tender', entityId: tender.id, req });
  res.json({ message: 'Appel d\'offres publie', tender });
});

const archiveTender = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  tender.status = 'archive';
  tender.archivedAt = new Date();
  await tender.save();
  await writeAudit({ user: req.user, action: 'ARCHIVE_TENDER', entity: 'Tender', entityId: tender.id, req });
  res.json({ message: 'Archive' });
});

const addTenderDocument = asyncHandler(async (req, res) => {
  const tender = await Tender.findByPk(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoye' });
  const doc = await TenderDocument.create({
    tenderId: tender.id,
    label: req.body.label || 'Cahier des charges',
    filePath: path.relative(process.cwd(), req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
  await writeAudit({ user: req.user, action: 'ADD_TENDER_DOC', entity: 'TenderDocument', entityId: doc.id, req });
  res.status(201).json(doc);
});

module.exports = {
  createTender,
  listTenders,
  listPublishedTenders,
  getTender,
  updateTender,
  publishTender,
  archiveTender,
  addTenderDocument,
};
