const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');

router.get('/', authenticate, requirePermission('dashboard:view'), ctrl.getDashboard);

module.exports = router;
