const asyncHandler = require('express-async-handler');
const models = require('../models');
const { AuditLog, User, Role } = models;

const listAuditLogs = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === 'authority') where.userId = req.user.id;
  if (req.query.action) where.action = req.query.action;
  if (req.query.entity) where.entity = req.query.entity;
  const requestedLimit = Number.parseInt(req.query.limit || '200', 10);
  const requestedOffset = Number.parseInt(req.query.offset || '0', 10);
  const logs = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'], include: [{ model: Role, as: 'role', attributes: ['name'] }] }],
    order: [['createdAt', 'DESC']],
    limit: Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 200,
    offset: Number.isFinite(requestedOffset) ? Math.max(0, Math.min(1000000, requestedOffset)) : 0,
  });
  res.json(logs);
});

const createManualAudit = asyncHandler(async (req, res) => {
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (description.length < 5 || description.length > 2000) {
    return res.status(400).json({ error: 'La description doit contenir entre 5 et 2000 caractères.' });
  }
  const log = await AuditLog.create({
    userId: req.user.id,
    action: 'MANUAL_AUDIT_REVIEW',
    entity: 'AuditLog',
    ipAddress: req.ip,
    details: JSON.stringify({ description }),
  });
  const saved = await AuditLog.findByPk(log.id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'], include: [{ model: Role, as: 'role', attributes: ['name'] }] }],
  });
  res.status(201).json(saved);
});

module.exports = { listAuditLogs, createManualAudit };

