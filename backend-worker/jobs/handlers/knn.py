"""
handlers/knn.py
───────────────
Handler KNN para classificação espectral.

O modelo serializado em disco tem a estrutura:
    {
        "pipeline": SpectralPipeline,
        "model":    KNeighborsClassifier,
        "classes":  list[str],          # ordem das classes
    }
"""

from __future__ import annotations

import os
from uuid import uuid4

import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    confusion_matrix,
)

from .base import BaseHandler
from preprocessing.pipeline import SpectralPipeline


class KNNHandler(BaseHandler):

    # ── Hiperparâmetros ────────────────────────────────────────────────────

    _DEFAULTS = {
        "n_neighbors": 5,
        "metric":      "euclidean",
        "weights":     "uniform",
    }

    _VALID_METRICS  = {"euclidean", "mahalanobis", "cosine", "cityblock"}
    _VALID_WEIGHTS  = {"uniform", "distance"}

    def validate_hyperparameters(self, params: dict) -> dict:
        merged = {**self._DEFAULTS, **params}

        k = int(merged["n_neighbors"])
        if not (1 <= k <= 50):
            raise ValueError("n_neighbors deve estar entre 1 e 50.")
        merged["n_neighbors"] = k

        if merged["metric"] not in self._VALID_METRICS:
            raise ValueError(
                f"metric inválido. Opções: {sorted(self._VALID_METRICS)}"
            )
        if merged["weights"] not in self._VALID_WEIGHTS:
            raise ValueError(
                f"weights inválido. Opções: {sorted(self._VALID_WEIGHTS)}"
            )

        return merged

    # ── Treino ─────────────────────────────────────────────────────────────

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray | None,
        params: dict,
        preprocessing: list[dict] | None = None,
    ) -> dict:
        if y is None:
            raise ValueError("KNN requer rótulos de classe (y não pode ser None).")

        params = self.validate_hyperparameters(params)

        # ── Pré-processamento ──────────────────────────────────────────────
        pipe   = SpectralPipeline.from_config(preprocessing)
        X_proc = pipe.fit_transform(X)

        # ── Modelo ────────────────────────────────────────────────────────
        # Mahalanobis exige metric_params com VI (inversa da covariância).
        # Calculamos aqui a partir de X_proc para que a distância seja
        # consistente entre treino e predição (o objeto sklearn guarda VI).
        metric_params = None
        if params["metric"] == "mahalanobis":
            cov = np.cov(X_proc, rowvar=False)
            try:
                VI = np.linalg.inv(cov)
            except np.linalg.LinAlgError:
                VI = np.linalg.pinv(cov)   # fallback: pseudo-inversa
            metric_params = {"VI": VI}

        model = KNeighborsClassifier(
            n_neighbors   = params["n_neighbors"],
            metric        = params["metric"],
            weights       = params["weights"],
            metric_params = metric_params,
            n_jobs        = -1,
        )

        # ── Métricas de calibração ─────────────────────────────────────────
        model.fit(X_proc, y)
        y_cal_pred   = model.predict(X_proc)
        classes      = list(model.classes_)
        metrics_cal  = _classification_metrics(y, y_cal_pred, classes)

        # ── Validação cruzada (stratified k-fold) ─────────────────────────
        n_splits = min(5, _min_class_count(y))
        metrics_cv: dict = {}

        if n_splits >= 2:
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            cv_result = cross_validate(
                KNeighborsClassifier(
                    n_neighbors   = params["n_neighbors"],
                    metric        = params["metric"],
                    weights       = params["weights"],
                    metric_params = metric_params,
                    n_jobs        = -1,
                ),
                X_proc, y,
                cv      = cv,
                scoring = ["accuracy", "f1_weighted"],
                return_train_score = False,
            )
            metrics_cv = {
                "cv_folds":        n_splits,
                "accuracy_mean":   round(float(cv_result["test_accuracy"].mean()),    4),
                "accuracy_std":    round(float(cv_result["test_accuracy"].std()),     4),
                "f1_weighted_mean": round(float(cv_result["test_f1_weighted"].mean()), 4),
                "f1_weighted_std":  round(float(cv_result["test_f1_weighted"].std()),  4),
            }
        else:
            metrics_cv = {"cv_folds": 0, "note": "Amostras insuficientes para CV."}

        # ── Serialização ───────────────────────────────────────────────────
        models_dir = os.environ.get("MODELS_DIR", "/app/storage/models")
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, f"knn_{uuid4().hex}.joblib")

        size_kb = self._serialize(
            {"pipeline": pipe, "model": model, "classes": classes},
            model_path,
        )

        return {
            "model_path":    model_path,
            "model_size_kb": size_kb,
            "train_samples": len(y),
            "test_samples":  0,           # sem split externo — usa CV
            "metrics_cal":   metrics_cal,
            "metrics_cv":    metrics_cv,
            "metrics_ext":   None,
        }

    # ── Predição ───────────────────────────────────────────────────────────

    def predict(
        self,
        model_path: str,
        X: np.ndarray,
        sample_names: list[str] | None = None,
    ) -> dict:
        obj      = self._load(model_path)
        pipeline = obj["pipeline"]
        model    = obj["model"]

        X_proc = pipeline.transform(X)
        preds  = model.predict(X_proc)

        # Probabilidades se disponíveis (sempre True para KNN)
        try:
            proba  = model.predict_proba(X_proc)   # (n_samples, n_classes)
            scores = proba.max(axis=1).tolist()
        except Exception:
            scores = [None] * len(preds)

        predictions = [
            {
                "position":    i,
                "sample_name": sample_names[i] if sample_names else None,
                "predicted":   str(preds[i]),
                "score":       round(scores[i], 4) if scores[i] is not None else None,
            }
            for i in range(len(preds))
        ]

        return {
            "predictions":  predictions,
            "sample_count": len(predictions),
        }


# ── Funções auxiliares (módulo-privadas) ──────────────────────────────────────

def _classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    classes: list,
) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=classes)
    return {
        "accuracy":        round(float(accuracy_score(y_true, y_pred)), 4),
        "f1_weighted":     round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "f1_macro":        round(float(f1_score(y_true, y_pred, average="macro",    zero_division=0)), 4),
        "confusion_matrix": cm.tolist(),
        "classes":          classes,
    }


def _min_class_count(y: np.ndarray) -> int:
    """Retorna o menor número de amostras entre todas as classes."""
    _, counts = np.unique(y, return_counts=True)
    return int(counts.min())