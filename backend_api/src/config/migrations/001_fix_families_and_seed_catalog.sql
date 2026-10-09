-- =============================================================================
-- Migration 001 — Fix families, slugs, schema gaps & seed full catalog
-- TcheLab · MySQL 8.0+
-- =============================================================================
-- Run order matters: schema changes first, then seed corrections, then inserts.
-- Safe to run more than once (uses INSERT IGNORE / ON DUPLICATE KEY UPDATE).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. SCHEMA FIXES
-- -----------------------------------------------------------------------------

-- 1a. Add `is_custom` column to techniques (missing from original schema)
ALTER TABLE `techniques`
  ADD COLUMN IF NOT EXISTS `is_custom` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Script definido pelo usuário fora do catálogo oficial'
  AFTER `is_beta`;

-- 1b. Change datasets.sample_axis DEFAULT from 0 to NULL
--     (NULL = array sem eixo de amostras, 0 = eixo 0 é amostras — semânticas distintas)
ALTER TABLE `datasets`
  ALTER COLUMN `sample_axis` DROP DEFAULT;
ALTER TABLE `datasets`
  MODIFY COLUMN `sample_axis` TINYINT UNSIGNED DEFAULT NULL
    COMMENT 'Índice (0-based) do modo em `dimensions`/`mode_labels` que representa amostras. NULL = não existe eixo de amostras.';

-- 1c. Create missing table: projects
CREATE TABLE IF NOT EXISTS `projects` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid`        CHAR(36)        NOT NULL,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `name`        VARCHAR(255)    NOT NULL,
  `description` TEXT            DEFAULT NULL,
  `visibility`  ENUM('public','private') NOT NULL DEFAULT 'private',
  `status`      ENUM('active','archived') NOT NULL DEFAULT 'active',
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_projects_user` (`user_id`),
  KEY `idx_projects_status` (`status`),
  CONSTRAINT `fk_projects_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Projetos de pesquisa que agrupam datasets, workflows e artigos.';

-- 1d. Create missing table: project_datasets
CREATE TABLE IF NOT EXISTS `project_datasets` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  BIGINT UNSIGNED NOT NULL,
  `dataset_id`  BIGINT UNSIGNED NOT NULL,
  `added_by`    BIGINT UNSIGNED NOT NULL,
  `added_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_dataset` (`project_id`, `dataset_id`),
  KEY `idx_project_datasets_project`  (`project_id`),
  KEY `idx_project_datasets_dataset`  (`dataset_id`),
  CONSTRAINT `fk_project_datasets_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_datasets_dataset`
    FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_datasets_user`
    FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1e. Create missing table: project_members
CREATE TABLE IF NOT EXISTS `project_members` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  BIGINT UNSIGNED NOT NULL,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `role`        ENUM('viewer','collaborator','admin') NOT NULL DEFAULT 'collaborator',
  `joined_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_member` (`project_id`, `user_id`),
  KEY `idx_project_members_project` (`project_id`),
  KEY `idx_project_members_user`    (`user_id`),
  CONSTRAINT `fk_project_members_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1f. Create missing table: project_articles
CREATE TABLE IF NOT EXISTS `project_articles` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  BIGINT UNSIGNED NOT NULL,
  `article_id`  BIGINT UNSIGNED NOT NULL,
  `added_by`    BIGINT UNSIGNED NOT NULL,
  `added_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_article` (`project_id`, `article_id`),
  KEY `idx_project_articles_project` (`project_id`),
  KEY `idx_project_articles_article` (`article_id`),
  CONSTRAINT `fk_project_articles_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_articles_article`
    FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_articles_user`
    FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1g. Create missing table: project_history
CREATE TABLE IF NOT EXISTS `project_history` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  BIGINT UNSIGNED NOT NULL,
  `user_id`     BIGINT UNSIGNED DEFAULT NULL,
  `action`      VARCHAR(100) NOT NULL COMMENT 'Ex: created, renamed, dataset_added, member_invited',
  `entity_type` VARCHAR(100) DEFAULT NULL,
  `entity_id`   BIGINT UNSIGNED DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `metadata`    JSON DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_history_project` (`project_id`),
  KEY `idx_project_history_user`    (`user_id`),
  KEY `idx_project_history_created` (`created_at`),
  CONSTRAINT `fk_project_history_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_history_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Auditoria específica de projetos (complementa audit_logs com contexto de projeto).';

