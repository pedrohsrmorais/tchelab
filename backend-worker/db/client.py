from __future__ import annotations

import json
import mysql.connector
import numpy as np
from config import settings


def get_connection():
    return mysql.connector.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_db,
    )


async def load_dataset(
    dataset_id: int,
    selected_vars: list | None = None,
    mode: str = "classification",    # "classification" | "regression" | "multivariate" | "exploratory"
    target_property: str | None = None,
):
    """
    Carrega dataset do MySQL via tabela dataset_spectra + spectra.
    Retorna (X, y, x_axis).

    Modos:
    - classification : y = lista de strings (sample_class)
    - regression     : y = array de floats  (reference_value)
    - multivariate   : y = array de floats  (reference_values[target_property])
    - exploratory    : y = None
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # ── Busca espectros na ordem do dataset ───────────────────────────
        cursor.execute(
            """
            SELECT
                ds.position,
                s.name       AS sample_name,
                s.sample_class,
                s.x_values,
                s.y_values,
                s.reference_value,
                s.reference_values
            FROM dataset_spectra ds
            JOIN spectra s ON s.id = ds.spectrum_id
            WHERE ds.dataset_id = %s
              AND s.deleted_at IS NULL
            ORDER BY ds.position
            """,
            (dataset_id,)
        )
        rows = cursor.fetchall()

        if not rows:
            raise ValueError(f"Dataset {dataset_id} não tem espectros.")

        # ── Eixo X do primeiro espectro (todos devem ser iguais) ──────────
        first_x = rows[0]["x_values"]
        if isinstance(first_x, str):
            first_x = json.loads(first_x)
        x_axis = [float(v) for v in first_x]

        X_list = []
        y_list = []

        for r in rows:
            # Espectro
            y_vals = r["y_values"]
            if isinstance(y_vals, str):
                y_vals = json.loads(y_vals)
            y_vals = [float(v) for v in y_vals]

            if selected_vars is not None:
                y_vals = [y_vals[i] for i in selected_vars]

            X_list.append(y_vals)

            # Target
            if mode == "classification":
                y_list.append(r["sample_class"])

            elif mode == "regression":
                v = r["reference_value"]
                if v is None:
                    raise ValueError(
                        f"Espectro na posição {r['position']} ({r['sample_name']}) "
                        "não tem reference_value. Preencha antes de treinar."
                    )
                y_list.append(float(v))

            elif mode == "multivariate":
                if not target_property:
                    raise ValueError("target_property é obrigatório no modo multivariate.")
                rv = r["reference_values"]
                if isinstance(rv, str):
                    rv = json.loads(rv)
                if rv is None or target_property not in rv:
                    raise ValueError(
                        f"Espectro na posição {r['position']} ({r['sample_name']}) "
                        f"não tem '{target_property}' em reference_values."
                    )
                y_list.append(float(rv[target_property]))

            # mode == "exploratory" → y_list fica vazio

        X = np.array(X_list, dtype=np.float64)
        y = y_list if y_list else None

        return X, y, x_axis

    finally:
        cursor.close()
        conn.close()