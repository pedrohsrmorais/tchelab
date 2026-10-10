"""Família 01 — Operações com Dados"""
from __future__ import annotations
import ast
from typing import Any
import numpy as np
from catalog.base import BaseScript


# ── Importação ──────────────────────────────────────────────────────────────

class Importacao(BaseScript):
    slug = "importacao"
    nome = "Importação de Dados"
    familia = "01_dados"
    descricao = "Lê arquivo externo (XLSX, CSV, NumPy, HDF5, Zarr) e retorna dataset."

    def validate(self, inputs, params):
        file_path = params.get("file_path") or inputs.get("file_path")
        if not file_path:
            raise ValueError("Parâmetro 'file_path' é obrigatório.")
        fmt = params.get("format", "auto")
        supported = {"auto", "xlsx", "csv", "npy", "npz", "hdf5", "h5", "zarr"}
        if fmt not in supported:
            raise ValueError(f"Formato '{fmt}' não suportado. Use: {supported}")

    def execute(self, inputs, params):
        import os
        file_path = params.get("file_path") or inputs.get("file_path")
        fmt = params.get("format", "auto")
        sample_axis = params.get("sample_axis", 0)
        dtype = params.get("dtype", "float64")
        if fmt == "auto":
            ext = os.path.splitext(file_path)[1].lower().lstrip(".")
            fmt = {"xlsx": "xlsx", "csv": "csv", "npy": "npy", "npz": "npz",
                   "h5": "hdf5", "hdf5": "hdf5", "zarr": "zarr"}.get(ext, "csv")
        if fmt == "csv":
            import pandas as pd
            data = pd.read_csv(file_path, sep=None, engine="python").values.astype(dtype)
        elif fmt == "xlsx":
            import pandas as pd
            data = pd.read_excel(file_path).values.astype(dtype)
        elif fmt == "npy":
            data = np.load(file_path).astype(dtype)
        elif fmt == "npz":
            npz = np.load(file_path)
            data = npz[list(npz.keys())[0]].astype(dtype)
        elif fmt in ("hdf5", "h5"):
            import h5py
            with h5py.File(file_path, "r") as f:
                data = f[list(f.keys())[0]][()].astype(dtype)
        elif fmt == "zarr":
            import zarr
            data = np.array(zarr.open(file_path, mode="r")).astype(dtype)
        else:
            raise ValueError(f"Formato não tratado: {fmt}")
        return {"dataset": data, "shape": list(data.shape), "dtype": str(data.dtype), "sample_axis": sample_axis}


# ── Limpeza e Missing ────────────────────────────────────────────────────────

class Limpeza(BaseScript):
    slug = "limpeza"
    nome = "Limpeza de Dados"
    familia = "01_dados"
    descricao = "Remove amostras ou variáveis com NaN, Inf ou variância zero."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        axis = params.get("axis", 0)
        if axis >= X.ndim:
            raise ValueError(f"axis={axis} inválido para array com {X.ndim} dimensões.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        axis = params.get("axis", 0)
        remove_nan = params.get("remove_nan", True)
        remove_inf = params.get("remove_inf", True)
        thr_var = params.get("threshold_zero_variance", 0.0)
        other_axes = tuple(i for i in range(X.ndim) if i != axis)
        mask = np.ones(X.shape[axis], dtype=bool)
        if remove_nan:
            mask &= ~np.any(np.isnan(X), axis=other_axes)
        if remove_inf:
            mask &= ~np.any(np.isinf(X), axis=other_axes)
        if thr_var is not None and thr_var >= 0:
            mask &= np.var(X, axis=other_axes) > thr_var
        removed = np.where(~mask)[0].tolist()
        return {"X_clean": np.take(X, np.where(mask)[0], axis=axis), "removed_indices": removed}


class TratamentoMissing(BaseScript):
    slug = "tratamento_missing"
    nome = "Tratamento de Valores Ausentes"
    familia = "01_dados"
    descricao = "Preenche ou remove valores ausentes (NaN)."
    _STRATEGIES = {"mean", "median", "zero", "interpolate", "drop"}

    def validate(self, inputs, params):
        self._require_key(inputs, "X")
        strategy = params.get("strategy", "mean")
        if strategy not in self._STRATEGIES:
            raise ValueError(f"strategy '{strategy}' inválido. Use: {self._STRATEGIES}")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        strategy = params.get("strategy", "mean")
        if strategy == "mean":
            col_mean = np.nanmean(X, axis=0)
            inds = np.where(np.isnan(X))
            X[inds] = np.take(col_mean, inds[1] if X.ndim > 1 else inds[0])
        elif strategy == "median":
            col_med = np.nanmedian(X, axis=0)
            inds = np.where(np.isnan(X))
            X[inds] = np.take(col_med, inds[1] if X.ndim > 1 else inds[0])
        elif strategy == "zero":
            X = np.nan_to_num(X, nan=0.0)
        elif strategy == "interpolate":
            for i in range(X.shape[0]):
                row = X[i]
                nans = np.isnan(row)
                if nans.any():
                    not_nan = ~nans
                    xp = np.where(not_nan)[0]
                    if len(xp) >= 2:
                        X[i, nans] = np.interp(np.where(nans)[0], xp, row[not_nan])
                    else:
                        X[i, nans] = 0.0
        elif strategy == "drop":
            mask = ~np.any(np.isnan(X), axis=tuple(range(1, X.ndim)))
            X = X[mask]
        return {"X_filled": X}


# ── Seleção ──────────────────────────────────────────────────────────────────

class SelecaoAmostras(BaseScript):
    slug = "selecao_amostras"
    nome = "Seleção de Amostras"
    familia = "01_dados"
    descricao = "Seleciona subconjunto de amostras por índice ou máscara booleana."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")
        if "indices" not in params and "mask" not in params:
            raise ValueError("Forneça 'indices' ou 'mask' nos parâmetros.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"])
        sample_axis = params.get("sample_axis", 0)
        idx = np.where(np.asarray(params["mask"], dtype=bool))[0] if "mask" in params else np.asarray(params["indices"], dtype=int)
        return {"X_sel": np.take(X, idx, axis=sample_axis)}


