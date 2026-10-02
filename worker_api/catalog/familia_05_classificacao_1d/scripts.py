"""Classificação 1D — Família 05"""
from __future__ import annotations
from typing import Any
import numpy as np
from catalog.base import BaseScript


def _clf_metrics(y_true, y_pred):
    from sklearn.metrics import accuracy_score, balanced_accuracy_score
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
    }


class LDA(BaseScript):
    slug = "lda"
    nome = "LDA — Linear Discriminant Analysis"
    familia = "05_classificacao_1d"
    descricao = "Discriminação linear entre classes."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp = params.get("n_components", None)
        clf = LinearDiscriminantAnalysis(n_components=n_comp)
        clf.fit(X, y)
        scores = clf.transform(X)
        y_pred = clf.predict(X)
        return {
            "model": {"type": "lda"},
            "scores": scores,
            "loadings": clf.scalings_,
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class QDA(BaseScript):
    slug = "qda"
    nome = "QDA — Quadratic Discriminant Analysis"
    familia = "05_classificacao_1d"
    descricao = "Discriminação quadrática entre classes."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.discriminant_analysis import QuadraticDiscriminantAnalysis
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        clf = QuadraticDiscriminantAnalysis()
        clf.fit(X, y)
        y_pred = clf.predict(X)
        return {
            "model": {"type": "qda"},
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class KNN(BaseScript):
    slug = "knn"
    nome = "KNN — K-Nearest Neighbors"
    familia = "05_classificacao_1d"
    descricao = "Classificação por K vizinhos mais próximos."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.neighbors import KNeighborsClassifier
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_neighbors = params.get("n_neighbors", 5)
        metric = params.get("metric", "euclidean")
        weights = params.get("weights", "uniform")
        clf = KNeighborsClassifier(n_neighbors=n_neighbors, metric=metric, weights=weights)
        clf.fit(X, y)
        y_pred = clf.predict(X)
        return {
            "model": {"type": "knn", "n_neighbors": n_neighbors},
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class SVM(BaseScript):
    slug = "svm"
    nome = "SVM — Support Vector Machine"
    familia = "05_classificacao_1d"
    descricao = "Classificação por máquinas de vetores de suporte."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.svm import SVC
        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        kernel = params.get("kernel", "rbf")
        C = params.get("C", 1.0)
        gamma = params.get("gamma", "scale")
        clf = SVC(kernel=kernel, C=C, gamma=gamma, probability=True)
        clf.fit(X, y)
        y_pred = clf.predict(X)
        return {
            "model": {"type": "svm", "kernel": kernel, "C": C},
            "support_vectors": clf.support_vectors_,
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class SIMCA(BaseScript):
    slug = "simca"
    nome = "SIMCA — Soft Independent Modelling of Class Analogies"
    familia = "05_classificacao_1d"
    descricao = "Modela cada classe com PCA; classifica por distância ao modelo de classe."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        n_comp = params.get("n_components", 2)
        if n_comp < 1:
            raise ValueError("n_components deve ser >= 1.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp = params.get("n_components", 2)
        alpha = params.get("alpha", 0.05)  # significance level for threshold

        classes = np.unique(y)
        models = {}
        thresholds = {}

        # Fit one PCA model per class
        for cls in classes:
            mask = y == cls
            Xc = X[mask]
            nc = min(n_comp, Xc.shape[0] - 1, Xc.shape[1])
            pca = PCA(n_components=nc)
            pca.fit(Xc)
            scores = pca.transform(Xc)
            X_rec = pca.inverse_transform(scores)
            residuals = Xc - X_rec
            # Orthogonal distance: sum of squared residuals per sample
            od = np.sum(residuals ** 2, axis=1)
            # Threshold: mean + z*std (parametric approximation)
            from scipy.stats import chi2
            dof = Xc.shape[1] - nc
            if dof > 0:
                thresh = np.mean(od) * chi2.ppf(1 - alpha, dof) / dof
            else:
                thresh = np.percentile(od, (1 - alpha) * 100)
            models[cls] = pca
            thresholds[cls] = float(thresh)

        # Classify: sample belongs to class with smallest OD (below threshold)
        y_pred = []
        distances = {cls: [] for cls in classes}

        for xi in X:
            best_cls = None
            best_od = np.inf
            for cls in classes:
                pca = models[cls]
                scores = pca.transform(xi.reshape(1, -1))
                x_rec = pca.inverse_transform(scores)
                od = float(np.sum((xi - x_rec.ravel()) ** 2))
                distances[cls].append(od)
                if od < thresholds[cls] and od < best_od:
                    best_od = od
                    best_cls = cls
            y_pred.append(best_cls if best_cls is not None else "unknown")

        y_pred = np.array(y_pred)
        # For metrics, treat "unknown" as wrong
        y_pred_for_metrics = np.where(y_pred == "unknown", "__unknown__", y_pred)

        return {
            "model": {"type": "simca", "n_components": n_comp},
            "thresholds": thresholds,
            "classes": classes.tolist(),
            "distances": {cls: distances[cls] for cls in classes},
            "metrics_cal": _clf_metrics(y, y_pred_for_metrics),
        }


class OCSIMCA(BaseScript):
    slug = "oc_simca"
    nome = "One-Class SIMCA"
    familia = "05_classificacao_1d"
    descricao = "SIMCA one-class: modela apenas a classe alvo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from scipy.stats import chi2

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        n_comp = params.get("n_components", 2)
        alpha = params.get("alpha", 0.05)

        if target_class is None:
            target_class = np.unique(y)[0]

        mask = y == target_class
        Xc = X[mask]
        nc = min(n_comp, Xc.shape[0] - 1, Xc.shape[1])
        pca = PCA(n_components=nc)
        pca.fit(Xc)

        scores_c = pca.transform(Xc)
        X_rec_c = pca.inverse_transform(scores_c)
        od_c = np.sum((Xc - X_rec_c) ** 2, axis=1)

        dof = max(1, Xc.shape[1] - nc)
        thresh = np.mean(od_c) * chi2.ppf(1 - alpha, dof) / dof

        # Predict all samples
        scores_all = pca.transform(X)
        X_rec_all = pca.inverse_transform(scores_all)
        od_all = np.sum((X - X_rec_all) ** 2, axis=1)
        y_pred = np.where(od_all <= thresh, target_class, f"not_{target_class}")

        return {
            "model": {"type": "oc_simca", "target_class": str(target_class), "n_components": nc},
            "threshold": float(thresh),
            "orthogonal_distances": od_all.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class DDSIMCA(BaseScript):
    slug = "dd_simca"
    nome = "DD-SIMCA — Data-Driven SIMCA"
    familia = "05_classificacao_1d"
    descricao = "SIMCA data-driven com fronteira estatística por distribuição F (Mahalanobis + ortogonal)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        n_comp = params.get("n_components", 3)
        if n_comp < 1:
            raise ValueError("n_components deve ser >= 1.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA
        from scipy.stats import f as f_dist

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        n_comp = params.get("n_components", 3)
        alpha = params.get("alpha", 0.05)

        if target_class is None:
            target_class = np.unique(y)[0]

        mask = y == target_class
        Xc = X[mask]
        n, p = Xc.shape
        nc = min(n_comp, n - 1, p)

        pca = PCA(n_components=nc)
        pca.fit(Xc)
        scores_c = pca.transform(Xc)  # (n, nc)

        # Score distance (SD) — Mahalanobis in score space
        mean_s = scores_c.mean(axis=0)
        std_s = scores_c.std(axis=0, ddof=1)
        std_s[std_s == 0] = 1.0
        SD = np.sqrt(np.sum(((scores_c - mean_s) / std_s) ** 2, axis=1))

        # Orthogonal distance (OD) — residual in X space
        X_rec_c = pca.inverse_transform(scores_c)
        residuals_c = Xc - X_rec_c
        OD = np.sqrt(np.sum(residuals_c ** 2, axis=1))

        # Normalise and combine: (SD/SD0)^2 + (OD/OD0)^2 ~ chi2
        SD0 = np.mean(SD) if np.mean(SD) > 0 else 1.0
        OD0 = np.mean(OD) if np.mean(OD) > 0 else 1.0

        combined_c = (SD / SD0) ** 2 + (OD / OD0) ** 2

        # Threshold via F-distribution: F(nc, n-nc)
        f_crit = f_dist.ppf(1 - alpha, nc, max(n - nc, 1))
        thresh = nc * (n**2 - 1) / (n * (n - nc)) * f_crit

        # Classify all samples
        scores_all = pca.transform(X)
        X_rec_all = pca.inverse_transform(scores_all)
        residuals_all = X - X_rec_all
        SD_all = np.sqrt(np.sum(((scores_all - mean_s) / std_s) ** 2, axis=1))
        OD_all = np.sqrt(np.sum(residuals_all ** 2, axis=1))
        combined_all = (SD_all / SD0) ** 2 + (OD_all / OD0) ** 2

        y_pred = np.where(combined_all <= thresh, target_class, f"not_{target_class}")

        return {
            "model": {"type": "dd_simca", "target_class": str(target_class), "n_components": nc},
            "threshold": float(thresh),
            "SD0": float(SD0),
            "OD0": float(OD0),
            "combined_distances": combined_all.tolist(),
            "SD_scores": SD_all.tolist(),
            "OD_scores": OD_all.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class PLSDA(BaseScript):
    slug = "pls_da"
    nome = "PLS-DA — Partial Least Squares Discriminant Analysis"
    familia = "05_classificacao_1d"
    descricao = "Classificação via PLS com variável resposta dummy."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        n_comp = params.get("n_components", 2)
        if n_comp < 1:
            raise ValueError("n_components deve ser >= 1.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.preprocessing import LabelBinarizer

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp = params.get("n_components", 2)
        threshold = params.get("threshold", 0.5)

        lb = LabelBinarizer()
        Y_dummy = lb.fit_transform(y).astype(float)
        # PLSRegression needs Y 2D
        if Y_dummy.ndim == 1:
            Y_dummy = Y_dummy.reshape(-1, 1)

        n_comp = min(n_comp, X.shape[0] - 1, X.shape[1])
        pls = PLSRegression(n_components=n_comp)
        pls.fit(X, Y_dummy)

        scores = pls.transform(X)
        Y_pred_cont = pls.predict(X)

        # Assign class by argmax of predicted dummy columns
        if Y_pred_cont.shape[1] == 1:
            y_pred_idx = (Y_pred_cont[:, 0] >= threshold).astype(int)
        else:
            y_pred_idx = np.argmax(Y_pred_cont, axis=1)

        classes = lb.classes_
        y_pred = classes[y_pred_idx]

        return {
            "model": {"type": "pls_da", "n_components": n_comp},
            "scores": scores.tolist(),
            "x_loadings": pls.x_loadings_.tolist(),
            "x_weights": pls.x_weights_.tolist(),
            "classes": classes.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class RandomForest(BaseScript):
    slug = "random_forest"
    nome = "Random Forest Classifier"
    familia = "05_classificacao_1d"
    descricao = "Classificação por floresta aleatória de árvores de decisão."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestClassifier

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_estimators = params.get("n_estimators", 100)
        max_depth = params.get("max_depth", None)
        min_samples_split = params.get("min_samples_split", 2)
        random_state = params.get("random_state", 42)

        clf = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_split=min_samples_split,
            random_state=random_state,
        )
        clf.fit(X, y)
        y_pred = clf.predict(X)

        return {
            "model": {"type": "random_forest", "n_estimators": n_estimators},
            "feature_importances": clf.feature_importances_.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class OneClassSVM(BaseScript):
    slug = "one_class_svm"
    nome = "One-Class SVM"
    familia = "05_classificacao_1d"
    descricao = "Detecção de novidades por SVM de uma classe (sklearn)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.svm import OneClassSVM as _OCSVM

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        kernel = params.get("kernel", "rbf")
        nu = params.get("nu", 0.05)
        gamma = params.get("gamma", "scale")

        if target_class is None:
            target_class = np.unique(y)[0]

        mask = y == target_class
        Xc = X[mask]

        clf = _OCSVM(kernel=kernel, nu=nu, gamma=gamma)
        clf.fit(Xc)

        # predict returns +1 (inlier) or -1 (outlier)
        raw_pred = clf.predict(X)
        y_pred = np.where(raw_pred == 1, target_class, f"not_{target_class}")
        decision = clf.decision_function(X)

        return {
            "model": {"type": "one_class_svm", "kernel": kernel, "nu": nu, "target_class": str(target_class)},
            "decision_scores": decision.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class PLSOC(BaseScript):
    slug = "pls_oc"
    nome = "PLS One-Class"
    familia = "05_classificacao_1d"
    descricao = "One-class classifier via PLS com pseudo-negativos aleatórios."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from scipy.stats import chi2

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        n_comp = params.get("n_components", 3)
        alpha = params.get("alpha", 0.05)
        random_state = params.get("random_state", 42)

        if target_class is None:
            target_class = np.unique(y)[0]

        mask = y == target_class
        Xc = X[mask]

        # Generate pseudo-negatives as random permutations of the target data
        rng = np.random.default_rng(random_state)
        n_neg = max(Xc.shape[0], 10)
        X_neg = rng.permutation(Xc.ravel()).reshape(n_neg, Xc.shape[1]) if Xc.shape[0] > 1 else rng.normal(size=(n_neg, Xc.shape[1]))

        X_train = np.vstack([Xc, X_neg])
        y_train = np.array([1.0] * len(Xc) + [0.0] * n_neg)

        nc = min(n_comp, X_train.shape[0] - 1, X_train.shape[1])
        pls = PLSRegression(n_components=nc)
        pls.fit(X_train, y_train)

        scores_c = pls.transform(Xc)
        # Hotelling T² on calibration target scores
        mean_s = scores_c.mean(axis=0)
        cov_s = np.cov(scores_c.T) if nc > 1 else np.var(scores_c) * np.eye(1)
        try:
            cov_inv = np.linalg.inv(cov_s + np.eye(nc) * 1e-10)
        except np.linalg.LinAlgError:
            cov_inv = np.eye(nc)

        n_c = len(Xc)
        f_thresh = (nc * (n_c - 1) * (n_c + 1)) / (n_c * (n_c - nc)) * chi2.ppf(1 - alpha, nc) / nc if n_c > nc else chi2.ppf(1 - alpha, nc)

        scores_all = pls.transform(X)
        T2 = np.array([float((s - mean_s) @ cov_inv @ (s - mean_s)) for s in scores_all])
        y_pred = np.where(T2 <= f_thresh, target_class, f"not_{target_class}")

        return {
            "model": {"type": "pls_oc", "target_class": str(target_class), "n_components": nc},
            "threshold_T2": float(f_thresh),
            "T2_scores": T2.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class OCRF(BaseScript):
    slug = "oc_rf"
    nome = "OC-RF — One-Class Random Forest"
    familia = "05_classificacao_1d"
    descricao = "Random Forest one-class com pseudo-negativos sintéticos."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestClassifier

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        n_estimators = params.get("n_estimators", 100)
        threshold = params.get("threshold", 0.5)
        random_state = params.get("random_state", 42)

        if target_class is None:
            target_class = np.unique(y)[0]

        mask = y == target_class
        Xc = X[mask]
        n, p = Xc.shape

        rng = np.random.default_rng(random_state)
        # Synthetic negatives: sample each feature independently from its marginal distribution
        X_neg = np.column_stack([
            rng.choice(Xc[:, j], size=max(n, 10)) for j in range(p)
        ])
        # Shuffle rows to break correlations
        rng.shuffle(X_neg)

        X_train = np.vstack([Xc, X_neg])
        y_train = np.array([1] * n + [0] * len(X_neg))

        clf = RandomForestClassifier(
            n_estimators=n_estimators,
            random_state=random_state,
            class_weight="balanced",
        )
        clf.fit(X_train, y_train)

        # Probability of belonging to target class
        proba = clf.predict_proba(X)[:, list(clf.classes_).index(1)]
        y_pred = np.where(proba >= threshold, target_class, f"not_{target_class}")

        return {
            "model": {"type": "oc_rf", "target_class": str(target_class), "n_estimators": n_estimators},
            "membership_probability": proba.tolist(),
            "feature_importances": clf.feature_importances_.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }
