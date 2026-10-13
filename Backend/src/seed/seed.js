require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const models = require('../models');
const { ROLE_PERMISSIONS } = require('../config/permissions');
const { ADMIN_DOCS } = require('../config/constants');
const { hashPassword } = require('../utils/security');

const {
  sequelize,
  Role,
  User,
  Supplier,
  Tender,
  TenderDocument,
  EvaluationCriteria,
  Bid,
  BidDocument,
} = models;

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const DEMO_PASSWORD = 'PffDemo-2026!';
const ROLE_LABELS = {
  admin: 'Administrateur',
  authority: 'Autorité contractante',
  supplier: 'Fournisseur',
  commission: 'Commission d’évaluation',
  auditor: 'Auditeur',
};

function makePdfFile(fileName, text) {
  const filePath = path.join(UPLOAD_DIR, fileName);
  const safeText = String(text)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[\\()]/g, '\\$&')
    .slice(0, 180);
  const stream = `BT /F1 12 Tf 50 740 Td (${safeText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, 'ascii');
  return { filePath: path.relative(process.cwd(), filePath), size: Buffer.byteLength(pdf, 'ascii') };
}

async function createUser(roleName, details) {
  const role = await Role.findOne({ where: { name: roleName } });
  const user = await User.create({
    firstName: details.firstName,
    lastName: details.lastName,
    email: details.email,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    phone: details.phone,
    address: details.address,
    roleId: role.id,
  });
  if (roleName === 'supplier') {
    await Supplier.create({
      userId: user.id,
      companyName: details.companyName,
      registreCommerce: details.registreCommerce,
      activitySector: details.activitySector,
      yearsExperience: details.yearsExperience,
      address: details.address,
      phone: details.phone,
      email: details.email,
    });
  }
  return user;
}

async function addBid({ tender, supplier, categoryPrefix, amount, delayDays }) {
  const submittedAt = new Date();
  const reference = `OFFRE-${crypto.randomInt(100000, 1000000)}`;
  const bid = await Bid.create({
    reference,
    tenderId: tender.id,
    supplierId: supplier.id,
    status: 'deposee',
    submittedAt,
    financialAmount: amount,
    currency: tender.currency,
    executionDelayDays: delayDays,
    technicalProposal: `Proposition de démonstration de ${supplier.companyName}. À examiner par la commission.`,
    extractedText: `Proposition de démonstration ${supplier.companyName}; délai proposé ${delayDays} jours.`,
    analysisStatus: 'a_verifier',
  });
  bid.receiptHash = crypto.createHash('sha256')
    .update(`${bid.id}:${bid.reference}:${bid.supplierId}:${bid.financialAmount}:${submittedAt.toISOString()}`)
    .digest('hex');
  await bid.save();

  for (const category of ADMIN_DOCS) {
    const file = makePdfFile(
      `${categoryPrefix}-${reference}-${category}.pdf`,
      `DOCUMENT SYNTHETIQUE DE DEMONSTRATION - ${category} - ${supplier.companyName} - REVUE HUMAINE REQUISE`,
    );
    await BidDocument.create({
      bidId: bid.id,
      category,
      label: category,
      filePath: file.filePath,
      originalName: `${category}.pdf`,
      mimeType: 'application/pdf',
      size: file.size,
      extractedText: `Document synthétique de démonstration pour ${category}; revue humaine requise.`,
      extractedFields: '{}',
      reviewStatus: 'a_verifier',
    });
  }
  return bid;
}

async function main() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  await sequelize.sync();

  // Seed is intentionally one-shot: do not mix fixtures into an existing project database.
  if (await User.count() || await Tender.count() || await Bid.count()) {
    throw new Error('Base non vide : ajout des données de démonstration annulé pour préserver les données existantes.');
  }

  for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    await Role.findOrCreate({
      where: { name },
      defaults: { name, label: ROLE_LABELS[name], permissions: JSON.stringify(permissions) },
    });
  }

  const admin = await createUser('admin', {
    firstName: 'Admin', lastName: 'Demo', email: 'admin@marche.gov', phone: '770000001', address: 'Dakar',
  });
  const authority = await createUser('authority', {
    firstName: 'Awa', lastName: 'Diallo', email: 'autorite@marche.gov', phone: '770000002', address: 'Dakar',
  });
  await createUser('commission', {
    firstName: 'Moussa', lastName: 'Fall', email: 'commission@marche.gov', phone: '770000003', address: 'Dakar',
  });
  await createUser('auditor', {
    firstName: 'Fatou', lastName: 'Sow', email: 'auditeur@marche.gov', phone: '770000004', address: 'Dakar',
  });
  const supplierUser1 = await createUser('supplier', {
    firstName: 'Cheikh', lastName: 'Ndiaye', email: 'supplier1@fournisseur.sn', phone: '770000005',
    address: 'Dakar', companyName: 'SARL Construction Plus', registreCommerce: 'SN-DEMO-001',
    activitySector: 'Informatique et équipements', yearsExperience: 8,
  });
  const supplierUser2 = await createUser('supplier', {
    firstName: 'Aminata', lastName: 'Ba', email: 'supplier2@fournisseur.sn', phone: '770000006',
    address: 'Thiès', companyName: 'EURL Bâtiment Sud', registreCommerce: 'SN-DEMO-002',
    activitySector: 'Informatique et équipements', yearsExperience: 3,
  });

  const tender = await Tender.create({
    reference: 'AO-DEMO-2026-001',
    title: 'Fourniture de matériel informatique — démonstration',
    description: 'Exemple synthétique pour parcourir le dépôt et l’examen des offres.',
    type: 'informatique',
    estimatedBudget: 50000000,
    currency: 'XOF',
    submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'publie',
    publishedAt: new Date(),
    createdBy: authority.id,
  });
  const tenderFile = makePdfFile('cahier-ao-demo-2026-001.pdf', 'CAHIER DES CHARGES SYNTHETIQUE DE DEMONSTRATION - MATERIEL INFORMATIQUE');
  await TenderDocument.create({
    tenderId: tender.id,
    label: 'Cahier des charges (exemple)',
    filePath: tenderFile.filePath,
    originalName: 'cahier-des-charges-demo.pdf',
    mimeType: 'application/pdf',
    size: tenderFile.size,
  });

  await Tender.create({
    reference: 'AO-DEMO-2026-002',
    title: 'Maintenance informatique — brouillon de démonstration',
    description: 'Exemple de consultation non publiée, visible uniquement par les rôles habilités.',
    type: 'maintenance',
    estimatedBudget: 12000000,
    currency: 'XOF',
    submissionDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    status: 'brouillon',
    createdBy: authority.id,
  });

  for (const criterion of [
    { label: 'Architecture et conformité technique', description: 'Adéquation de la solution au cahier des charges.', weight: 60, maxScore: 20, category: 'technique' },
    { label: 'Méthode et délai de livraison', description: 'Organisation et réalisme du planning proposé.', weight: 40, maxScore: 20, category: 'technique' },
  ]) {
    await EvaluationCriteria.create({ tenderId: tender.id, ...criterion });
  }

  const supplier1 = await Supplier.findOne({ where: { userId: supplierUser1.id } });
  const supplier2 = await Supplier.findOne({ where: { userId: supplierUser2.id } });
  await addBid({ tender, supplier: supplier1, categoryPrefix: 'demo', amount: 45000000, delayDays: 45 });
  await addBid({ tender, supplier: supplier2, categoryPrefix: 'demo', amount: 47200000, delayDays: 60 });

  console.log('[SEED] Données de démonstration ajoutées. Toutes les pièces sont synthétiques et en attente de revue humaine.');
  console.log(`Mot de passe temporaire commun : ${DEMO_PASSWORD}`);
  console.log('admin@marche.gov');
  console.log('autorite@marche.gov');
  console.log('commission@marche.gov');
  console.log('auditeur@marche.gov');
  console.log('supplier1@fournisseur.sn');
  console.log('supplier2@fournisseur.sn');
}

main().catch((error) => {
  console.error('[SEED] Erreur :', error.message);
  process.exitCode = 1;
}).finally(async () => {
  await sequelize.close();
});
