const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');

const sequelize = new Sequelize(dbConfig);

sequelize
  .authenticate()
  .then(() => console.log(`[DB] Connecte au dialecte "${dbConfig.dialect}"`))
  .catch((err) => console.error('[DB] Erreur de connexion :', err.message));

module.exports = sequelize;
