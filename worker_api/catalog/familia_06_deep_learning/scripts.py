"""Deep Learning — Família 06"""
from __future__ import annotations
import numpy as np
from catalog.base import BaseScript


def _build_history_metrics(history):
    """Extract last-epoch metrics from a Keras History object."""
    out = {}
    for key, values in history.history.items():
        out[key] = float(values[-1])
    return out


class MLP(BaseScript):
    slug = "mlp"
    nome = "MLP — Multi-Layer Perceptron"
    familia = "06_deep_learning"
    descricao = "Rede neural densa (MLP) para regressão ou classificação."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        task = params.get("task", "regression")
        if task not in {"regression", "classification"}:
            raise ValueError("task deve ser 'regression' ou 'classification'.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        hidden_layers = params.get("hidden_layers", [64, 32])
        activation = params.get("activation", "relu")
        dropout = params.get("dropout", 0.0)
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)

        layers = [keras.layers.Input(shape=(X.shape[1],))]
        for units in hidden_layers:
            layers_block = [keras.layers.Dense(units, activation=activation)]
            if dropout > 0:
                layers_block.append(keras.layers.Dropout(dropout))
            for l in layers_block:
                if len(layers) == 1:
                    x = l(layers[-1])
                else:
                    x = l(x)

        # Build model
        inp = keras.layers.Input(shape=(X.shape[1],))
        x = inp
        for units in hidden_layers:
            x = keras.layers.Dense(units, activation=activation)(x)
            if dropout > 0:
                x = keras.layers.Dropout(dropout)(x)

        if task == "regression":
            out = keras.layers.Dense(1)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse", metrics=["mae"])
            y_fit = y.astype(float)
        else:
            classes = np.unique(y)
            n_cls = len(classes)
            label_map = {c: i for i, c in enumerate(classes)}
            y_idx = np.array([label_map[c] for c in y])
            if n_cls == 2:
                out = keras.layers.Dense(1, activation="sigmoid")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="binary_crossentropy", metrics=["accuracy"])
                y_fit = y_idx.astype(float)
            else:
                out = keras.layers.Dense(n_cls, activation="softmax")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="sparse_categorical_crossentropy", metrics=["accuracy"])
                y_fit = y_idx

        history = model.fit(X, y_fit, epochs=epochs, batch_size=batch_size, verbose=0)

        return {
            "model": {"type": "mlp", "hidden_layers": hidden_layers, "task": task},
            "history": _build_history_metrics(history),
        }


class CNN1D(BaseScript):
    slug = "cnn_1d"
    nome = "CNN-1D — Convolutional Neural Network 1D"
    familia = "06_deep_learning"
    descricao = "CNN 1D para espectros / séries temporais."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_samples, n_features).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)[..., np.newaxis]  # (N, L, 1)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        filters = params.get("filters", [32, 64])
        kernel_size = params.get("kernel_size", 5)
        pool_size = params.get("pool_size", 2)
        dense_units = params.get("dense_units", [64])
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)

        inp = keras.layers.Input(shape=X.shape[1:])
        x = inp
        for f in filters:
            x = keras.layers.Conv1D(f, kernel_size, activation="relu", padding="same")(x)
            x = keras.layers.MaxPooling1D(pool_size, padding="same")(x)
        x = keras.layers.Flatten()(x)
        for units in dense_units:
            x = keras.layers.Dense(units, activation="relu")(x)

        if task == "regression":
            out = keras.layers.Dense(1)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse", metrics=["mae"])
            y_fit = y.astype(float)
        else:
            classes = np.unique(y)
            n_cls = len(classes)
            label_map = {c: i for i, c in enumerate(classes)}
            y_idx = np.array([label_map[c] for c in y])
            if n_cls == 2:
                out = keras.layers.Dense(1, activation="sigmoid")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="binary_crossentropy", metrics=["accuracy"])
                y_fit = y_idx.astype(float)
            else:
                out = keras.layers.Dense(n_cls, activation="softmax")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="sparse_categorical_crossentropy", metrics=["accuracy"])
                y_fit = y_idx

        history = model.fit(X, y_fit, epochs=epochs, batch_size=batch_size, verbose=0)

        return {
            "model": {"type": "cnn_1d", "filters": filters, "kernel_size": kernel_size},
            "history": _build_history_metrics(history),
        }


