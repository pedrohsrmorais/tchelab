from __future__ import annotations


# ================================================================
# utils.py
# ================================================================
"""Utilitários Quimiométricos — Família 20"""
import numpy as np
from catalog.base import BaseScript


class MetricsAggregation(BaseScript):
    slug = "metrics_aggregation"
    nome = "Metrics Aggregation — Consolidação de Métricas"
    familia = "20_utilitarios"
    descricao = "Agrega e compara métricas de múltiplos modelos ou experimentos."

    def validate(self, inputs, params):
        results = self._require_key(inputs, "results")
        if not isinstance(results, list):
            raise ValueError("'results' deve ser lista de dicts com métricas.")

    def execute(self, inputs, params):
        results = inputs["results"]
        metric_names = params.get("metrics", None)
        sort_by = params.get("sort_by", None)

        all_keys = set()
        for r in results:
            all_keys.update(r.keys())

        if metric_names is None:
            numeric_keys = []
            for k in sorted(all_keys):
                if k in ("name", "model", "type"):
                    continue
                vals = [r.get(k) for r in results if r.get(k) is not None]
                if vals and all(isinstance(v, (int, float)) for v in vals):
                    numeric_keys.append(k)
            metric_names = numeric_keys

        summary = {}
        for m in metric_names:
            vals = [r.get(m) for r in results if r.get(m) is not None]
            if not vals:
                continue
            vals_arr = np.array(vals, dtype=float)
            summary[m] = {
                "mean": float(vals_arr.mean()),
                "std": float(vals_arr.std()),
                "min": float(vals_arr.min()),
                "max": float(vals_arr.max()),
                "values": vals_arr.tolist(),
            }

        sorted_results = results
        if sort_by and sort_by in {m for r in results for m in r}:
            sorted_results = sorted(results, key=lambda r: r.get(sort_by, np.inf))

        return {
            "model": {"type": "metrics_aggregation"},
            "summary": summary,
            "n_experiments": len(results),
            "sorted_results": sorted_results,
            "best_experiment": sorted_results[0] if sorted_results else None,
        }


class SpectrumSimulator(BaseScript):
    slug = "spectrum_simulator"
    nome = "Spectrum Simulator — Geração de Espectros Sintéticos"
    familia = "20_utilitarios"
    descricao = "Gera espectros sintéticos com picos gaussianos e ruído controlado."

    def validate(self, inputs, params):
        pass  # no required inputs — fully parameterized

    def execute(self, inputs, params):
        n_samples = params.get("n_samples", 10)
        n_vars = params.get("n_vars", 200)
        n_peaks = params.get("n_peaks", 3)
        snr = params.get("snr", 20.0)
        seed = params.get("seed", 42)

        rng = np.random.default_rng(seed)
        x = np.linspace(0, 1, n_vars)

        # Generate peak positions and widths
        peak_positions = rng.uniform(0.1, 0.9, n_peaks)
        peak_widths = rng.uniform(0.02, 0.08, n_peaks)
        peak_heights = rng.uniform(0.5, 1.0, n_peaks)

        # Base spectrum
        base = np.zeros(n_vars)
        for pos, width, height in zip(peak_positions, peak_widths, peak_heights):
            base += height * np.exp(-0.5 * ((x - pos) / width) ** 2)

        # Generate samples with random peak intensity variations
        X = np.zeros((n_samples, n_vars))
        y = np.zeros(n_samples)
        for i in range(n_samples):
            scale = rng.uniform(0.5, 1.5)
            X[i] = scale * base
            y[i] = scale * sum(peak_heights)

        # Add noise
        signal_power = np.mean(X ** 2)
        noise_std = np.sqrt(signal_power / snr) if snr > 0 else 0.0
        X += rng.normal(0, noise_std, X.shape)

        return {
            "model": {"type": "spectrum_simulator", "n_samples": n_samples, "n_vars": n_vars},
            "X": X.tolist(),
            "y": y.tolist(),
            "wavenumbers": x.tolist(),
            "peak_positions": peak_positions.tolist(),
            "snr_actual": float(signal_power / (noise_std ** 2 + 1e-12)),
        }


