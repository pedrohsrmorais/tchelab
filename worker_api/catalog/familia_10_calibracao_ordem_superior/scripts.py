"""Calibração de Ordem Superior — Família 10"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript
from catalog.familia_04_regressao_1d.scripts import _metrics_cal


class SegundaOrdem(BaseScript):
    slug = "segunda_ordem"
    nome = "Calibração de 2ª Ordem (Bilinear)"
    familia = "10_calibracao_ordem_superior"
    descricao = "Calibração bilinear via PARAFAC + regressão (2ª ordem, tensores 3-way)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 3:
            raise ValueError("X deve ser tensor 3D (n_samples, n_excitation, n_emission).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 300)

        tl.set_backend("numpy")
        weights, factors = parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42, normalize_factors=True)

        A = factors[0]  # (n_samples, rank) — sample scores
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        X_rec = tl.kruskal_to_tensor((weights, factors))
        fit = 1.0 - float(np.linalg.norm(X - X_rec) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {"type": "segunda_ordem", "rank": rank},
            "sample_scores": A.tolist(),
            "excitation_profiles": factors[1].tolist(),
            "emission_profiles": factors[2].tolist(),
            "weights": weights.tolist(),
            "fit": fit,
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class TerceiraOrdem(BaseScript):
    slug = "terceira_ordem"
    nome = "Calibração de 3ª Ordem (Trilinear)"
    familia = "10_calibracao_ordem_superior"
    descricao = "Calibração trilinear via PARAFAC sobre tensor 4-way."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 4:
            raise ValueError("X deve ser tensor 4D (n_samples, J, K, L).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 300)

        tl.set_backend("numpy")
        weights, factors = parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42, normalize_factors=True)

        A = factors[0]  # sample scores
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        X_rec = tl.kruskal_to_tensor((weights, factors))
        fit = 1.0 - float(np.linalg.norm(X - X_rec) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {"type": "terceira_ordem", "rank": rank},
            "sample_scores": A.tolist(),
            "mode_profiles": [f.tolist() for f in factors[1:]],
            "weights": weights.tolist(),
            "fit": fit,
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class QuartaOrdem(BaseScript):
    slug = "quarta_ordem"
    nome = "Calibração de 4ª Ordem"
    familia = "10_calibracao_ordem_superior"
    descricao = "Calibração de 4ª ordem via PARAFAC sobre tensor 5-way."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 5:
            raise ValueError("X deve ser tensor 5D (n_samples, J, K, L, M).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 300)

        tl.set_backend("numpy")
        weights, factors = parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42, normalize_factors=True)

        A = factors[0]
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        X_rec = tl.kruskal_to_tensor((weights, factors))
        fit = 1.0 - float(np.linalg.norm(X - X_rec) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {"type": "quarta_ordem", "rank": rank},
            "sample_scores": A.tolist(),
            "mode_profiles": [f.tolist() for f in factors[1:]],
            "weights": weights.tolist(),
            "fit": fit,
            "metrics_cal": _metrics_cal(y, y_pred),
        }


class OrdemSuperiorGenerica(BaseScript):
    slug = "ordem_superior_generica"
    nome = "Calibração de Ordem Superior Genérica"
    familia = "10_calibracao_ordem_superior"
    descricao = "Calibração por PARAFAC genérico para tensor de qualquer ordem >= 3."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac
        from sklearn.linear_model import LinearRegression

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 300)
        non_negative = params.get("non_negative", False)

        tl.set_backend("numpy")

        if non_negative:
            from tensorly.decomposition import non_negative_parafac
            weights, factors = non_negative_parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42)
        else:
            weights, factors = parafac(X, rank=rank, n_iter_max=n_iter_max, random_state=42, normalize_factors=True)

        A = factors[0]  # sample scores
        reg = LinearRegression()
        reg.fit(A, y)
        y_pred = reg.predict(A)

        X_rec = tl.kruskal_to_tensor((weights, factors))
        fit = 1.0 - float(np.linalg.norm(X - X_rec) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {
                "type": "ordem_superior_generica",
                "order": X.ndim,
                "rank": rank,
                "shape": list(X.shape),
            },
            "sample_scores": A.tolist(),
            "mode_profiles": [f.tolist() for f in factors[1:]],
            "weights": weights.tolist(),
            "fit": fit,
            "metrics_cal": _metrics_cal(y, y_pred),
        }
