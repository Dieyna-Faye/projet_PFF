const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.get('/logs', authenticate, requirePermission('audit:view'), ctrl.listAuditLogs);
router.post('/logs/manual', authenticate, requirePermission('audit:view'), ctrl.createManualAudit);

module.exports = router;
