const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bidController');
const { validate } = require('../middleware/validate');
const { bidSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');

router.post('/:id/bids', authenticate, requirePermission('bids:submit'), validate(bidSchema), ctrl.createBid);
router.post('/:id/documents', authenticate, requirePermission('bids:submit'), upload.single('file'), ctrl.uploadBidDocument);
router.get('/:id/bids', authenticate, requirePermission('bids:view'), ctrl.listBidsByTender);
router.get('/my', authenticate, requirePermission('bids:submit'), ctrl.listMyBids);
router.post('/:id/submit', authenticate, requirePermission('bids:submit'), ctrl.submitBid);
router.post('/:id/analyze', authenticate, requirePermission('bids:analyze'), ctrl.analyzeBid);
router.get('/:id', authenticate, requirePermission('bids:view'), ctrl.getBid);

module.exports = router;
