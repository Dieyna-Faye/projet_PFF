require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'changez-cette-cle-secrete-en-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function hashPassword(password) {
  return crypto.hash(password, 10);
}

async function comparePassword(password, hash) {
  return crypto.compare(password, hash);
}

module.exports = { signToken, verifyToken, hashPassword, comparePassword };
