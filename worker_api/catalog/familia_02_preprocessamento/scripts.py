"""Pré-processamento Espectral — Família 02"""
from __future__ import annotations
from typing import Any
import numpy as np
from catalog.base import BaseScript


class SNV(BaseScript):
    slug = "snv"
    nome = "SNV — Standard Normal Variate"
    familia = "02_preprocessamento"
    descricao = "Centraliza e escala cada amostra individualmente (SNV)."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser uma matriz (ndim ≥ 2).")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        spectral_axis = params.get("spectral_axis", 1)
        mean = np.mean(X, axis=spectral_axis, keepdims=True)
        std = np.std(X, axis=spectral_axis, keepdims=True, ddof=1)
        std = np.where(std == 0, 1.0, std)
        X_snv = (X - mean) / std
        return {"X_snv": X_snv}


class MSC(BaseScript):
    slug = "msc"
    nome = "MSC — Multiplicative Scatter Correction"
    familia = "02_preprocessamento"
    descricao = "Corrige efeitos de espalhamento multiplicativo."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        reference = params.get("reference", "mean")
        if reference == "mean":
            ref = np.mean(X, axis=0)
        else:
            ref = np.asarray(reference, dtype=float)

        X_msc = np.zeros_like(X)
        for i in range(X.shape[0]):
            # Fit linear: x_i = a + b * ref
            coeffs = np.polyfit(ref, X[i], 1)
            X_msc[i] = (X[i] - coeffs[1]) / coeffs[0]

        return {"X_msc": X_msc, "reference_used": ref}


class Detrend(BaseScript):
    slug = "detrend"
    nome = "Detrend"
    familia = "02_preprocessamento"
    descricao = "Remove tendência linear ou polinomial de cada amostra."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        degree = params.get("degree", 1)
        spectral_axis = params.get("spectral_axis", 1)

        n_vars = X.shape[spectral_axis]
        xp = np.arange(n_vars)
        X_dt = X.copy()

        for i in range(X.shape[0]):
            row = np.take(X, i, axis=0) if spectral_axis == 1 else X[i]
            coeffs = np.polyfit(xp, row, degree)
            trend = np.polyval(coeffs, xp)
            if spectral_axis == 1:
                X_dt[i] = row - trend
            else:
                X_dt[:, i] = X_dt[:, i] - trend

        return {"X_dt": X_dt}


class Baseline(BaseScript):
    slug = "baseline"
    nome = "Correção de Linha de Base"
    familia = "02_preprocessamento"
    descricao = "Corrige linha de base por método linear, polinomial, rubberband ou ALS."

    _METHODS = {"linear", "polynomial", "rubberband", "als"}

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        method = params.get("method", "linear")
        if method not in self._METHODS:
            raise ValueError(f"method '{method}' inválido. Use: {self._METHODS}")
        if X.ndim < 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "linear")
        degree = params.get("degree", 2)
        lambda_ = params.get("lambda_", 1e4)
        spectral_axis = params.get("spectral_axis", 1)

        X_bl = X.copy()
        n_vars = X.shape[spectral_axis]
        xp = np.arange(n_vars, dtype=float)

        for i in range(X.shape[0]):
            row = X[i] if spectral_axis == 1 else X[:, i]

            if method == "linear":
                bl = np.linspace(row[0], row[-1], n_vars)
                row_corr = row - bl
            elif method == "polynomial":
                coeffs = np.polyfit([0, n_vars - 1], [row[0], row[-1]], 1)
                bl = np.polyval(coeffs, xp)
                row_corr = row - bl
            elif method == "rubberband":
                from scipy.spatial import ConvexHull
                pts = np.column_stack([xp, row])
                hull = ConvexHull(pts)
                # Lower convex hull
                lower_idx = sorted(set(hull.simplices.ravel()))
                lower_pts = pts[lower_idx]
                lower_pts = lower_pts[np.argsort(lower_pts[:, 0])]
                bl = np.interp(xp, lower_pts[:, 0], lower_pts[:, 1])
                row_corr = row - bl
            elif method == "als":
                from scipy import sparse
                from scipy.sparse.linalg import spsolve
                n = len(row)
                D = sparse.diags([1, -2, 1], [0, 1, 2], shape=(n - 2, n))
                H = lambda_ * D.T.dot(D)
                w = np.ones(n)
                for _ in range(10):
                    W = sparse.diags(w, 0)
                    bl = spsolve(W + H, w * row)
                    w = np.where(row > bl, 1e-5, 1.0)
                row_corr = row - bl
            else:
                row_corr = row

            if spectral_axis == 1:
                X_bl[i] = row_corr
            else:
                X_bl[:, i] = row_corr

        return {"X_bl": X_bl}


