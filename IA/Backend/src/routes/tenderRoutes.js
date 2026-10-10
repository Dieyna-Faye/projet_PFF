const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenderController');
const bidCtrl = require('../controllers/bidController');
const evalCtrl = require('../controllers/evaluationController');
const fraudCtrl = require('../controllers/fraudController');
const { validate } = require('../middleware/validate');
const { tenderSchema, bidSchema, criteriaSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');

// Appels d'offres
router.get('/', authenticate, requirePermission('tenders:view'), ctrl.listTenders);
router.get('/published', authenticate, requirePermission('tenders:view'), ctrl.listPublishedTenders);
router.post('/', authenticate, requirePermission('tenders:manage'), validate(tenderSchema), ctrl.createTender);
router.get('/:id', authenticate, requirePermission('tenders:view'), ctrl.getTender);
router.put('/:id', authenticate, requirePermission('tenders:manage'), validate(tenderSchema), ctrl.updateTender);
router.post('/:id/publish', authenticate, requirePermission('tenders:publish'), ctrl.publishTender);
router.post('/:id/archive', authenticate, requirePermission('tenders:manage'), ctrl.archiveTender);
router.post('/:id/documents', authenticate, requirePermission('tenders:manage'), upload.single('file'), ctrl.addTenderDocument);

// Soumissions pour un appel d'offres spécifique
router.post('/:id/bids', authenticate, requirePermission('bids:submit'), validate(bidSchema), bidCtrl.createBid);
router.get('/:id/bids', authenticate, requirePermission('bids:view'), bidCtrl.listBidsByTender);

// Critères d'évaluation de l'appel d'offres
router.post('/:id/criteria', authenticate, requirePermission('tenders:manage'), validate(criteriaSchema), evalCtrl.createCriteria);
router.get('/:id/criteria', authenticate, requirePermission('tenders:view'), evalCtrl.listCriteria);

// Scan de fraude pour cet appel d'offres
router.post('/:id/fraud-scan', authenticate, requirePermission('alerts:manage'), fraudCtrl.runFraudDetection);

// Chatbot IA d'assistance aux soumissionnaires pour cet appel d'offres
router.post('/:id/chatbot', authenticate, async (req, res) => {
  const models = require('../models');
  const { askChatbot } = require('../services/aiClient');
  const tender = await models.Tender.findByPk(req.params.id);
  const question = req.body.question;
  if (!question) return res.status(400).json({ error: 'Question requise' });
  const response = await askChatbot(question, tender ? (tender.toJSON ? tender.toJSON() : tender) : null);
  res.json(response);
});

module.exports = router;
