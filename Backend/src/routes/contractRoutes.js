const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contractController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');

// Attribution et consultation des contrats
router.post('/bids/:id/award', authenticate, requirePermission('contracts:manage'), ctrl.awardContract);
router.get('/', authenticate, requirePermission('contracts:manage'), ctrl.listContracts);
router.get('/:id', authenticate, ctrl.getContract);

// Suivi de l'exécution, paiements, pénalités, notation
router.post('/:id/progress', authenticate, requirePermission('contracts:manage'), ctrl.updateProgress);
router.post('/:id/payments', authenticate, requirePermission('contracts:manage'), ctrl.addPayment);
router.post('/:id/penalty', authenticate, requirePermission('contracts:manage'), ctrl.applyPenalty);
router.post('/:id/rating', authenticate, requirePermission('contracts:manage'), ctrl.finalRating);

// Livrables
router.post('/:id/deliverables', authenticate, upload.single('file'), ctrl.addDeliverable);
router.get('/:id/deliverables', authenticate, ctrl.listDeliverables);
router.post('/deliverables/:id/validate', authenticate, requirePermission('contracts:manage'), ctrl.validateDeliverable);

// Jalons / étapes
router.post('/:id/milestones', authenticate, requirePermission('contracts:manage'), ctrl.addMilestone);
router.get('/:id/milestones', authenticate, ctrl.listMilestones);
router.post('/milestones/:id/status', authenticate, requirePermission('contracts:manage'), ctrl.updateMilestone);

module.exports = router;
