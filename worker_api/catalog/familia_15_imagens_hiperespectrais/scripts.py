from __future__ import annotations


# ================================================================
# hyperspectral.py
# ================================================================
"""Imagens Hiperespectrais — Família 15"""
import numpy as np
from catalog.base import BaseScript


class HyperspectralUnmixing(BaseScript):
    slug = "hyperspectral_unmixing"
    nome = "Hyperspectral Unmixing (N-FINDR / VCA / FCLSU)"
    familia = "15_imagens_hiperespectrais"
    descricao = "Desmistura hiperespectral: extrai endmembers e abundâncias."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D (n_pixels, n_bands).")
        method = params.get("method", "vca")
        if method not in {"vca", "nfindr", "fclsu"}:
            raise ValueError("method deve ser 'vca', 'nfindr' ou 'fclsu'.")

    def execute(self, inputs, params):
        from scipy.optimize import nnls

        X = np.asarray(inputs["X"], dtype=float)
        n_endmembers = params.get("n_endmembers", 3)
        method = params.get("method", "vca")
        n, p = X.shape
        R = min(n_endmembers, n, p)

        if method == "vca":
            # Vertex Component Analysis (simplified)
            from sklearn.decomposition import PCA
            pca = PCA(n_components=R)
            X_pca = pca.fit_transform(X)
            endmember_indices = []
            rng = np.random.default_rng(42)
            f = rng.random(R)
            f /= np.linalg.norm(f)
            for _ in range(R):
                projections = X_pca @ f
                idx = int(np.argmax(np.abs(projections)))
                endmember_indices.append(idx)
                v = X_pca[idx]
                f = v - X_pca @ (X_pca.T @ v) / (np.linalg.norm(X_pca.T @ v) + 1e-12)
                f_norm = np.linalg.norm(f)
                f = f / f_norm if f_norm > 0 else rng.random(R)
                f /= np.linalg.norm(f) + 1e-12

        elif method == "nfindr":
            # N-FINDR: iterative simplex volume maximization
            from sklearn.decomposition import PCA
            pca = PCA(n_components=R - 1)
            X_pca = pca.fit_transform(X)
            rng = np.random.default_rng(42)
            endmember_indices = rng.choice(n, R, replace=False).tolist()

            def simplex_vol(idx_list):
                E = np.column_stack([X_pca[i] for i in idx_list])
                M = np.vstack([E, np.ones((1, R))])
                return abs(np.linalg.det(M[:R, :]))

            improved = True
            for _iter in range(100):
                improved = False
                for k in range(R):
                    best_v = simplex_vol(endmember_indices)
                    best_idx = endmember_indices[k]
                    for j in range(n):
                        if j in endmember_indices:
                            continue
                        candidate = endmember_indices.copy()
                        candidate[k] = j
                        v = simplex_vol(candidate)
                        if v > best_v:
                            best_v = v
                            best_idx = j
                    if best_idx != endmember_indices[k]:
                        endmember_indices[k] = best_idx
                        improved = True
                if not improved:
                    break

        else:  # fclsu — Fully Constrained Least Squares Unmixing
            from sklearn.decomposition import PCA
            pca = PCA(n_components=R - 1)
            X_pca = pca.fit_transform(X)
            rng = np.random.default_rng(42)
            endmember_indices = rng.choice(n, R, replace=False).tolist()

        E = X[endmember_indices, :]   # (R, p)

        # Compute abundances via FCLS (non-negative least squares + sum-to-one)
        # Augmented: add row of 1s to enforce sum-to-one
        lam = params.get("lambda_constraint", 10.0)
        E_aug = np.vstack([E.T, lam * np.ones((1, R))])
        abundances = np.zeros((n, R))
        for i in range(n):
            x_aug = np.append(X[i], lam)
            ab, _ = nnls(E_aug, x_aug)
            s = ab.sum()
            abundances[i] = ab / s if s > 0 else ab

        X_reconstructed = abundances @ E
        rmse = float(np.sqrt(np.mean((X - X_reconstructed) ** 2)))

        return {
            "model": {"type": f"unmixing_{method}", "n_endmembers": R},
            "endmember_indices": endmember_indices,
            "endmembers": E.tolist(),
            "abundances": abundances.tolist(),
            "reconstruction_rmse": rmse,
        }


