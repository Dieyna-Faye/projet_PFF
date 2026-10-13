"""
Module NLP & Analyse de Similarité (Section 5.5 & 7.4)
Détection de plagiat et de documents copiés via TF-IDF et Cosine Similarity (Scikit-learn).
"""

from typing import List, Dict, Any
import numpy as np

def compute_similarity_matrix(documents: List[Dict[str, Any]], threshold: float = 0.60) -> Dict[str, Any]:
    """
    Calcule la matrice de similarité cosinus TF-IDF entre les soumissions.
    documents : [ {"id": "offre-1", "title": "SARL X", "text": "..."} , ... ]
    """
    if len(documents) < 2:
        return {"pairs": [], "matrix": [], "high_similarity_alerts": [], "status": "insufficient_data", "explanation": "Au moins deux documents sont nécessaires.", "limitations": "La similarité textuelle est un signal de comparaison, jamais une preuve de collusion."}

    texts = [doc.get("text", "") for doc in documents]
    # Si tous les textes sont vides ou trop courts
    if sum(len(t.strip()) for t in texts) < 20 or sum(bool(t.strip()) for t in texts) < 2:
        return {"pairs": [], "matrix": [], "high_similarity_alerts": [], "status": "insufficient_data", "explanation": "Les textes extraits sont absents ou trop courts.", "limitations": "Le résultat dépend de la qualité OCR et des documents comparés."}

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True
        )
        tfidf_matrix = vectorizer.fit_transform(texts)
        sim_matrix = cosine_similarity(tfidf_matrix)

        pairs = []
        alerts = []

        n = len(documents)
        for i in range(n):
            for j in range(i + 1, n):
                score = float(sim_matrix[i][j])
                score_pct = round(score * 100, 1)
                pair_info = {
                    "doc1_id": documents[i].get("id"),
                    "doc1_title": documents[i].get("title", ""),
                    "doc2_id": documents[j].get("id"),
                    "doc2_title": documents[j].get("title", ""),
                    "similarity_score": round(score, 4),
                    "similarity_percentage": score_pct,
                }
                pairs.append(pair_info)

                if score >= threshold:
                    alerts.append({
                        "type": "documents_similaires_nlp",
                        "severity": "moyen" if score >= 0.85 else "faible",
                        "message": f"Signal à vérifier : similarité textuelle de {score_pct}% entre les deux documents",
                        "pair": pair_info
                    })

        return {
            "pairs": pairs,
            "matrix": sim_matrix.round(4).tolist(),
            "high_similarity_alerts": alerts,
            "count": len(alerts)
            ,"status": "completed",
            "method": "TF-IDF (unigrammes et bigrammes) avec similarité cosinus",
            "explanation": "Le score compare les termes et expressions partagés dans les textes extraits.",
            "limitations": "La mise en page, les formulations standard et les erreurs OCR influencent les scores; un humain doit examiner tout signal."
        }

    except Exception as e:
        return {
            "error": "Comparaison impossible pour les textes fournis",
            "pairs": [],
            "matrix": [],
            "high_similarity_alerts": []
        }
