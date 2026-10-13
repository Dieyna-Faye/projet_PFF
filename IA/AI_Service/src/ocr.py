"""
Module OCR & Extraction de Documents (Section 6 & 7.4)
Extraction de texte à partir de documents PDF ou images (scans administratifs).
"""

import os
import re
from io import BytesIO
from typing import Dict, Any, List

DOCUMENT_KEYWORDS = {
    "quitus_fiscal": [
        "direction generale des impots", "quitus fiscal", "situation fiscale",
        "impot", "dgi", "certifie", "en regle", "tresor", "quitus"
    ],
    "registre_de_commerce": [
        "registre de commerce", "rcce", "rccm", "greffe", "tribunal",
        "immatriculation", "societe", "siege social", "capital"
    ],
    "attestation_sociale": [
        "caisse de securite sociale", "ipres", "cotisations", "attestation",
        "securite sociale", "immatriculation employeur", "css"
    ],
    "memoire_technique": [
        "memoire technique", "methodologie", "planning", "moyens humains",
        "materiel", "organisation", "description technique", "equipe"
    ],
    "offre_financiere_signee": [
        "offre financiere", "montant total", "bordereau des prix", "devis",
        "lettre de soumission", "lu et approuve", "signature", "ttc", "ht"
    ],
}

def extract_text_from_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extrait le texte d'un fichier PDF en utilisant pypdf,
    avec un fallback OCR (pytesseract) si le document est scanné / image.
    """
    if not os.path.exists(file_path):
        return {"error": "Fichier introuvable", "text": "", "is_scanned": False, "warnings": ["Fichier absent"]}
    max_bytes = int(os.getenv("AI_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
    if os.path.getsize(file_path) > max_bytes:
        return {"error": "Fichier trop volumineux", "text": "", "is_scanned": False, "warnings": ["Limite de taille dépassée"]}

    extracted_text = ""
    is_scanned = False
    page_count = 0

    warnings = []
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                return {"error": "PDF protégé par mot de passe", "text": "", "is_scanned": False, "page_count": len(reader.pages), "warnings": ["PDF protégé"]}
        page_count = len(reader.pages)
        if page_count > 100:
            return {"error": "Le PDF dépasse la limite de 100 pages", "text": "", "is_scanned": False, "page_count": page_count, "warnings": ["Limite de pages dépassée"]}
        for page in reader.pages:
            text = page.extract_text()
            if text:
                remaining = 1_000_000 - len(extracted_text)
                if remaining <= 0:
                    warnings.append("Texte tronqué à la limite d’extraction")
                    break
                extracted_text += text[:remaining] + "\n"
                if len(text) > remaining:
                    warnings.append("Texte tronqué à la limite d’extraction")
                    break
        if page_count == 0:
            warnings.append("PDF sans page")
    except Exception as e:
        warnings.append(f"Lecture PDF impossible : {type(e).__name__}")
        extracted_text = ""

    # Si le texte extrait est vide ou quasi-vide (< 50 caractères), il s'agit d'un PDF scanné
    if len(extracted_text.strip()) < 50:
        is_scanned = True
        try:
            # PyMuPDF can render scanned pages when installed. Tesseract remains
            # an optional system dependency and failures are returned as warnings.
            import fitz
            import pytesseract
            from PIL import Image
            ocr_text = ""
            pdf = fitz.open(file_path)
            for page in list(pdf)[:20]:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image_obj = Image.open(BytesIO(pixmap.tobytes("png")))
                remaining = 1_000_000 - len(ocr_text)
                if remaining <= 0:
                    warnings.append("Résultat OCR tronqué à la limite d’extraction")
                    break
                ocr_text += pytesseract.image_to_string(image_obj, lang="fra")[:remaining] + "\n"
            if page_count > 20:
                warnings.append("OCR limité aux 20 premières pages")
            if len(ocr_text.strip()) > len(extracted_text.strip()):
                extracted_text = ocr_text
            if not ocr_text.strip():
                warnings.append("OCR sans texte exploitable")
        except Exception as e:
            warnings.append(f"OCR indisponible : {type(e).__name__}")

    detected_category = detect_document_category(extracted_text)
    keywords_found = detect_keywords(extracted_text, detected_category)

    if not extracted_text.strip():
        warnings.append("Aucun texte exploitable extrait")

    fields = extract_fields(extracted_text)
    return {
        "text": extracted_text.strip(),
        "char_count": len(extracted_text.strip()),
        "page_count": page_count,
        "is_scanned": is_scanned,
        "detected_category": detected_category,
        "keywords_found": keywords_found,
        "detected_fields": fields,
        "warnings": warnings,
    }


def extract_fields(text: str) -> Dict[str, List[str]]:
    """Return candidate values only; OCR never validates authenticity or meaning."""
    return {
        "amounts": re.findall(r"(?i)(?:montant|total|prix|budget)?\s*[:=]?\s*([\d][\d\s.,]{2,}\s*(?:FCFA|XOF|CFA|EUR|€))", text)[:20],
        "dates": re.findall(r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b", text)[:30],
        "references": re.findall(r"(?i)\b(?:référence|reference|n°|no)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})", text)[:20],
        "execution_delays": re.findall(r"(?i)\b(\d{1,4})\s*(jours?|mois|semaines?)\b", text)[:20],
    }

def detect_document_category(text: str) -> str:
    """Détecte la catégorie probable d'une pièce administrative selon son contenu."""
    lower = text.lower()
    scores = {}
    for cat, kws in DOCUMENT_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        scores[cat] = score
    best = max(scores.items(), key=lambda x: x[1]) if scores else ("autre", 0)
    return best[0] if best[1] > 0 else "autre"

def detect_keywords(text: str, category: str) -> List[str]:
    """Retourne la liste des mots-clés réglementaires présents pour une catégorie."""
    lower = text.lower()
    kws = DOCUMENT_KEYWORDS.get(category, [])
    return [kw for kw in kws if kw in lower]