class SelecaoVariaveis(BaseScript):
    slug = "selecao_variaveis"
    nome = "Seleção de Variáveis"
    familia = "01_dados"
    descricao = "Seleciona subconjunto de variáveis por índice, range ou máscara."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")
        if "indices" not in params and "range" not in params and "mask" not in params:
            raise ValueError("Forneça 'indices', 'range' ou 'mask'.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"])
        mode_axis = params.get("mode", 1)
        if "mask" in params:
            idx = np.where(np.asarray(params["mask"], dtype=bool))[0]
        elif "indices" in params:
            idx = np.asarray(params["indices"], dtype=int)
        else:
            r = params["range"]
            idx = np.arange(r[0], r[1], r[2] if len(r) > 2 else 1)
        return {"X_sel": np.take(X, idx, axis=mode_axis), "selected_indices": idx.tolist()}


class KennardStone(BaseScript):
    slug = "kennard_stone"
    nome = "Separação Kennard-Stone"
    familia = "01_dados"
    descricao = (
        "Divide as amostras em calibração (treino), teste e, opcionalmente, "
        "validação, selecionando iterativamente a amostra mais distante "
        "(distância Euclidiana) das já escolhidas — maximiza a cobertura da "
        "variabilidade multivariada em vez de uma divisão aleatória. "
        "Determinístico: a mesma entrada sempre produz a mesma divisão."
    )

    @staticmethod
    def _resolve_count(params, int_key, frac_key, n, default_frac):
        """Resolve um tamanho de subconjunto a partir de params[int_key]
        (contagem absoluta) ou params[frac_key] (fração de n), nessa ordem
        de prioridade."""
        if params.get(int_key) is not None:
            return int(params[int_key])
        frac = params.get(frac_key, default_frac)
        if not (0 <= frac < 1):
            raise ValueError(f"'{frac_key}' deve estar entre 0 e 1 (exclusivo), recebido {frac}.")
        return int(round(frac * n))

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"), dtype=float)
        sample_axis = params.get("sample_axis", 0)
        if sample_axis >= X.ndim or sample_axis < 0:
            raise ValueError(f"sample_axis={sample_axis} inválido para array com {X.ndim} dimensões.")

        n = X.shape[sample_axis]
        if n < 3:
            raise ValueError(f"Kennard-Stone exige pelo menos 3 amostras no eixo de amostras (recebido {n}).")

        n_train = self._resolve_count(params, "n_train", "train_size", n, default_frac=0.7)
        n_val = self._resolve_count(params, "n_validation", "validation_size", n, default_frac=0.0)

        if n_train < 2:
            raise ValueError(f"O conjunto de treino/calibração precisa ter ao menos 2 amostras (resultou em {n_train}).")
        if n_val < 0:
            raise ValueError("O tamanho do conjunto de validação não pode ser negativo.")
        if n_train + n_val >= n:
            raise ValueError(
                f"train+validation ({n_train + n_val}) deve ser menor que o total de amostras ({n}), "
                "para sobrar ao menos 1 amostra no conjunto de teste."
            )

    @staticmethod
    def _ks_order(X2d):
        """Ordem de seleção Kennard-Stone completa (do mais prioritário ao
        menos prioritário), via farthest-point / max-min distance sobre
        distância Euclidiana."""
        from scipy.spatial.distance import pdist, squareform
        n = X2d.shape[0]
        D = squareform(pdist(X2d, metric="euclidean"))

        i0, j0 = np.unravel_index(np.argmax(D), D.shape)
        selected = [int(i0), int(j0)]
        remaining = set(range(n)) - set(selected)

        min_dist = {k: min(D[k, selected[0]], D[k, selected[1]]) for k in remaining}
        while remaining:
            next_idx = max(remaining, key=lambda k: min_dist[k])
            selected.append(next_idx)
            remaining.remove(next_idx)
            for k in remaining:
                d = D[k, next_idx]
                if d < min_dist[k]:
                    min_dist[k] = d
        return selected

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        sample_axis = params.get("sample_axis", 0)
        n = X.shape[sample_axis]

        n_train = self._resolve_count(params, "n_train", "train_size", n, default_frac=0.7)
        n_val = self._resolve_count(params, "n_validation", "validation_size", n, default_frac=0.0)

        # Achata tudo exceto o eixo de amostras só para CALCULAR a distância —
        # os arrays de saída preservam o shape original, apenas filtrando o
        # eixo de amostras (igual a selecao_amostras).
        X_moved = np.moveaxis(X, sample_axis, 0)
        X2d = X_moved.reshape(n, -1)

        order = self._ks_order(X2d)
        train_idx = sorted(order[:n_train])
        rest_idx = order[n_train:]

        if n_val > 0:
            # Reaplica Kennard-Stone dentro do restante, para que a validação
            # também cubra bem a variabilidade do que sobrou — em vez de
            # pegar os próximos da ordem global, o que tenderia a concentrar
            # a validação perto do conjunto de treino.
            rest_X2d = X2d[rest_idx]
            rest_order_local = self._ks_order(rest_X2d) if len(rest_idx) >= 3 else list(range(len(rest_idx)))
            rest_order_global = [rest_idx[i] for i in rest_order_local]
            validation_idx = sorted(rest_order_global[:n_val])
            test_idx = sorted(rest_order_global[n_val:])
        else:
            validation_idx = []
            test_idx = sorted(rest_idx)

        def _take(idx_list):
            return np.take(X, np.asarray(idx_list, dtype=int), axis=sample_axis)

        outputs = {
            "train": _take(train_idx),
            "test": _take(test_idx),
            "train_indices": train_idx,
            "test_indices": test_idx,
        }
        if n_val > 0:
            outputs["validation"] = _take(validation_idx)
            outputs["validation_indices"] = validation_idx
        return outputs


