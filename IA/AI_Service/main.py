"""
Microservice IA - Plateforme de Gestion des Marchés Publics
Conforme aux sections 6, 7.4 et 8 du Cahier des Charges.
Technologies : FastAPI, Scikit-learn, OCR, NLP, Isolation Forest.
"""

import os
import shutil
import uuid
import hmac
import math
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name('.env'))

from src.ocr import extract_text_from_pdf
from src.fraud_detection import (
    detect_financial_anomalies,
    detect_collusion_network,
    detect_win_rotation
)
from src.delay_prediction import predict_execution_delay
from src.chatbot import ask_chatbot
from src.nlp_similarity import compute_similarity_matrix

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

@app.middleware("http")
async def protect_internal_ai_api(request: Request, call_next):
    if request.url.path.startswith("/api/ai/"):
        if AI_SERVICE_API_KEY:
            supplied = request.headers.get("x-internal-ai-key", "")
            if not hmac.compare_digest(supplied, AI_SERVICE_API_KEY):
                return JSONResponse(status_code=401, content={"detail": "Accès interne requis"})
        else:
            client_host = request.client.host if request.client else ""
            if client_host not in {"127.0.0.1", "::1", "localhost"}:
                return JSONResponse(status_code=403, content={"detail": "Le service IA n’accepte que les appels locaux sans clé interne."})
        if request.url.path != "/api/ai/ocr/upload":
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > MAX_JSON_BODY_BYTES:
                        return JSONResponse(status_code=413, content={"detail": "Requête trop volumineuse."})
                except ValueError:
                    return JSONResponse(status_code=400, content={"detail": "Taille de requête invalide."})
    return await call_next(request)

TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp_uploads")
os.makedirs(TEMP_DIR, exist_ok=True)
FILES_ROOT = Path(os.getenv("AI_FILES_ROOT") or (Path(__file__).resolve().parents[2] / "Backend" / "uploads")).resolve()
MAX_UPLOAD_BYTES = int(os.getenv("AI_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
AI_SERVICE_API_KEY = os.getenv("AI_SERVICE_API_KEY", "").strip()

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------

class DocumentItem(BaseModel):
    id: str = Field(max_length=128)
    title: Optional[str] = Field(default="", max_length=300)
    text: str = Field(max_length=30000)

class SimilarityRequest(BaseModel):
    documents: List[DocumentItem] = Field(max_length=60)
    threshold: Optional[float] = Field(default=0.60, ge=0, le=1)

class FraudDetectionRequest(BaseModel):
    tender: Optional[Dict[str, Any]] = None
    bids: List[Dict[str, Any]] = Field(max_length=200)
    suppliers: List[Dict[str, Any]] = Field(max_length=200)
    historicalContracts: Optional[List[Dict[str, Any]]] = Field(default_factory=list, max_length=1000)

class DelayPredictionRequest(BaseModel):
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    startDate: Optional[str] = Field(default=None, max_length=40)
    endDate: Optional[str] = Field(default=None, max_length=40)
    asOfDate: Optional[str] = Field(default=None, max_length=40)
    milestones: Optional[List[Dict[str, Any]]] = Field(default_factory=list, max_length=200)
    overdueDeliverables: Optional[int] = Field(default=0, ge=0, le=10000)
    historicalDelays: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=500)

class ChatbotRequest(BaseModel):
    question: str = Field(max_length=2000)
    tenderContext: Optional[Dict[str, Any]] = None

class OcrPathRequest(BaseModel):
    filePath: str = Field(max_length=1000)

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "AI_Service_Marches_Publics",
        "version": "1.0.0",
        "chatbot_llm_enabled": bool(os.getenv("GEMINI_API_KEY")),
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
    candidate = Path(payload.filePath).resolve()
    try:
        candidate.relative_to(FILES_ROOT)
    except ValueError:
        raise HTTPException(status_code=403, detail="Chemin de fichier non autorisé")
    if candidate.suffix.lower() != ".pdf" or not candidate.is_file():
        raise HTTPException(status_code=404, detail="PDF introuvable")
    if candidate.stat().st_size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux")
    result = extract_text_from_pdf(str(candidate))
    return result

@app.post("/api/ai/ocr/upload")
async def ocr_upload(file: UploadFile = File(...)):
    """Reçoit un fichier PDF/image et effectue l'extraction OCR."""
    extension = Path(file.filename or "").suffix.lower()
    if extension != ".pdf" or file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Seuls les fichiers PDF sont acceptés")
    temp_path = os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}.pdf")
    try:
        size = 0
        with open(temp_path, "wb") as buffer:
            while chunk := await file.read(64 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Fichier trop volumineux")
                buffer.write(chunk)
        with open(temp_path, "rb") as stored:
            if stored.read(5) != b"%PDF-":
                raise HTTPException(status_code=415, detail="Le fichier reçu n’est pas un PDF valide")
        result = extract_text_from_pdf(temp_path)
        return result
    finally:
        await file.close()
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/ai/nlp/similarity")
def nlp_similarity(payload: SimilarityRequest):
    """Calcule la matrice de similarité cosinus TF-IDF entre les offres."""
    docs = [d.dict() for d in payload.documents]
    result = compute_similarity_matrix(docs, payload.threshold if payload.threshold is not None else 0.60)
    return result

@app.post("/api/ai/fraud/detect")
def fraud_detection(payload: FraudDetectionRequest):
    """Exécute l'analyse complète de fraude : Isolation Forest + Graphe de collusion + Rotation."""
    try:
        estimated_budget = float(payload.tender.get("estimatedBudget", 0)) if payload.tender else 0.0
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Budget estimatif invalide")
    if not math.isfinite(estimated_budget) or estimated_budget < 0:
        raise HTTPException(status_code=422, detail="Budget estimatif invalide")

    validated_bids = []
    for bid in payload.bids:
        raw_amount = bid.get("financialAmount")
        if raw_amount not in (None, ""):
            try:
                amount = float(raw_amount)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="Montant d’offre invalide")
            if not math.isfinite(amount) or amount < 0:
                raise HTTPException(status_code=422, detail="Montant d’offre invalide")
            bid["financialAmount"] = amount
        text = bid.get("extractedText")
        if text is not None and (not isinstance(text, str) or len(text) > 30000):
            raise HTTPException(status_code=422, detail="Texte extrait trop volumineux ou invalide")
        validated_bids.append(bid)
    
    price_alerts = detect_financial_anomalies(validated_bids, estimated_budget)
    network_alerts = detect_collusion_network(payload.suppliers)
    current_ids = [s.get("id") for s in payload.suppliers if s.get("id")]
    rotation_alerts = detect_win_rotation(payload.historicalContracts or [], current_ids)

    similarity_result = compute_similarity_matrix(
        [{"id": b.get("id", ""), "title": b.get("reference", ""), "text": b.get("extractedText", "")} for b in validated_bids]
    )
    document_alerts = []
    for item in similarity_result.get("high_similarity_alerts", []):
        pair = item.get("pair", {})
        document_alerts.append({
            "type": item.get("type", "documents_similaires_nlp"),
            "severity": item.get("severity", "faible"),
            "message": item.get("message", "Similarité documentaire à vérifier"),
            "metadata": {"bidIds": [pair.get("doc1_id"), pair.get("doc2_id")], "score": pair.get("similarity_score"), "limitations": similarity_result.get("limitations")},
        })

    # Close offers are a review indicator, not evidence of coordination.
    priced = [(b, float(b.get("financialAmount") or 0)) for b in validated_bids if float(b.get("financialAmount") or 0) > 0]
    for index, (bid_a, amount_a) in enumerate(priced):
        for bid_b, amount_b in priced[index + 1:]:
            gap = abs(amount_a - amount_b) / max(amount_a, amount_b)
            if gap <= 0.05:
                document_alerts.append({
                    "type": "offres_proches", "severity": "faible",
                    "message": "Signal à vérifier : les montants de deux offres sont proches; cela ne prouve aucune coordination.",
                    "metadata": {"bidIds": [bid_a.get("id"), bid_b.get("id")], "relativeGap": round(gap, 4)},
                })

    all_alerts = price_alerts + network_alerts + rotation_alerts + document_alerts
    return {
        "scanned_bids_count": len(payload.bids),
        "scanned_suppliers_count": len(payload.suppliers),
        "alerts_count": len(all_alerts),
        "alerts": all_alerts,
        "similarity": similarity_result,
    }

@app.post("/api/ai/predict/delay")
def predict_delay(payload: DelayPredictionRequest):
    """Prédit le risque de retard d'exécution d'un marché avec Scikit-learn."""
    return predict_execution_delay(payload.model_dump())

@app.post("/api/ai/chatbot/ask")
def chatbot_ask(payload: ChatbotRequest):
    """Assiste les fournisseurs en répondant à leurs interrogations sur l'appel d'offres."""
    if not payload.question.strip() or len(payload.question) > 2000:
        raise HTTPException(status_code=400, detail="La question doit contenir entre 1 et 2000 caractères")
    # Client-supplied context is intentionally not trusted as platform data.
    return ask_chatbot(payload.question, None)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_PORT", 5000))
    uvicorn.run(app, host=os.getenv("AI_HOST", "127.0.0.1"), port=port)
