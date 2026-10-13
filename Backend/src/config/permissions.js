const PERMISSIONS = {
  'users:manage': 'Gerer les utilisateurs',
  'roles:manage': 'Gerer les roles et permissions',
  'tenders:manage': 'Creer et gerer les appels d\'offres',
  'tenders:publish': 'Publier les appels d\'offres',
  'tenders:view': 'Consulter les appels d\'offres',
  'bids:submit': 'Deposer des offres',
  'bids:view': 'Consulter les offres',
  'bids:analyze': 'Analyser automatiquement les offres',
  'evaluations:manage': 'Evaluer et noter les offres',
  'scores:view': 'Consulter les scores',
  'contracts:manage': 'Gerer l\'execution des marches',
  'contracts:view': 'Consulter les contrats accessibles',
  'dashboard:view': 'Consulter le tableau de bord',
  'alerts:manage': 'Gerer les alertes de fraude',
  'audit:view': 'Consulter les journaux d\'audit',
};

const ROLE_PERMISSIONS = {
  admin: ['*'],
  authority: [
    'tenders:manage',
    'tenders:publish',
    'tenders:view',
    'bids:view',
    'bids:analyze',
    'scores:view',
    'contracts:manage',
    'contracts:view',
    'dashboard:view',
    'alerts:manage',
    'audit:view',
  ],
  supplier: ['tenders:view', 'bids:submit', 'bids:view', 'scores:view', 'contracts:view'],
  commission: ['tenders:view', 'bids:view', 'bids:analyze', 'evaluations:manage', 'scores:view', 'dashboard:view'],
  auditor: ['tenders:view', 'bids:view', 'scores:view', 'alerts:manage', 'audit:view', 'dashboard:view'],
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS };
