function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifie' });
    if (allowedRoles.length === 0) return next();
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acces refuse : role insuffisant' });
    }
    next();
  };
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifie' });
    const userPerms = req.user.permissions || [];
    const ok = permissions.every((p) => userPerms.includes(p) || userPerms.includes('*'));
    if (!ok) return res.status(403).json({ error: 'Permission requise : ' + permissions.join(', ') });
    next();
  };
}

module.exports = { authorize, requirePermission };
