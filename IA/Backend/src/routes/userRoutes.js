const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { validate } = require('../middleware/validate');
const { userCreateSchema, userUpdateSchema, roleSchema } = require('../validators/schemas');
const authenticate = require('../middleware/authenticate');
const { authorize, requirePermission } = require('../middleware/authorize');
const { audit } = require('../middleware/audit');

router.get('/', authenticate, requirePermission('users:manage'), ctrl.listUsers);
router.get('/roles', authenticate, ctrl.listRoles);
router.post('/roles', authenticate, requirePermission('roles:manage'), validate(roleSchema), ctrl.createRole);
router.get('/:id', authenticate, ctrl.getUser);
router.post('/', authenticate, requirePermission('users:manage'), validate(userCreateSchema), ctrl.createUser);
router.put('/:id', authenticate, requirePermission('users:manage'), validate(userUpdateSchema), ctrl.updateUser);

module.exports = router;
