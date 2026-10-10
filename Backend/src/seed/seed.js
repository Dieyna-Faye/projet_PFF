require('dotenv').config();
const fs = require('fs');
const path = require('path');
const models = require('../models');
const { Role, User, Supplier, Tender, TenderDocument, EvaluationCriteria, Bid, BidDocument } = models;
const { hashPassword } = require('../utils/security');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { ADMIN_DOCS } = require('../config/constants');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function makeUser(role, data) {
  const r = await Role.findOne({ where: { name: role } });
  return User.create({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    passwordHash: await hashPassword(data.password || 'MotDePasse123!'),
    phone: data.phone,
    address: data.address,
    roleId: r.id,
  });
}

function makeDummyFile(name, content) {
  const p = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(p, content || 'Document de demonstration');
  return path.relative(process.cwd(), p);
}

async function main() {
  ensureUploadDir();
  console.log('[SEED] Synchronisation de la base...');
  await models.sequelize.sync({ force: true });

  console.log('[SEED] Roles...');
  for (const [name, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const labels = {
      admin: 'Administrateur',
      authority: 'Autorite contractante',
      supplier: 'Fournisseur',
      commission: 'Commission d\'evaluation',
      auditor: 'Auditeur',
    };
    await Role.findOrCreate({
      where: { name },
      defaults: { label: labels[name], permissions: JSON.stringify(perms) },
    });
  }

  console.log('[SEED] Utilisateurs...');
  const admin = await makeUser('admin', { firstName: 'Admin', lastName: 'Systeme', email: 'admin@marche.gov', phone: '770000001', address: 'DGMP, Dakar' });
  const authority = await makeUser('authority', { firstName: 'Awa', lastName: 'Diallo', email: 'autorite@marche.gov', phone: '770000002', address: 'Ministere, Dakar' });
  const commission = await makeUser('commission', { firstName: 'Moussa', lastName: 'Fall', email: 'commission@marche.gov', phone: '770000003', address: 'Comite, Dakar' });
  const auditor = await makeUser('auditor', { firstName: 'Fatou', lastName: 'Sow', email: 'auditeur@marche.gov', phone: '770000004', address: 'IGE, Dakar' });
  const supplier1 = await makeUser('supplier', { firstName: 'Cheikh', lastName: 'Ndiaye', email: 'supplier1@fournisseur.sn', phone: '770000005', address: '12 Rue Faidherbe, Dakar' });
  const supplier2 = await makeUser('supplier', { firstName: 'Aminata', lastName: 'Ba', email: 'supplier2@fournisseur.sn', phone: '770000006', address: '12 Rue Faidherbe, Dakar' });

  await Supplier.findOrCreate({ where: { userId: supplier1.id }, defaults: { companyName: 'SARL Construction Plus', userId: supplier1.id, address: supplier1.address, phone: supplier1.phone, email: supplier1.email, yearsExperience: 8 } });
  await Supplier.findOrCreate({ where: { userId: supplier2.id }, defaults: { companyName: 'EURL Batiment Sud', userId: supplier2.id, address: supplier2.address, phone: supplier2.phone, email: supplier2.email, yearsExperience: 3 } });

  console.log('[SEED] Appel d\'offres...');
  const tender = await Tender.create({
    reference: 'AO-2026-1001',
    title: 'Fourniture de materiel informatique pour les administrations',
    description: 'Acquisition de 200 postes de travail et peripheriques.',
    type: 'informatique',
    estimatedBudget: 50000000,
    currency: 'XOF',
    submissionDeadline: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    status: 'publie',
    publishedAt: new Date(),
    createdBy: authority.id,
  });
  await TenderDocument.create({
    tenderId: tender.id,
    label: 'Cahier des charges',
    filePath: makeDummyFile('cahier-ao-1001.txt', 'Cahier des charges - Fourniture materiel informatique.'),
    originalName: 'cahier-des-charges.pdf',
    mimeType: 'application/pdf',
    size: 1024,
  });

  console.log('[SEED] Criteres d\'evaluation...');
  const crit = [
    { label: 'Conformite administrative', category: 'administratif', weight: 20, maxScore: 20 },
    { label: 'Qualite technique', category: 'technique', weight: 30, maxScore: 20 },
    { label: 'Prix', category: 'financier', weight: 25, maxScore: 20 },
  ];
  for (const c of crit) await EvaluationCriteria.create({ tenderId: tender.id, ...c });

  console.log('[SEED] Soumissions de demonstration...');
  const s1 = await Supplier.findOne({ where: { userId: supplier1.id } });
  const s2 = await Supplier.findOne({ where: { userId: supplier2.id } });
  for (const [s, amount, delay, docs] of [
    [s1, 45000000, 45, true],
    [s2, 45200000, 60, false],
  ]) {
    const bid = await Bid.create({
      reference: 'OFFRE-' + Math.floor(100000 + Math.random() * 900000),
      tenderId: tender.id,
      supplierId: s.id,
      status: 'deposee',
      submittedAt: new Date(),
      technicalProposal: 'Proposition technique detaillee pour ' + s.companyName,
      financialAmount: amount,
      currency: 'XOF',
      executionDelayDays: delay,
    });
    if (docs) {
      for (const cat of ADMIN_DOCS.slice(0, 5)) {
        await BidDocument.create({
          bidId: bid.id,
          category: cat,
          label: cat,
          filePath: makeDummyFile(`doc-${bid.reference}-${cat}.txt`, `Piece ${cat} pour ${s.companyName}`),
          originalName: `${cat}.pdf`,
          mimeType: 'application/pdf',
          size: 512,
        });
      }
    }
  }

  console.log('[SEED] Terminé.');
  console.log('Comptes :');
  console.log('  admin@marche.gov / MotDePasse123!');
  console.log('  autorite@marche.gov / MotDePasse123!');
  console.log('  supplier1@fournisseur.sn / MotDePasse123!');
  console.log('  commission@marche.gov / MotDePasse123!');
  console.log('  auditeur@marche.gov / MotDePasse123!');
  process.exit(0);
}

main().catch((e) => {
  console.error('[SEED] Erreur :', e);
  process.exit(1);
});
