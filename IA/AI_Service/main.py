"""
Microservice IA - Plateforme de Gestion des Marchés Publics
Conforme aux sections 6, 7.4 et 8 du Cahier des Charges.
Technologies : FastAPI, Scikit-learn, OCR, NLP, Isolation Forest.
"""

import os
import shutil
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.ocr import extract_text_from_pdf
from src.nlp_similarity import compute_similarity_matrix
from src.fraud_detection import (
    detect_financial_anomalies,
    detect_collusion_network,
    detect_win_rotation
)
from src.delay_prediction import predict_execution_delay
from src.chatbot import ask_chatbot

allowed_origins = (
    os.getenv("CORS_ORIGIN")
    or "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
).split(",")
allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

app = FastAPI(
    title="Service IA - Plateforme Marchés Publics",
    description="Microservice d'Intelligence Artificielle : OCR, Similarité NLP, Détection de fraude, Prédiction de retard et Chatbot.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_uploads")
os.makedirs(TEMP_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------

class DocumentItem(BaseModel):
    id: str
    title: Optional[str] = ""
    text: str

class SimilarityRequest(BaseModel):
    documents: List[DocumentItem]
    threshold: Optional[float] = 0.60

class FraudDetectionRequest(BaseModel):
    tender: Optional[Dict[str, Any]] = None
    bids: List[Dict[str, Any]]
    suppliers: List[Dict[str, Any]]
    historicalContracts: Optional[List[Dict[str, Any]]] = []

class DelayPredictionRequest(BaseModel):
    tenderType: Optional[str] = "fournitures"
    estimatedBudget: Optional[float] = 1.0
    financialAmount: Optional[float] = 1.0
    executionDelayDays: Optional[int] = 60
    baselineDelayDays: Optional[int] = 60
    supplierYearsExperience: Optional[int] = 2

class ChatbotRequest(BaseModel):
    question: str
    tenderContext: Optional[Dict[str, Any]] = None

class OcrPathRequest(BaseModel):
    filePath: str

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "AI_Service_Marches_Publics",
        "version": "1.0.0",
        "capabilities": [
            "OCR (Extraction scans & vérification mots-clés)",
            "NLP (Similarité TF-IDF & détection de plagiat)",
            "Machine Learning (Isolation Forest pour anomalies de prix)",
            "Collusion Graph (Détection de liaisons entre concurrents)",
            "Delay Risk Prediction (Scikit-Learn)",
            "Chatbot Assistant Soumissionnaire"
        ]
    }

@app.post("/api/ai/ocr/extract-path")
def ocr_from_path(payload: OcrPathRequest):
    """Extrait le texte d'un fichier PDF existant sur le disque local."""
    result = extract_text_from_pdf(payload.filePath)
    return result

@app.post("/api/ai/ocr/upload")
async def ocr_upload(file: UploadFile = File(...)):
    """Reçoit un fichier PDF/image et effectue l'extraction OCR."""
    temp_path = os.path.join(TEMP_DIR, file.filename)
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        result = extract_text_from_pdf(temp_path)
        return result
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/ai/nlp/similarity")
def nlp_similarity(payload: SimilarityRequest):
    """Calcule la matrice de similarité cosinus TF-IDF entre les offres."""
    docs = [d.dict() for d in payload.documents]
    result = compute_similarity_matrix(docs, payload.threshold or 0.60)
    return result

@app.post("/api/ai/fraud/detect")
def fraud_detection(payload: FraudDetectionRequest):
    """Exécute l'analyse complète de fraude : Isolation Forest + Graphe de collusion + Rotation."""
    estimated_budget = float(payload.tender.get("estimatedBudget", 0)) if payload.tender else 0.0
    
    price_alerts = detect_financial_anomalies(payload.bids, estimated_budget)
    network_alerts = detect_collusion_network(payload.suppliers)
    current_ids = [s.get("id") for s in payload.suppliers if s.get("id")]
    rotation_alerts = detect_win_rotation(payload.historicalContracts or [], current_ids)

    all_alerts = price_alerts + network_alerts + rotation_alerts
    return {
        "scanned_bids_count": len(payload.bids),
        "scanned_suppliers_count": len(payload.suppliers),
        "alerts_count": len(all_alerts),
        "alerts": all_alerts
    }

@app.post("/api/ai/predict/delay")
def predict_delay(payload: DelayPredictionRequest):
    """Prédit le risque de retard d'exécution d'un marché avec Scikit-learn."""
    return predict_execution_delay(payload.dict())

@app.post("/api/ai/chatbot/ask")
def chatbot_ask(payload: ChatbotRequest):
    """Assiste les fournisseurs en répondant à leurs interrogations sur l'appel d'offres."""
    return ask_chatbot(payload.question, payload.tenderContext)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)
