const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// ---------------------------------------------------------------------------
// ROLE
// ---------------------------------------------------------------------------
class Role extends Model {}
Role.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
    permissions: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
  },
  { sequelize, modelName: 'Role', tableName: 'roles' }
);

// ---------------------------------------------------------------------------
// USER
// ---------------------------------------------------------------------------
class User extends Model {}
User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'User', tableName: 'users' }
);

// ---------------------------------------------------------------------------
// SUPPLIER (profil fournisseur rattache a un User)
// ---------------------------------------------------------------------------
class Supplier extends Model {}
Supplier.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyName: { type: DataTypes.STRING, allowNull: false },
    registreCommerce: { type: DataTypes.STRING },
    quitusFiscal: { type: DataTypes.STRING },
    attestationSociale: { type: DataTypes.STRING },
    siret: { type: DataTypes.STRING },
    activitySector: { type: DataTypes.STRING },
    yearsExperience: { type: DataTypes.INTEGER, defaultValue: 0 },
    address: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
  },
  { sequelize, modelName: 'Supplier', tableName: 'suppliers' }
);

// ---------------------------------------------------------------------------
// TENDER (appel d'offres)
// ---------------------------------------------------------------------------
class Tender extends Model {}
Tender.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING, allowNull: false, unique: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    type: { type: DataTypes.STRING, allowNull: false },
    estimatedBudget: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    currency: { type: DataTypes.STRING, defaultValue: 'XOF' },
    submissionDeadline: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'brouillon' },
    publishedAt: { type: DataTypes.DATE },
    archivedAt: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'Tender', tableName: 'tenders' }
);

// ---------------------------------------------------------------------------
// TENDER DOCUMENT (cahier des charges, etc.)
// ---------------------------------------------------------------------------
class TenderDocument extends Model {}
TenderDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    label: { type: DataTypes.STRING },
    filePath: { type: DataTypes.STRING, allowNull: false },
    originalName: { type: DataTypes.STRING },
    mimeType: { type: DataTypes.STRING },
    size: { type: DataTypes.INTEGER },
  },
  { sequelize, modelName: 'TenderDocument', tableName: 'tender_documents' }
);

// ---------------------------------------------------------------------------
// BID (soumission)
// ---------------------------------------------------------------------------
class Bid extends Model {}
Bid.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING, unique: true },
    status: { type: DataTypes.STRING, defaultValue: 'brouillon' },
    technicalProposal: { type: DataTypes.TEXT },
    financialAmount: { type: DataTypes.DECIMAL(18, 2) },
    currency: { type: DataTypes.STRING, defaultValue: 'XOF' },
    executionDelayDays: { type: DataTypes.INTEGER },
    submittedAt: { type: DataTypes.DATE },
    isCompliant: { type: DataTypes.BOOLEAN },
    complianceSummary: { type: DataTypes.TEXT },
    automaticSummary: { type: DataTypes.TEXT },
    extractedText: { type: DataTypes.TEXT },
  },
  { sequelize, modelName: 'Bid', tableName: 'bids' }
);

// ---------------------------------------------------------------------------
// BID DOCUMENT (pieces administratives + offres)
// ---------------------------------------------------------------------------
class BidDocument extends Model {}
BidDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    category: { type: DataTypes.STRING },
    label: { type: DataTypes.STRING },
    filePath: { type: DataTypes.STRING, allowNull: false },
    originalName: { type: DataTypes.STRING },
    mimeType: { type: DataTypes.STRING },
    size: { type: DataTypes.INTEGER },
    expiryDate: { type: DataTypes.DATE },
    isExpired: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: 'BidDocument', tableName: 'bid_documents' }
);

// ---------------------------------------------------------------------------
// EVALUATION CRITERIA (grille de conformite)
// ---------------------------------------------------------------------------
class EvaluationCriteria extends Model {}
EvaluationCriteria.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    label: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    weight: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    maxScore: { type: DataTypes.DECIMAL(5, 2), defaultValue: 20 },
    category: { type: DataTypes.STRING },
  },
  { sequelize, modelName: 'EvaluationCriteria', tableName: 'evaluation_criteria' }
);

// ---------------------------------------------------------------------------
// EVALUATION (notes attribuees par la commission)
// ---------------------------------------------------------------------------
class Evaluation extends Model {}
Evaluation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    score: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    comment: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'en_attente' },
  },
  { sequelize, modelName: 'Evaluation', tableName: 'evaluations' }
);

// ---------------------------------------------------------------------------
// SCORE (resultat agrege du scoring fournisseur)
// ---------------------------------------------------------------------------
class Score extends Model {}
Score.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminScore: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    technicalScore: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    financialScore: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    globalScore: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    riskLevel: { type: DataTypes.STRING, defaultValue: 'faible' },
    recommendation: { type: DataTypes.STRING },
  },
  { sequelize, modelName: 'Score', tableName: 'scores' }
);