-- 1h. Create missing table: workflow_versions
CREATE TABLE IF NOT EXISTS `workflow_versions` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workflow_id`  BIGINT UNSIGNED NOT NULL,
  `version`      INT UNSIGNED NOT NULL DEFAULT 1,
  `definition`   JSON NOT NULL COMMENT 'Snapshot do grafo naquele momento (nós + arestas + parâmetros)',
  `label`        VARCHAR(255) DEFAULT NULL COMMENT 'Rótulo opcional (ex: "antes do refactor", "v2 com PCA")',
  `created_by`   BIGINT UNSIGNED DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_workflow_version` (`workflow_id`, `version`),
  KEY `idx_workflow_versions_workflow` (`workflow_id`),
  CONSTRAINT `fk_workflow_versions_workflow`
    FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_workflow_versions_user`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Histórico de versões de um workflow — cada edição pode gerar um snapshot.';


-- -----------------------------------------------------------------------------
-- 2. FIX EXISTING SEED DATA — correct wrong family values and slugs
-- -----------------------------------------------------------------------------

-- 2a. Fix family: '02_pre_processamento' → '02_preprocessamento'
UPDATE `techniques`
SET `family` = '02_preprocessamento',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `family` = '02_pre_processamento';

-- 2b. Fix family: '03_exploratoria_1d' → '03_exploratoria'
UPDATE `techniques`
SET `family` = '03_exploratoria',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `family` = '03_exploratoria_1d';

-- 2c. Fix family: '06_deep_learning_1d' → '06_deep_learning'
UPDATE `techniques`
SET `family` = '06_deep_learning',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `family` = '06_deep_learning_1d';

-- 2d. Fix family + slug: '14_validacao' / 'cross-validation' → '12_validacao_modelos' / 'cross_validation'
UPDATE `techniques`
SET `family` = '12_validacao_modelos',
    `slug`   = 'cross_validation',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `slug` = 'cross-validation';

-- 2e. Fix slug: 'savitzky-golay' → 'savitzky_golay'
UPDATE `techniques`
SET `slug` = 'savitzky_golay',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `slug` = 'savitzky-golay';

-- 2f. Fix slug: 'pls-da' → 'pls_da'
UPDATE `techniques`
SET `slug` = 'pls_da',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `slug` = 'pls-da';

-- 2g. Fix slug: 'random-forest' → 'random_forest'
UPDATE `techniques`
SET `slug` = 'random_forest',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `slug` = 'random-forest';


-- -----------------------------------------------------------------------------
-- 3. SEED ALL CATALOG SCRIPTS (all 20 families, ~100 scripts)
--    Uses INSERT IGNORE so re-running is safe.
--    UUIDs are deterministic (based on slug + family for reproducibility).
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO `techniques`
  (`uuid`,`name`,`slug`,`category`,`subcategory`,`family`,`description`,`active`)
VALUES

-- =========================================================
-- FAMÍLIA 01 — Dados
-- =========================================================
('b0000001-0000-0000-0000-000000000001','Dataset Upload','dataset_upload','input','upload','01_dados','Carrega arquivo de dados (CSV, Excel, MAT, HDF5) e cria um dataset.', 1),
('b0000001-0000-0000-0000-000000000002','Dataset Info','dataset_info','input','info','01_dados','Retorna metadados, shape e estatísticas básicas de um dataset.', 1),
('b0000001-0000-0000-0000-000000000003','Array Reshape','array_reshape','input','manipulation','01_dados','Remodela um array para shape especificado.', 1),
('b0000001-0000-0000-0000-000000000004','Array Transpose','array_transpose','input','manipulation','01_dados','Transpõe eixos de um array N-way.', 1),
('b0000001-0000-0000-0000-000000000005','Array Unfold','array_unfold','input','manipulation','01_dados','Desdobra (unfold) um tensor em matriz ao longo de um modo.', 1),
('b0000001-0000-0000-0000-000000000006','Array Concatenate','array_concatenate','input','manipulation','01_dados','Concatena datasets ao longo de um eixo especificado.', 1),
('b0000001-0000-0000-0000-000000000007','Dataset Split','dataset_split','input','split','01_dados','Divide dataset em treino/teste/validação.', 1),
('b0000001-0000-0000-0000-000000000008','Formula Customizada','formula_customizada','input','custom','01_dados','Aplica expressão matemática customizada (avaliador AST seguro).', 1),

-- =========================================================
-- FAMÍLIA 02 — Pré-processamento
-- =========================================================
-- snv e msc já existem (ids 2 e 3); normalization (id 5); savitzky_golay (id 4 após fix)
-- Inserindo os demais:
('b0000002-0000-0000-0000-000000000001','Mean Center','mean_center','preprocessing','scaling','02_preprocessamento','Centraliza os espectros na média.', 1),
('b0000002-0000-0000-0000-000000000002','Autoscale','autoscale','preprocessing','scaling','02_preprocessamento','Centraliza e escala pela desvio padrão (UV scaling).', 1),
('b0000002-0000-0000-0000-000000000003','Pareto Scaling','pareto_scaling','preprocessing','scaling','02_preprocessamento','Escala pela raiz quadrada do desvio padrão.', 1),
('b0000002-0000-0000-0000-000000000004','Baseline Correction','baseline_correction','preprocessing','baseline','02_preprocessamento','Corrige linha de base por polinômio ou rubberband.', 1),
('b0000002-0000-0000-0000-000000000005','Detrend','detrend','preprocessing','baseline','02_preprocessamento','Remove tendência linear ou constante dos espectros.', 1),
('b0000002-0000-0000-0000-000000000006','Smoothing','smoothing','preprocessing','smoothing_derivative','02_preprocessamento','Suavização por média móvel, mediana ou Gaussian.', 1),
('b0000002-0000-0000-0000-000000000007','OSC','osc','preprocessing','scatter_correction','02_preprocessamento','Orthogonal Signal Correction.', 1),
('b0000002-0000-0000-0000-000000000008','EMSC','emsc','preprocessing','scatter_correction','02_preprocessamento','Extended Multiplicative Scatter Correction.', 1),
('b0000002-0000-0000-0000-000000000009','Spectral Cropping','spectral_cropping','preprocessing','region_selection','02_preprocessamento','Recorta intervalo espectral.', 1),
('b0000002-0000-0000-0000-000000000010','Interpolation','interpolation','preprocessing','resampling','02_preprocessamento','Reamosta espectros para eixo comum por interpolação.', 1),
('b0000002-0000-0000-0000-000000000011','Nbet Correction','nbet_correction','preprocessing','baseline','02_preprocessamento','Correção NBET para dados de fluorescência.', 1),
('b0000002-0000-0000-0000-000000000012','Rayleigh Masking','rayleigh_masking','preprocessing','masking','02_preprocessamento','Mascara regiões de Rayleigh e Raman em matrizes EEM.', 1),

-- =========================================================
-- FAMÍLIA 03 — Análise Exploratória
-- =========================================================
-- pca já existe (id 6 após fix de família)
('b0000003-0000-0000-0000-000000000001','PCA Multiway','pca_multiway','exploratory','multiway','03_exploratoria','PCA em dados multiway via Tucker com R=1 por modo.', 1),
('b0000003-0000-0000-0000-000000000002','HOSVD','hosvd','exploratory','multiway','03_exploratoria','Higher-Order SVD para análise exploratória de tensores.', 1),
('b0000003-0000-0000-0000-000000000003','Cluster Analysis','cluster_analysis','exploratory','clustering','03_exploratoria','Agrupamento hierárquico ou k-means.', 1),
('b0000003-0000-0000-0000-000000000004','Outlier Detection','outlier_detection','exploratory','outliers','03_exploratoria','Detecção de outliers por leverage, distância de Mahalanobis ou Hotelling T².', 1),
('b0000003-0000-0000-0000-000000000005','SIMCA','simca','exploratory','classification','03_exploratoria','Soft Independent Modelling of Class Analogies.', 1),
('b0000003-0000-0000-0000-000000000006','Correlation Analysis','correlation_analysis','exploratory','statistics','03_exploratoria','Matriz de correlação e heatmap.', 1),
('b0000003-0000-0000-0000-000000000007','Descriptive Statistics','descriptive_statistics','exploratory','statistics','03_exploratoria','Média, desvio padrão, CV, curtose, assimetria por variável.', 1),

-- =========================================================
-- FAMÍLIA 04 — Regressão 1D
-- =========================================================
-- pls já existe (id 7)
('b0000004-0000-0000-0000-000000000001','MLR','mlr','regression','linear','04_regressao_1d','Multiple Linear Regression.', 1),
('b0000004-0000-0000-0000-000000000002','PCR','pcr','regression','linear','04_regressao_1d','Principal Component Regression.', 1),
('b0000004-0000-0000-0000-000000000003','Ridge Regression','ridge_regression','regression','regularized','04_regressao_1d','Regressão Ridge (regularização L2).', 1),
('b0000004-0000-0000-0000-000000000004','LASSO Regression','lasso_regression','regression','regularized','04_regressao_1d','Least Absolute Shrinkage and Selection Operator (L1).', 1),
('b0000004-0000-0000-0000-000000000005','SVR','svr','regression','kernel','04_regressao_1d','Support Vector Regression.', 1),
('b0000004-0000-0000-0000-000000000006','GPR','gpr','regression','probabilistic','04_regressao_1d','Gaussian Process Regression.', 1),
('b0000004-0000-0000-0000-000000000007','Interval PLS','ipls','regression','interval','04_regressao_1d','iPLS — seleção do melhor intervalo espectral por PLS.', 1),
('b0000004-0000-0000-0000-000000000008','Prediction','prediction','regression','prediction','04_regressao_1d','Aplica modelo treinado em novas amostras.', 1),

-- =========================================================
-- FAMÍLIA 05 — Classificação 1D
-- =========================================================
-- pls_da (id 8 após fix slug) e random_forest (id 11 após fix slug)
('b0000005-0000-0000-0000-000000000001','LDA','lda','classification','linear','05_classificacao_1d','Linear Discriminant Analysis.', 1),
('b0000005-0000-0000-0000-000000000002','QDA','qda','classification','quadratic','05_classificacao_1d','Quadratic Discriminant Analysis.', 1),
('b0000005-0000-0000-0000-000000000003','SVM','svm','classification','kernel','05_classificacao_1d','Support Vector Machine com kernel RBF ou linear.', 1),
('b0000005-0000-0000-0000-000000000004','KNN','knn','classification','distance','05_classificacao_1d','K-Nearest Neighbors.', 1),
('b0000005-0000-0000-0000-000000000005','Naive Bayes','naive_bayes','classification','probabilistic','05_classificacao_1d','Classificador Naive Bayes Gaussiano.', 1),
('b0000005-0000-0000-0000-000000000006','Logistic Regression','logistic_regression','classification','linear','05_classificacao_1d','Regressão Logística (binária ou multiclasse).', 1),

-- =========================================================
-- FAMÍLIA 06 — Deep Learning
-- =========================================================
-- rnn já existe (id 12 após fix família)
('b0000006-0000-0000-0000-000000000001','MLP Regression','mlp_regression','deep_learning','mlp','06_deep_learning','Multilayer Perceptron para regressão.', 1),
('b0000006-0000-0000-0000-000000000002','MLP Classification','mlp_classification','deep_learning','mlp','06_deep_learning','Multilayer Perceptron para classificação.', 1),
('b0000006-0000-0000-0000-000000000003','CNN 1D','cnn_1d','deep_learning','cnn','06_deep_learning','Convolutional Neural Network 1D para espectros.', 1),
('b0000006-0000-0000-0000-000000000004','LSTM','lstm','deep_learning','recurrent','06_deep_learning','Long Short-Term Memory.', 1),
('b0000006-0000-0000-0000-000000000005','Autoencoder','autoencoder','deep_learning','autoencoder','06_deep_learning','Autoencoder para aprendizado de representações e detecção de anomalias.', 1),
('b0000006-0000-0000-0000-000000000006','Transformer','transformer','deep_learning','attention','06_deep_learning','Transformer com atenção multi-head para séries espectrais.', 1),

-- =========================================================
-- FAMÍLIA 07 — Decomposição Multiway
-- =========================================================
-- parafac (id 9) e tucker3 (id 10) já existem
('b0000007-0000-0000-0000-000000000001','MCR-ALS','mcr_als','multiway','factorization','07_multiway_decomp','Multivariate Curve Resolution — Alternating Least Squares.', 1),
('b0000007-0000-0000-0000-000000000002','PARAFAC2','parafac2','multiway','factorization','07_multiway_decomp','PARAFAC2 para dados com variação de perfil em um modo.', 1),
('b0000007-0000-0000-0000-000000000003','NTF','ntf','multiway','factorization','07_multiway_decomp','Non-negative Tensor Factorization.', 1),
('b0000007-0000-0000-0000-000000000004','CP Decomposition','cp_decomp','multiway','factorization','07_multiway_decomp','Canonical Polyadic Decomposition genérica.', 1),
('b0000007-0000-0000-0000-000000000005','HOOI','hooi','multiway','factorization','07_multiway_decomp','Higher-Order Orthogonal Iteration (Tucker otimizado).', 1),
('b0000007-0000-0000-0000-000000000006','Core Consistency','core_consistency','multiway','diagnostics','07_multiway_decomp','Diagnóstico de consistência do núcleo para seleção do número de componentes.', 1),

-- =========================================================
-- FAMÍLIA 08 — Regressão Multiway
-- =========================================================
('b0000008-0000-0000-0000-000000000001','N-PLS','n_pls','multiway_regression','regression','08_multiway_regression','N-PLS — regressão multilinear para dados de ordem superior.', 1),
('b0000008-0000-0000-0000-000000000002','Tucker-PLS','tucker_pls','multiway_regression','regression','08_multiway_regression','PLS combinado com decomposição Tucker.', 1),
('b0000008-0000-0000-0000-000000000003','Unfolded PLS','unfolded_pls','multiway_regression','regression','08_multiway_regression','PLS em dados multiway desdobrados (unfold + PLS).', 1),
('b0000008-0000-0000-0000-000000000004','PARAFAC Regression','parafac_regression','multiway_regression','regression','08_multiway_regression','Regressão sobre scores PARAFAC.', 1),
('b0000008-0000-0000-0000-000000000005','Multiway PCR','multiway_pcr','multiway_regression','regression','08_multiway_regression','PCR sobre dados multiway desdobrados.', 1),

-- =========================================================
-- FAMÍLIA 09 — Classificação Multiway
-- =========================================================
('b0000009-0000-0000-0000-000000000001','N-PLS-DA','n_pls_da','multiway_classification','classification','09_multiway_classif','N-PLS-DA para discriminação em dados multiway.', 1),
('b0000009-0000-0000-0000-000000000002','Unfolded PLS-DA','unfolded_pls_da','multiway_classification','classification','09_multiway_classif','PLS-DA em dados multiway desdobrados.', 1),
('b0000009-0000-0000-0000-000000000003','Tucker LDA','tucker_lda','multiway_classification','classification','09_multiway_classif','LDA sobre scores Tucker.', 1),
('b0000009-0000-0000-0000-000000000004','PARAFAC SIMCA','parafac_simca','multiway_classification','classification','09_multiway_classif','SIMCA aplicado a scores PARAFAC por classe.', 1),

-- =========================================================
-- FAMÍLIA 10 — Calibração de Ordem Superior
-- =========================================================
('b0000010-0000-0000-0000-000000000001','Second Order Calibration','second_order_calibration','calibration','second_order','10_calibracao_ordem_superior','Calibração de segunda ordem com estimação de constituintes sem separação prévia.', 1),
('b0000010-0000-0000-0000-000000000002','Third Order Calibration','third_order_calibration','calibration','third_order','10_calibracao_ordem_superior','Calibração de terceira ordem para dados de quarta ordem analítica.', 1),
('b0000010-0000-0000-0000-000000000003','BLLS','blls','calibration','bilinear','10_calibracao_ordem_superior','Bilinear Least Squares — calibração bilinear de primeira ordem.', 1),
('b0000010-0000-0000-0000-000000000004','GRAM','gram','calibration','second_order','10_calibracao_ordem_superior','Generalized Rank Annihilation Method.', 1),
('b0000010-0000-0000-0000-000000000005','ATLD','atld','calibration','second_order','10_calibracao_ordem_superior','Alternating Trilinear Decomposition.', 1),

-- =========================================================
-- FAMÍLIA 11 — Seleção de Variáveis
-- =========================================================
('b0000011-0000-0000-0000-000000000001','UVE','uve','variable_selection','filter','11_selecao_variaveis','Uninformative Variable Elimination.', 1),
('b0000011-0000-0000-0000-000000000002','iPLS','ipls_var','variable_selection','interval','11_selecao_variaveis','Interval PLS para seleção de regiões espectrais.', 1),
('b0000011-0000-0000-0000-000000000003','siPLS','sipls','variable_selection','interval','11_selecao_variaveis','Synergy interval PLS — combinações de intervalos.', 1),
('b0000011-0000-0000-0000-000000000004','CARS','cars','variable_selection','evolutionary','11_selecao_variaveis','Competitive Adaptive Reweighted Sampling.', 1),
('b0000011-0000-0000-0000-000000000005','VIP Selection','vip','variable_selection','importance','11_selecao_variaveis','Variable Importance in Projection (corte por threshold).', 1),
('b0000011-0000-0000-0000-000000000006','GA-PLS','ga_pls','variable_selection','evolutionary','11_selecao_variaveis','Algoritmo Genético para seleção de variáveis em PLS.', 1),
('b0000011-0000-0000-0000-000000000007','SPA','spa','variable_selection','projection','11_selecao_variaveis','Successive Projections Algorithm.', 1),
('b0000011-0000-0000-0000-000000000008','RF Importance','rf_importance','variable_selection','importance','11_selecao_variaveis','Importância de variáveis por Random Forest.', 1),
('b0000011-0000-0000-0000-000000000009','Boruta','boruta','variable_selection','wrapper','11_selecao_variaveis','Seleção de variáveis por método Boruta (shadow features).', 1),
('b0000011-0000-0000-0000-000000000010','LASSO Selection','lasso_selection','variable_selection','regularized','11_selecao_variaveis','Seleção por regularização L1 com cross-validation do lambda.', 1),

-- =========================================================
-- FAMÍLIA 12 — Validação de Modelos
-- =========================================================
-- cross_validation já existe (id 13 após fixes)
('b0000012-0000-0000-0000-000000000001','Bootstrap','bootstrap','validation','resampling','12_validacao_modelos','Bootstrap .632 para estimativa de erro.', 1),
('b0000012-0000-0000-0000-000000000002','Permutation Test','permutation_test','validation','significance','12_validacao_modelos','Teste de permutação (y-scrambling) para verificar chance correlation.', 1),
('b0000012-0000-0000-0000-000000000003','Leverage Influence','leverage_influence','validation','diagnostics','12_validacao_modelos','Hat matrix e distância de Cook para detectar amostras influentes.', 1),

-- =========================================================
-- FAMÍLIA 13 — Transferência de Aprendizado
-- =========================================================
('b0000013-0000-0000-0000-000000000001','PDS','pds','other','calibration_transfer','13_transferencia_aprendizado','Piecewise Direct Standardization.', 1),
('b0000013-0000-0000-0000-000000000002','DS','ds','other','calibration_transfer','13_transferencia_aprendizado','Direct Standardization.', 1),
('b0000013-0000-0000-0000-000000000003','Domain Adaptation PCA','domain_adaptation_pca','other','calibration_transfer','13_transferencia_aprendizado','Alinhamento de domínios via rotação Procrustes em PCA.', 1),
('b0000013-0000-0000-0000-000000000004','Fine Tuning PLS','fine_tuning_pls','other','calibration_transfer','13_transferencia_aprendizado','Fine-tuning de modelo PLS com amostras do novo instrumento.', 1),
('b0000013-0000-0000-0000-000000000005','Spectral Calibration Transfer','spectral_calibration_transfer','other','calibration_transfer','13_transferencia_aprendizado','Transferência de calibração espectral genérica (SLOPE/BIAS).', 1),

-- =========================================================
-- FAMÍLIA 14 — Sinais Espectrais
-- =========================================================
('b0000014-0000-0000-0000-000000000001','Peak Detection','peak_detection','other','signal_processing','14_sinais_espectrais','Detecção de picos espectrais via scipy find_peaks.', 1),
('b0000014-0000-0000-0000-000000000002','Peak Alignment','peak_alignment','other','signal_processing','14_sinais_espectrais','Alinhamento de picos por correlação cruzada.', 1),
('b0000014-0000-0000-0000-000000000003','Spectrum Decomposition','spectrum_decomposition','other','signal_processing','14_sinais_espectrais','Decomposição espectral por NMF, ICA ou PCA.', 1),
('b0000014-0000-0000-0000-000000000004','Noise Estimation','noise_estimation','other','signal_processing','14_sinais_espectrais','Estimação de ruído por derivada ou SWSC.', 1),
('b0000014-0000-0000-0000-000000000005','Fourier Analysis','fourier_analysis','other','signal_processing','14_sinais_espectrais','Análise de Fourier (FFT) com filtragem lowpass/highpass.', 1),

-- =========================================================
-- FAMÍLIA 15 — Imagens Hiperespectrais
-- =========================================================
('b0000015-0000-0000-0000-000000000001','Hyperspectral Unmixing','hyperspectral_unmixing','other','hyperspectral','15_imagens_hiperespectrais','Desmistura espectral via VCA, N-FINDR ou FCLSU.', 1),
('b0000015-0000-0000-0000-000000000002','Hyperspectral Classification','hyperspectral_classification','other','hyperspectral','15_imagens_hiperespectrais','Classificação pixel a pixel (SVM ou RF) em imagens hiperespectrais.', 1),
('b0000015-0000-0000-0000-000000000003','Hyperspectral PCA','hyperspectral_pca','other','hyperspectral','15_imagens_hiperespectrais','PCA em imagem hiperespectral (entrada 2D ou 3D).', 1),
('b0000015-0000-0000-0000-000000000004','Spectral Angle Mapper','spectral_angle_mapper','other','hyperspectral','15_imagens_hiperespectrais','SAM — classificação por ângulo espectral.', 1),

-- =========================================================
-- FAMÍLIA 16 — Dados Faltantes
-- =========================================================
('b0000016-0000-0000-0000-000000000001','KNN Imputation','knn_imputation','other','missing_data','16_dados_faltantes','Imputação por K vizinhos mais próximos.', 1),
('b0000016-0000-0000-0000-000000000002','Iterative Imputation','iterative_imputation','other','missing_data','16_dados_faltantes','MICE — Multiple Imputation by Chained Equations.', 1),
('b0000016-0000-0000-0000-000000000003','Matrix Completion','matrix_completion','other','missing_data','16_dados_faltantes','Completamento de matriz por SVD iterativo.', 1),
('b0000016-0000-0000-0000-000000000004','Spectral Interpolation','spectral_interpolation','other','missing_data','16_dados_faltantes','Interpolação de regiões faltantes (linear, cúbica ou PCHIP).', 1),
('b0000016-0000-0000-0000-000000000005','PCA Imputation','pca_imputation','other','missing_data','16_dados_faltantes','Imputação via NIPALS com dados faltantes.', 1),

-- =========================================================
-- FAMÍLIA 17 — Fusão de Dados
-- =========================================================
('b0000017-0000-0000-0000-000000000001','Low Level Fusion','low_level_fusion','other','data_fusion','17_fusao_dados','Fusão de baixo nível — concatenação de blocos de dados.', 1),
('b0000017-0000-0000-0000-000000000002','Mid Level Fusion','mid_level_fusion','other','data_fusion','17_fusao_dados','Fusão de médio nível — PCA por bloco + concatenação de scores.', 1),
('b0000017-0000-0000-0000-000000000003','High Level Fusion','high_level_fusion','other','data_fusion','17_fusao_dados','Fusão de alto nível — combinação de predições de modelos independentes.', 1),
('b0000017-0000-0000-0000-000000000004','Kernel Fusion','kernel_fusion','other','data_fusion','17_fusao_dados','Fusão de kernels (MKL-style) para SVM multi-bloco.', 1),
('b0000017-0000-0000-0000-000000000005','SOCOFUS','socofus','other','data_fusion','17_fusao_dados','Sequential Orthogonalized PLS para fusão sequencial.', 1),

-- =========================================================
-- FAMÍLIA 18 — Quimiometria de Processo / SPC
-- =========================================================
('b0000018-0000-0000-0000-000000000001','MSPC','mspc','other','spc','18_quimiometria_processo','Multivariate Statistical Process Control (T² de Hotelling + Q/SPE).', 1),
('b0000018-0000-0000-0000-000000000002','PCA Control Chart','pca_control_chart','other','spc','18_quimiometria_processo','Carta de controle por scores PCA (±3σ por componente).', 1),
('b0000018-0000-0000-0000-000000000003','EWMA','ewma','other','spc','18_quimiometria_processo','Exponentially Weighted Moving Average — univariado e multivariado.', 1),
('b0000018-0000-0000-0000-000000000004','Batch PCA','batch_pca','other','spc','18_quimiometria_processo','MPCA — análise de lotes por desdobramento de tensor 3D.', 1),
('b0000018-0000-0000-0000-000000000005','CUSUM Chart','cusum_chart','other','spc','18_quimiometria_processo','Carta CUSUM para detecção de desvios acumulados (univariada).', 1),

-- =========================================================
-- FAMÍLIA 19 — Interpretabilidade
-- =========================================================
('b0000019-0000-0000-0000-000000000001','Permutation Importance','permutation_importance','other','interpretability','19_interpretabilidade','Importância por permutação via RF ou PLS.', 1),
('b0000019-0000-0000-0000-000000000002','Partial Dependence','partial_dependence','other','interpretability','19_interpretabilidade','Partial Dependence Plot — efeito marginal de variáveis no modelo RF.', 1),
('b0000019-0000-0000-0000-000000000003','Sensitivity Analysis','sensitivity_analysis','other','interpretability','19_interpretabilidade','Análise de sensibilidade local (gradiente) ou global (Morris screening).', 1),
('b0000019-0000-0000-0000-000000000004','VIP Interpretation','vip_interpretation','other','interpretability','19_interpretabilidade','VIP scores de PLS com análise de regiões mais importantes.', 1),
('b0000019-0000-0000-0000-000000000005','LIME Explanation','lime_explanation','other','interpretability','19_interpretabilidade','LIME — aproximação linear local em torno de amostras individuais.', 1),

-- =========================================================
-- FAMÍLIA 20 — Utilitários
-- =========================================================
('b0000020-0000-0000-0000-000000000001','Metrics Aggregation','metrics_aggregation','utility',NULL,'20_utilitarios','Agrega métricas de múltiplas execuções em tabela comparativa.', 1),
('b0000020-0000-0000-0000-000000000002','Spectrum Simulator','spectrum_simulator','utility',NULL,'20_utilitarios','Gera espectros sintéticos com picos Gaussianos e ruído controlado.', 1),
('b0000020-0000-0000-0000-000000000003','Unit Converter','unit_converter','utility',NULL,'20_utilitarios','Converte entre unidades espectrais: nm, cm⁻¹, eV, THz, μm.', 1),
('b0000020-0000-0000-0000-000000000004','Outlier Detection Utility','outlier_detection_utility','utility',NULL,'20_utilitarios','Detecção de outliers por Mahalanobis, Grubbs ou IQR.', 1),
('b0000020-0000-0000-0000-000000000005','Data Export Report','data_export_report','utility',NULL,'20_utilitarios','Exporta resultados para CSV/JSON e gera relatório HTML.', 1),
('b0000020-0000-0000-0000-000000000006','Spectral Database Search','spectral_database_search','utility',NULL,'20_utilitarios','Busca espectral por similaridade (cosine ou SAM).', 1);


SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- End of Migration 001
-- =============================================================================
