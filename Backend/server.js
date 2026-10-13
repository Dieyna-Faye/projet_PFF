const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authenticate = require('./src/middleware/authenticate');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const models = require('./src/models');
const { TenderDocument, BidDocument, Bid, Supplier, Deliverable, Contract } = models;

const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const tenderRoutes = require('./src/routes/tenderRoutes');
const bidRoutes = require('./src/routes/bidRoutes');
const evaluationRoutes = require('./src/routes/evaluationRoutes');
const fraudRoutes = require('./src/routes/fraudRoutes');
const contractRoutes = require('./src/routes/contractRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const supplierRoutes = require('./src/routes/supplierRoutes');
const asyncHandler = require('express-async-handler');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map((origin) => origin.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origine non autorisée par CORS'));
} }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api', evaluationRoutes); // alias
app.use('/api/alerts', fraudRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api', fraudRoutes); // alias
app.use('/api/contracts', contractRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api', auditRoutes); // alias pour /api/logs
app.use('/api/dashboard', dashboardRoutes);

// Assistant Chatbot IA (accessible aux soumissionnaires et administration)
const { askChatbot } = require('./src/services/aiClient');
const chatbotRateLimits = new Map();
app.post('/api/ai/chatbot', authenticate, asyncHandler(async (req, res) => {
  const { question } = req.body;
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) return res.status(400).json({ error: 'Question invalide (1 à 2000 caractères)' });
  const now = Date.now();
  const rate = chatbotRateLimits.get(req.user.id) || { startedAt: now, count: 0 };
  if (now - rate.startedAt >= 60_000) { rate.startedAt = now; rate.count = 0; }
  if (rate.count >= 12) return res.status(429).json({ error: 'Limite temporaire atteinte. Réessayez dans une minute.' });
  rate.count += 1;
  chatbotRateLimits.set(req.user.id, rate);
  if (chatbotRateLimits.size > 5000) {
    for (const [userId, entry] of chatbotRateLimits) if (now - entry.startedAt > 120_000) chatbotRateLimits.delete(userId);
  }
  // Context from the browser is untrusted and must not be treated as platform data.
  const response = await askChatbot(question.trim(), null);
  res.json(response);
}));

// Telechargement securise des documents (authentifie avec controle d'acces granulaire)
app.get('/api/files', authenticate, async (req, res, next) => {
  try {
    const rel = req.query.path;
    if (!rel) return res.status(400).json({ error: 'Chemin manquant' });
    const normalizedRel = path.normalize(rel);
    const base = fs.realpathSync(path.resolve(process.cwd(), UPLOAD_DIR));
    const requested = path.resolve(process.cwd(), normalizedRel);
    if (path.relative(base, requested).startsWith('..') || path.isAbsolute(path.relative(base, requested)) || !fs.existsSync(requested)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    const filePath = fs.realpathSync(requested);
    const realRelative = path.relative(base, filePath);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    // Utilisateurs avec rôles de supervision ont accès complet
    const privilegedRoles = ['admin', 'authority', 'commission', 'auditor'];
    const isPrivileged = privilegedRoles.includes(req.user.role);

    // Cahier des charges / document d'appel d'offres : accessible
    const tenderDoc = await TenderDocument.findOne({ where: { filePath: normalizedRel }, include: [{ model: models.Tender, as: 'tender' }] });
    if (tenderDoc && tenderDoc.tender && (tenderDoc.tender.status === 'publie' || isPrivileged)) {
      return res.download(filePath);
    }

    // Document de soumission : uniquement le fournisseur propriétaire
    const bidDoc = await BidDocument.findOne({
      where: { filePath: normalizedRel },
      include: [{ model: Bid, as: 'bid' }],
    });
    if (bidDoc && bidDoc.bid) {
      if (isPrivileged && bidDoc.bid.status !== 'brouillon') return res.download(filePath);
      const supplier = await Supplier.findOne({ where: { userId: req.user.id } });
      if (supplier && supplier.id === bidDoc.bid.supplierId) {
        return res.download(filePath);
      }
      return res.status(403).json({ error: 'Acces refuse : document confidentiel d\'un autre soumissionnaire' });
    }

    // Livrable : uniquement le fournisseur titulaire du contrat
    const deliverable = await Deliverable.findOne({
      where: { filePath: normalizedRel },
      include: [{ model: Contract, as: 'contract' }],
    });
    if (deliverable && deliverable.contract) {
      if (isPrivileged) return res.download(filePath);
      const supplier = await Supplier.findOne({ where: { userId: req.user.id } });
      if (supplier && supplier.id === deliverable.contract.supplierId) {
        return res.download(filePath);
      }
      return res.status(403).json({ error: 'Acces refuse : livrable d\'un autre marche' });
    }

    return res.status(404).json({ error: 'Fichier introuvable' });
  } catch (err) {
    next(err);
  }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (process.env.NODE_ENV === 'production' && (!jwtSecret || ['changez-cette-cle-secrete-en-production', 'replace-with-a-long-random-secret'].includes(jwtSecret))) {
    console.error('[SERVER] Configurez JWT_SECRET avec une valeur privée avant un démarrage en production.');
    process.exitCode = 1;
  } else {
    app.listen(PORT, () => {
      console.log(`[SERVER] Plateforme marches publics demarree sur le port ${PORT}`);
    });
  }
}

module.exports = app;
