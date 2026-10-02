"""Análise Exploratória — Família 03"""
from __future__ import annotations
from typing import Any
import numpy as np
from catalog.base import BaseScript


class PCA(BaseScript):
    slug = "pca"
    nome = "PCA — Análise de Componentes Principais"
    familia = "03_exploratoria"
    descricao = "Decompõe X em scores e loadings por SVD."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from sklearn.decomposition import PCA as SKPCA
        X = np.asarray(inputs["X"], dtype=float)
        n_components = params.get("n_components", None)
        center = params.get("center", True)
        scale = params.get("scale", False)

        if n_components == "auto":
            n_components = None

        if center:
            X = X - np.mean(X, axis=0)
        if scale:
            std = np.std(X, axis=0, ddof=1)
            std = np.where(std == 0, 1.0, std)
            X = X / std

        pca = SKPCA(n_components=n_components)
        scores = pca.fit_transform(X)

        return {
            "scores": scores,
            "loadings": pca.components_.T,
            "explained_variance": pca.explained_variance_.tolist(),
            "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        }


class HCA(BaseScript):
    slug = "hca"
    nome = "HCA — Agrupamento Hierárquico"
    familia = "03_exploratoria"
    descricao = "Análise de agrupamento hierárquico com linkage e dendrograma."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from scipy.cluster.hierarchy import linkage, dendrogram
        from scipy.spatial.distance import pdist

        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "ward")
        metric = params.get("metric", "euclidean")

        if method == "ward" and metric != "euclidean":
            metric = "euclidean"  # Ward requires euclidean

        dist = pdist(X, metric=metric)
        Z = linkage(dist, method=method)
        dend = dendrogram(Z, no_plot=True)

        return {
            "linkage_matrix": Z.tolist(),
            "dendrogram_data": {
                "icoord": dend["icoord"],
                "dcoord": dend["dcoord"],
                "leaves": dend["leaves"],
                "color_list": dend["color_list"],
            },
        }


class KMeans(BaseScript):
    slug = "kmeans"
    nome = "K-Means"
    familia = "03_exploratoria"
    descricao = "Agrupamento K-Means."

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        n_clusters = params.get("n_clusters", 2)
        if n_clusters < 2:
            raise ValueError("n_clusters deve ser ≥ 2.")
        if n_clusters >= X.shape[0]:
            raise ValueError("n_clusters deve ser < número de amostras.")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        from sklearn.cluster import KMeans as SKKMeans
        X = np.asarray(inputs["X"], dtype=float)
        n_clusters = params.get("n_clusters", 2)
        n_init = params.get("n_init", 10)
        random_state = params.get("random_state", 42)

        km = SKKMeans(n_clusters=n_clusters, n_init=n_init, random_state=random_state)
        labels = km.fit_predict(X)

        return {
            "labels": labels.tolist(),
            "centroids": km.cluster_centers_,
            "inertia": float(km.inertia_),
        }


class OutlierDetection(BaseScript):
    slug = "outlier_detection"
    nome = "Detecção de Outliers"
    familia = "03_exploratoria"
    descricao = "Detecta outliers por Mahalanobis, Hotelling T² ou Isolation Forest."

    _METHODS = {"mahalanobis", "hotelling", "isolation_forest"}

    def validate(self, inputs: dict[str, Any], params: dict[str, Any]) -> None:
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        m = params.get("method", "hotelling")
        if m not in self._METHODS:
            raise ValueError(f"method '{m}' inválido. Use: {self._METHODS}")

    def execute(self, inputs: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "hotelling")
        alpha = params.get("alpha", 0.05)

        n, p = X.shape

        if method in ("mahalanobis", "hotelling"):
            mean = np.mean(X, axis=0)
            cov = np.cov(X.T)
            try:
                cov_inv = np.linalg.inv(cov + 1e-10 * np.eye(p))
            except np.linalg.LinAlgError:
                cov_inv = np.linalg.pinv(cov)

            diff = X - mean
            scores = np.array([diff[i] @ cov_inv @ diff[i] for i in range(n)])

            if method == "hotelling":
                # Scale to F distribution threshold
                from scipy.stats import chi2
                threshold = chi2.ppf(1 - alpha, df=p)
            else:
                from scipy.stats import chi2
                threshold = chi2.ppf(1 - alpha, df=p)

            outlier_mask = scores > threshold

        elif method == "isolation_forest":
            from sklearn.ensemble import IsolationForest
            clf = IsolationForest(contamination=alpha, random_state=42)
            pred = clf.fit_predict(X)
            scores = -clf.score_samples(X)
            threshold = float(np.percentile(scores, (1 - alpha) * 100))
            outlier_mask = pred == -1

        return {
            "outlier_mask": outlier_mask.tolist(),
            "scores_": scores.tolist(),
            "threshold": float(threshold),
        }
