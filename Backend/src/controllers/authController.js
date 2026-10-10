const asyncHandler = require('express-async-handler');
const models = require('../models');
const { User, Role, Supplier } = models;
const { hashPassword, signToken } = require('../utils/security');
const { ROLES, ROLE_LABELS } = require('../config/constants');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { writeAudit } = require('../middleware/audit');

function buildToken(user, role) {
  return signToken({ sub: user.id, email: user.email, role: role.name });
}

const register = asyncHandler(async (req, res) => {
  const body = req.validated;
  const requestedRole = typeof body.role === 'string' ? body.role.toLowerCase() : '';
  const roleName = requestedRole && ROLES[requestedRole.toUpperCase()] ? requestedRole : ROLES.SUPPLIER;
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) return res.status(400).json({ error: 'Role invalide' });

  const existing = await User.findOne({ where: { email: body.email } });
  if (existing) return res.status(409).json({ error: 'Email deja utilise' });

  const user = await User.create({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    passwordHash: await hashPassword(body.password),
    phone: body.phone,
    address: body.address,
    roleId: role.id,
  });

  if (roleName === ROLES.SUPPLIER) {
    await Supplier.create({
      userId: user.id,
      companyName: body.companyName || `${body.firstName} ${body.lastName}`,
      phone: body.phone,
      email: body.email,
      address: body.address,
      activitySector: body.activitySector,
      yearsExperience: body.yearsExperience || 0,
    });
  }

  await writeAudit({ user, action: 'REGISTER', entity: 'User', entityId: user.id, req });
  res.status(201).json({
    message: 'Compte cree',
    token: buildToken(user, role),
    user: { id: user.id, email: user.email, role: roleName, firstName: user.firstName, lastName: user.lastName },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validated;
  const user = await User.findOne({
    where: { email },
    include: [{ model: Role, as: 'role' }],
  });
  if (!user || !(await require('../utils/security').comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (!user.isActive) return res.status(403).json({ error: 'Compte desactive' });
  user.lastLoginAt = new Date();
  await user.save();

  const role = user.role || (await Role.findOne({ where: { name: ROLES.SUPPLIER } }));
  res.json({
    token: buildToken(user, role),
    user: { id: user.id, email: user.email, role: role.name, firstName: user.firstName, lastName: user.lastName },
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    include: [{ model: Role, as: 'role' }, { model: Supplier, as: 'supplier' }],
  });
  res.json(user);
});

module.exports = { register, login, me };
