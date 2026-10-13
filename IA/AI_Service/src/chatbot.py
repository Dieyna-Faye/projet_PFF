"""Grounded assistance that does not invent platform-specific records."""

import os
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

def ask_chatbot(question: str, tender_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    q = question.strip()
    if not q:
        return {"answer": "Veuillez saisir une question.", "engine": "Rules-Fallback"}

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            prompt = (
                "Réponds en français comme assistant général de marchés publics. "
                "N'invente jamais une règle, une pièce obligatoire, un statut, un score ou une donnée de la plateforme. "
                "Tu n'as pas accès à la base de données. Pour une exigence propre à un appel d'offres, demande à l'utilisateur "
                "de consulter son dossier ou l'API autorisée. Précise les limites en cas d'incertitude.\n"
                f"Question : {q}"
            )
            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            if response and response.text:
                return {"answer": response.text.strip(), "engine": "Gemini-LLM", "grounded": False}
            logger.warning("Gemini n'a renvoyé aucune réponse; utilisation du mode de secours.")
        except Exception as error:
            logger.warning("Échec Gemini (%s); utilisation du mode de secours.", type(error).__name__)

    q_lower = q.lower()
    if any(word in q_lower for word in ("score", "scoring", "notation", "barème", "bareme")):
        answer = ("Le calcul configuré dans cette plateforme pondère l'administratif à 20 %, le technique à 30 %, "
                  "le financier à 25 %, l'expérience à 15 % et le délai à 10 %. Les notes détaillées doivent être consultées "
                  "dans le résultat enregistré pour l'offre; ce score aide la décision et ne remplace pas la commission.")
    elif any(word in q_lower for word in ("statut", "soumission", "mon offre", "résultat", "resultat")):
        answer = ("Je n'ai pas accès aux dossiers ni aux statuts de la base. Consultez la page de votre soumission après connexion; "
                  "l'accès aux offres d'autres fournisseurs est restreint.")
    elif any(word in q_lower for word in ("pièce", "piece", "document", "fournir", "quitus", "registre")):
        answer = ("Les pièces à fournir dépendent du règlement de consultation de l'appel d'offres. Consultez son cahier des charges; "
                  "la présence d'un fichier ne confirme ni sa validité, ni sa signature, ni son authenticité.")
    elif any(word in q_lower for word in ("fraude", "alerte", "risque", "collusion")):
        answer = ("Une alerte automatique est un signal à examiner. Une adresse partagée, une proximité de prix ou une similarité "
                  "documentaire ne constitue pas une preuve de fraude ou de collusion.")
    else:
        answer = ("Je peux expliquer les étapes générales de soumission, les critères de scoring configurés et la portée des alertes. "
                  "Je ne peux pas consulter les données privées de la plateforme ni confirmer une exigence d'appel d'offres sans son dossier.")
    return {
        "answer": answer,
        "engine": "Rules-Fallback",
        "grounded": True,
        "reason": "gemini_not_configured" if not gemini_key else "gemini_unavailable",
    }
