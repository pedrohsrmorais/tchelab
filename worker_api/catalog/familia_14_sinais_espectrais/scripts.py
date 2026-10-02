from __future__ import annotations


# ================================================================
# signal_processing.py
# ================================================================
"""Processamento de Sinais Espectrais — Família 14"""
import numpy as np
from catalog.base import BaseScript


class PeakDetection(BaseScript):
    slug = "peak_detection"
    nome = "Peak Detection — Detecção de Picos Espectrais"
    familia = "14_sinais_espectrais"
    descricao = "Detecta picos em espectro por prominence, height ou threshold."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser vetor 1D ou matriz 2D (n_samples, n_vars).")

    def execute(self, inputs, params):
        from scipy.signal import find_peaks

        X = np.asarray(inputs["X"], dtype=float)
        height = params.get("height", None)
        prominence = params.get("prominence", None)
        distance = params.get("distance", None)
        width = params.get("width", None)
        wavenumbers = inputs.get("wavenumbers", None)

        if X.ndim == 1:
            spectra = [X]
        else:
            spectra = X

        results = []
        for spectrum in spectra:
            peaks, props = find_peaks(
                spectrum,
                height=height,
                prominence=prominence,
                distance=distance,
                width=width,
            )
            entry = {"peak_indices": peaks.tolist()}
            if wavenumbers is not None:
                wn = np.asarray(wavenumbers)
                entry["peak_positions"] = wn[peaks].tolist()
            if "peak_heights" in props:
                entry["peak_heights"] = props["peak_heights"].tolist()
            if "prominences" in props:
                entry["prominences"] = props["prominences"].tolist()
            if "widths" in props:
                entry["widths"] = props["widths"].tolist()
            results.append(entry)

        return {
            "model": {"type": "peak_detection"},
            "results": results if X.ndim == 2 else results[0],
        }


class PeakAlignment(BaseScript):
    slug = "peak_alignment"
    nome = "Peak Alignment — Alinhamento de Picos (COW / icoshift)"
    familia = "14_sinais_espectrais"
    descricao = "Alinha espectros por correlação de janelas deslizantes (COW simplificado)."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D (n_samples, n_vars).")

    def execute(self, inputs, params):
        from scipy.signal import correlate

        X = np.asarray(inputs["X"], dtype=float)
        reference = params.get("reference", "mean")  # "mean" or index int
        max_shift = params.get("max_shift", 5)

        if reference == "mean":
            ref = X.mean(axis=0)
        else:
            ref = X[int(reference)]

        X_aligned = np.zeros_like(X)
        shifts = []
        for i, row in enumerate(X):
            corr = correlate(row, ref, mode="full")
            lag = corr.argmax() - (len(ref) - 1)
            lag = int(np.clip(lag, -max_shift, max_shift))
            shifts.append(lag)
            if lag > 0:
                X_aligned[i, lag:] = row[:-lag] if lag < len(row) else row
                X_aligned[i, :lag] = row[0]
            elif lag < 0:
                X_aligned[i, :lag] = row[-lag:]
                X_aligned[i, lag:] = row[-1]
            else:
                X_aligned[i] = row

        return {
            "model": {"type": "peak_alignment", "max_shift": max_shift},
            "X_aligned": X_aligned.tolist(),
            "shifts": shifts,
        }


class SpectrumDecomposition(BaseScript):
    slug = "spectrum_decomposition"
    nome = "Spectrum Decomposition (NMF / ICA / PCA)"
    familia = "14_sinais_espectrais"
    descricao = "Decompõe espectros em componentes puros via NMF, ICA ou PCA."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser matriz 2D.")
        method = params.get("method", "nmf")
        if method not in {"nmf", "ica", "pca"}:
            raise ValueError("method deve ser 'nmf', 'ica' ou 'pca'.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "nmf")
        n_comp = params.get("n_components", 3)
        nc = min(n_comp, X.shape[0] - 1, X.shape[1])

        if method == "nmf":
            from sklearn.decomposition import NMF
            model = NMF(n_components=nc, max_iter=300, random_state=42)
            W = model.fit_transform(np.clip(X, 0, None))
            H = model.components_
            components = H
            scores = W
        elif method == "ica":
            from sklearn.decomposition import FastICA
            model = FastICA(n_components=nc, random_state=42, max_iter=500)
            scores = model.fit_transform(X)
            components = model.components_
        else:
            from sklearn.decomposition import PCA
            model = PCA(n_components=nc)
            scores = model.fit_transform(X)
            components = model.components_

        return {
            "model": {"type": f"spectrum_decomposition_{method}", "n_components": nc},
            "scores": scores.tolist(),
            "components": components.tolist(),
        }


class NoiseEstimation(BaseScript):
    slug = "noise_estimation"
    nome = "Noise Estimation — Estimativa de Ruído Espectral"
    familia = "14_sinais_espectrais"
    descricao = "Estima nível de ruído por DU (Derivative method), SWSC ou regiões planas."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser vetor 1D ou matriz 2D.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        method = params.get("method", "derivative")

        if X.ndim == 1:
            spectra = X[np.newaxis, :]
        else:
            spectra = X

        noise_estimates = []
        for row in spectra:
            if method == "derivative":
                d = np.diff(row)
                noise = float(np.std(d) / np.sqrt(2))
            elif method == "swsc":
                # Sliding window std  (smallest window std)
                window = max(5, len(row) // 20)
                stds = [np.std(row[i:i+window]) for i in range(len(row) - window)]
                noise = float(np.min(stds)) if stds else float(np.std(row))
            else:
                noise = float(np.std(row))
            noise_estimates.append(noise)

        return {
            "model": {"type": f"noise_estimation_{method}"},
            "noise_levels": noise_estimates if X.ndim == 2 else noise_estimates[0],
            "mean_snr": float(np.mean(np.abs(spectra.mean(axis=0))) / (np.mean(noise_estimates) + 1e-12)),
        }


class FourierAnalysis(BaseScript):
    slug = "fourier_analysis"
    nome = "Fourier Analysis — FFT e Filtragem em Frequência"
    familia = "14_sinais_espectrais"
    descricao = "FFT e filtragem por corte de frequência em espectros / sinais."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim not in {1, 2}:
            raise ValueError("X deve ser vetor 1D ou matriz 2D.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        mode = params.get("mode", "transform")   # transform / lowpass / highpass
        cutoff = params.get("cutoff", 0.1)        # fraction of Nyquist

        if X.ndim == 1:
            spectra = X[np.newaxis, :]
        else:
            spectra = X

        n = spectra.shape[1]
        freqs = np.fft.rfftfreq(n)

        results = []
        for row in spectra:
            F = np.fft.rfft(row)
            if mode == "lowpass":
                mask = freqs <= cutoff
                F_filt = F * mask
                rec = np.fft.irfft(F_filt, n=n)
                results.append(rec.tolist())
            elif mode == "highpass":
                mask = freqs >= cutoff
                F_filt = F * mask
                rec = np.fft.irfft(F_filt, n=n)
                results.append(rec.tolist())
            else:
                results.append({"magnitude": np.abs(F).tolist(), "phase": np.angle(F).tolist()})

        return {
            "model": {"type": f"fourier_{mode}", "cutoff": cutoff},
            "frequencies": freqs.tolist(),
            "results": results if X.ndim == 2 else results[0],
        }

