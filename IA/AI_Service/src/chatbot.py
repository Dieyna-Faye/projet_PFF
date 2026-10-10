"""
Module Chatbot d'Assistance aux Fournisseurs (Section 6)
Assistant conversationnel guidant les candidats sur les exigences et pièces d'un appel d'offres.
"""

import os
from typing import Dict, Any, Optional

STANDARD_INTENTS = {
    "pieces_obligatoires": {
        "keywords": ["piece", "document", "dossier", "fournir", "quitus", "registre", "papiers"],
        "answer": (
            "Pour que votre dossier soit recevable, vous devez fournir 7 pièces obligatoires :\n"
            "1. Registre de Commerce (RCCM)\n"
            "2. Quitus fiscal en cours de validité\n"
            "3. Attestation sociale (CSS / IPRES)\n"
            "4. Références techniques (marchés similaires passés)\n"
            "5. Mémoire technique méthodologique\n"
            "6. Planning d'exécution des prestations\n"
            "7. Offre financière signée avec bordereau des prix."
        )
    },
    "scoring_bareme": {
        "keywords": ["score", "bareme", "note", "notation", "critere", "pourcentage", "evaluation"],
        "answer": (
            "Le barème d'évaluation officiel de la plateforme est pondéré comme suit :\n"
            "— Conformité administrative : 20%\n"
            "— Qualité de l'offre technique : 30%\n"
            "— Offre financière (prix) : 25%\n"
            "— Expérience de votre entreprise : 15%\n"
            "— Délai d'exécution proposé : 10%\n"
            "Total = 100%. Un score >= 70/100 avec conformité administrative donne un avis 'Recommandé'."
        )
    },
    "depot_soumission": {
        "keywords": ["depot", "soumettre", "comment", "soumission", "etape", "candidater", "accuse"],
        "answer": (
            "Étapes pour soumettre votre offre en ligne :\n"
            "1. Accédez à l'appel d'offres et téléchargez le cahier des charges.\n"
            "2. Remplissez votre proposition technique, montant financier et délai.\n"
            "3. Téléversez chacun des documents PDF requis.\n"
            "4. Cliquez sur 'Déposer définitivement' pour générer votre accusé de réception numérique avec empreinte SHA-256."
        )
    },
    "delai_retard": {
        "keywords": ["delai", "date limite", "retard", "cloture", "calendrier"],
        "answer": (
            "Attention : Aucune offre ne peut être déposée après l'heure exacte de la date limite de soumission. "
            "Le système horodate numériquement chaque dépôt."
        )
    }
}

def ask_chatbot(question: str, tender_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Répond à une question du soumissionnaire, avec prise en compte du contexte de l'appel d'offres.
    """
    q_lower = question.lower().strip()

    # Tentative d'utilisation de Gemini si configuré
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            prompt = (
                "Tu es l'assistant IA officiel de la plateforme des Marchés Publics. "
                "Tu aides les fournisseurs à soumissionner avec succès.\n"
            )
            if tender_context:
                prompt += f"Contexte de l'appel d'offres actuel : {tender_context}\n"
            prompt += f"Question du candidat : {question}\nRéponds de manière concise, précise et professionnelle en français."
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            if response and response.text:
                return {"answer": response.text.strip(), "engine": "Gemini-LLM"}
        except Exception:
            pass

    # Moteur de règles / intentions sémantiques contextuel
    for intent_key, intent_data in STANDARD_INTENTS.items():
        if any(kw in q_lower for kw in intent_data["keywords"]):
            ans = intent_data["answer"]
            if tender_context and "titre" in str(tender_context).lower():
                ans += f"\n\n(Contexte Appel d'offres : {tender_context.get('title', '')} - Budget estimatif : {tender_context.get('estimatedBudget', '')} {tender_context.get('currency', 'XOF')})"
            return {"answer": ans, "engine": "Intent-Classifier", "intent": intent_key}

    # Réponse générale
    default_ans = (
        "Bonjour, je suis l'assistant IA de la plateforme des Marchés Publics. "
        "Je peux vous renseigner sur les 7 pièces obligatoires à fournir, le barème de scoring "
        "(20% admin, 30% technique, 25% financier, 15% expérience, 10% délai), "
        "ou la démarche de dépôt d'offre numérique."
    )
    return {"answer": default_ans, "engine": "Default-Fallback"}
