from __future__ import annotations
import os
from uuid import uuid4
import numpy as np
from sklearn.decomposition import PCA
from scipy import stats
from .base import BaseHandler
from preprocessing.pipeline import SpectralPipeline


class SIMCAHandler(BaseHandler):

    _DEFAULTS = {"n_components": 3, "alpha": 0.05}

    def validate_hyperparameters(self, params: dict) -> dict:
        merged = {**self._DEFAULTS, **params}
        n = int(merged["n_components"])
        if not (1 <= n <= 20):
            raise ValueError("n_components deve estar entre 1 e 20.")
        merged["n_components"] = n
        alpha = float(merged["alpha"])
        if not (0.01 <= alpha <= 0.20):
            raise ValueError("alpha deve estar entre 0.01 e 0.20.")
        merged["alpha"] = alpha
        return merged

    def train(self, X, y, params, preprocessing=None):
        if y is None:
            raise ValueError("SIMCA requer rótulos de classe.")

        hp     = self.validate_hyperparameters(params.get("hyperparameters", params))
        n_comp = hp["n_components"]
        alpha  = hp["alpha"]

        pipe   = SpectralPipeline.from_config(preprocessing)
        X_proc = pipe.fit_transform(X)
        y_arr  = np.array(y)
        classes = sorted(set(y))

        # ── Um modelo PCA por classe ───────────────────────────────────────
        class_models = {}
        for cls in classes:
            Xc    = X_proc[y_arr == cls]
            n_safe = min(n_comp, Xc.shape[0] - 1, Xc.shape[1])
            pca   = PCA(n_components=n_safe)
            pca.fit(Xc)

            T     = pca.transform(Xc)
            n, p  = Xc.shape
            q     = n_safe

            # Limiar T² de Hotelling
            f_crit  = stats.f.ppf(1 - alpha, q, n - q)
            t2_lim  = (q * (n - 1) * (n + 1)) / (n * (n - q)) * f_crit

            # Limiar Q (resíduo)
            X_rec   = pca.inverse_transform(T)
            Q_vals  = np.sum((Xc - X_rec) ** 2, axis=1)
            q_lim   = float(np.quantile(Q_vals, 1 - alpha))

            class_models[cls] = {
                "pca":    pca,
                "t2_lim": float(t2_lim),
                "q_lim":  q_lim,
                "n_train": int(len(Xc)),
            }

        # ── Métricas de calibração ─────────────────────────────────────────
        correct = 0
        for i, xi in enumerate(X_proc):
            xi     = xi.reshape(1, -1)
            true_c = y_arr[i]
            accepted_by = []
            for cls, cm in class_models.items():
                T_i   = cm["pca"].transform(xi)
                Xr_i  = cm["pca"].inverse_transform(T_i)
                t2    = float(T_i @ np.linalg.pinv(np.cov(
                    cm["pca"].transform(X_proc[y_arr == cls]), rowvar=False,
                )) @ T_i.T)
                q_val = float(np.sum((xi - Xr_i) ** 2))
                if t2 <= cm["t2_lim"] and q_val <= cm["q_lim"]:
                    accepted_by.append(cls)
            if true_c in accepted_by:
                correct += 1

        accuracy = round(correct / len(y_arr), 4)

        # ── Serialização ───────────────────────────────────────────────────
        models_dir = os.environ.get("MODELS_DIR", "/app/storage/models")
        os.makedirs(models_dir, exist_ok=True)
        model_path = os.path.join(models_dir, f"simca_{uuid4().hex}.joblib")

        size_kb = self._serialize(
            {"pipeline": pipe, "class_models": class_models, "classes": classes},
            model_path,
        )

        return {
            "model_path":    model_path,
            "model_size_kb": size_kb,
            "train_samples": len(y_arr),
            "test_samples":  0,
            "metrics_cal":   {"accuracy": accuracy, "classes": classes,
                              "alpha": alpha, "n_components": n_comp},
            "metrics_cv":    {"cv_folds": 0, "note": "Limiares calculados por F/chi² no treino."},
            "metrics_ext":   None,
        }

    def predict(self, model_path, X, sample_names=None):
        obj          = self._load(model_path)
        pipe         = obj["pipeline"]
        class_models = obj["class_models"]

        X_proc = pipe.transform(X)
        predictions = []

        for i, xi in enumerate(X_proc):
            xi = xi.reshape(1, -1)
            accepted_by = []
            for cls, cm in class_models.items():
                T_i  = cm["pca"].transform(xi)
                Xr_i = cm["pca"].inverse_transform(T_i)
                q_val = float(np.sum((xi - Xr_i) ** 2))
                if q_val <= cm["q_lim"]:
                    accepted_by.append(cls)

            predicted = accepted_by[0] if len(accepted_by) == 1 else (
                "ambiguous" if len(accepted_by) > 1 else "rejected"
            )
            predictions.append({
                "position":    i,
                "sample_name": sample_names[i] if sample_names else None,
                "predicted":   predicted,
                "score":       None,
            })

        return {"predictions": predictions, "sample_count": len(predictions)}