const { similarity } = require('./similarity');

const SIMILARITY_THRESHOLD = 0.6;
const PRICE_PROXIMITY_RATIO = 0.05;

function detectFraud(suppliers, bids, tender, historicalContracts = []) {
  const alerts = [];

  function add(type, severity, message, metadata) {
    alerts.push({ type, severity, message, metadata: metadata || {} });
  }

  // 1. Indicateurs lies aux fournisseurs (identite partagee)
  const seenAddress = {};
  const seenPhone = {};
  const seenEmail = {};
  const seenRegistre = {};

  for (const s of suppliers) {
    if (s.address) seenAddress[s.address] = (seenAddress[s.address] || []).concat(s.id);
    if (s.phone) seenPhone[s.phone] = (seenPhone[s.phone] || []).concat(s.id);
    if (s.email) seenEmail[s.email] = (seenEmail[s.email] || []).concat(s.id);
    if (s.registreCommerce)
      seenRegistre[s.registreCommerce] = (seenRegistre[s.registreCommerce] || []).concat(s.id);
  }

  for (const [addr, ids] of Object.entries(seenAddress))
    if (ids.length > 1) add('meme_adresse', 'moyen', 'Signal à vérifier : plusieurs fournisseurs partagent une adresse déclarée', { ids });
  for (const [phone, ids] of Object.entries(seenPhone))
    if (ids.length > 1) add('meme_telephone', 'moyen', 'Signal à vérifier : plusieurs fournisseurs partagent un numéro déclaré', { ids });
  for (const [email, ids] of Object.entries(seenEmail))
    if (ids.length > 1) add('meme_email', 'moyen', 'Signal à vérifier : plusieurs fournisseurs partagent une adresse e-mail déclarée', { ids });
  for (const [reg, ids] of Object.entries(seenRegistre))
    if (ids.length > 1) add('meme_registre', 'moyen', 'Signal à vérifier : plusieurs fournisseurs déclarent un même registre de commerce', { ids });

  // 2. Prix anormalement bas ou eleve par rapport au budget estimatif
  const estimatedBudget = tender ? Number(tender.estimatedBudget || 0) : 0;
  if (estimatedBudget > 0) {
    for (const b of bids) {
      const amt = Number(b.financialAmount || 0);
      if (amt > 0) {
        if (amt < estimatedBudget * 0.55) {
          add(
            'prix_anormalement_bas',
            'eleve',
            `Signal à examiner : offre située sous 55 % du budget estimatif; ce seuil ne démontre pas une irrégularité.`,
            { bidId: b.id, amount: amt, budget: estimatedBudget, reviewRequired: true }
          );
        } else if (amt > estimatedBudget * 1.25) {
          add(
            'prix_anormalement_eleve',
            'moyen',
            `Signal à examiner : offre supérieure de plus de 25 % au budget estimatif.`,
            { bidId: b.id, amount: amt, budget: estimatedBudget, reviewRequired: true }
          );
        }
      }
    }
  }

  // 3. Offres financieres tres proches (suspicion d'entente sur les prix)
  const priced = bids.filter((b) => b.financialAmount).map((b) => ({ id: b.id, amount: Number(b.financialAmount) }));
  if (priced.length >= 2) {
    const min = Math.min(...priced.map((p) => p.amount));
    const close = priced.filter((p) => p.amount <= min * (1 + PRICE_PROXIMITY_RATIO) && p.amount >= min);
    if (close.length >= 2)
      add(
        'offres_proches',
        'moyen',
        `Signal à vérifier : les montants de plusieurs offres sont proches; cela ne prouve pas une coordination.`,
        { bidIds: close.map((c) => c.id) }
      );
  }

  // 4. Documents similaires entre soumissions (plagiat / memoire technique copie)
  for (let i = 0; i < bids.length; i++) {
    for (let j = i + 1; j < bids.length; j++) {
      const sim = similarity(bids[i].extractedText, bids[j].extractedText);
      if (sim >= SIMILARITY_THRESHOLD) {
        add(
          'documents_similaires',
          'moyen',
          `Signal à vérifier : similarité documentaire de ${Math.round(sim * 100)} % entre deux soumissions.`,
          { bidIds: [bids[i].id, bids[j].id], score: sim }
        );
      }
    }
  }

  // 5. Analyse de graphe de collusion (connexions directes entre soumissionnaires concurrents)
  const links = [];
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const s1 = suppliers[i];
      const s2 = suppliers[j];
      const reasons = [];
      if (s1.phone && s1.phone === s2.phone) reasons.push('telephone identique');
      if (s1.address && s1.address === s2.address) reasons.push('adresse identique');
      if (s1.email && s1.email === s2.email) reasons.push('email identique');
      if (s1.registreCommerce && s1.registreCommerce === s2.registreCommerce) reasons.push('registre de commerce identique');

      if (reasons.length > 0) {
        links.push({ supplier1: s1.companyName || s1.id, supplier2: s2.companyName || s2.id, reasons });
        add(
          'reseau_collusion',
          'moyen',
          `Signal à vérifier : coordonnées déclarées partagées entre "${s1.companyName || s1.id}" et "${s2.companyName || s2.id}".`,
          { supplierIds: [s1.id, s2.id], reasons }
        );
      }
    }
  }

  // 6. Rotation suspecte des gagnants (Win Rotation / Bid Rigging historique)
  if (historicalContracts && historicalContracts.length >= 3) {
    const winsBySupplier = {};
    for (const c of historicalContracts) {
      if (c.supplierId) {
        winsBySupplier[c.supplierId] = (winsBySupplier[c.supplierId] || 0) + 1;
      }
    }
    const currentSupplierIds = new Set(suppliers.map((s) => s.id));
    const activeHistoricalWinners = Object.entries(winsBySupplier).filter(([id]) => currentSupplierIds.has(id));
    if (activeHistoricalWinners.length >= 2) {
      const counts = activeHistoricalWinners.map(([, count]) => count);
      const maxWins = Math.max(...counts);
      const minWins = Math.min(...counts);
      // Si plusieurs soumissionnaires ont un historique régulier d'attribution en alternance
      if (maxWins >= 2 && minWins >= 2 && maxWins - minWins <= 1) {
        add(
          'rotation_gagnants',
          'moyen',
          `Historique d'attribution suspect : rotation cyclique potentielle entre ${activeHistoricalWinners.length} fournisseurs regulierement adjudicataires`,
          { winners: activeHistoricalWinners }
        );
      }
    }
  }

  return alerts;
}

module.exports = { detectFraud, SIMILARITY_THRESHOLD };