class SavitzkyGolay(BaseScript):
    slug = "savitzky_golay"
    nome = "Savitzky-Golay"
    familia = "02_preprocessamento"
    descricao = "Suavização e/ou derivação por filtro Savitzky-Golay."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser matriz 2D.")
        wl = params.get("window_length", 11)
        po = params.get("polyorder", 2)
        if wl <= po:
            raise ValueError(f"window_length={wl} deve ser > polyorder={po}.")
        if wl % 2 == 0:
            raise ValueError(f"window_length={wl} deve ser ímpar.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from scipy.signal import savgol_filter
        X = np.asarray(inputs["X"], dtype=float)
        window_length = params.get("window_length", 11)
        polyorder = params.get("polyorder", 2)
        deriv = params.get("deriv", 0)
        spectral_axis = params.get("spectral_axis", 1)

        X_sg = savgol_filter(X, window_length=window_length,
                             polyorder=polyorder, deriv=deriv, axis=spectral_axis)
        return {"X_sg": X_sg}


class Normalizacao(BaseScript):
    slug = "normalizacao"
    nome = "Normalização Espectral"
    familia = "02_preprocessamento"
    descricao = "Normalização por norma vetorial, área, máximo ou intervalo."

    _METHODS = {"l1", "l2", "max", "area", "range"}

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        self._require_key(inputs, "X")
        m = params.get("method", "l2")
        if m not in self._METHODS:
            raise ValueError(f"method '{m}' inválido. Use: {self._METHODS}")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "l2")
        spectral_axis = params.get("spectral_axis", 1)

        if method == "l1":
            norms = np.sum(np.abs(X), axis=spectral_axis, keepdims=True)
        elif method == "l2":
            norms = np.sqrt(np.sum(X ** 2, axis=spectral_axis, keepdims=True))
        elif method == "max":
            norms = np.max(np.abs(X), axis=spectral_axis, keepdims=True)
        elif method == "area":
            norms = np.trapz(np.abs(X), axis=spectral_axis).reshape(-1, 1) if spectral_axis == 1 else np.trapz(np.abs(X), axis=spectral_axis).reshape(1, -1)
        elif method == "range":
            norms = (np.max(X, axis=spectral_axis, keepdims=True)
                     - np.min(X, axis=spectral_axis, keepdims=True))

        norms = np.where(norms == 0, 1.0, norms)
        X_norm = X / norms
        return {"X_norm": X_norm}


class Centering(BaseScript):
    slug = "centering"
    nome = "Mean Centering"
    familia = "02_preprocessamento"
    descricao = "Subtrai a média de cada variável."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        axis = params.get("axis", 0)
        mean_ = np.mean(X, axis=axis)
        X_c = X - mean_
        return {"X_c": X_c, "mean_": mean_}


class Autoscaling(BaseScript):
    slug = "autoscaling"
    nome = "Autoscaling (Mean + StdDev)"
    familia = "02_preprocessamento"
    descricao = "Mean centering + divisão pelo desvio padrão."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        mean_ = np.mean(X, axis=0)
        std_ = np.std(X, axis=0, ddof=1)
        std_ = np.where(std_ == 0, 1.0, std_)
        X_as = (X - mean_) / std_
        return {"X_as": X_as, "mean_": mean_, "std_": std_}


