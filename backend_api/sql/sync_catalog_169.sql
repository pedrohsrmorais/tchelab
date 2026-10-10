-- =============================================================================
-- Sync do catálogo de técnicas com os 169 scripts reais do worker_api/catalog
-- Gerado a partir da auditoria slug-a-slug (ver conversa de 2026-10-10).
-- Idempotente: pode rodar mais de uma vez sem duplicar/quebrar nada.
-- =============================================================================

-- ─── 1. Renomeações (mesma técnica, slug divergente do script Python real) ───
UPDATE `techniques` SET `slug` = 'concatenacao' WHERE `slug` = 'array_concatenate' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'concatenacao');
UPDATE `techniques` SET `slug` = 'autoscaling' WHERE `slug` = 'autoscale' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'autoscaling');
UPDATE `techniques` SET `slug` = 'baseline' WHERE `slug` = 'baseline_correction' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'baseline');
UPDATE `techniques` SET `slug` = 'importacao' WHERE `slug` = 'dataset' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'importacao');
UPDATE `techniques` SET `slug` = 'tensor_svd' WHERE `slug` = 'hosvd' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'tensor_svd');
UPDATE `techniques` SET `slug` = 'ipls' WHERE `slug` = 'ipls_var' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'ipls');
UPDATE `techniques` SET `slug` = 'lasso' WHERE `slug` = 'lasso_regression' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'lasso');
UPDATE `techniques` SET `slug` = 'rnn' WHERE `slug` = 'lstm' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'rnn');
UPDATE `techniques` SET `slug` = 'centering' WHERE `slug` = 'mean_center' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'centering');
UPDATE `techniques` SET `slug` = 'ols' WHERE `slug` = 'mlr' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'ols');
UPDATE `techniques` SET `slug` = 'n_way_pcr' WHERE `slug` = 'multiway_pcr' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'n_way_pcr');
UPDATE `techniques` SET `slug` = 'normalizacao' WHERE `slug` = 'normalization' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'normalizacao');
UPDATE `techniques` SET `slug` = 'tensor_nmf' WHERE `slug` = 'ntf' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'tensor_nmf');
UPDATE `techniques` SET `slug` = 'pareto' WHERE `slug` = 'pareto_scaling' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'pareto');
UPDATE `techniques` SET `slug` = 'ridge' WHERE `slug` = 'ridge_regression' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'ridge');
UPDATE `techniques` SET `slug` = 'segunda_ordem' WHERE `slug` = 'second_order_calibration' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'segunda_ordem');
UPDATE `techniques` SET `slug` = 'nonlinear_regression' WHERE `slug` = 'svr' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'nonlinear_regression');
UPDATE `techniques` SET `slug` = 'terceira_ordem' WHERE `slug` = 'third_order_calibration' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'terceira_ordem');
UPDATE `techniques` SET `slug` = 'u_pls' WHERE `slug` = 'unfolded_pls' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'u_pls');
UPDATE `techniques` SET `slug` = 'multiway_pls_da' WHERE `slug` = 'unfolded_pls_da' AND NOT EXISTS (SELECT 1 FROM (SELECT slug FROM `techniques`) t2 WHERE t2.slug = 'multiway_pls_da');

