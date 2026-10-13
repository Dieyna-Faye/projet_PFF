require('dotenv').config();
const models = require('../models');

async function main() {
  const roles = await models.Role.findAll();
  for (const role of roles) {
    let permissions;
    try { permissions = JSON.parse(role.permissions || '[]'); } catch { permissions = []; }
    const requiredRole = { 'evaluations:manage': 'commission', 'tenders:publish': 'authority', 'contracts:manage': 'authority' };
    if (Array.isArray(permissions) && permissions.some((permission) => requiredRole[permission] && requiredRole[permission] !== role.name)) {
      role.permissions = JSON.stringify(permissions.filter((permission) => !requiredRole[permission] || requiredRole[permission] === role.name));
      await role.save();
    }
  }
  console.log('Publication et gestion des contrats réservées à l’autorité; examen et notation réservés à la commission.');
}

main().catch((error) => {
  console.error('Migration des rôles non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
