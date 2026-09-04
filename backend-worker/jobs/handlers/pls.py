from __future__ import annotations
import os
from uuid import uuid4
import numpy as np
from sklearn.cross_decomposition import PLSRegression
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.metrics import r2_score, mean_squared_error
from .base import BaseHandler
from preprocessing.pipeline import SpectralPipeline


class PLSHandler(BaseHandler):

    _DEFAULTS = {"n_components": 3, "scale": False}

    def validate_hyperparameters(self, params: dict) -> dict:
        merged = {**self._DEFAULTS, **params}
        n = int(merged["n_components"])
        if not (1 <= n <= 20):
            raise ValueError("n_components deve estar entre 1 e 20.")
        merged["n_components"] = n
        merged["scale"] = bool(merged.get("scale", False))
        return merged

    def train(self, X, y, params, preprocessing=None):
        if y is None:
            raise ValueError("PLS requer valores contínuos em y.")

        hp     = self.validate_hyperparameters(params.get("hyperparameters", params))
        n_comp = hp["n_components"]
        cv_folds = int(params.get("cv_folds", 5))

        pipe   = SpectralPipeline.from_config(preprocessing)
        X_proc = pipe.fit_transform(X)
        y_arr  = np.array(y, dtype=float)

        model  = PLSRegression(n_components=n_comp, scale=hp["scale"])
        model.fit(X_proc, y_arr)

        # ── Calibração ────────────────────────────────────────────────────
        y_cal_pred  = model.predict(X_proc).ravel()
        r2_cal      = float(r2_score(y_arr, y_cal_pred))
        rmsec       = float(np.sqrt(mean_squared_error(y_arr, y_cal_pred)))
        bias_cal    = float(np.mean(y_cal_pred - y_arr))

        # ── Validação cruzada ─────────────────────────────────────────────
        metrics_cv: dict = {}
        n_splits = min(cv_folds, len(y_arr))
        if n_splits >= 2:
            cv       = KFold(n_splits=n_splits, shuffle=True, random_state=42)
            y_cv     = cross_val_predict(
                PLSRegression(n_components=n_comp, scale=hp["scale"]),
                X_proc, y_arr, cv=cv,
            ).ravel()
            r2_cv    = float(r2_score(y_arr, y_cv))
            rmsecv   = float(np.sqrt(mean_squared_error(y_arr, y_cv)))
            metrics_cv = {
                "cv_folds": n_splits,
                "r2_cv":    round(r2_cv,  4),
                "rmsecv":   round(rmsecv, 6),
            }

        # ── Serialização ──────────────────────────────────────────────────
        models_dir = os.environ.get("MODELS_DIR", "/app/storage/models")
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, f"pls_{uuid4().hex}.joblib")

        size_kb = self._serialize(
            {"pipeline": pipe, "model": model},
            model_path,
        )

        return {
            "model_path":    model_path,
            "model_size_kb": size_kb,
            "train_samples": len(y_arr),
            "test_samples":  0,
            "metrics_cal": {
                "r2":    round(r2_cal, 4),
                "rmsec": round(rmsec,  6),
                "bias":  round(bias_cal, 6),
                "n_components": n_comp,
            },
            "metrics_cv":  metrics_cv,
            "metrics_ext": None,
        }

    def predict(self, model_path, X, sample_names=None):
        obj    = self._load(model_path)
        X_proc = obj["pipeline"].transform(X)
        preds  = obj["model"].predict(X_proc).ravel()

        predictions = [
            {
                "position":    i,
                "sample_name": sample_names[i] if sample_names else None,
                "predicted":   round(float(preds[i]), 6),
                "score":       None,
            }
            for i in range(len(preds))
        ]
        return {"predictions": predictions, "sample_count": len(predictions)}