-- ─── 2. Técnicas que já funcionam no worker mas nunca tiveram linha no catálogo ───
INSERT IGNORE INTO `techniques` (`uuid`,`name`,`slug`,`category`,`subcategory`,`family`,`description`,`active`,`is_beta`) VALUES
('9f8ec5b7-88e6-4e71-b63e-20a9167a23ec','Automated Preprocessing Selection','automated_preprocessing','preprocessing','other','02_preprocessamento','Seleciona automaticamente a melhor sequência de pré-processamento por RMSECV.',1,0),
('b591a280-f60f-4830-b773-b1b7a9c3c033','CLS — Classical Least Squares','cls','regression','other','04_regressao_1d','X = C × Sᵀ. Resolve concentrações dado espectros puros S.',1,0),
('a9512b8b-b518-4b62-aa97-dd7920243c17','CNN-2D — Convolutional Neural Network 2D','cnn_2d','deep_learning','other','06_deep_learning','CNN 2D para imagens hiperespectrais ou mapas 2D.',1,0),
('e90e803e-672c-4467-bc2c-be19ca2de234','DD-SIMCA — Data-Driven SIMCA','dd_simca','classification','other','05_classificacao_1d','SIMCA data-driven com fronteira estatística por distribuição F (Mahalanobis + ortogonal).',1,0),
('2bef5f80-777c-47e6-b1dd-90d84ecffc37','Diffusion Model — Denoising Spectral Diffusion','diffusion','deep_learning','other','06_deep_learning','Modelo de difusão para denoising ou augmentação de espectros.',1,0),
('226f23d3-8faa-4527-993d-d3cbb01f269d','Eilers Smoothing (Whittaker)','eilers_smoothing','preprocessing','other','02_preprocessamento','Suavização por spline penalizada de Eilers.',1,0),
('ffcad7ea-e225-4538-8f10-739aa71047b3','Elastic Net','elastic_net','regression','other','04_regressao_1d','Regularização mista L1+L2.',1,0),
('36bd61cf-035a-4931-a805-f68e8f0b3a25','HCA — Agrupamento Hierárquico','hca','exploratory','clustering','03_exploratoria','Análise de agrupamento hierárquico com linkage e dendrograma.',1,0),
('d55dbfd6-8493-43c6-a102-59046a0a15fa','ILS — Inverse Least Squares','ils','regression','other','04_regressao_1d','Modela y = X × b diretamente. Requer n_samples > n_variables.',1,0),
('24872f95-56ed-4ef0-b9ca-d0811e0b455c','Separação Kennard-Stone','kennard_stone','input','manipulation','01_dados','Divide as amostras em calibração (treino), teste e, opcionalmente, validação, selecionando iterativamente a amostra mais distante (distância Euclidiana) das já escolhidas — maximiza a cobertura da variabilidade multivariada em vez de uma divisão aleatória. Determinístico: a mesma entrada sempre produz a mesma divisão.',1,0),
('eefe0d2b-5545-48a6-8070-3be5eb5a9b4a','K-Means','kmeans','exploratory','clustering','03_exploratoria','Agrupamento K-Means.',1,0),
('253d866e-278e-4abc-8e6c-e314f6f9097a','Limpeza de Dados','limpeza','input','manipulation','01_dados','Remove amostras ou variáveis com NaN, Inf ou variância zero.',1,0),
('f4411545-03f1-47d4-bf01-dd2d8dda1dc6','RMie-EMSC (Resonance Mie Scatter Extended MSC)','mie_emsc','preprocessing','other','02_preprocessamento','Correção de espalhamento físico Mie para FTIR de células e tecidos.',1,1),
('70720202-f3cf-44ed-8ef7-08d9ddecb9eb','Multiway One-Class','multiway_one_class','multiway_classification','classification','09_multiway_classif','One-class SVM sobre tensor desdobrado com pré-redução PCA.',1,0),
('3314988d-434e-4eba-8101-2191cf3e2cc8','OC-RF — One-Class Random Forest','oc_rf','classification','other','05_classificacao_1d','Random Forest one-class com pseudo-negativos sintéticos.',1,0),
('ffcaa6a8-d662-4769-bdd4-59195c13d03e','One-Class SIMCA','oc_simca','classification','other','05_classificacao_1d','SIMCA one-class: modela apenas a classe alvo.',1,0),
('f9f05eb3-bb77-40b9-aac6-a562c3556b4a','One-Class SVM','one_class_svm','classification','other','05_classificacao_1d','Detecção de novidades por SVM de uma classe (sklearn).',1,0),
('b7b436cc-3b74-4a05-8559-a2bec02f91d4','Calibração de Ordem Superior Genérica','ordem_superior_generica','calibration','higher_order','10_calibracao_ordem_superior','Calibração por PARAFAC genérico para tensor de qualquer ordem >= 3.',1,0),
('2677e0b5-c800-4596-941f-16357f898b20','Outros Scalings (vast/level/range)','outros_scalings','preprocessing','other','02_preprocessamento','VAST, level e range scaling.',1,0),
('903b2dbb-5eae-4cf5-8a1e-333343238b56','PARAFAC Aumentado (Augmented PARAFAC)','parafac_aumentado','multiway','factorization','07_multiway_decomp','PARAFAC sobre tensor aumentado com restrições de não-negatividade.',1,0),
('05510ad9-29f7-451e-bbb7-7bb55fc4063b','PLS One-Class','pls_oc','classification','other','05_classificacao_1d','One-class classifier via PLS com pseudo-negativos aleatórios.',1,0),
('a45974bd-98b8-4b48-9e1b-0c8a0a3a3592','PQN — Probabilistic Quotient Normalization','pqn','preprocessing','other','02_preprocessamento','Normaliza pela mediana dos quocientes variável a variável.',1,0),
('a3953725-b194-49e5-9ff7-a8293bd2b11a','Calibração de 4ª Ordem','quarta_ordem','calibration','higher_order','10_calibracao_ordem_superior','Calibração de 4ª ordem via PARAFAC sobre tensor 5-way.',1,0),
('0fa5d72d-b6c2-40da-acde-7ee16f0b4162','Robust Scaling','robust_scaling','preprocessing','other','02_preprocessamento','Centraliza pela mediana e escala pelo IQR (insensível a outliers).',1,0),
('5c6dbb13-7ae0-4343-a307-4007e31076ba','Seleção de Amostras','selecao_amostras','input','manipulation','01_dados','Seleciona subconjunto de amostras por índice ou máscara booleana.',1,0),
('220991be-4022-41f2-90ee-bf49cf9f9b74','Seleção de Variáveis','selecao_variaveis','input','manipulation','01_dados','Seleciona subconjunto de variáveis por índice, range ou máscara.',1,0),
('3b766641-ffb0-45ce-afc9-836ab5bf75df','Slice de Array','slice','input','manipulation','01_dados','Seleciona parte de um ou mais eixos por range.',1,0),
('62dc47c1-232e-4b36-99f5-1abd52c7771b','Split','split','input','manipulation','01_dados','Divide array em partes ao longo de um eixo.',1,0),
('33e55241-0503-4183-800d-f1a6cadc4ce8','Stack','stack','input','manipulation','01_dados','Empilha arrays adicionando um novo eixo.',1,0),
('f6a57d4f-1522-41d9-92cd-302af0f072d7','Tensor KNN','tensor_knn','multiway_classification','classification','09_multiway_classif','KNN sobre tensor desdobrado.',1,0),
('18dce36c-db8c-4fa0-87f4-b181079e4e21','Tensor Random Forest','tensor_random_forest','multiway_classification','classification','09_multiway_classif','Random Forest sobre tensor desdobrado.',1,0),
('9c2e1fda-5252-41ab-8563-55c22767dd4e','Tensor Regression (CP)','tensor_regression','multiway_regression','regression','08_multiway_regression','Regressão tensorial com coeficiente de peso em formato CP.',1,0),
('d3cc4648-a122-4702-84d4-90875a804142','Tensor SVM','tensor_svm','multiway_classification','classification','09_multiway_classif','SVM sobre tensor desdobrado.',1,0),
('678dc976-4549-4b2d-8a67-660a1578919d','Tratamento de Valores Ausentes','tratamento_missing','input','manipulation','01_dados','Preenche ou remove valores ausentes (NaN).',1,0),
('12344729-9593-4f91-adef-db0e41b5e6da','Tucker Regression','tucker_regression','multiway_regression','regression','08_multiway_regression','Regressão via decomposição Tucker: scores → regressão linear.',1,0),
('51f0c172-72d1-4926-b0f2-98fba8d98444','U-PCA — Unfolded PCA','u_pca','multiway_regression','regression','08_multiway_regression','PCA sobre tensor desdobrado (análise exploratória multiway).',1,0),
('d3cdd8a4-91af-404c-aabc-7c8e539173b5','Wavelet Transform','wavelet_transform','preprocessing','other','02_preprocessamento','Decomposição Wavelet discreta para suavização, decomposição ou extração de features.',1,0);
