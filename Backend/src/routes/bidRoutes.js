const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bidController');
const evalCtrl = require('../controllers/evaluationController');
const contractCtrl = require('../controllers/contractController');
const { validate } = require('../middleware/validate');
const { bidSchema, documentReviewSchema, committeeDecisionSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { authorize, requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');
const verifyPdfUpload = require('../middleware/verifyPdfUpload');

// Mes offres (fournisseur connecté)
router.get('/my', authenticate, requirePermission('bids:submit'), ctrl.listMyBids);

// Actions et détails sur une offre spécifique (:id = bidId)
router.get('/:id', authenticate, requirePermission('bids:view'), ctrl.getBid);
router.post('/:id/documents', authenticate, requirePermission('bids:submit'), upload.single('file'), verifyPdfUpload, ctrl.uploadBidDocument);
router.post('/:id/documents/:documentId/review', authenticate, requirePermission('evaluations:manage'), validate(documentReviewSchema), ctrl.reviewBidDocument);
router.post('/:id/submit', authenticate, requirePermission('bids:submit'), ctrl.submitBid);
router.post('/:id/analyze', authenticate, requirePermission('bids:analyze'), ctrl.analyzeBid);
router.post('/:id/committee-decision', authenticate, authorize('commission'), validate(committeeDecisionSchema), ctrl.setCommitteeDecision);
router.post('/:id/recompute', authenticate, requirePermission('bids:analyze'), evalCtrl.recomputeBid);
router.get('/:id/evaluations', authenticate, requirePermission('bids:view'), evalCtrl.listEvaluations);
router.post('/:id/award', authenticate, requirePermission('contracts:manage'), contractCtrl.awardContract);

// Alias rétrocompatibilité (:id = tenderId)
router.post('/:id/bids', authenticate, requirePermission('bids:submit'), validate(bidSchema), ctrl.createBid);
router.get('/:id/bids', authenticate, requirePermission('bids:view'), ctrl.listBidsByTender);

module.exports = router;