# ── Reshape / Transform ──────────────────────────────────────────────────────

class Transpose(BaseScript):
    slug = "transpose"
    nome = "Transposição / Permutação de Eixos"
    familia = "01_dados"
    descricao = "Permuta os eixos do array."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        axes = params.get("axes")
        if axes is not None:
            axes = list(axes)
            if len(axes) != X.ndim:
                raise ValueError(f"len(axes)={len(axes)} ≠ ndim={X.ndim}.")
            if sorted(axes) != list(range(X.ndim)):
                raise ValueError(f"axes={axes} não é permutação válida.")

    def execute(self, inputs, params):
        return {"X_T": np.transpose(np.asarray(inputs["X"]), axes=params.get("axes"))}


class Reshape(BaseScript):
    slug = "reshape"
    nome = "Reshape"
    familia = "01_dados"
    descricao = "Altera a forma do array sem alterar a ordem dos elementos."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        new_shape = params.get("new_shape")
        if new_shape is None:
            raise ValueError("'new_shape' é obrigatório.")
        import math
        prod_in = math.prod(X.shape)
        prod_out = math.prod([s for s in new_shape if s != -1])
        if -1 not in new_shape and prod_in != prod_out:
            raise ValueError(f"prod(shape_in)={prod_in} ≠ prod(new_shape)={prod_out}.")

    def execute(self, inputs, params):
        return {"X_r": np.asarray(inputs["X"]).reshape(tuple(params["new_shape"]))}


