// Add the persisted commission decision fields without resetting existing bids.
require('dotenv').config();
const { DataTypes } = require('sequelize');
const models = require('../models');

async function main() {
  const query = models.sequelize.getQueryInterface();
  const columns = await query.describeTable('bids');
  const additions = {
    committeeDecision: { type: DataTypes.STRING, allowNull: true },
    committeeComment: { type: DataTypes.TEXT, allowNull: true },
    committeeDecidedAt: { type: DataTypes.DATE, allowNull: true },
    committeeDecidedBy: { type: DataTypes.UUID, allowNull: true },
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn('bids', name, definition);
  }
  console.log('Champs de décision de la commission ajoutés; les soumissions existantes sont conservées.');
}

main().catch((error) => {
  console.error('Migration commission non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
