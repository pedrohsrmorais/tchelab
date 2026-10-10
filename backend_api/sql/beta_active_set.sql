-- =============================================================================
-- Lista beta: 75 técnicas ativas, resto marcado 'em desenvolvimento' (active=0)
-- Decidido em conversa com o usuário em 2026-10-10 — ver backend_api/sql/CATALOG_AUDIT.md
-- Idempotente.
-- =============================================================================

-- `mlp` (MLP único, parametrizado por task=classification/regression) nunca
-- teve linha própria — era um dos 5 pares ambíguos deixados de lado no sync
-- anterior (o banco só tinha `mlp_classification`/`mlp_regression`
-- separados). Insere agora porque o usuário confirmou MLP pra beta.
-- `mlp_classification`/`mlp_regression` ficam como duplicatas inativas
-- (já cobertas pelo active=0 abaixo), documentadas em CATALOG_AUDIT.md.
INSERT IGNORE INTO `techniques` (`uuid`,`name`,`slug`,`category`,`subcategory`,`family`,`description`,`active`,`is_beta`)
VALUES (UUID(), 'MLP — Multi-Layer Perceptron', 'mlp', 'deep_learning', 'mlp', '06_deep_learning', 'Rede neural densa (MLP) para regressão ou classificação.', 1, 0);

UPDATE `techniques` SET `active` = 0 WHERE `is_custom` = 0;

UPDATE `techniques` SET `active` = 1 WHERE `is_custom` = 0 AND `slug` IN ('autoencoder','autoscaling','autovalores','autovetores','baseline','centering','cnn_1d','concatenacao','cross_validation','determinante','diffusion','divisao_elementwise','ds','eig','expand_dims','folding','formula_customizada','hca','importacao','inversa','ipls','kennard_stone','knn','lda','leverage_influence','limpeza','max','mcr_als','mean','median','metrics_aggregation','min','mlp','msc','multiplicacao_elementwise','multiway_pls_da','n_pls','norma','outlier_detection','parafac','pca','pcr','pds','pls','pls_da','pls_oc','produto_matricial','pseudo_inversa','random_forest','rank','reshape','rnn','savitzky_golay','selecao_amostras','selecao_variaveis','simca','slice','snv','soma','split','squeeze','stack','std','subtracao','sum','svd','svm','trace','transformer','transpose','tratamento_missing','tucker3','u_pls','unfolding','vip');
