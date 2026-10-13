const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contractController');
const authenticate = require('../middleware/authenticate');
const { authorize, requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');
const verifyPdfUpload = require('../middleware/verifyPdfUpload');

// Attribution et consultation des contrats
router.post('/bids/:id/award', authenticate, requirePermission('contracts:manage'), ctrl.awardContract);
router.get('/', authenticate, requirePermission('contracts:view'), ctrl.listContracts);
router.get('/:id', authenticate, requirePermission('contracts:view'), ctrl.getContract);
router.post('/:id/predict-delay', authenticate, requirePermission('contracts:manage'), ctrl.predictContractDelay);
router.get('/:id/predict-delay', authenticate, requirePermission('contracts:manage'), ctrl.getContractDelayPrediction);

// Suivi de l'exécution, paiements, pénalités, notation
router.post('/:id/progress', authenticate, requirePermission('contracts:manage'), ctrl.updateProgress);
router.post('/:id/payments', authenticate, requirePermission('contracts:manage'), ctrl.addPayment);
router.post('/:id/penalty', authenticate, requirePermission('contracts:manage'), ctrl.applyPenalty);
router.post('/:id/rating', authenticate, requirePermission('contracts:manage'), ctrl.finalRating);

// Livrables
router.post('/:id/deliverables', authenticate, authorize('authority', 'supplier'), upload.single('file'), verifyPdfUpload, ctrl.addDeliverable);
router.get('/:id/deliverables', authenticate, requirePermission('contracts:view'), ctrl.listDeliverables);
router.post('/deliverables/:id/validate', authenticate, requirePermission('contracts:manage'), ctrl.validateDeliverable);

// Jalons / étapes
router.post('/:id/milestones', authenticate, requirePermission('contracts:manage'), ctrl.addMilestone);
router.get('/:id/milestones', authenticate, ctrl.listMilestones);
router.post('/milestones/:id/status', authenticate, requirePermission('contracts:manage'), ctrl.updateMilestone);

module.exports = router;
