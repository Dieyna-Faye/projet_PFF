require('dotenv').config();
const fs = require('fs');
const path = require('path');

const dialect = process.env.DB_DIALECT || 'sqlite';

const baseConfig = {
  dialect,
  logging: false,
  define: {
    underscored: false,
    freezeTableName: false,
  },
};

let sequelizeConfig;

if (dialect === 'sqlite') {
  const storage = process.env.DB_STORAGE || './data/marches.db';
  const dir = path.dirname(storage);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  sequelizeConfig = { ...baseConfig, storage };
} else {
  sequelizeConfig = {
    ...baseConfig,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialectOptions:
      dialect === 'postgres'
        ? { ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false }
        : {},
  };
}

module.exports = sequelizeConfig;
