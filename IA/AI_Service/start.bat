@echo off
echo ============================================================
echo Demarrage du Service IA Python (FastAPI / Scikit-learn / OCR)
echo ============================================================

REM Verification de l'environnement virtuel
if not exist "venv" (
    echo Creation de l'environnement virtuel venv...
    python -m venv venv
)

call venv\Scripts\activate

echo Installation des dependances...
pip install -r requirements.txt

echo.
echo Lancement du serveur FastAPI sur http://localhost:5000...
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
pause
