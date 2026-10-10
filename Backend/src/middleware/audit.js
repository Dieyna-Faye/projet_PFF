const models = require('../models');
const { AuditLog } = models;

async function writeAudit({ user, action, entity, entityId, req, details }) {
  try {
    await AuditLog.create({
      userId: user ? user.id : null,
      action,
      entity,
      entityId,
      ipAddress: req ? req.ip : null,
      details: JSON.stringify(details || {}),
    });
  } catch (e) {
    console.error('[AUDIT] echec ecriture journal :', e.message);
  }
}

function audit(action, entity) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        writeAudit({
          user: req.user,
          action,
          entity,
          entityId: req.auditEntityId,
          req,
          details: req.auditDetails,
        });
      }
    });
    next();
  };
}

module.exports = { audit, writeAudit };