class UnitConverter(BaseScript):
    slug = "unit_converter"
    nome = "Unit Converter — Conversão de Unidades Espectrais"
    familia = "20_utilitarios"
    descricao = "Converte entre unidades espectrais: nm, cm⁻¹, eV, THz, μm."

    def validate(self, inputs, params):
        values = self._require_key(inputs, "values")
        from_unit = self._require_key(params, "from_unit")
        to_unit = self._require_key(params, "to_unit")
        valid = {"nm", "cm-1", "ev", "thz", "um"}
        if from_unit.lower() not in valid or to_unit.lower() not in valid:
            raise ValueError(f"Unidades devem ser um de: {valid}")

    def execute(self, inputs, params):
        values = np.asarray(inputs["values"], dtype=float)
        from_unit = params["from_unit"].lower()
        to_unit = params["to_unit"].lower()

        # Convert everything to nm first
        def to_nm(v, unit):
            if unit == "nm":
                return v
            elif unit == "um":
                return v * 1000.0
            elif unit == "cm-1":
                return 1e7 / v
            elif unit == "ev":
                return 1239.84193 / v
            elif unit == "thz":
                return (2.998e8 / (v * 1e12)) * 1e9
            return v

        def from_nm(v_nm, unit):
            if unit == "nm":
                return v_nm
            elif unit == "um":
                return v_nm / 1000.0
            elif unit == "cm-1":
                return 1e7 / v_nm
            elif unit == "ev":
                return 1239.84193 / v_nm
            elif unit == "thz":
                return (2.998e8 / (v_nm * 1e-9)) / 1e12
            return v_nm

        nm_values = to_nm(values, from_unit)
        result = from_nm(nm_values, to_unit)

        return {
            "model": {"type": "unit_converter", "from": from_unit, "to": to_unit},
            "converted": result.tolist(),
            "original": values.tolist(),
        }


class OutlierDetectionUtility(BaseScript):
    slug = "outlier_detection_utility"
    nome = "Outlier Detection Utility (Mahalanobis / Grubbs / IQR)"
    familia = "20_utilitarios"
    descricao = "Detecta amostras aberrantes por métodos clássicos."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser 1D ou 2D.")

    def execute(self, inputs, params):
        from scipy import stats

        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "mahalanobis")
        alpha = params.get("alpha", 0.05)

        if X.ndim == 1:
            X = X[:, np.newaxis]

        n, p = X.shape
        outlier_flags = np.zeros(n, dtype=bool)

        if method == "mahalanobis":
            mu = X.mean(axis=0)
            cov = np.cov(X.T) if p > 1 else np.array([[X.var()]])
            cov_inv = np.linalg.pinv(cov)
            distances = np.array([((x - mu) @ cov_inv @ (x - mu)) for x in X])
            threshold = float(stats.chi2.ppf(1 - alpha, df=p))
            outlier_flags = distances > threshold
            score = distances

        elif method == "grubbs":
            if p > 1:
                score = np.abs(X - X.mean(axis=0)).max(axis=1)
            else:
                x1d = X[:, 0]
                score = np.abs((x1d - x1d.mean()) / (x1d.std() + 1e-12))
            # Grubbs critical value (approximate)
            t_crit = stats.t.ppf(1 - alpha / (2 * n), df=n - 2)
            G_crit = ((n - 1) / np.sqrt(n)) * np.sqrt(t_crit ** 2 / (n - 2 + t_crit ** 2))
            outlier_flags = score > G_crit
            threshold = float(G_crit)

        else:  # IQR
            if p > 1:
                medians = np.median(X, axis=0)
                score = np.abs(X - medians).max(axis=1)
            else:
                score = X[:, 0]
            Q1, Q3 = np.percentile(score, [25, 75])
            IQR = Q3 - Q1
            threshold = float(Q3 + 1.5 * IQR)
            outlier_flags = score > threshold

        return {
            "model": {"type": f"outlier_{method}", "alpha": alpha},
            "outlier_flags": outlier_flags.tolist(),
            "scores": score.tolist() if hasattr(score, 'tolist') else list(score),
            "n_outliers": int(outlier_flags.sum()),
            "outlier_indices": np.where(outlier_flags)[0].tolist(),
            "threshold": threshold,
        }