class CNN2D(BaseScript):
    slug = "cnn_2d"
    nome = "CNN-2D — Convolutional Neural Network 2D"
    familia = "06_deep_learning"
    descricao = "CNN 2D para imagens hiperespectrais ou mapas 2D."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim not in {3, 4}:
            raise ValueError("X deve ser 3D (N,H,W) ou 4D (N,H,W,C).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)
        if X.ndim == 3:
            X = X[..., np.newaxis]  # add channel dim
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        filters = params.get("filters", [32, 64])
        kernel_size = params.get("kernel_size", 3)
        pool_size = params.get("pool_size", 2)
        dense_units = params.get("dense_units", [128])
        epochs = params.get("epochs", 30)
        batch_size = params.get("batch_size", 16)
        learning_rate = params.get("learning_rate", 1e-3)

        inp = keras.layers.Input(shape=X.shape[1:])
        x = inp
        for f in filters:
            x = keras.layers.Conv2D(f, kernel_size, activation="relu", padding="same")(x)
            x = keras.layers.MaxPooling2D(pool_size, padding="same")(x)
        x = keras.layers.Flatten()(x)
        for units in dense_units:
            x = keras.layers.Dense(units, activation="relu")(x)

        if task == "regression":
            out = keras.layers.Dense(1)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse", metrics=["mae"])
            y_fit = y.astype(float)
        else:
            classes = np.unique(y)
            n_cls = len(classes)
            label_map = {c: i for i, c in enumerate(classes)}
            y_idx = np.array([label_map[c] for c in y])
            if n_cls == 2:
                out = keras.layers.Dense(1, activation="sigmoid")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="binary_crossentropy", metrics=["accuracy"])
                y_fit = y_idx.astype(float)
            else:
                out = keras.layers.Dense(n_cls, activation="softmax")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="sparse_categorical_crossentropy", metrics=["accuracy"])
                y_fit = y_idx

        history = model.fit(X, y_fit, epochs=epochs, batch_size=batch_size, verbose=0)

        return {
            "model": {"type": "cnn_2d", "filters": filters, "kernel_size": kernel_size},
            "history": _build_history_metrics(history),
        }


class RNN(BaseScript):
    slug = "rnn"
    nome = "RNN — Recurrent Neural Network (LSTM / GRU)"
    familia = "06_deep_learning"
    descricao = "Rede recorrente LSTM ou GRU para séries temporais / espectros."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim not in {2, 3}:
            raise ValueError("X deve ser 2D (N,T) ou 3D (N,T,F).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")
        cell = params.get("cell", "lstm")
        if cell not in {"lstm", "gru"}:
            raise ValueError("cell deve ser 'lstm' ou 'gru'.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)
        if X.ndim == 2:
            X = X[:, :, np.newaxis]  # (N, T, 1)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        cell = params.get("cell", "lstm")
        units = params.get("units", [64])
        dense_units = params.get("dense_units", [32])
        dropout = params.get("dropout", 0.0)
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)

        RNNCell = keras.layers.LSTM if cell == "lstm" else keras.layers.GRU

        inp = keras.layers.Input(shape=X.shape[1:])
        x = inp
        for i, u in enumerate(units):
            return_seq = i < len(units) - 1
            x = RNNCell(u, return_sequences=return_seq, dropout=dropout)(x)
        for u in dense_units:
            x = keras.layers.Dense(u, activation="relu")(x)

        if task == "regression":
            out = keras.layers.Dense(1)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse", metrics=["mae"])
            y_fit = y.astype(float)
        else:
            classes = np.unique(y)
            n_cls = len(classes)
            label_map = {c: i for i, c in enumerate(classes)}
            y_idx = np.array([label_map[c] for c in y])
            if n_cls == 2:
                out = keras.layers.Dense(1, activation="sigmoid")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="binary_crossentropy", metrics=["accuracy"])
                y_fit = y_idx.astype(float)
            else:
                out = keras.layers.Dense(n_cls, activation="softmax")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="sparse_categorical_crossentropy", metrics=["accuracy"])
                y_fit = y_idx

        history = model.fit(X, y_fit, epochs=epochs, batch_size=batch_size, verbose=0)

        return {
            "model": {"type": f"rnn_{cell}", "units": units},
            "history": _build_history_metrics(history),
        }


