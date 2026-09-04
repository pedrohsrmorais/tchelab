# backend-worker/jobs/handlers/plsoc.py
from __future__ import annotations

import os
from uuid import uuid4

import numpy as np
from sklearn.cross_decomposition import PLSRegression

from .base import BaseHandler
from preprocessing.pipeline import SpectralPipeline


class PLSOCHandler(BaseHandler):

    _DEFAULTS = {
        "n_components": 3,
        "threshold":    0.05,
    }

    def validate_hyperparameters(self, params: dict) -> dict:
        merged = {**self._DEFAULTS, **params}

        n = int(merged["n_components"])
        if not (1 <= n <= 20):
            raise ValueError("n_components deve estar entre 1 e 20.")
        merged["n_components"] = n

        alpha = float(merged["threshold"])
        if not (0.01 <= alpha <= 0.20):
            raise ValueError("threshold deve estar entre 0.01 e 0.20.")
        merged["threshold"] = alpha

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
            raise ValueError("PLS-OC requer rótulos de classe (y não pode ser None).")

        hp       = params.get("hyperparameters", params)
        hp       = self.validate_hyperparameters(hp)
        n_comp   = hp["n_components"]
        alpha    = hp["threshold"]

        # ── Pré-processamento ──────────────────────────────────────────────
        pipe   = SpectralPipeline.from_config(preprocessing)
        X_proc = pipe.fit_transform(X)

        # ── Seleciona classe alvo (primeira em ordem alfabética) ───────────
        classes = sorted(set(y))
        target  = classes[0]
        mask    = np.array(y) == target
        X_target = X_proc[mask]

        if len(X_target) < 2:
            raise ValueError(f"Classe '{target}' tem menos de 2 amostras.")

        n_comp_safe = min(n_comp, X_target.shape[0] - 1, X_target.shape[1])

        # ── Treina PLS1 contra vetor dummy de 1s ──────────────────────────
        y_dummy = np.ones(len(X_target))
        pls     = PLSRegression(n_components=n_comp_safe)
        pls.fit(X_target, y_dummy)

        # ── Distâncias no espaço latente e limiar ──────────────────────────
        T          = pls.transform(X_target)
        centroid   = T.mean(axis=0)
        dists      = np.linalg.norm(T - centroid, axis=1)
        threshold  = float(np.quantile(dists, 1 - alpha))

        # ── Métricas de calibração ─────────────────────────────────────────
        # Avalia sobre TODAS as amostras: target=aceito, outros=rejeitado
        T_all      = pls.transform(X_proc)
        dists_all  = np.linalg.norm(T_all - centroid, axis=1)
        accepted   = dists_all <= threshold
        y_arr      = np.array(y)

        tp = int(np.sum(accepted  &  mask))
        fp = int(np.sum(accepted  & ~mask))
        tn = int(np.sum(~accepted & ~mask))
        fn = int(np.sum(~accepted &  mask))

        sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        accuracy    = (tp + tn) / len(y) if len(y) > 0 else 0.0

        metrics_cal = {
            "accuracy":    round(accuracy,    4),
            "sensitivity": round(sensitivity, 4),
            "specificity": round(specificity, 4),
            "threshold":   round(threshold,   6),
            "target_class": target,
            "classes":      classes,
            "confusion_matrix": [[tp, fn], [fp, tn]],
        }

        # ── Serialização ───────────────────────────────────────────────────
        models_dir = os.environ.get("MODELS_DIR", "/app/storage/models")
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, f"plsoc_{uuid4().hex}.joblib")

        size_kb = self._serialize(
            {
                "pipeline":     pipe,
                "pls":          pls,
                "centroid":     centroid,
                "threshold":    threshold,
                "target_class": target,
                "classes":      classes,
            },
            model_path,
        )

        return {
            "model_path":    model_path,
            "model_size_kb": size_kb,
            "train_samples": int(mask.sum()),
            "test_samples":  0,
            "metrics_cal":   metrics_cal,
            "metrics_cv":    {"cv_folds": 0, "note": "CV não aplicável para one-class."},
            "metrics_ext":   None,
        }

    # ── Predição ───────────────────────────────────────────────────────────

    def predict(
        self,
        model_path: str,
        X: np.ndarray,
        sample_names: list[str] | None = None,
    ) -> dict:
        obj        = self._load(model_path)
        pipeline   = obj["pipeline"]
        pls        = obj["pls"]
        centroid   = obj["centroid"]
        threshold  = obj["threshold"]
        target     = obj["target_class"]

        X_proc = pipeline.transform(X)
        T      = pls.transform(X_proc)
        dists  = np.linalg.norm(T - centroid, axis=1)

        predictions = [
            {
                "position":    i,
                "sample_name": sample_names[i] if sample_names else None,
                "predicted":   target if dists[i] <= threshold else "rejected",
                "score":       round(float(dists[i]), 6),
            }
            for i in range(len(dists))
        ]

        return {
            "predictions":  predictions,
            "sample_count": len(predictions),
        }