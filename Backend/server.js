const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authenticate = require('./src/middleware/authenticate');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const tenderRoutes = require('./src/routes/tenderRoutes');
const bidRoutes = require('./src/routes/bidRoutes');
const evaluationRoutes = require('./src/routes/evaluationRoutes');
const fraudRoutes = require('./src/routes/fraudRoutes');
const contractRoutes = require('./src/routes/contractRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origine non autorisee par CORS'));
  },
  credentials: true,
}));

const rateLimitStore = new Map();
app.use((req, res, next) => {
  const key = req.ip || 'global';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 120;

  const current = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  if (current.count > maxRequests) {
    return res.status(429).json({ error: 'Trop de requetes, veuillez reessayer plus tard.' });
  }

  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api', evaluationRoutes);
app.use('/api', fraudRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/files', authenticate, (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'Chemin manquant' });

  const base = path.resolve(process.cwd(), UPLOAD_DIR);
  const filePath = path.resolve(base, String(rel));
  const relative = path.relative(base, filePath);

  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }

  res.download(filePath);
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[SERVER] Plateforme marches publics demarree sur le port ${PORT}`);
  });
}

module.exports = app;
