const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fraudController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.post('/tenders/:id/fraud-scan', authenticate, requirePermission('alerts:manage'), ctrl.runFraudDetection);
router.get('/alerts', authenticate, requirePermission('alerts:manage'), ctrl.listAlerts);
router.post('/alerts/:id/resolve', authenticate, requirePermission('alerts:manage'), ctrl.resolveAlert);

module.exports = router;
