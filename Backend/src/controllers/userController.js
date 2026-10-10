const asyncHandler = require('express-async-handler');
const models = require('../models');
const { User, Role, Supplier } = models;
const { hashPassword } = require('../utils/security');
const { ROLES } = require('../config/constants');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { writeAudit } = require('../middleware/audit');

const listUsers = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    include: [{ model: Role, as: 'role' }],
    attributes: { exclude: ['passwordHash'] },
  });
  res.json(users);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Role, as: 'role' }, { model: Supplier, as: 'supplier' }],
    attributes: { exclude: ['passwordHash'] },
  });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

const createUser = asyncHandler(async (req, res) => {
  const body = req.validated;
  const roleName = body.role && ROLES[body.role.toUpperCase()] ? body.role : ROLES.SUPPLIER;
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) return res.status(400).json({ error: 'Role invalide' });

  if (await User.findOne({ where: { email: body.email } }))
    return res.status(409).json({ error: 'Email deja utilise' });

  const user = await User.create({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    passwordHash: await hashPassword(body.password || 'MotDePasse123!'),
    phone: body.phone,
    address: body.address,
    roleId: role.id,
  });

  if (roleName === ROLES.SUPPLIER) {
    await Supplier.create({ userId: user.id, companyName: body.companyName || `${body.firstName} ${body.lastName}` });
  }
  await writeAudit({ user: req.user, action: 'CREATE_USER', entity: 'User', entityId: user.id, req });
  res.status(201).json({ id: user.id, email: user.email, role: roleName });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const body = req.validated;
  if (body.firstName) user.firstName = body.firstName;
  if (body.lastName) user.lastName = body.lastName;
  if (body.phone) user.phone = body.phone;
  if (body.address) user.address = body.address;
  if (body.isActive !== undefined) user.isActive = body.isActive;
  if (body.password) user.passwordHash = await hashPassword(body.password);
  await user.save();
  await writeAudit({ user: req.user, action: 'UPDATE_USER', entity: 'User', entityId: user.id, req });
  res.json({ message: 'Utilisateur mis a jour' });
});

const listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.findAll();
  res.json(roles);
});

const createRole = asyncHandler(async (req, res) => {
  const body = req.validated;
  const [role, created] = await Role.findOrCreate({
    where: { name: body.name },
    defaults: { label: body.label, permissions: JSON.stringify(body.permissions || ROLE_PERMISSIONS[body.name] || []) },
  });
  if (!created) return res.status(409).json({ error: 'Role deja existant' });
  await writeAudit({ user: req.user, action: 'CREATE_ROLE', entity: 'Role', entityId: role.id, req });
  res.status(201).json(role);
});

module.exports = { listUsers, getUser, createUser, updateUser, listRoles, createRole };
