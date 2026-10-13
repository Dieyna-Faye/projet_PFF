const path = require('path');
const { extractText: fallbackExtractText } = require('./pdfExtract');
const { detectFraud: fallbackDetectFraud } = require('./fraud');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

async function safePost(endpoint, body, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.AI_SERVICE_API_KEY) headers['X-Internal-AI-Key'] = process.env.AI_SERVICE_API_KEY;
    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers,
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
      detectedFields: aiResult.detected_fields || {},
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
    detectedFields: {},
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
  return aiResult && aiResult.risk_level ? aiResult : null;
}

/**
 * Chatbot d'assistance aux soumissionnaires.
 */
async function askChatbot(question, tenderContext) {
  // The hosted language model can take longer than local OCR/risk calls.
  const aiResult = await safePost('/api/ai/chatbot/ask', { question, tenderContext }, 45000);
  if (aiResult && aiResult.answer) {
    return aiResult;
  }
  return {
    answer: "Je ne peux pas consulter les données de votre plateforme. Vérifiez les pièces et exigences dans le règlement de consultation de l'appel d'offres concerné.",
    engine: "Safe-Fallback",
    grounded: true,
    reason: "ai_service_unreachable",
  };
}

module.exports = {
  extractTextWithOCR,
  detectFraudAdvanced,
  predictDelayRisk,
  askChatbot,
};
