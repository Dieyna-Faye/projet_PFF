const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/supplierController');

router.get('/', authenticate, requirePermission('tenders:manage'), controller.listSuppliers);

module.exports = router;
