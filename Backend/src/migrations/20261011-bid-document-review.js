// Safe additive schema change. Run from Backend after backing up the database:
// node src/migrations/20261011-bid-document-review.js
require('dotenv').config();
const { DataTypes } = require('sequelize');
const models = require('../models');

async function main() {
  const query = models.sequelize.getQueryInterface();
  const columns = await query.describeTable('bid_documents');
  const additions = {
    reviewStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: 'a_verifier' },
    reviewComment: { type: DataTypes.TEXT, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedBy: { type: DataTypes.UUID, allowNull: true },
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn('bid_documents', name, definition);
  }
  console.log('Migration de revue documentaire appliquée; les fichiers et dossiers existants sont conservés.');
}

main().catch((error) => {
  console.error('Migration documentaire non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
