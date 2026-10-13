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
    // These decisions belong to the procurement workflow, even when an account
    // has the administrator wildcard or a permission was granted in the UI.
    if (permissions.includes('tenders:publish') && req.user.role !== 'authority') {
      return res.status(403).json({ error: 'La publication des appels d’offres est réservée à l’autorité contractante.' });
    }
    if (permissions.includes('evaluations:manage') && req.user.role !== 'commission') {
      return res.status(403).json({ error: 'Cette action est réservée à la commission d’évaluation.' });
    }
    if (permissions.includes('contracts:manage') && req.user.role !== 'authority') {
      return res.status(403).json({ error: 'La gestion du contrat est réservée à l’autorité contractante.' });
    }
    const userPerms = req.user.permissions || [];
    const ok = permissions.every((p) => userPerms.includes(p) || userPerms.includes('*'));
    if (!ok) return res.status(403).json({ error: 'Permission requise : ' + permissions.join(', ') });
    next();
  };
}

module.exports = { authorize, requirePermission };
