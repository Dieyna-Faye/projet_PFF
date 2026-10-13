require('dotenv').config();
const models = require('../models');

async function main() {
  const roles = await models.Role.findAll({ where: { name: ['authority', 'supplier'] } });
  for (const role of roles) {
    let permissions;
    try { permissions = JSON.parse(role.permissions || '[]'); } catch { permissions = []; }
    if (!permissions.includes('*') && !permissions.includes('contracts:view')) {
      role.permissions = JSON.stringify([...permissions, 'contracts:view']);
      await role.save();
    }
  }
  console.log('Accès de consultation des contrats ajouté aux rôles autorité et fournisseur.');
}

main().catch((error) => {
  console.error('Migration des droits contrat non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
