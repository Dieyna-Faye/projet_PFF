const asyncHandler = require('express-async-handler');
const models = require('../models');
const { AuditLog, User, Role } = models;

const listAuditLogs = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.action) where.action = req.query.action;
  if (req.query.entity) where.entity = req.query.entity;
  const logs = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    order: [['createdAt', 'DESC']],
    limit: parseInt(req.query.limit || '200', 10),
  });
  res.json(logs);
});

module.exports = { listAuditLogs };

