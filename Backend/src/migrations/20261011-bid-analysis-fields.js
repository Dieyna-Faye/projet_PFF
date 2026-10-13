// Add fields used by persisted, explainable bid-analysis reports.
// Run from Backend only after backing up an existing database.
require('dotenv').config();
const { DataTypes } = require('sequelize');
const models = require('../models');

async function addMissingColumns(query, table, additions) {
  const columns = await query.describeTable(table);
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn(table, name, definition);
  }
}

async function main() {
  const query = models.sequelize.getQueryInterface();
  await addMissingColumns(query, 'bids', {
    analysisStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: 'a_verifier' },
    analyzedAt: { type: DataTypes.DATE, allowNull: true },
    aiAnalysis: { type: DataTypes.TEXT, allowNull: true },
  });
  await addMissingColumns(query, 'bid_documents', {
    extractedFields: { type: DataTypes.TEXT, allowNull: false, defaultValue: '{}' },
  });
  console.log('Champs du rapport d’analyse ajoutés; les données existantes sont conservées.');
}

main().catch((error) => {
  console.error('Migration d’analyse non appliquée :', error.message);
  process.exitCode = 1;
}).finally(async () => models.sequelize.close());
