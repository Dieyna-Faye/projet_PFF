const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenderController');
const { validate } = require('../middleware/validate');
const { tenderSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { authorize, requirePermission } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');

router.get('/', authenticate, requirePermission('tenders:view'), ctrl.listTenders);
router.get('/published', authenticate, requirePermission('tenders:view'), ctrl.listPublishedTenders);
router.post('/', authenticate, requirePermission('tenders:manage'), validate(tenderSchema), ctrl.createTender);
router.get('/:id', authenticate, requirePermission('tenders:view'), ctrl.getTender);
router.put('/:id', authenticate, requirePermission('tenders:manage'), validate(tenderSchema), ctrl.updateTender);
router.post('/:id/publish', authenticate, requirePermission('tenders:publish'), ctrl.publishTender);
router.post('/:id/archive', authenticate, requirePermission('tenders:manage'), ctrl.archiveTender);
router.post('/:id/documents', authenticate, requirePermission('tenders:manage'), upload.single('file'), ctrl.addTenderDocument);

module.exports = router;
