"""Classificação Multiway — Família 09"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript
from catalog.familia_05_classificacao_1d.scripts import _clf_metrics


class MultilinearLDA(BaseScript):
    slug = "multilinear_lda"
    nome = "Multilinear LDA"
    familia = "09_multiway_classif"
    descricao = "LDA sobre tensor desdobrado (modo amostras)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp_pca = params.get("n_components_pca", 20)
        n_comp_lda = params.get("n_components_lda", None)

        n = X.shape[0]
        X2D = X.reshape(n, -1)

        # Reduce with PCA first to avoid singularity
        nc_pca = min(n_comp_pca, X2D.shape[0] - 1, X2D.shape[1])
        pca = PCA(n_components=nc_pca)
        X_pca = pca.fit_transform(X2D)

        lda = LinearDiscriminantAnalysis(n_components=n_comp_lda)
        lda.fit(X_pca, y)
        scores = lda.transform(X_pca)
        y_pred = lda.predict(X_pca)

        return {
            "model": {"type": "multilinear_lda"},
            "scores": scores.tolist(),
            "loadings": lda.scalings_.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class TensorSVM(BaseScript):
    slug = "tensor_svm"
    nome = "Tensor SVM"
    familia = "09_multiway_classif"
    descricao = "SVM sobre tensor desdobrado."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.svm import SVC
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp_pca = params.get("n_components_pca", 20)
        kernel = params.get("kernel", "rbf")
        C = params.get("C", 1.0)
        gamma = params.get("gamma", "scale")

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        nc = min(n_comp_pca, X2D.shape[0] - 1, X2D.shape[1])
        pca = PCA(n_components=nc)
        X_pca = pca.fit_transform(X2D)

        clf = SVC(kernel=kernel, C=C, gamma=gamma, probability=True)
        clf.fit(X_pca, y)
        y_pred = clf.predict(X_pca)

        return {
            "model": {"type": "tensor_svm", "kernel": kernel, "C": C},
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class TensorKNN(BaseScript):
    slug = "tensor_knn"
    nome = "Tensor KNN"
    familia = "09_multiway_classif"
    descricao = "KNN sobre tensor desdobrado."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.neighbors import KNeighborsClassifier

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_neighbors = params.get("n_neighbors", 5)
        metric = params.get("metric", "euclidean")

        n = X.shape[0]
        X2D = X.reshape(n, -1)

        clf = KNeighborsClassifier(n_neighbors=n_neighbors, metric=metric)
        clf.fit(X2D, y)
        y_pred = clf.predict(X2D)

        return {
            "model": {"type": "tensor_knn", "n_neighbors": n_neighbors},
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class TensorRandomForest(BaseScript):
    slug = "tensor_random_forest"
    nome = "Tensor Random Forest"
    familia = "09_multiway_classif"
    descricao = "Random Forest sobre tensor desdobrado."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_estimators = params.get("n_estimators", 100)
        n_comp_pca = params.get("n_components_pca", 20)
        random_state = params.get("random_state", 42)

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        nc = min(n_comp_pca, X2D.shape[0] - 1, X2D.shape[1])
        pca = PCA(n_components=nc)
        X_pca = pca.fit_transform(X2D)

        clf = RandomForestClassifier(n_estimators=n_estimators, random_state=random_state)
        clf.fit(X_pca, y)
        y_pred = clf.predict(X_pca)

        return {
            "model": {"type": "tensor_random_forest", "n_estimators": n_estimators},
            "feature_importances": clf.feature_importances_.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class MultiwayPLSDA(BaseScript):
    slug = "multiway_pls_da"
    nome = "Multiway PLS-DA"
    familia = "09_multiway_classif"
    descricao = "PLS-DA sobre tensor desdobrado."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.cross_decomposition import PLSRegression
        from sklearn.preprocessing import LabelBinarizer

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp = params.get("n_components", 3)

        n = X.shape[0]
        X2D = X.reshape(n, -1)

        lb = LabelBinarizer()
        Y_dummy = lb.fit_transform(y).astype(float)
        if Y_dummy.ndim == 1:
            Y_dummy = Y_dummy.reshape(-1, 1)

        nc = min(n_comp, X2D.shape[0] - 1, X2D.shape[1])
        pls = PLSRegression(n_components=nc)
        pls.fit(X2D, Y_dummy)
        scores = pls.transform(X2D)
        Y_pred = pls.predict(X2D)

        if Y_pred.shape[1] == 1:
            y_pred_idx = (Y_pred[:, 0] >= 0.5).astype(int)
        else:
            y_pred_idx = np.argmax(Y_pred, axis=1)

        y_pred = lb.classes_[y_pred_idx]

        return {
            "model": {"type": "multiway_pls_da", "n_components": nc},
            "scores": scores.tolist(),
            "classes": lb.classes_.tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }


class MultiwaySIMCA(BaseScript):
    slug = "multiway_simca"
    nome = "Multiway SIMCA"
    familia = "09_multiway_classif"
    descricao = "SIMCA aplicado sobre tensor desdobrado."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        n_comp = params.get("n_components", 3)
        alpha = params.get("alpha", 0.05)

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        classes = np.unique(y)
        models = {}
        thresholds = {}

        for cls in classes:
            mask = y == cls
            Xc = X2D[mask]
            nc = min(n_comp, Xc.shape[0] - 1, Xc.shape[1])
            pca = PCA(n_components=nc)
            pca.fit(Xc)
            X_rec = pca.inverse_transform(pca.transform(Xc))
            od = np.sum((Xc - X_rec) ** 2, axis=1)
            thresh = np.percentile(od, (1 - alpha) * 100)
            models[cls] = pca
            thresholds[cls] = float(thresh)

        y_pred = []
        for xi in X2D:
            best_cls, best_od = None, np.inf
            for cls in classes:
                scores_i = models[cls].transform(xi.reshape(1, -1))
                x_rec_i = models[cls].inverse_transform(scores_i)
                od = float(np.sum((xi - x_rec_i.ravel()) ** 2))
                if od < thresholds[cls] and od < best_od:
                    best_od = od
                    best_cls = cls
            y_pred.append(best_cls if best_cls is not None else "unknown")

        y_pred = np.array(y_pred)

        return {
            "model": {"type": "multiway_simca", "n_components": n_comp},
            "thresholds": thresholds,
            "classes": classes.tolist(),
            "metrics_cal": _clf_metrics(y, np.where(y_pred == "unknown", "__unknown__", y_pred)),
        }


class MultiwayOneClass(BaseScript):
    slug = "multiway_one_class"
    nome = "Multiway One-Class"
    familia = "09_multiway_classif"
    descricao = "One-class SVM sobre tensor desdobrado com pré-redução PCA."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim < 3:
            raise ValueError("X deve ser tensor de ordem >= 3.")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        from sklearn.svm import OneClassSVM
        from sklearn.decomposition import PCA

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        target_class = params.get("target_class", None)
        n_comp_pca = params.get("n_components_pca", 10)
        nu = params.get("nu", 0.05)
        kernel = params.get("kernel", "rbf")

        if target_class is None:
            target_class = np.unique(y)[0]

        n = X.shape[0]
        X2D = X.reshape(n, -1)
        mask = y == target_class
        Xc = X2D[mask]

        nc = min(n_comp_pca, Xc.shape[0] - 1, Xc.shape[1])
        pca = PCA(n_components=nc)
        Xc_pca = pca.fit_transform(Xc)

        clf = OneClassSVM(kernel=kernel, nu=nu)
        clf.fit(Xc_pca)

        X_all_pca = pca.transform(X2D)
        raw_pred = clf.predict(X_all_pca)
        y_pred = np.where(raw_pred == 1, target_class, f"not_{target_class}")

        return {
            "model": {"type": "multiway_one_class", "target_class": str(target_class)},
            "decision_scores": clf.decision_function(X_all_pca).tolist(),
            "metrics_cal": _clf_metrics(y, y_pred),
        }
