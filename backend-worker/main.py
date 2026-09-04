# main.py

from fastapi import FastAPI
from jobs.factory import available_algorithms

app = FastAPI(title="TcheLab Worker", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok", "algorithms": available_algorithms()}

# Futuramente:
# @app.post("/predict") → carrega modelo salvo e retorna predição