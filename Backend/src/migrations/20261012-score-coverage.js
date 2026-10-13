require('dotenv').config();
const { DataTypes } = require('sequelize');
const models = require('../models');

async function main() {
  const query = models.sequelize.getQueryInterface();
  const columns = await query.describeTable('scores');
  if (!columns.scoreCoveragePercent) await query.addColumn('scores', 'scoreCoveragePercent', { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
  if (!columns.scoreComplete) await query.addColumn('scores', 'scoreComplete', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  console.log('Champs de couverture du score ajoutés; les scores historiques restent consultables.');
}

main().catch((error) => {
  console.error('Migration couverture score non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
