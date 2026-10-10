const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/evaluationController');
const { validate } = require('../middleware/validate');
const { criteriaSchema, evaluationSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.post('/tenders/:id/criteria', authenticate, requirePermission('tenders:manage'), validate(criteriaSchema), ctrl.createCriteria);
router.get('/tenders/:id/criteria', authenticate, requirePermission('tenders:view'), ctrl.listCriteria);
router.post('/evaluations', authenticate, requirePermission('evaluations:manage'), validate(evaluationSchema), ctrl.setEvaluation);
router.get('/:id/evaluations', authenticate, requirePermission('bids:view'), ctrl.listEvaluations);
router.post('/:id/recompute', authenticate, requirePermission('bids:analyze'), ctrl.recomputeBid);

module.exports = router;
