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
        return {"pairs": [], "matrix": [], "high_similarity_alerts": []}

    texts = [doc.get("text", "") for doc in documents]
    # Si tous les textes sont vides ou trop courts
    if sum(len(t.strip()) for t in texts) < 20:
        return {"pairs": [], "matrix": [], "high_similarity_alerts": []}

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
                        "severity": "critique" if score >= 0.85 else "eleve",
                        "message": f"Forte similarité textuelle ({score_pct}%) détectée entre {documents[i].get('title')} et {documents[j].get('title')}",
                        "pair": pair_info
                    })

        return {
            "pairs": pairs,
            "matrix": sim_matrix.round(4).tolist(),
            "high_similarity_alerts": alerts,
            "count": len(alerts)
        }

    except Exception as e:
        return {
            "error": str(e),
            "pairs": [],
            "matrix": [],
            "high_similarity_alerts": []
        }