class DataExportReport(BaseScript):
    slug = "data_export_report"
    nome = "Data Export & Report Summary"
    familia = "20_utilitarios"
    descricao = "Gera relatório de sumário de dados: estatísticas descritivas, correlações, distribuições."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        y = inputs.get("y", None)
        wavenumbers = inputs.get("wavenumbers", list(range(X.shape[1])))
        sample_names = inputs.get("sample_names", [f"sample_{i}" for i in range(X.shape[0])])
        include_correlation = params.get("include_correlation", False)

        n, p = X.shape

        # Descriptive statistics
        desc = {
            "n_samples": n,
            "n_variables": p,
            "mean_spectrum": X.mean(axis=0).tolist(),
            "std_spectrum": X.std(axis=0).tolist(),
            "min_spectrum": X.min(axis=0).tolist(),
            "max_spectrum": X.max(axis=0).tolist(),
            "per_sample_mean": X.mean(axis=1).tolist(),
            "per_sample_std": X.std(axis=1).tolist(),
        }

        # Missing values
        nan_count = int(np.isnan(X).sum())
        desc["missing_values"] = nan_count
        desc["missing_fraction"] = float(nan_count / (n * p))

        # Correlation matrix (optional, expensive for large p)
        if include_correlation and p <= 200:
            corr = np.corrcoef(X.T)
            desc["correlation_matrix"] = corr.tolist()

        result = {
            "model": {"type": "data_report"},
            "descriptive_statistics": desc,
            "wavenumbers": wavenumbers if isinstance(wavenumbers, list) else wavenumbers.tolist() if hasattr(wavenumbers, 'tolist') else list(wavenumbers),
            "sample_names": sample_names,
        }

        if y is not None:
            y_arr = np.asarray(y, dtype=float)
            result["y_statistics"] = {
                "mean": float(y_arr.mean()),
                "std": float(y_arr.std()),
                "min": float(y_arr.min()),
                "max": float(y_arr.max()),
                "median": float(np.median(y_arr)),
            }

        return result


class SpectralDatabaseSearch(BaseScript):
    slug = "spectral_database_search"
    nome = "Spectral Database Search (cosine similarity)"
    familia = "20_utilitarios"
    descricao = "Busca espectros semelhantes em base de dados por similaridade cosseno ou SAM."

    def validate(self, inputs, params):
        query = np.asarray(self._require_key(inputs, "query"))
        database = np.asarray(self._require_key(inputs, "database"))
        if query.ndim not in {1, 2}:
            raise ValueError("'query' deve ser 1D ou 2D.")
        if database.ndim != 2:
            raise ValueError("'database' deve ser 2D (n_refs, n_bands).")
        if (query.shape[-1] if query.ndim == 2 else query.shape[0]) != database.shape[1]:
            raise ValueError("query e database devem ter o mesmo número de variáveis.")

    def execute(self, inputs, params):
        query = np.asarray(inputs["query"], dtype=float)
        database = np.asarray(inputs["database"], dtype=float)
        db_names = inputs.get("db_names", [f"ref_{i}" for i in range(len(database))])
        metric = params.get("metric", "cosine")  # cosine or sam
        top_k = params.get("top_k", 5)

        if query.ndim == 1:
            queries = query[np.newaxis, :]
        else:
            queries = query

        def cosine_sim(q, db):
            q_n = q / (np.linalg.norm(q) + 1e-12)
            db_n = db / (np.linalg.norm(db, axis=1, keepdims=True) + 1e-12)
            return q_n @ db_n.T

        def sam_similarity(q, db):
            q_n = q / (np.linalg.norm(q) + 1e-12)
            db_n = db / (np.linalg.norm(db, axis=1, keepdims=True) + 1e-12)
            cos = np.clip(q_n @ db_n.T, -1, 1)
            angles = np.degrees(np.arccos(cos))
            return -angles  # higher = more similar

        all_results = []
        for q in queries:
            if metric == "cosine":
                sims = cosine_sim(q, database)
            else:
                sims = sam_similarity(q, database)
            ranking = np.argsort(sims)[::-1][:top_k]
            matches = [{"rank": int(k + 1), "index": int(ranking[k]),
                        "name": db_names[ranking[k]],
                        "score": float(sims[ranking[k]])} for k in range(len(ranking))]
            all_results.append(matches)

        return {
            "model": {"type": f"spectral_search_{metric}", "top_k": top_k},
            "results": all_results if query.ndim == 2 else all_results[0],
        }

