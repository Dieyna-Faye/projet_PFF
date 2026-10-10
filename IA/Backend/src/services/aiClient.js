const path = require('path');
const { extractText: fallbackExtractText } = require('./pdfExtract');
const { detectFraud: fallbackDetectFraud } = require('./fraud');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

async function safePost(endpoint, body, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Extraction de texte avec OCR Python, avec repli automatique sur pdf-parse si Python n'est pas actif.
 */
async function extractTextWithOCR(filePath, mimeType) {
  const absPath = path.resolve(process.cwd(), filePath);
  const aiResult = await safePost('/api/ai/ocr/extract-path', { filePath: absPath });
  if (aiResult && aiResult.text) {
    return {
      text: aiResult.text,
      isScanned: aiResult.is_scanned || false,
      detectedCategory: aiResult.detected_category || 'autre',
      keywordsFound: aiResult.keywords_found || [],
      engine: 'Python-OCR',
    };
  }
  // Repli automatique local
  const localText = await fallbackExtractText(absPath, mimeType);
  return {
    text: localText,
    isScanned: false,
    detectedCategory: 'autre',
    keywordsFound: [],
    engine: 'Node-Local',
  };
}

/**
 * Détection de fraude avancée (Isolation Forest + Graphe de collusion + Rotation).
 */
async function detectFraudAdvanced({ bids, tender, suppliers, historicalContracts }) {
  const payload = {
    tender,
    bids: bids.map((b) => ({
      id: b.id,
      financialAmount: b.financialAmount,
      extractedText: b.extractedText,
    })),
    suppliers,
    historicalContracts,
  };
  const aiResult = await safePost('/api/ai/fraud/detect', payload);
  if (aiResult && Array.isArray(aiResult.alerts)) {
    return {
      alerts: aiResult.alerts,
      engine: 'Python-ScikitLearn',
    };
  }
  // Repli automatique local
  const localAlerts = fallbackDetectFraud(suppliers, payload.bids, tender, historicalContracts);
  return {
    alerts: localAlerts,
    engine: 'Node-Local',
  };
}

/**
 * Prédiction Machine Learning du risque de retard de contrat.
 */
async function predictDelayRisk(contractData) {
  const aiResult = await safePost('/api/ai/predict/delay', contractData);
  if (aiResult && aiResult.risk_level) {
    return aiResult;
  }
  return {
    probability_of_delay: contractData.riskLevel === 'eleve' ? 0.65 : 0.25,
    risk_level: contractData.riskLevel === 'eleve' ? 'eleve' : 'faible',
    risk_factors: contractData.riskLevel === 'eleve' ? ['Offre classée à risque élevé'] : [],
    recommendations: ['Suivi administratif régulier'],
    engine: 'Node-Local-Fallback',
  };
}

/**
 * Chatbot d'assistance aux soumissionnaires.
 */
async function askChatbot(question, tenderContext) {
  const aiResult = await safePost('/api/ai/chatbot/ask', { question, tenderContext });
  if (aiResult && aiResult.answer) {
    return aiResult;
  }
  return {
    answer: "Pour soumissionner, vous devez déposer les 7 pièces administratives obligatoires (Quitus fiscal, RCCM, Attestation sociale, etc.) avant la date limite.",
    engine: "Node-Local-Fallback",
  };
}

module.exports = {
  extractTextWithOCR,
  detectFraudAdvanced,
  predictDelayRisk,
  askChatbot,
};
