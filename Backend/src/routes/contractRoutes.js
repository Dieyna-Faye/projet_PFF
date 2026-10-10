const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contractController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.post('/bids/:id/award', authenticate, requirePermission('contracts:manage'), ctrl.awardContract);
router.get('/', authenticate, requirePermission('contracts:manage'), ctrl.listContracts);
router.get('/:id', authenticate, requirePermission('contracts:manage'), ctrl.getContract);
router.post('/:id/progress', authenticate, requirePermission('contracts:manage'), ctrl.updateProgress);
router.post('/:id/payments', authenticate, requirePermission('contracts:manage'), ctrl.addPayment);
router.post('/:id/penalty', authenticate, requirePermission('contracts:manage'), ctrl.applyPenalty);
router.post('/:id/rating', authenticate, requirePermission('contracts:manage'), ctrl.finalRating);

module.exports = router;
