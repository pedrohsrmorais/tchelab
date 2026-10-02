"""Decomposição Multiway — Família 07"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript


class PARAFAC(BaseScript):
    slug = "parafac"
    nome = "PARAFAC — Parallel Factor Analysis"
    familia = "07_multiway_decomp"
    descricao = "Decomposição tensorial trilinear (CP) por ALS."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        rank = params.get("rank", 2)
        if rank < 1:
            raise ValueError("rank deve ser >= 1.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac

        X = np.asarray(inputs["X"], dtype=float)
        rank = params.get("rank", 2)
        n_iter_max = params.get("n_iter_max", 200)
        tol = params.get("tol", 1e-8)
        random_state = params.get("random_state", 42)
        non_negative = params.get("non_negative", False)
        normalize_factors = params.get("normalize_factors", True)

        tl.set_backend("numpy")

        if non_negative:
            from tensorly.decomposition import non_negative_parafac
            weights, factors = non_negative_parafac(
                X, rank=rank, n_iter_max=n_iter_max, tol=tol, random_state=random_state
            )
        else:
            weights, factors = parafac(
                X, rank=rank, n_iter_max=n_iter_max, tol=tol,
                random_state=random_state, normalize_factors=normalize_factors,
            )

        X_rec = tl.kruskal_to_tensor((weights, factors))
        residuals = X - X_rec
        fit = 1.0 - float(np.linalg.norm(residuals) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {"type": "parafac", "rank": rank},
            "weights": weights.tolist(),
            "factors": [f.tolist() for f in factors],
            "fit": fit,
            "core_consistency": None,  # placeholder — requires extra computation
        }


class PARAFAC2(BaseScript):
    slug = "parafac2"
    nome = "PARAFAC2"
    familia = "07_multiway_decomp"
    descricao = "PARAFAC2 para conjuntos de matrizes com tamanhos variáveis."

    def validate(self, inputs, params):
        slices = self._require_key(inputs, "slices")
        if not isinstance(slices, (list, tuple)) or len(slices) < 2:
            raise ValueError("slices deve ser lista de >= 2 matrizes.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import parafac2

        slices = [np.asarray(s, dtype=float) for s in inputs["slices"]]
        rank = params.get("rank", 2)
        n_iter_max = params.get("n_iter_max", 200)
        tol = params.get("tol", 1e-8)

        tl.set_backend("numpy")
        weights, factors, projections = parafac2(
            slices, rank=rank, n_iter_max=n_iter_max, tol=tol
        )

        return {
            "model": {"type": "parafac2", "rank": rank},
            "weights": weights.tolist(),
            "factors": [f.tolist() for f in factors],
            "n_slices": len(slices),
        }


class PARAFACAumentado(BaseScript):
    slug = "parafac_aumentado"
    nome = "PARAFAC Aumentado (Augmented PARAFAC)"
    familia = "07_multiway_decomp"
    descricao = "PARAFAC sobre tensor aumentado com restrições de não-negatividade."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import non_negative_parafac

        X = np.asarray(inputs["X"], dtype=float)
        rank = params.get("rank", 3)
        n_iter_max = params.get("n_iter_max", 300)
        tol = params.get("tol", 1e-8)

        tl.set_backend("numpy")
        # Augmented: stack X with its column-permuted version
        perm = np.random.permutation(X.shape[-1])
        X_aug = np.concatenate([X, X[..., perm]], axis=-1)

        weights, factors = non_negative_parafac(X_aug, rank=rank, n_iter_max=n_iter_max, tol=tol)
        X_rec = tl.kruskal_to_tensor((weights, factors))
        fit = 1.0 - float(np.linalg.norm(X_aug - X_rec) / (np.linalg.norm(X_aug) + 1e-12))

        return {
            "model": {"type": "parafac_aumentado", "rank": rank},
            "weights": weights.tolist(),
            "factors": [f.tolist() for f in factors],
            "fit": fit,
        }


class Tucker3(BaseScript):
    slug = "tucker3"
    nome = "Tucker3 — Tucker Decomposition (3-way)"
    familia = "07_multiway_decomp"
    descricao = "Decomposição Tucker para tensores de 3ª ordem."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 3:
            raise ValueError("X deve ser tensor 3D (I, J, K).")
        ranks = params.get("ranks", [2, 2, 2])
        if len(ranks) != 3:
            raise ValueError("ranks deve ter 3 elementos.")

    def execute(self, inputs, params):
        import tensorly as tl
        from tensorly.decomposition import tucker

        X = np.asarray(inputs["X"], dtype=float)
        ranks = params.get("ranks", [2, 2, 2])
        n_iter_max = params.get("n_iter_max", 100)
        tol = params.get("tol", 1e-8)

        tl.set_backend("numpy")
        core, factors = tucker(X, rank=ranks, n_iter_max=n_iter_max, tol=tol)
        X_rec = tl.tucker_to_tensor((core, factors))
        fit = 1.0 - float(np.linalg.norm(X - X_rec) / (np.linalg.norm(X) + 1e-12))

        return {
            "model": {"type": "tucker3", "ranks": ranks},
            "core": core.tolist(),
            "factors": [f.tolist() for f in factors],
            "fit": fit,
        }


class MCRALS(BaseScript):
    slug = "mcr_als"
    nome = "MCR-ALS — Multivariate Curve Resolution – Alternating Least Squares"
    familia = "07_multiway_decomp"
    descricao = "Decompõe X = C × Sᵀ por ALS com restrições de não-negatividade."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D (n_samples, n_wavelengths).")
        n_comp = params.get("n_components", 2)
        if n_comp < 1:
            raise ValueError("n_components deve ser >= 1.")

    def execute(self, inputs, params):
        from scipy.optimize import nnls

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 2)
        n_iter = params.get("n_iter", 200)
        tol = params.get("tol", 1e-6)
        non_neg_C = params.get("non_neg_C", True)
        non_neg_S = params.get("non_neg_S", True)

        n, p = X.shape
        rng = np.random.default_rng(42)
        S = np.abs(rng.standard_normal((p, n_comp)))

        prev_loss = np.inf
        for _ in range(n_iter):
            # Solve for C
            if non_neg_C:
                C = np.zeros((n, n_comp))
                for i in range(n):
                    C[i], _ = nnls(S, X[i])
            else:
                C = X @ np.linalg.pinv(S.T)

            # Solve for S
            if non_neg_S:
                S = np.zeros((p, n_comp))
                for j in range(p):
                    S[j], _ = nnls(C, X[:, j])
            else:
                S = np.linalg.pinv(C) @ X

            X_rec = C @ S.T
            loss = float(np.linalg.norm(X - X_rec))
            if abs(prev_loss - loss) < tol:
                break
            prev_loss = loss

        fit = 1.0 - loss / (float(np.linalg.norm(X)) + 1e-12)

        return {
            "model": {"type": "mcr_als", "n_components": n_comp},
            "C": C.tolist(),
            "S": S.tolist(),
            "X_reconstructed": X_rec.tolist(),
            "fit": fit,
        }


class MPCA(BaseScript):
    slug = "mpca"
    nome = "MPCA — Multilinear PCA"
    familia = "07_multiway_decomp"
    descricao = "PCA multilinear (tensor) via desdobramento iterativo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")

    def execute(self, inputs, params):
        import tensorly as tl

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 2)
        n_iter = params.get("n_iter", 20)

        tl.set_backend("numpy")
        order = X.ndim
        modes = list(range(1, order))  # keep mode 0 as samples

        # Initialize projection matrices via SVD of unfoldeds
        projections = []
        for mode in modes:
            Xm = tl.unfold(X, mode)
            U, _, _ = np.linalg.svd(Xm, full_matrices=False)
            nc = min(n_comp, U.shape[1])
            projections.append(U[:, :nc])

        # Iterative update
        for _ in range(n_iter):
            for i, mode in enumerate(modes):
                # Project all other modes
                X_proj = X
                for j, m in enumerate(modes):
                    if j != i:
                        X_proj = tl.tenalg.mode_dot(X_proj, projections[j].T, m)
                Xm = tl.unfold(X_proj, mode)
                U, _, _ = np.linalg.svd(Xm, full_matrices=False)
                nc = min(n_comp, U.shape[1])
                projections[i] = U[:, :nc]

        # Project X to get tensor scores
        X_scores = X
        for i, mode in enumerate(modes):
            X_scores = tl.tenalg.mode_dot(X_scores, projections[i].T, mode)

        return {
            "model": {"type": "mpca", "n_components": n_comp},
            "scores": X_scores.tolist(),
            "projections": [p.tolist() for p in projections],
        }


class TensorSVD(BaseScript):
    slug = "tensor_svd"
    nome = "Tensor SVD (Multilinear SVD)"
    familia = "07_multiway_decomp"
    descricao = "SVD multilinear via desdobramentos modais."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser tensor de ordem >= 2.")

    def execute(self, inputs, params):
        import tensorly as tl

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 2)

        tl.set_backend("numpy")
        Us, Ss, Vts = [], [], []
        for mode in range(X.ndim):
            Xm = tl.unfold(X, mode)
            U, S, Vt = np.linalg.svd(Xm, full_matrices=False)
            nc = min(n_comp, len(S))
            Us.append(U[:, :nc].tolist())
            Ss.append(S[:nc].tolist())
            Vts.append(Vt[:nc, :].tolist())

        return {
            "model": {"type": "tensor_svd", "n_components": n_comp},
            "U_modes": Us,
            "S_modes": Ss,
            "Vt_modes": Vts,
        }


class TensorNMF(BaseScript):
    slug = "tensor_nmf"
    nome = "Tensor NMF — Non-Negative Matrix Factorization Tensorial"
    familia = "07_multiway_decomp"
    descricao = "NMF não-negativa sobre desdobramento modal do tensor."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("X deve ser tensor de ordem >= 2.")
        if np.any(np.asarray(X) < 0):
            raise ValueError("Tensor NMF requer X >= 0.")

    def execute(self, inputs, params):
        from sklearn.decomposition import NMF
        import tensorly as tl

        X = np.asarray(inputs["X"], dtype=float)
        n_comp = params.get("n_components", 3)
        mode = params.get("mode", 0)  # which mode to unfold
        max_iter = params.get("max_iter", 200)

        tl.set_backend("numpy")
        Xm = tl.unfold(X, mode)
        nmf = NMF(n_components=n_comp, max_iter=max_iter, random_state=42)
        W = nmf.fit_transform(Xm)
        H = nmf.components_

        return {
            "model": {"type": "tensor_nmf", "n_components": n_comp, "mode": mode},
            "W": W.tolist(),
            "H": H.tolist(),
            "reconstruction_error": float(nmf.reconstruction_err_),
        }