class SliceArray(BaseScript):
    slug = "slice"
    nome = "Slice de Array"
    familia = "01_dados"
    descricao = "Seleciona parte de um ou mais eixos por range."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        for ax in params.get("ranges", {}):
            if int(ax) >= X.ndim:
                raise ValueError(f"Eixo {ax} inválido para ndim={X.ndim}.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"])
        slices = [slice(None)] * X.ndim
        for ax, r in params.get("ranges", {}).items():
            ax = int(ax)
            slices[ax] = slice(r[0] if len(r) > 0 else None, r[1] if len(r) > 1 else None, r[2] if len(r) > 2 else None)
        return {"X_sl": X[tuple(slices)]}


class Squeeze(BaseScript):
    slug = "squeeze"
    nome = "Squeeze"
    familia = "01_dados"
    descricao = "Remove eixos de tamanho 1."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        axis = params.get("axis")
        if axis is not None and X.shape[axis] != 1:
            raise ValueError(f"Eixo {axis} tem tamanho {X.shape[axis]} ≠ 1.")

    def execute(self, inputs, params):
        return {"X_sq": np.squeeze(np.asarray(inputs["X"]), axis=params.get("axis"))}


class ExpandDims(BaseScript):
    slug = "expand_dims"
    nome = "Expand Dims"
    familia = "01_dados"
    descricao = "Insere um eixo de tamanho 1."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")
        if "axis" not in params:
            raise ValueError("'axis' é obrigatório.")

    def execute(self, inputs, params):
        return {"X_exp": np.expand_dims(np.asarray(inputs["X"]), axis=int(params["axis"]))}


# ── Unfolding / Folding ──────────────────────────────────────────────────────