class Pareto(BaseScript):
    slug = "pareto"
    nome = "Pareto Scaling"
    familia = "02_preprocessamento"
    descricao = "Mean centering + divisão pela raiz quadrada do desvio padrão."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        mean_ = np.mean(X, axis=0)
        std_ = np.std(X, axis=0, ddof=1)
        scale_ = np.sqrt(np.where(std_ == 0, 1.0, std_))
        X_p = (X - mean_) / scale_
        return {"X_p": X_p, "mean_": mean_, "scale_": scale_}


class OutrosScalings(BaseScript):
    slug = "outros_scalings"
    nome = "Outros Scalings (vast/level/range)"
    familia = "02_preprocessamento"
    descricao = "VAST, level e range scaling."

    _METHODS = {"vast", "level", "range"}

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        self._require_key(inputs, "X")
        m = params.get("method", "vast")
        if m not in self._METHODS:
            raise ValueError(f"method '{m}' inválido. Use: {self._METHODS}")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "vast")
        axis = params.get("axis", 0)

        mean_ = np.mean(X, axis=axis)
        std_ = np.std(X, axis=axis, ddof=1)
        std_ = np.where(std_ == 0, 1.0, std_)

        if method == "vast":
            cv = std_ / np.where(mean_ == 0, 1.0, mean_)
            scale = std_ * cv
            X_s = (X - mean_) / scale
            params_ = {"mean_": mean_, "std_": std_, "cv": cv}
        elif method == "level":
            X_s = (X - mean_) / np.where(mean_ == 0, 1.0, mean_)
            params_ = {"mean_": mean_}
        elif method == "range":
            min_ = np.min(X, axis=axis)
            max_ = np.max(X, axis=axis)
            rng = np.where((max_ - min_) == 0, 1.0, max_ - min_)
            X_s = (X - min_) / rng
            params_ = {"min_": min_, "max_": max_}

        return {"X_s": X_s, "params_": params_}


class RobustScaling(BaseScript):
    slug = "robust_scaling"
    nome = "Robust Scaling"
    familia = "02_preprocessamento"
    descricao = "Centraliza pela mediana e escala pelo IQR (insensível a outliers)."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from sklearn.preprocessing import RobustScaler
        X = np.asarray(inputs["X"], dtype=float)
        q_range = params.get("quantile_range", (25, 75))
        scaler = RobustScaler(quantile_range=q_range)
        X_rs = scaler.fit_transform(X)
        return {
            "X_rs": X_rs,
            "median_": scaler.center_,
            "iqr_": scaler.scale_,
        }


