const asyncHandler = require('express-async-handler');
const models = require('../models');
const { Tender, TenderDocument, User } = models;
const { TENDER_TYPES, TENDER_STATUSES } = require('../config/constants');
const { writeAudit } = require('../middleware/audit');
const { UPLOAD_DIR } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

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
  if (req.query.type) where.type = req.query.type;
  if (req.user.role === 'supplier') where.status = 'publie';
  const tenders = await Tender.findAll({
    where,
    include: [{ model: TenderDocument, as: 'documents', ...(req.user.role === 'supplier' ? { attributes: ['id', 'label', 'originalName', 'mimeType', 'size'] } : {}) }],
    order: [['createdAt', 'DESC']],
  });
  res.json(tenders);
});

const listPublicTenders = asyncHandler(async (req, res) => {
  const where = { status: 'publie' };
  if (req.query.type) where.type = req.query.type;
  const tenders = await Tender.findAll({
    where,
    attributes: ['id', 'reference', 'title', 'description', 'type', 'estimatedBudget', 'currency', 'submissionDeadline', 'status', 'publishedAt', 'createdAt', 'updatedAt'],
    include: [{ model: TenderDocument, as: 'documents', attributes: ['id', 'label', 'originalName', 'mimeType', 'size'] }],
    order: [['publishedAt', 'DESC']],
  });
  res.json(tenders);
});

const getPublicTender = asyncHandler(async (req, res) => {
  const tender = await Tender.findOne({
    where: { id: req.params.id, status: 'publie' },
    attributes: ['id', 'reference', 'title', 'description', 'type', 'estimatedBudget', 'currency', 'submissionDeadline', 'status', 'publishedAt', 'createdAt', 'updatedAt'],
    include: [{ model: TenderDocument, as: 'documents', attributes: ['id', 'label', 'originalName', 'mimeType', 'size'] }],
  });
  if (!tender) return res.status(404).json({ error: 'Appel d\'offres public introuvable' });
  res.json(tender);
});

const downloadTenderDocument = asyncHandler(async (req, res) => {
  const document = await TenderDocument.findOne({ where: { id: req.params.documentId, tenderId: req.params.id }, include: [{ model: Tender, as: 'tender' }] });
  if (!document || !document.tender || document.tender.status !== 'publie') return res.status(404).json({ error: 'Document public introuvable' });
  const root = fs.realpathSync(path.resolve(process.cwd(), UPLOAD_DIR));
  const candidate = path.resolve(process.cwd(), document.filePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(candidate)) return res.status(404).json({ error: 'Document introuvable' });
  const safePath = fs.realpathSync(candidate);
  const realRelative = path.relative(root, safePath);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || !fs.statSync(safePath).isFile()) return res.status(404).json({ error: 'Document introuvable' });
  res.download(safePath, document.originalName || 'document.pdf');
});

const listPublishedTenders = asyncHandler(async (req, res) => {
  const tenders = await Tender.findAll({
    where: { status: 'publie' },
    attributes: ['id', 'reference', 'title', 'description', 'type', 'estimatedBudget', 'currency', 'submissionDeadline', 'status', 'publishedAt', 'createdAt', 'updatedAt'],
    include: [{ model: TenderDocument, as: 'documents', attributes: ['id', 'label', 'originalName', 'mimeType', 'size'] }],
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
  if (req.user.role === 'supplier' && tender.status !== 'publie') return res.status(404).json({ error: 'Appel d\'offres introuvable' });
  if (req.user.role === 'supplier') tender.documents = (tender.documents || []).map((doc) => ({ id: doc.id, label: doc.label, originalName: doc.originalName, mimeType: doc.mimeType, size: doc.size }));
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
  listPublicTenders,
  getPublicTender,
  downloadTenderDocument,
  getTender,
  updateTender,
  publishTender,
  archiveTender,
  addTenderDocument,
};