// ---------------------------------------------------------------------------
// CONTRACT (marche attribue)
// ---------------------------------------------------------------------------
class Contract extends Model {}
Contract.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING, unique: true },
    amount: { type: DataTypes.DECIMAL(18, 2) },
    currency: { type: DataTypes.STRING, defaultValue: 'XOF' },
    startDate: { type: DataTypes.DATE },
    endDate: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING, defaultValue: 'actif' },
    progress: { type: DataTypes.INTEGER, defaultValue: 0 },
    penaltyApplied: { type: DataTypes.DECIMAL(18, 2), defaultValue: 0 },
    delayRiskPredicted: { type: DataTypes.BOOLEAN, defaultValue: false },
    finalSupplierRating: { type: DataTypes.DECIMAL(3, 2) },
  },
  { sequelize, modelName: 'Contract', tableName: 'contracts' }
);

// ---------------------------------------------------------------------------
// PAYMENT
// ---------------------------------------------------------------------------
class Payment extends Model {}
Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currency: { type: DataTypes.STRING, defaultValue: 'XOF' },
    dueDate: { type: DataTypes.DATE },
    paidAt: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING, defaultValue: 'en_attente' },
  },
  { sequelize, modelName: 'Payment', tableName: 'payments' }
);

// ---------------------------------------------------------------------------
// ALERT (fraude / anomalie)
// ---------------------------------------------------------------------------
class Alert extends Model {}
Alert.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.STRING, allowNull: false },
    severity: { type: DataTypes.STRING, defaultValue: 'moyen' },
    message: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'ouverte' },
    metadata: { type: DataTypes.TEXT, defaultValue: '{}' },
  },
  { sequelize, modelName: 'Alert', tableName: 'alerts' }
);

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------
class AuditLog extends Model {}
AuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID },
    action: { type: DataTypes.STRING, allowNull: false },
    entity: { type: DataTypes.STRING },
    entityId: { type: DataTypes.UUID },
    ipAddress: { type: DataTypes.STRING },
    details: { type: DataTypes.TEXT, defaultValue: '{}' },
  },
  { sequelize, modelName: 'AuditLog', tableName: 'audit_logs' }
);

// ---------------------------------------------------------------------------
// ASSOCIATIONS
// ---------------------------------------------------------------------------
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });

User.hasOne(Supplier, { foreignKey: 'userId', as: 'supplier' });
Supplier.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Tender, { foreignKey: 'createdBy', as: 'createdTenders' });
Tender.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Tender.hasMany(TenderDocument, { foreignKey: 'tenderId', as: 'documents' });
TenderDocument.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });

Tender.hasMany(Bid, { foreignKey: 'tenderId', as: 'bids' });
Bid.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });

Supplier.hasMany(Bid, { foreignKey: 'supplierId', as: 'bids' });
Bid.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

Bid.hasMany(BidDocument, { foreignKey: 'bidId', as: 'documents' });
BidDocument.belongsTo(Bid, { foreignKey: 'bidId', as: 'bid' });

Tender.hasMany(EvaluationCriteria, { foreignKey: 'tenderId', as: 'criteria' });
EvaluationCriteria.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });

Bid.hasMany(Evaluation, { foreignKey: 'bidId', as: 'evaluations' });
Evaluation.belongsTo(Bid, { foreignKey: 'bidId', as: 'bid' });

EvaluationCriteria.hasMany(Evaluation, { foreignKey: 'criteriaId', as: 'evaluations' });
Evaluation.belongsTo(EvaluationCriteria, { foreignKey: 'criteriaId', as: 'criteria' });

Bid.hasOne(Score, { foreignKey: 'bidId', as: 'score' });
Score.belongsTo(Bid, { foreignKey: 'bidId', as: 'bid' });

Tender.hasOne(Contract, { foreignKey: 'tenderId', as: 'contract' });
Contract.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });

Bid.hasOne(Contract, { foreignKey: 'bidId', as: 'contract' });
Contract.belongsTo(Bid, { foreignKey: 'bidId', as: 'bid' });

Supplier.hasMany(Contract, { foreignKey: 'supplierId', as: 'contracts' });
Contract.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

Contract.hasMany(Payment, { foreignKey: 'contractId', as: 'payments' });
Payment.belongsTo(Contract, { foreignKey: 'contractId', as: 'contract' });

const models = {
  sequelize,
  Role,
  User,
  Supplier,
  Tender,
  TenderDocument,
  Bid,
  BidDocument,
  EvaluationCriteria,
  Evaluation,
  Score,
  Contract,
  Payment,
  Alert,
  AuditLog,
};

module.exports = models;