class Autoencoder(BaseScript):
    slug = "autoencoder"
    nome = "Autoencoder (Dense / Variacional)"
    familia = "06_deep_learning"
    descricao = "Autoencoder denso para redução de dimensão / detecção de anomalias."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_samples, n_features).")
        variant = params.get("variant", "standard")
        if variant not in {"standard", "variational"}:
            raise ValueError("variant deve ser 'standard' ou 'variational'.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)
        variant = params.get("variant", "standard")
        latent_dim = params.get("latent_dim", 8)
        encoder_layers = params.get("encoder_layers", [64, 32])
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)
        n_features = X.shape[1]

        if variant == "standard":
            inp = keras.layers.Input(shape=(n_features,))
            x = inp
            for u in encoder_layers:
                x = keras.layers.Dense(u, activation="relu")(x)
            latent = keras.layers.Dense(latent_dim, activation="relu", name="latent")(x)
            x = latent
            for u in reversed(encoder_layers):
                x = keras.layers.Dense(u, activation="relu")(x)
            out = keras.layers.Dense(n_features)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse")
            history = model.fit(X, X, epochs=epochs, batch_size=batch_size, verbose=0)

            encoder_model = keras.Model(inp, latent)
            latent_repr = encoder_model.predict(X, verbose=0)
            X_rec = model.predict(X, verbose=0)
            reconstruction_error = float(np.mean(np.sum((X - X_rec) ** 2, axis=1)))

        else:  # variational
            class Sampling(keras.layers.Layer):
                def call(self, inputs):
                    z_mean, z_log_var = inputs
                    batch = tf.shape(z_mean)[0]
                    dim = tf.shape(z_mean)[1]
                    epsilon = tf.random.normal(shape=(batch, dim))
                    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

            inp = keras.layers.Input(shape=(n_features,))
            x = inp
            for u in encoder_layers:
                x = keras.layers.Dense(u, activation="relu")(x)
            z_mean = keras.layers.Dense(latent_dim, name="z_mean")(x)
            z_log_var = keras.layers.Dense(latent_dim, name="z_log_var")(x)
            z = Sampling()([z_mean, z_log_var])
            x = z
            for u in reversed(encoder_layers):
                x = keras.layers.Dense(u, activation="relu")(x)
            out = keras.layers.Dense(n_features)(x)

            model = keras.Model(inp, out)
            # Add KL loss
            kl_loss = -0.5 * tf.reduce_mean(z_log_var - tf.square(z_mean) - tf.exp(z_log_var) + 1)
            model.add_loss(kl_loss)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse")
            history = model.fit(X, X, epochs=epochs, batch_size=batch_size, verbose=0)

            enc_model = keras.Model(inp, z_mean)
            latent_repr = enc_model.predict(X, verbose=0)
            X_rec = model.predict(X, verbose=0)
            reconstruction_error = float(np.mean(np.sum((X - X_rec) ** 2, axis=1)))

        return {
            "model": {"type": f"autoencoder_{variant}", "latent_dim": latent_dim},
            "latent": latent_repr.tolist(),
            "reconstruction_error": reconstruction_error,
            "history": _build_history_metrics(history),
        }


class Transformer(BaseScript):
    slug = "transformer"
    nome = "Transformer — Self-Attention 1D"
    familia = "06_deep_learning"
    descricao = "Transformer com multi-head self-attention para espectros / séries."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        y = self._require_key(inputs, "y")
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_samples, sequence_length).")
        if X.shape[0] != len(y):
            raise ValueError("X e y têm número diferente de amostras.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)[..., np.newaxis]  # (N, L, 1)
        y = np.asarray(inputs["y"])
        task = params.get("task", "regression")
        n_heads = params.get("n_heads", 4)
        d_model = params.get("d_model", 32)
        ff_dim = params.get("ff_dim", 64)
        n_blocks = params.get("n_blocks", 2)
        dense_units = params.get("dense_units", [64])
        dropout = params.get("dropout", 0.1)
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)

        def transformer_block(x, heads, d, ff, drop):
            attn = keras.layers.MultiHeadAttention(num_heads=heads, key_dim=d // max(heads, 1))(x, x)
            attn = keras.layers.Dropout(drop)(attn)
            x = keras.layers.LayerNormalization()(x + attn)
            ffn = keras.layers.Dense(ff, activation="relu")(x)
            ffn = keras.layers.Dense(x.shape[-1])(ffn)
            ffn = keras.layers.Dropout(drop)(ffn)
            return keras.layers.LayerNormalization()(x + ffn)

        inp = keras.layers.Input(shape=X.shape[1:])
        x = keras.layers.Dense(d_model)(inp)  # project to d_model
        for _ in range(n_blocks):
            x = transformer_block(x, n_heads, d_model, ff_dim, dropout)
        x = keras.layers.GlobalAveragePooling1D()(x)
        for u in dense_units:
            x = keras.layers.Dense(u, activation="relu")(x)

        if task == "regression":
            out = keras.layers.Dense(1)(x)
            model = keras.Model(inp, out)
            model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse", metrics=["mae"])
            y_fit = y.astype(float)
        else:
            classes = np.unique(y)
            n_cls = len(classes)
            label_map = {c: i for i, c in enumerate(classes)}
            y_idx = np.array([label_map[c] for c in y])
            if n_cls == 2:
                out = keras.layers.Dense(1, activation="sigmoid")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="binary_crossentropy", metrics=["accuracy"])
                y_fit = y_idx.astype(float)
            else:
                out = keras.layers.Dense(n_cls, activation="softmax")(x)
                model = keras.Model(inp, out)
                model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                               loss="sparse_categorical_crossentropy", metrics=["accuracy"])
                y_fit = y_idx

        history = model.fit(X, y_fit, epochs=epochs, batch_size=batch_size, verbose=0)

        return {
            "model": {"type": "transformer", "n_heads": n_heads, "d_model": d_model, "n_blocks": n_blocks},
            "history": _build_history_metrics(history),
        }


