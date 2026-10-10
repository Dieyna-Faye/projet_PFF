const express = require('express');
const asyncHandler = require('express-async-handler');
const { verifyToken } = require('../utils/security');
const models = require('../models');
const { User } = models;

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
  }
  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
  const user = await User.findByPk(payload.sub, {
    include: [{ model: User.associations.role.target, as: 'role' }],
  });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Utilisateur introuvable ou desactive' });
  }
  req.user = {
    id: user.id,
    email: user.email,
    role: user.role ? user.role.name : null,
    permissions: user.role ? JSON.parse(user.role.permissions || '[]') : [],
    firstName: user.firstName,
    lastName: user.lastName,
  };
  next();
});

module.exports = authenticate;
