// Safe, idempotent schema upgrade for existing databases. Run from Backend:
// node src/migrations/20261011-score-data-availability.js
require('dotenv').config();
const models = require('../models');
const { DataTypes } = require('sequelize');

async function main() {
  const query = models.sequelize.getQueryInterface();
  const columns = await query.describeTable('scores');
  const decimal = { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: null };
  for (const name of ['adminScore', 'technicalScore', 'financialScore', 'experienceScore', 'delayScore', 'globalScore']) {
    if (!columns[name]) throw new Error(`Colonne attendue absente : scores.${name}`);
    await query.changeColumn('scores', name, decimal);
  }
  if (!columns.details) {
    await query.addColumn('scores', 'details', { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}' });
  }
  console.log('Migration scores appliquée. Les lignes et les autres tables sont préservées.');
}

main().catch((error) => {
  console.error('Migration scores non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
