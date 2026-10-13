require('dotenv').config();
const models = require('../models');

async function main() {
  const role = await models.Role.findOne({ where: { name: 'authority' } });
  if (!role) {
    console.log('Rôle authority absent; aucune mise à jour nécessaire.');
    return;
  }
  let permissions;
  try {
    permissions = JSON.parse(role.permissions || '[]');
  } catch {
    permissions = [];
  }
  if (!permissions.includes('audit:view') && !permissions.includes('*')) {
    permissions.push('audit:view');
    role.permissions = JSON.stringify(permissions);
    await role.save();
  }
  console.log('Permission de consultation de l’historique ajoutée au rôle authority.');
}

main().catch((error) => {
  console.error('Migration des permissions non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