class DiffusionModel(BaseScript):
    slug = "diffusion"
    nome = "Diffusion Model — Denoising Spectral Diffusion"
    familia = "06_deep_learning"
    descricao = "Modelo de difusão para denoising ou augmentação de espectros."

    def validate(self, inputs, params):
        X = np.asarray(self._require_key(inputs, "X"))
        if X.ndim != 2:
            raise ValueError("X deve ser 2D (n_samples, n_features).")
        task = params.get("task", "denoise")
        if task not in {"denoise", "augment"}:
            raise ValueError("task deve ser 'denoise' ou 'augment'.")

    def execute(self, inputs, params):
        import tensorflow as tf
        from tensorflow import keras

        X = np.asarray(inputs["X"], dtype=float)
        task = params.get("task", "denoise")
        T = params.get("T", 100)          # diffusion steps
        hidden_units = params.get("hidden_units", [128, 128])
        epochs = params.get("epochs", 50)
        batch_size = params.get("batch_size", 32)
        learning_rate = params.get("learning_rate", 1e-3)
        n_augment = params.get("n_augment", X.shape[0])

        n_feat = X.shape[1]

        # Linear noise schedule
        beta = np.linspace(1e-4, 0.02, T)
        alpha = 1.0 - beta
        alpha_cumprod = np.cumprod(alpha)

        def add_noise(x, t_idx):
            sqrt_ac = np.sqrt(alpha_cumprod[t_idx])
            sqrt_1_ac = np.sqrt(1 - alpha_cumprod[t_idx])
            noise = np.random.randn(*x.shape)
            return sqrt_ac * x + sqrt_1_ac * noise, noise

        # Build denoising U-Net (simplified dense version)
        def build_denoiser():
            x_inp = keras.layers.Input(shape=(n_feat,))
            t_inp = keras.layers.Input(shape=(1,))
            t_emb = keras.layers.Dense(16, activation="relu")(t_inp)
            x = keras.layers.Concatenate()([x_inp, t_emb])
            for u in hidden_units:
                x = keras.layers.Dense(u, activation="relu")(x)
            out = keras.layers.Dense(n_feat)(x)
            return keras.Model([x_inp, t_inp], out)

        denoiser = build_denoiser()
        denoiser.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse")

        # Train: sample random t, add noise, predict noise
        n = X.shape[0]
        all_loss = []
        for epoch in range(epochs):
            idx = np.random.randint(0, n, batch_size)
            x_batch = X[idx]
            t_batch = np.random.randint(0, T, batch_size)
            x_noisy_list, noise_list = [], []
            for i, t_i in enumerate(t_batch):
                x_n, eps = add_noise(x_batch[i:i+1], t_i)
                x_noisy_list.append(x_n)
                noise_list.append(eps)
            x_noisy = np.vstack(x_noisy_list)
            noise_true = np.vstack(noise_list)
            t_norm = (t_batch / T).reshape(-1, 1)
            loss = denoiser.train_on_batch([x_noisy, t_norm], noise_true)
            all_loss.append(float(loss))

        if task == "denoise":
            # Reverse diffusion from noisy X (T/2 steps)
            x_out = X + 0.1 * np.random.randn(*X.shape)
            for t_i in range(T // 2, -1, -1):
                t_norm = np.full((len(x_out), 1), t_i / T)
                eps_pred = denoiser.predict([x_out, t_norm], verbose=0)
                b = beta[t_i] if t_i < T else beta[-1]
                a = alpha[t_i] if t_i < T else alpha[-1]
                x_out = (x_out - b / np.sqrt(1 - alpha_cumprod[min(t_i, T-1)]) * eps_pred) / np.sqrt(a)
            result_key = "X_denoised"
            result_val = x_out.tolist()
        else:
            # Augment: sample from noise and run full reverse chain
            x_out = np.random.randn(n_augment, n_feat)
            for t_i in range(T - 1, -1, -1):
                t_norm = np.full((n_augment, 1), t_i / T)
                eps_pred = denoiser.predict([x_out, t_norm], verbose=0)
                b = beta[t_i]
                a = alpha[t_i]
                x_out = (x_out - b / np.sqrt(max(1 - alpha_cumprod[t_i], 1e-8)) * eps_pred) / np.sqrt(a)
                if t_i > 0:
                    x_out += np.sqrt(b) * np.random.randn(*x_out.shape)
            result_key = "X_augmented"
            result_val = x_out.tolist()

        return {
            "model": {"type": "diffusion", "T": T, "task": task},
            result_key: result_val,
            "training_loss": {"final_loss": float(np.mean(all_loss[-10:]))},
        }
