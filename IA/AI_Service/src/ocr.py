"""
Module OCR & Extraction de Documents (Section 6 & 7.4)
Extraction de texte à partir de documents PDF ou images (scans administratifs).
"""

import os
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
        return {"error": "Fichier introuvable", "text": "", "is_scanned": False}

    extracted_text = ""
    is_scanned = False
    page_count = 0

    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        page_count = len(reader.pages)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
    except Exception as e:
        extracted_text = ""

    # Si le texte extrait est vide ou quasi-vide (< 50 caractères), il s'agit d'un PDF scanné
    if len(extracted_text.strip()) < 50:
        is_scanned = True
        try:
            import pytesseract
            from PIL import Image
            # Tentative d'extraction d'images intégrées
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            ocr_text = ""
            for page in reader.pages:
                for img in page.images:
                    image_obj = Image.open(BytesIO(img.data))
                    ocr_text += pytesseract.image_to_string(image_obj, lang="fra") + "\n"
            if len(ocr_text.strip()) > len(extracted_text.strip()):
                extracted_text = ocr_text
        except Exception:
            # Si Tesseract n'est pas installé sur la machine hôte, on conserve le texte natif
            pass

    detected_category = detect_document_category(extracted_text)
    keywords_found = detect_keywords(extracted_text, detected_category)

    return {
        "text": extracted_text.strip(),
        "char_count": len(extracted_text.strip()),
        "page_count": page_count,
        "is_scanned": is_scanned,
        "detected_category": detected_category,
        "keywords_found": keywords_found,
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
