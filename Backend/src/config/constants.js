const ROLES = {
  ADMIN: 'admin',
  AUTHORITY: 'authority',
  SUPPLIER: 'supplier',
  COMMISSION: 'commission',
  AUDITOR: 'auditor',
};

const ROLE_LABELS = {
  admin: 'Administrateur',
  authority: 'Autorite contractante',
  supplier: 'Fournisseur',
  commission: 'Commission d\'evaluation',
  auditor: 'Auditeur',
};

const TENDER_TYPES = [
  'fournitures',
  'services',
  'travaux',
  'prestations_intellectuelles',
  'maintenance',
  'informatique',
  'equipements',
];

const BID_STATUSES = [
  'brouillon',
  'deposee',
  'en_evaluation',
  'conforme',
  'non_conforme',
  'rejetee',
  'attribuee',
  'perdue',
];

const TENDER_STATUSES = [
  'brouillon',
  'publie',
  'cloture',
  'attribue',
  'archive',
];

const ADMIN_DOCS = [
  'registre_de_commerce',
  'quitus_fiscal',
  'attestation_sociale',
  'references_techniques',
  'memoire_technique',
  'planning_execution',
  'offre_financiere_signee',
];

module.exports = { ROLES, ROLE_LABELS, TENDER_TYPES, BID_STATUSES, TENDER_STATUSES, ADMIN_DOCS };
