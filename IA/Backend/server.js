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

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
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
app.post('/api/ai/chatbot', async (req, res) => {
  const { question, tenderContext } = req.body;
  if (!question) return res.status(400).json({ error: 'Question requise' });
  const response = await askChatbot(question, tenderContext || null);
  res.json(response);
});

// Telechargement securise des documents (authentifie avec controle d'acces granulaire)
app.get('/api/files', authenticate, async (req, res, next) => {
  try {
    const rel = req.query.path;
    if (!rel) return res.status(400).json({ error: 'Chemin manquant' });
    const normalizedRel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.resolve(process.cwd(), normalizedRel);
    const base = path.resolve(process.cwd(), UPLOAD_DIR);
    if (!filePath.startsWith(base) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    // Utilisateurs avec rôles de supervision ont accès complet
    const privilegedRoles = ['admin', 'authority', 'commission', 'auditor'];
    if (privilegedRoles.includes(req.user.role)) {
      return res.download(filePath);
    }

    // Cahier des charges / document d'appel d'offres : accessible
    const tenderDoc = await TenderDocument.findOne({ where: { filePath: normalizedRel } });
    if (tenderDoc) {
      return res.download(filePath);
    }

    // Document de soumission : uniquement le fournisseur propriétaire
    const bidDoc = await BidDocument.findOne({
      where: { filePath: normalizedRel },
      include: [{ model: Bid, as: 'bid' }],
    });
    if (bidDoc && bidDoc.bid) {
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
      const supplier = await Supplier.findOne({ where: { userId: req.user.id } });
      if (supplier && supplier.id === deliverable.contract.supplierId) {
        return res.download(filePath);
      }
      return res.status(403).json({ error: 'Acces refuse : livrable d\'un autre marche' });
    }

    res.download(filePath);
  } catch (err) {
    next(err);
  }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[SERVER] Plateforme marches publics demarree sur le port ${PORT}`);
});

module.exports = app;
