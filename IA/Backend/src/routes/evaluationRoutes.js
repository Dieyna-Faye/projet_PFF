const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/evaluationController');
const { validate } = require('../middleware/validate');
const { criteriaSchema, evaluationSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

// Notation commission
router.post('/', authenticate, requirePermission('evaluations:manage'), validate(evaluationSchema), ctrl.setEvaluation);
router.post('/evaluations', authenticate, requirePermission('evaluations:manage'), validate(evaluationSchema), ctrl.setEvaluation);

// Evaluations par offre
router.get('/bids/:id', authenticate, requirePermission('bids:view'), ctrl.listEvaluations);
router.get('/:id/evaluations', authenticate, requirePermission('bids:view'), ctrl.listEvaluations);

// Recalcul du score
router.post('/:id/recompute', authenticate, requirePermission('bids:analyze'), ctrl.recomputeBid);

// Critères d'appel d'offres (alias)
router.post('/tenders/:id/criteria', authenticate, requirePermission('tenders:manage'), validate(criteriaSchema), ctrl.createCriteria);
router.get('/tenders/:id/criteria', authenticate, requirePermission('tenders:view'), ctrl.listCriteria);

module.exports = router;
