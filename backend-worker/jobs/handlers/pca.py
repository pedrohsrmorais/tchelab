from __future__ import annotations
import os
from uuid import uuid4
import numpy as np
from sklearn.decomposition import PCA
from .base import BaseHandler
from preprocessing.pipeline import SpectralPipeline


class PCAHandler(BaseHandler):

    _DEFAULTS = {"n_components": 3}

    def validate_hyperparameters(self, params: dict) -> dict:
        merged = {**self._DEFAULTS, **params}
        n = int(merged["n_components"])
        if not (1 <= n <= 20):
            raise ValueError("n_components deve estar entre 1 e 20.")
        merged["n_components"] = n
        return merged

    def train(self, X, y, params, preprocessing=None):
        hp     = self.validate_hyperparameters(params.get("hyperparameters", params))
        n_comp = hp["n_components"]

        pipe   = SpectralPipeline.from_config(preprocessing)
        X_proc = pipe.fit_transform(X)

        n_safe = min(n_comp, X_proc.shape[0], X_proc.shape[1])
        model  = PCA(n_components=n_safe)
        model.fit(X_proc)

        scores    = model.transform(X_proc)
        loadings  = model.components_
        exp_var   = model.explained_variance_ratio_

        # ── Serialização ──────────────────────────────────────────────────
        models_dir = os.environ.get("MODELS_DIR", "/app/storage/models")
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, f"pca_{uuid4().hex}.joblib")

        size_kb = self._serialize(
            {"pipeline": pipe, "model": model},
            model_path,
        )

        return {
            "model_path":    model_path,
            "model_size_kb": size_kb,
            "train_samples": X_proc.shape[0],
            "test_samples":  0,
            "metrics_cal": {
                "explained_variance":       [round(float(v), 4) for v in exp_var],
                "cumulative_variance":      [round(float(v), 4) for v in np.cumsum(exp_var)],
                "n_components":             n_safe,
                "scores":   scores.tolist(),    # frontend usa para plot
                "loadings": loadings.tolist(),  # frontend usa para plot
                "classes":  list(y) if y is not None else [],
            },
            "metrics_cv":  None,
            "metrics_ext": None,
        }

    def predict(self, model_path, X, sample_names=None):
        obj    = self._load(model_path)
        X_proc = obj["pipeline"].transform(X)
        scores = obj["model"].transform(X_proc)

        predictions = [
            {
                "position":    i,
                "sample_name": sample_names[i] if sample_names else None,
                "predicted":   scores[i].tolist(),  # coordenadas nos PCs
                "score":       None,
            }
            for i in range(len(scores))
        ]
        return {"predictions": predictions, "sample_count": len(predictions)}