class HyperspectralClassification(BaseScript):
    slug = "hyperspectral_classification"
    nome = "Hyperspectral Classification (pixel-wise)"
    familia = "15_imagens_hiperespectrais"
    descricao = "Classificação pixel-a-pixel de imagem hiperespectral."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_pixels, n_bands).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de pixels.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from sklearn.svm import SVC
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.metrics import accuracy_score

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        method = params.get("method", "svm")
        n_comp_pca = params.get("n_components_pca", 10)

        nc = min(n_comp_pca, X.shape[0] - 1, X.shape[1])
        pca = PCA(n_components=nc)
        X_pca = pca.fit_transform(X)

        if method == "svm":
            clf = SVC(kernel="rbf", probability=False)
        else:
            clf = RandomForestClassifier(n_estimators=100, random_state=42)

        clf.fit(X_pca, y)
        y_pred = clf.predict(X_pca)
        acc = float(accuracy_score(y, y_pred))

        return {
            "model": {"type": f"hyperspectral_classif_{method}", "n_components_pca": nc},
            "y_pred": y_pred.tolist(),
            "accuracy": acc,
            "explained_variance": pca.explained_variance_ratio_.tolist(),
        }


class HyperspectralImagePCA(BaseScript):
    slug = "hyperspectral_pca"
    nome = "Hyperspectral Image PCA"
    familia = "15_imagens_hiperespectrais"
    descricao = "PCA de imagem hiperespectral: redução de dimensão espectral."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {2, 3}:
            raise ValueError("X deve ser 2D (n_pixels, n_bands) ou 3D (H, W, n_bands).")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 5)

        orig_shape = X.shape
        if X.ndim == 3:
            H, W, B = X.shape
            X2D = X.reshape(-1, B)
        else:
            X2D = X
            H, W = None, None

        nc = min(n_comp, X2D.shape[0] - 1, X2D.shape[1])
        pca = PCA(n_components=nc)
        scores = pca.fit_transform(X2D)

        if H is not None:
            scores_img = scores.reshape(H, W, nc)
            scores_out = scores_img.tolist()
        else:
            scores_out = scores.tolist()

        return {
            "model": {"type": "hyperspectral_pca", "n_components": nc, "original_shape": list(orig_shape)},
            "scores": scores_out,
            "loadings": pca.components_.tolist(),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
            "cumulative_variance": np.cumsum(pca.explained_variance_ratio_).tolist(),
        }


class SpectralAngleMapper(BaseScript):
    slug = "spectral_angle_mapper"
    nome = "SAM — Spectral Angle Mapper"
    familia = "15_imagens_hiperespectrais"
    descricao = "Classifica pixels por ângulo espectral em relação a espectros de referência."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        refs = np.asarray(self._require_key(inputs, "references"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_pixels, n_bands).")
        if refs.ndim != 2 or refs.shape[1] != X.shape[1]:
            raise ValueError("references deve ser 2D (n_classes, n_bands) com mesmas bandas.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        refs = np.asarray(inputs["references"], dtype=float)
        class_names = inputs.get("class_names", [f"class_{i}" for i in range(len(refs))])
        threshold_deg = params.get("threshold_degrees", 10.0)

        # Compute spectral angle (radians)
        X_norm = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-12)
        R_norm = refs / (np.linalg.norm(refs, axis=1, keepdims=True) + 1e-12)

        # angles: (n_pixels, n_classes)
        cos_angles = np.clip(X_norm @ R_norm.T, -1, 1)
        angles_rad = np.arccos(cos_angles)
        angles_deg = np.degrees(angles_rad)

        best_class_idx = np.argmin(angles_deg, axis=1)
        best_angle = angles_deg[np.arange(len(X)), best_class_idx]

        thresh_rad = np.radians(threshold_deg)
        y_pred = [class_names[i] if a < threshold_deg else "unclassified"
                  for i, a in zip(best_class_idx, best_angle)]

        return {
            "model": {"type": "sam", "threshold_degrees": threshold_deg},
            "y_pred": y_pred,
            "minimum_angles_degrees": best_angle.tolist(),
            "all_angles_degrees": angles_deg.tolist(),
        }