class OSC(BaseScript):
    slug = "osc"
    nome = "OSC — Orthogonal Signal Correction"
    familia = "02_preprocessamento"
    descricao = "Remove variação ortogonal a y de X antes de PLS."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        y = np.asarray(self._require_key(inputs, "y"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        if y.ndim > 2:
            raise ValueError("y deve ser vetor ou matriz 2D.")
        if X.shape[0] != (y.shape[0] if y.ndim > 1 else len(y)):
            raise ValueError("Número de amostras de X e y diferem.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from scipy import linalg
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)
        if y.ndim == 1:
            y = y.reshape(-1, 1)

        n_components = params.get("n_components", 1)
        max_iter = params.get("max_iter", 100)
        tol = params.get("tolerance", 1e-6)

        weights_list = []
        X_osc = X.copy()

        for _ in range(n_components):
            # Initialize t as first PC of X orthogonal to y
            t = X_osc[:, 0:1]
            for _iter in range(max_iter):
                # Orthogonalize t w.r.t. y
                t = t - y @ np.linalg.pinv(y.T @ y) @ y.T @ t
                t /= np.linalg.norm(t)
                w = X_osc.T @ t
                w /= np.linalg.norm(w)
                t_new = X_osc @ w
                t_new = t_new - y @ np.linalg.pinv(y.T @ y) @ y.T @ t_new
                if np.linalg.norm(t_new - t) < tol:
                    break
                t = t_new

            p = X_osc.T @ t / (t.T @ t)
            X_osc = X_osc - t @ p.T
            weights_list.append(w.squeeze().tolist())

        return {
            "X_osc": X_osc,
            "weights_": weights_list,
            "scores_osc": (X - X_osc).tolist(),
        }


class EMSC(BaseScript):
    slug = "emsc"
    nome = "EMSC — Extended Multiplicative Scatter Correction"
    familia = "02_preprocessamento"
    descricao = "Corrige espalhamento multiplicativo e aditivo, mais interferentes conhecidos."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        reference = params.get("reference", "mean")
        poly_order = params.get("polynomial_order", 2)
        interferents = params.get("interferents", None)
        spectral_axis = params.get("spectral_axis", 1)

        if reference == "mean":
            ref = np.mean(X, axis=0)
        elif reference == "median":
            ref = np.median(X, axis=0)
        else:
            ref = np.asarray(reference, dtype=float)

        n_vars = X.shape[spectral_axis]
        xp = np.linspace(-1, 1, n_vars)

        # Build regression matrix: [ref, 1, x, x^2, ..., interferents]
        cols = [ref, np.ones(n_vars)]
        for d in range(1, poly_order + 1):
            cols.append(xp ** d)
        if interferents is not None:
            intf = np.asarray(interferents, dtype=float)
            if intf.ndim == 1:
                intf = intf.reshape(1, -1)
            for row in intf:
                cols.append(row)

        D = np.column_stack(cols)
        coefficients = []
        X_emsc = np.zeros_like(X)

        for i in range(X.shape[0]):
            xi = X[i]
            c, *_ = np.linalg.lstsq(D, xi, rcond=None)
            coefficients.append(c.tolist())
            # Correct: remove everything except reference contribution
            reconstructed = D @ c
            scatter_part = D[:, 1:] @ c[1:]
            X_emsc[i] = (xi - scatter_part) / c[0]

        return {
            "X_emsc": X_emsc,
            "coefficients_": coefficients,
            "reference_used": ref,
        }


class MieEMSC(BaseScript):
    slug = "mie_emsc"
    nome = "RMie-EMSC (Resonance Mie Scatter Extended MSC)"
    familia = "02_preprocessamento"
    descricao = "Correção de espalhamento físico Mie para FTIR de células e tecidos. is_beta=true."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        if "wavenumbers" not in params:
            raise ValueError("'wavenumbers' é obrigatório para o modelo de Mie.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        ref = params.get("reference", "mean")
        n_comp = params.get("n_components", 7)
        n_iter = params.get("n_iterations", 4)
        wavenumbers = np.asarray(params["wavenumbers"], dtype=float)
        size_range = params.get("particle_size_range", [2, 8])

        if ref == "mean":
            reference = np.mean(X, axis=0)
        else:
            reference = np.asarray(ref, dtype=float)

        # Simplified RMie-EMSC: iterative approach using PCA to estimate true spectra
        from sklearn.decomposition import PCA
        X_corr = X.copy()
        mie_spectra = np.zeros_like(X)

        for iteration in range(n_iter):
            # Fit PCA to get principal spectral components
            pca = PCA(n_components=min(n_comp, X_corr.shape[0] - 1))
            pca.fit(X_corr)
            pc_spectra = pca.components_

            # Build EMSC model with PCA components as interferents
            n_vars = X.shape[1]
            xp = np.linspace(-1, 1, n_vars)
            D = np.column_stack([reference, np.ones(n_vars), xp] + list(pc_spectra.T))

            X_new = np.zeros_like(X)
            mie_new = np.zeros_like(X)
            for i in range(X.shape[0]):
                c, *_ = np.linalg.lstsq(D, X[i], rcond=None)
                scatter_part = D[:, 1:] @ c[1:]
                X_new[i] = (X[i] - scatter_part) / max(c[0], 1e-10)
                mie_new[i] = scatter_part

            X_corr = X_new
            mie_spectra = mie_new

        return {"X_corrected": X_corr, "mie_spectra_": mie_spectra}


class PQN(BaseScript):
    slug = "pqn"
    nome = "PQN — Probabilistic Quotient Normalization"
    familia = "02_preprocessamento"
    descricao = "Normaliza pela mediana dos quocientes variável a variável."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        reference = params.get("reference", "mean")

        if reference == "mean":
            ref = np.mean(X, axis=0)
        elif reference == "median":
            ref = np.median(X, axis=0)
        else:
            ref = np.asarray(reference, dtype=float)

        # Normalize each sample by L1 then compute quotients
        X_l1 = X / np.sum(np.abs(X), axis=1, keepdims=True).clip(1e-10)
        ref_l1 = ref / np.sum(np.abs(ref)).clip(1e-10)

        # Quotients: X_l1[i, j] / ref_l1[j]
        quotients = X_l1 / np.where(ref_l1 == 0, 1.0, ref_l1)
        scaling_factors = np.median(quotients, axis=1)
        scaling_factors = np.where(scaling_factors == 0, 1.0, scaling_factors)

        X_pqn = X / scaling_factors.reshape(-1, 1)

        return {
            "X_pqn": X_pqn,
            "reference_used": ref,
            "quotients_": quotients,
            "scaling_factors_": scaling_factors,
        }


class EilersSmoothing(BaseScript):
    slug = "eilers_smoothing"
    nome = "Eilers Smoothing (Whittaker)"
    familia = "02_preprocessamento"
    descricao = "Suavização por spline penalizada de Eilers."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser matriz 2D.")
        lambda_ = params.get("lambda_", 1e3)
        if lambda_ <= 0:
            raise ValueError("'lambda_' deve ser > 0.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from scipy import sparse
        from scipy.sparse.linalg import spsolve

        X = np.asarray(inputs["X"], dtype=float)
        lambda_ = params.get("lambda_", 1e3)
        d = params.get("d", 2)
        spectral_axis = params.get("spectral_axis", 1)

        n = X.shape[spectral_axis]
        # Build penalty matrix
        D_mat = np.diff(np.eye(n), d, axis=0)
        D_sp = sparse.csr_matrix(D_mat)
        H = lambda_ * D_sp.T.dot(D_sp)
        I_sp = sparse.eye(n, format="csr")

        X_smooth = np.zeros_like(X)
        for i in range(X.shape[0]):
            row = X[i] if spectral_axis == 1 else X[:, i]
            smoothed = spsolve(I_sp + H, row)
            if spectral_axis == 1:
                X_smooth[i] = smoothed
            else:
                X_smooth[:, i] = smoothed

        return {"X_smooth": X_smooth}


class WaveletTransform(BaseScript):
    slug = "wavelet_transform"
    nome = "Wavelet Transform"
    familia = "02_preprocessamento"
    descricao = "Decomposição Wavelet discreta para suavização, decomposição ou extração de features."

    _MODES = {"denoise", "decompose", "features"}

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser matriz 2D.")
        mode = params.get("mode", "denoise")
        if mode not in self._MODES:
            raise ValueError(f"mode '{mode}' inválido. Use: {self._MODES}")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        import pywt
        X = np.asarray(inputs["X"], dtype=float)
        wavelet = params.get("wavelet", "db4")
        level = params.get("level", None)
        mode = params.get("mode", "denoise")
        threshold_method = params.get("threshold_method", "soft")
        spectral_axis = params.get("spectral_axis", 1)

        results = {}

        if mode == "denoise":
            X_denoised = np.zeros_like(X)
            for i in range(X.shape[0]):
                row = X[i] if spectral_axis == 1 else X[:, i]
                coeffs = pywt.wavedec(row, wavelet, level=level)
                # Universal threshold
                sigma = np.median(np.abs(coeffs[-1])) / 0.6745
                thr = sigma * np.sqrt(2 * np.log(len(row)))
                coeffs_thr = [coeffs[0]] + [
                    pywt.threshold(c, thr, mode=threshold_method or "soft")
                    for c in coeffs[1:]
                ]
                rec = pywt.waverec(coeffs_thr, wavelet)[:len(row)]
                if spectral_axis == 1:
                    X_denoised[i] = rec
                else:
                    X_denoised[:, i] = rec
            results["X_denoised"] = X_denoised

        elif mode == "decompose":
            approx_list, details_list = [], []
            for i in range(X.shape[0]):
                row = X[i] if spectral_axis == 1 else X[:, i]
                coeffs = pywt.wavedec(row, wavelet, level=level)
                approx_list.append(coeffs[0])
                details_list.append([c.tolist() for c in coeffs[1:]])
            results["approximation"] = approx_list
            results["details"] = details_list

        elif mode == "features":
            feat_rows = []
            for i in range(X.shape[0]):
                row = X[i] if spectral_axis == 1 else X[:, i]
                coeffs = pywt.wavedec(row, wavelet, level=level)
                feat_rows.append(np.concatenate(coeffs))
            results["X_features"] = np.array(feat_rows)

        return results


class AutomatedPreprocessing(BaseScript):
    slug = "automated_preprocessing"
    nome = "Automated Preprocessing Selection"
    familia = "02_preprocessamento"
    descricao = "Seleciona automaticamente a melhor sequência de pré-processamento por RMSECV."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.model_selection import cross_val_score
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        import itertools

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"], dtype=float)

        methods_pool = params.get("methods_pool",
            ["snv", "msc", "baseline", "savitzky_golay", "centering", "autoscaling", "pareto"])
        max_steps = params.get("max_steps", 3)
        n_comp = params.get("n_components_pls", 5)
        cv_folds = params.get("cv_folds", 5)
        scoring_metric = params.get("scoring_metric", "rmsecv")

        from factory import ScriptFactory
        ScriptFactory.autodiscover()

        def apply_pipeline(X_in, pipeline_slugs):
            X_cur = X_in.copy()
            for slug in pipeline_slugs:
                try:
                    script = ScriptFactory.get(slug)
                    script.validate({"X": X_cur}, {})
                    out = script.execute({"X": X_cur}, {})
                    # Get first output that is a 2D array
                    for v in out.values():
                        arr = np.asarray(v)
                        if arr.shape == X_cur.shape:
                            X_cur = arr
                            break
                except Exception:
                    pass
            return X_cur

        def rmsecv(X_in, y_in):
            n_comp_actual = min(n_comp, X_in.shape[1], X_in.shape[0] - 1)
            pls = PLSRegression(n_components=n_comp_actual)
            scores = cross_val_score(
                pls, X_in, y_in,
                cv=min(cv_folds, len(y_in)),
                scoring="neg_mean_squared_error"
            )
            return float(np.sqrt(-scores.mean()))

        best_score = float("inf")
        best_pipeline = []
        scores_all = {}

        # Try combinations up to max_steps
        for n_steps in range(1, max_steps + 1):
            for combo in itertools.combinations(methods_pool, n_steps):
                try:
                    X_proc = apply_pipeline(X, list(combo))
                    score = rmsecv(X_proc, y)
                    scores_all["|".join(combo)] = score
                    if score < best_score:
                        best_score = score
                        best_pipeline = list(combo)
                except Exception:
                    continue

        X_preprocessed = apply_pipeline(X, best_pipeline)

        return {
            "best_pipeline": best_pipeline,
            "best_score": best_score,
            "scores_all_combinations": scores_all,
            "X_preprocessed": X_preprocessed,
        }
