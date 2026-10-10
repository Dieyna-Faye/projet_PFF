const { similarity } = require('./similarity');

const SIMILARITY_THRESHOLD = 0.6;
const PRICE_PROXIMITY_RATIO = 0.05;

function detectFraud(suppliers, bids) {
  const alerts = [];

  function add(type, severity, message, metadata) {
    alerts.push({ type, severity, message, metadata: metadata || {} });
  }

  // Indicateurs lies aux fournisseurs (identite partagee)
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
    if (ids.length > 1) add('meme_adresse', 'eleve', `Plusieurs fournisseurs partagent l'adresse : ${addr}`, { ids });
  for (const [phone, ids] of Object.entries(seenPhone))
    if (ids.length > 1) add('meme_telephone', 'eleve', `Memes numeros de telephone : ${phone}`, { ids });
  for (const [email, ids] of Object.entries(seenEmail))
    if (ids.length > 1) add('meme_email', 'eleve', `Memes adresses email : ${email}`, { ids });
  for (const [reg, ids] of Object.entries(seenRegistre))
    if (ids.length > 1) add('meme_registre', 'eleve', `Memes registres de commerce : ${reg}`, { ids });

  // Offres financieres tres proches
  const priced = bids.filter((b) => b.financialAmount).map((b) => ({ id: b.id, amount: Number(b.financialAmount) }));
  if (priced.length >= 2) {
    const min = Math.min(...priced.map((p) => p.amount));
    const close = priced.filter((p) => p.amount <= min * (1 + PRICE_PROXIMITY_RATIO) && p.amount >= min);
    if (close.length >= 2)
      add(
        'offres_proches',
        'moyen',
        `Offres financieres tres proches detectees (ecart <= ${PRICE_PROXIMITY_RATIO * 100}%)`,
        { bidIds: close.map((c) => c.id) }
      );
  }

  // Documents similaires entre soumissions
  for (let i = 0; i < bids.length; i++) {
    for (let j = i + 1; j < bids.length; j++) {
      const sim = similarity(bids[i].extractedText, bids[j].extractedText);
      if (sim >= SIMILARITY_THRESHOLD) {
        add(
          'documents_similaires',
          'moyen',
          `Similarite de documents elevee (${Math.round(sim * 100)}%) entre deux soumissions`,
          { bidIds: [bids[i].id, bids[j].id], score: sim }
        );
      }
    }
  }

  return alerts;
}

module.exports = { detectFraud, SIMILARITY_THRESHOLD };