class Unfolding(BaseScript):
    slug = "unfolding"
    nome = "Unfolding (Tensor → Matriz)"
    familia = "01_dados"
    descricao = "Transforma tensor N-way em matriz 2D ao longo de um modo."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim < 2:
            raise ValueError("Unfolding requer tensor com ndim ≥ 2.")
        mode = params.get("mode", 0)
        if mode >= X.ndim:
            raise ValueError(f"mode={mode} inválido para ndim={X.ndim}.")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"])
        mode = params.get("mode", 0)
        ordering = params.get("ordering", "C")
        X_moved = np.moveaxis(X, mode, 0)
        rows = X_moved.shape[0]
        X_unf = X_moved.reshape(rows, X_moved.size // rows, order=ordering)
        return {"X_unf": X_unf, "original_shape": list(X.shape), "mode": mode}


class Folding(BaseScript):
    slug = "folding"
    nome = "Folding (Matriz → Tensor)"
    familia = "01_dados"
    descricao = "Operação inversa do unfolding. Reconstrói tensor a partir de matriz."

    def validate(self, inputs, params):
        self._require_key(inputs, "X_unf")
        if "original_shape" not in params:
            raise ValueError("'original_shape' é obrigatório.")
        import math
        orig = tuple(params["original_shape"])
        X_unf = np.asarray(inputs["X_unf"])
        if math.prod(orig) != X_unf.size:
            raise ValueError(f"prod(original_shape) ≠ X_unf.size.")

    def execute(self, inputs, params):
        X_unf = np.asarray(inputs["X_unf"])
        original_shape = tuple(params["original_shape"])
        mode = params.get("mode", 0)
        ordering = params.get("ordering", "C")
        shape_moved = (original_shape[mode],) + tuple(s for i, s in enumerate(original_shape) if i != mode)
        X_moved = X_unf.reshape(shape_moved, order=ordering)
        return {"X": np.moveaxis(X_moved, 0, mode)}


# ── Concatenação / Stack / Split ─────────────────────────────────────────────

class Concatenacao(BaseScript):
    slug = "concatenacao"
    nome = "Concatenação"
    familia = "01_dados"
    descricao = "Concatena dois ou mais arrays ao longo de um eixo existente."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        B = np.asarray(self._require_key(inputs, "B"))
        axis = params.get("axis", 0)
        if A.ndim != B.ndim:
            raise ValueError("A e B devem ter o mesmo número de dimensões.")
        for i, (sa, sb) in enumerate(zip(A.shape, B.shape)):
            if i != axis and sa != sb:
                raise ValueError(f"Eixo {i}: A({sa}) ≠ B({sb}).")

    def execute(self, inputs, params):
        arrays = [np.asarray(inputs["A"]), np.asarray(inputs["B"])]
        if "extra" in inputs:
            arrays += [np.asarray(e) for e in inputs["extra"]]
        return {"result": np.concatenate(arrays, axis=params.get("axis", 0))}


class Stack(BaseScript):
    slug = "stack"
    nome = "Stack"
    familia = "01_dados"
    descricao = "Empilha arrays adicionando um novo eixo."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        B = np.asarray(self._require_key(inputs, "B"))
        if A.shape != B.shape:
            raise ValueError(f"Shapes de A {A.shape} e B {B.shape} devem ser idênticos.")

    def execute(self, inputs, params):
        return {"result": np.stack([np.asarray(inputs["A"]), np.asarray(inputs["B"])], axis=params.get("axis", 0))}


class Split(BaseScript):
    slug = "split"
    nome = "Split"
    familia = "01_dados"
    descricao = "Divide array em partes ao longo de um eixo."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")
        if "indices_or_sections" not in params:
            raise ValueError("'indices_or_sections' é obrigatório.")

    def execute(self, inputs, params):
        parts = np.split(np.asarray(inputs["X"]), params["indices_or_sections"], axis=params.get("axis", 0))
        return {f"part_{i+1}": p for i, p in enumerate(parts)}


# ── Aritmética Elementar ─────────────────────────────────────────────────────

def _check_shapes(A, B):
    try:
        np.broadcast_shapes(A.shape, B.shape)
    except ValueError:
        raise ValueError(f"Shapes {A.shape} e {B.shape} incompatíveis.")


class Soma(BaseScript):
    slug = "soma"
    nome = "Soma Elemento a Elemento"
    familia = "01_dados"
    descricao = "Adição A + B."

    def validate(self, inputs, params):
        _check_shapes(np.asarray(self._require_key(inputs, "A")), np.asarray(self._require_key(inputs, "B")))

    def execute(self, inputs, params):
        return {"result": np.asarray(inputs["A"]) + np.asarray(inputs["B"])}


class Subtracao(BaseScript):
    slug = "subtracao"
    nome = "Subtração"
    familia = "01_dados"
    descricao = "Subtração A − B."

    def validate(self, inputs, params):
        _check_shapes(np.asarray(self._require_key(inputs, "A")), np.asarray(self._require_key(inputs, "B")))

    def execute(self, inputs, params):
        return {"result": np.asarray(inputs["A"]) - np.asarray(inputs["B"])}


class MultiplicacaoElementwise(BaseScript):
    slug = "multiplicacao_elementwise"
    nome = "Multiplicação Elemento a Elemento"
    familia = "01_dados"
    descricao = "Multiplicação A × B (elemento a elemento)."

    def validate(self, inputs, params):
        _check_shapes(np.asarray(self._require_key(inputs, "A")), np.asarray(self._require_key(inputs, "B")))

    def execute(self, inputs, params):
        return {"result": np.asarray(inputs["A"]) * np.asarray(inputs["B"])}


class DivisaoElementwise(BaseScript):
    slug = "divisao_elementwise"
    nome = "Divisão Elemento a Elemento"
    familia = "01_dados"
    descricao = "Divisão A / B."

    def validate(self, inputs, params):
        _check_shapes(np.asarray(self._require_key(inputs, "A")), np.asarray(self._require_key(inputs, "B")))

    def execute(self, inputs, params):
        return {"result": np.asarray(inputs["A"], dtype=float) / np.asarray(inputs["B"], dtype=float)}


# ── Álgebra Linear ────────────────────────────────────────────────────────────

class ProdutoMatricial(BaseScript):
    slug = "produto_matricial"
    nome = "Produto Matricial"
    familia = "01_dados"
    descricao = "Multiplicação matricial A @ B."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        B = np.asarray(self._require_key(inputs, "B"))
        if A.ndim < 2 or B.ndim < 2:
            raise ValueError("A e B devem ser matrizes (ndim ≥ 2).")
        if A.shape[-1] != B.shape[-2]:
            raise ValueError(f"A.shape[-1]={A.shape[-1]} ≠ B.shape[-2]={B.shape[-2]}.")

    def execute(self, inputs, params):
        return {"result": np.asarray(inputs["A"]) @ np.asarray(inputs["B"])}


class Inversa(BaseScript):
    slug = "inversa"
    nome = "Inversa de Matriz"
    familia = "01_dados"
    descricao = "Calcula A⁻¹. Exige A quadrada."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError(f"A deve ser quadrada, mas tem shape {A.shape}.")

    def execute(self, inputs, params):
        return {"A_inv": np.linalg.inv(np.asarray(inputs["A"], dtype=float))}


class PseudoInversa(BaseScript):
    slug = "pseudo_inversa"
    nome = "Pseudo-Inversa (Moore-Penrose)"
    familia = "01_dados"
    descricao = "Calcula a pseudo-inversa A⁺."

    def validate(self, inputs, params):
        self._require_key(inputs, "A")

    def execute(self, inputs, params):
        return {"A_pinv": np.linalg.pinv(np.asarray(inputs["A"], dtype=float))}


class Determinante(BaseScript):
    slug = "determinante"
    nome = "Determinante"
    familia = "01_dados"
    descricao = "Calcula det(A)."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError(f"A deve ser quadrada, mas tem shape {A.shape}.")

    def execute(self, inputs, params):
        return {"det": float(np.linalg.det(np.asarray(inputs["A"], dtype=float)))}


class Autovalores(BaseScript):
    slug = "autovalores"
    nome = "Autovalores"
    familia = "01_dados"
    descricao = "Calcula autovalores de A."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError("A deve ser quadrada.")

    def execute(self, inputs, params):
        vals = np.linalg.eigvals(np.asarray(inputs["A"], dtype=float))
        return {"eigenvalues": {"real": vals.real.tolist(), "imag": vals.imag.tolist()}}


class Autovetores(BaseScript):
    slug = "autovetores"
    nome = "Autovetores"
    familia = "01_dados"
    descricao = "Calcula autovetores de A (cada coluna = autovetor)."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError("A deve ser quadrada.")

    def execute(self, inputs, params):
        _, vecs = np.linalg.eig(np.asarray(inputs["A"], dtype=float))
        return {"eigenvectors": vecs}


class Eig(BaseScript):
    slug = "eig"
    nome = "EIG (autovalores + autovetores)"
    familia = "01_dados"
    descricao = "Retorna autovalores e autovetores juntos."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError("A deve ser quadrada.")

    def execute(self, inputs, params):
        vals, vecs = np.linalg.eig(np.asarray(inputs["A"], dtype=float))
        return {"eigenvalues": {"real": vals.real.tolist(), "imag": vals.imag.tolist()}, "eigenvectors": vecs}


class SVD(BaseScript):
    slug = "svd"
    nome = "SVD (Decomposição em Valores Singulares)"
    familia = "01_dados"
    descricao = "A = U Σ Vᵀ."

    def validate(self, inputs, params):
        self._require_key(inputs, "A")

    def execute(self, inputs, params):
        U, S, Vt = np.linalg.svd(np.asarray(inputs["A"], dtype=float), full_matrices=params.get("full_matrices", False))
        return {"U": U, "S": S, "Vt": Vt}


class Norma(BaseScript):
    slug = "norma"
    nome = "Norma"
    familia = "01_dados"
    descricao = "Calcula norma do array."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        axis = params.get("axis", None)
        result = np.linalg.norm(X, ord=params.get("ord", None), axis=axis)
        return {"result": result if axis is not None else float(result)}


class Trace(BaseScript):
    slug = "trace"
    nome = "Traço da Matriz"
    familia = "01_dados"
    descricao = "Soma dos elementos da diagonal principal."

    def validate(self, inputs, params):
        A = np.asarray(self._require_key(inputs, "A"))
        if A.ndim != 2 or A.shape[0] != A.shape[1]:
            raise ValueError("A deve ser quadrada.")

    def execute(self, inputs, params):
        return {"result": float(np.trace(np.asarray(inputs["A"], dtype=float)))}


class RankMatrix(BaseScript):
    slug = "rank"
    nome = "Posto da Matriz"
    familia = "01_dados"
    descricao = "Posto numérico da matriz."

    def validate(self, inputs, params):
        self._require_key(inputs, "A")

    def execute(self, inputs, params):
        return {"result": int(np.linalg.matrix_rank(np.asarray(inputs["A"], dtype=float), tol=params.get("tol")))}


# ── Estatísticas Descritivas ──────────────────────────────────────────────────

class Mean(BaseScript):
    slug = "mean"
    nome = "Média"
    familia = "01_dados"
    descricao = "Média ao longo de um ou mais eixos."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        return {"result": np.mean(X, axis=params.get("axis"), keepdims=params.get("keepdims", False))}


class Median(BaseScript):
    slug = "median"
    nome = "Mediana"
    familia = "01_dados"
    descricao = "Mediana ao longo de um ou mais eixos."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        return {"result": np.median(np.asarray(inputs["X"], dtype=float), axis=params.get("axis"), keepdims=params.get("keepdims", False))}


class Std(BaseScript):
    slug = "std"
    nome = "Desvio Padrão"
    familia = "01_dados"
    descricao = "Desvio padrão ao longo de um eixo."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        X = np.asarray(inputs["X"], dtype=float)
        return {"result": np.std(X, axis=params.get("axis"), keepdims=params.get("keepdims", False), ddof=params.get("ddof", 0))}


class Min(BaseScript):
    slug = "min"
    nome = "Mínimo"
    familia = "01_dados"
    descricao = "Valor mínimo ao longo de um eixo."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        return {"result": np.min(np.asarray(inputs["X"]), axis=params.get("axis"), keepdims=params.get("keepdims", False))}


class Max(BaseScript):
    slug = "max"
    nome = "Máximo"
    familia = "01_dados"
    descricao = "Valor máximo ao longo de um eixo."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        return {"result": np.max(np.asarray(inputs["X"]), axis=params.get("axis"), keepdims=params.get("keepdims", False))}


class Sum(BaseScript):
    slug = "sum"
    nome = "Soma"
    familia = "01_dados"
    descricao = "Soma ao longo de um eixo."

    def validate(self, inputs, params):
        self._require_key(inputs, "X")

    def execute(self, inputs, params):
        return {"result": np.sum(np.asarray(inputs["X"]), axis=params.get("axis"), keepdims=params.get("keepdims", False))}


# ── Fórmula Customizada ───────────────────────────────────────────────────────

_ALLOWED_NODES = {
    ast.Module, ast.Expr, ast.Expression,
    ast.BinOp, ast.UnaryOp, ast.BoolOp,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.MatMult,
    ast.USub, ast.UAdd,
    ast.Num, ast.Constant,
    ast.Name, ast.Load,
    ast.Call, ast.Attribute,
    ast.IfExp, ast.Compare,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
}
_ALLOWED_FUNCS = {
    "sqrt": np.sqrt, "log": np.log, "log10": np.log10,
    "exp": np.exp, "abs": np.abs, "mean": np.mean,
    "std": np.std, "min": np.min, "max": np.max,
    "sum": np.sum, "transpose": np.transpose,
    "reshape": np.reshape, "norm": np.linalg.norm,
}
_FORBIDDEN_NAMES = {"os", "sys", "subprocess", "open", "exec", "eval",
                    "import", "__import__", "builtins", "globals", "locals",
                    "compile", "breakpoint"}


def _validate_ast(tree):
    for node in ast.walk(tree):
        if type(node) not in _ALLOWED_NODES:
            raise ValueError(f"Nó AST proibido: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id in _FORBIDDEN_NAMES:
            raise ValueError(f"Identificador proibido: {node.id}")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError(f"Atributo dunder proibido: {node.attr}")


class FormulaCustomizada(BaseScript):
    slug = "formula_customizada"
    nome = "Fórmula Customizada"
    familia = "01_dados"
    descricao = "Executa expressão matemática controlada por whitelist AST."

    def validate(self, inputs, params):
        expression = params.get("expression")
        if not expression:
            raise ValueError("'expression' é obrigatório.")
        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as e:
            raise ValueError(f"Expressão inválida: {e}")
        _validate_ast(tree)

    def execute(self, inputs, params):
        expression = params["expression"]
        tree = ast.parse(expression, mode="eval")
        _validate_ast(tree)
        ns: dict = {**_ALLOWED_FUNCS}
        for key, val in inputs.items():
            ns[key] = np.asarray(val) if isinstance(val, (list, np.ndarray)) else val
        code = compile(tree, "<formula>", "eval")
        result = eval(code, {"__builtins__": {}}, ns)  # noqa: S307
        return {"result": result}
