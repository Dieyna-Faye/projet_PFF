const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fraudController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

// Alertes
router.get('/', authenticate, requirePermission('alerts:manage'), ctrl.listAlerts);
router.get('/alerts', authenticate, requirePermission('alerts:manage'), ctrl.listAlerts);
router.post('/alerts/:id/resolve', authenticate, requirePermission('alerts:manage'), ctrl.resolveAlert);
router.post('/:id/resolve', authenticate, requirePermission('alerts:manage'), ctrl.resolveAlert);

// Scans de fraude
router.post('/scan/:id', authenticate, requirePermission('alerts:manage'), ctrl.runFraudDetection);
router.post('/tenders/:id/fraud-scan', authenticate, requirePermission('alerts:manage'), ctrl.runFraudDetection);

module.exports = router;
