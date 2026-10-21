-- =============================================================================
-- TcheLab — Funções MATLAB-like para o Workspace
-- Inserção das novas técnicas matemáticas + correção de discrepâncias schema.
-- Idempotente: INSERT IGNORE + UPDATE idempotente.
-- =============================================================================
SET NAMES utf8mb4;

-- ─── 1. Inserir novas técnicas MATLAB-like ────────────────────────────────────
INSERT IGNORE INTO `techniques`
  (`uuid`,`name`,`slug`,`category`,`family`,`description`,`active`,`is_beta`,
   `min_order`,`max_order`,`requires_sample_axis`)
VALUES
('a1b2c3d4-0001-4000-8000-000000000001','Variância','var','input','01_dados','Variância ao longo de um eixo. Equivalente ao var() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0002-4000-8000-000000000002','Valor Absoluto','abs','input','01_dados','Valor absoluto elemento a elemento. Equivalente ao abs() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0003-4000-8000-000000000003','Ordenar','sort','input','01_dados','Ordena elementos ao longo de um eixo. Equivalente ao sort() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0004-4000-8000-000000000004','Soma Cumulativa','cumsum','input','01_dados','Soma cumulativa ao longo de um eixo. Equivalente ao cumsum() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0005-4000-8000-000000000005','Diferença','diff','input','01_dados','Diferença entre elementos consecutivos. Equivalente ao diff() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0006-4000-8000-000000000006','Matriz de Correlação','corr','input','01_dados','Coeficientes de Pearson entre colunas. Equivalente ao corr() do MATLAB.',1,0,2,NULL,1),
('a1b2c3d4-0007-4000-8000-000000000007','Matriz de Covariância','cov','input','01_dados','Matriz de covariância entre colunas. Equivalente ao cov() do MATLAB.',1,0,2,NULL,1),
('a1b2c3d4-0008-4000-8000-000000000008','FFT — Transformada de Fourier','fft','input','01_dados','Transformada Rápida de Fourier 1D. Equivalente ao fft() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0009-4000-8000-000000000009','Logaritmo','log','input','01_dados','Logaritmo natural, base-2 ou base-10. Equivalente ao log()/log2()/log10() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0010-4000-8000-000000000010','Exponencial','exp','input','01_dados','e^x elemento a elemento. Equivalente ao exp() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0011-4000-8000-000000000011','Raiz Quadrada','sqrt','input','01_dados','Raiz quadrada de cada elemento. Equivalente ao sqrt() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0012-4000-8000-000000000012','Espaçamento Linear','linspace','input','01_dados','Gera vetor com N valores igualmente espaçados entre start e stop. Equivalente ao linspace() do MATLAB.',1,0,0,0,0),
('a1b2c3d4-0013-4000-8000-000000000013','Arredondamento','round','input','01_dados','Arredonda elementos para N casas decimais. Equivalente ao round() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0014-4000-8000-000000000014','Piso (floor)','floor','input','01_dados','Maior inteiro ≤ a cada elemento. Equivalente ao floor() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0015-4000-8000-000000000015','Teto (ceil)','ceil','input','01_dados','Menor inteiro ≥ a cada elemento. Equivalente ao ceil() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0016-4000-8000-000000000016','Sinal','sign','input','01_dados','Sinal de cada elemento: -1, 0 ou +1. Equivalente ao sign() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0017-4000-8000-000000000017','Módulo / Resto','mod','input','01_dados','Resto da divisão de X por divisor. Equivalente ao mod() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0018-4000-8000-000000000018','Produto Cumulativo','cumprod','input','01_dados','Produto cumulativo ao longo de um eixo. Equivalente ao cumprod() do MATLAB.',1,0,1,NULL,0),
('a1b2c3d4-0019-4000-8000-000000000019','Valores Únicos','unique','input','01_dados','Retorna os valores únicos e ordenados de X. Equivalente ao unique() do MATLAB.',1,0,1,NULL,0);

-- ─── 2. Schemas e how_it_works das novas técnicas ─────────────────────────────

ALTER TABLE techniques
  ADD COLUMN IF NOT EXISTS how_it_works TEXT NULL COMMENT 'Explicação de como o método funciona',
  ADD COLUMN IF NOT EXISTS historical_note TEXT NULL COMMENT 'Curiosidade histórica',
  ADD COLUMN IF NOT EXISTS usage_tips TEXT NULL COMMENT 'Orientação prática de uso';

UPDATE techniques SET
  how_it_works = 'Calcula a dispersão dos dados em torno da média — média dos quadrados dos desvios. Com ddof=0 (padrão) é a variância populacional; com ddof=1 é a amostral (divisão por N-1).',
  usage_tips = 'Use var(X) antes de escalar os dados para entender quanto cada variável contribui para a variância total. var(X, axis=0) calcula por coluna (por variável), axis=1 por linha (por amostra).',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada cujo quadrado do desvio padrão será calculado."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Variância calculada ao longo do eixo escolhido."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"axis":{"type":"integer","default":null,"description":"Eixo de redução. null=array todo."},"ddof":{"type":"integer","default":0,"description":"Graus de liberdade: 0=populacional, 1=amostral."},"keepdims":{"type":"boolean","default":false}}')
WHERE slug = 'var';

UPDATE techniques SET
  how_it_works = 'Retorna o valor absoluto de cada elemento do array — remove o sinal negativo. Para números complexos, retorna o módulo.',
  usage_tips = 'Útil para calcular o erro absoluto (|y_pred - y_true|), normalizar resíduos e construir métricas como MAE.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada com valores que podem ser negativos."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Array com os valores absolutos — mesmo shape que X."}}')
WHERE slug = 'abs';

UPDATE techniques SET
  how_it_works = 'Ordena os elementos ao longo do eixo especificado. Retorna tanto os valores ordenados quanto os índices de origem (argsort), permitindo aplicar a mesma ordenação a outros arrays.',
  usage_tips = 'Use para ordenar espectros por comprimento de onda, amostras por concentração, ou scores por magnitude. Os índices de saída permitem reordenar outras variáveis na mesma ordem.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array a ser ordenado."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Array com os elementos ordenados."},"indices":{"type":"ndarray","description":"Índices originais de cada elemento na ordem resultante."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"axis":{"type":"integer","default":-1,"description":"Eixo de ordenação. -1=último eixo."},"order":{"type":"string","default":"ascending","enum":["ascending","descending"]}}')
WHERE slug = 'sort';

UPDATE techniques SET
  how_it_works = 'Calcula a soma acumulativa ao longo de um eixo: cada posição do resultado contém a soma de todos os elementos até aquela posição. Útil para calcular distribuições cumulativas e integrais numéricas discretas.',
  usage_tips = 'Divida por cumsum[-1] para normalizar e obter a CDF empírica. Também útil para integrar espectros.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Array com as somas acumuladas — mesmo shape que X."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"axis":{"type":"integer","default":null,"description":"Eixo de acumulação. null=array aplainado."}}')
WHERE slug = 'cumsum';

UPDATE techniques SET
  how_it_works = 'Calcula a diferença entre elementos consecutivos ao longo de um eixo. A 1ª derivada discreta de um sinal. diff de ordem n=2 é a diferença das diferenças (2ª derivada discreta).',
  usage_tips = 'A 1ª derivada (n=1) remove offset constante; a 2ª (n=2) remove deriva linear. Muito usado como alternativa mais simples ao Savitzky-Golay para remover linha de base antes de PLS. O array resultante tem n posições a menos que a entrada.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array ou matriz de espectros."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Diferenças consecutivas — tem n posições a menos no eixo calculado."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"n":{"type":"integer","default":1,"description":"Ordem da diferença: 1=1ª derivada, 2=2ª derivada."},"axis":{"type":"integer","default":-1}}')
WHERE slug = 'diff';

UPDATE techniques SET
  how_it_works = 'Calcula os coeficientes de correlação de Pearson entre todas as combinações de pares de colunas (variáveis) da matriz X. Cada elemento (i,j) da matriz resultado indica quão linearmente relacionadas estão as variáveis i e j, variando de -1 a +1.',
  usage_tips = 'Fundamental para entender co-linearidade entre variáveis antes de modelagem. Em espectroscopia, comprimentos de onda próximos costumam ter correlação próxima de 1. Visualizar como mapa de calor ajuda a identificar grupos de variáveis redundantes.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Matriz 2D (amostras × variáveis). Pelo menos 2 colunas."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Matriz de correlação (variáveis × variáveis), valores entre -1 e +1."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"rowvar":{"type":"boolean","default":false,"description":"false=colunas são variáveis (padrão MATLAB); true=linhas são variáveis."}}')
WHERE slug = 'corr';

UPDATE techniques SET
  how_it_works = 'Calcula a matriz de covariância entre todas as variáveis (colunas) de X. Diferente da correlação, preserva as magnitudes originais — o elemento (i,i) é a variância da variável i, e (i,j) é a covariância entre i e j.',
  usage_tips = 'Usada internamente pelo PCA e LDA. Verificar a matriz de covariância antes da PCA ajuda a entender quais variáveis dominam a análise. Com ddof=1 (padrão estatístico), divisão por N-1 dá estimativa não-viesada da covariância populacional.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Matriz 2D (amostras × variáveis)."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Matriz de covariância (variáveis × variáveis)."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"rowvar":{"type":"boolean","default":false},"ddof":{"type":"integer","default":1}}')
WHERE slug = 'cov';

UPDATE techniques SET
  how_it_works = 'Calcula a Transformada Rápida de Fourier (FFT real) ao longo de um eixo, decompondo o sinal no domínio da frequência. Retorna a magnitude (amplitudes espectrais), a fase e as frequências correspondentes a cada bin de frequência.',
  usage_tips = 'Multiplique o parâmetro sample_spacing pelo passo de amostragem real (ex: 1/taxa_amostragem) para ter as frequências em Hz. Magnitudes altas em baixas frequências geralmente indicam deriva de linha de base; em altas frequências, ruído.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Sinal 1D ou matriz de sinais. A FFT é calculada ao longo do eixo especificado."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"magnitude":{"type":"ndarray","description":"Amplitude de cada componente de frequência."},"phase":{"type":"ndarray","description":"Fase de cada componente (em radianos)."},"frequencies":{"type":"ndarray","description":"Frequências correspondentes a cada bin, em unidades de 1/sample_spacing."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"axis":{"type":"integer","default":-1},"n":{"type":"integer","default":null,"description":"Número de pontos da FFT. null=comprimento do sinal."},"sample_spacing":{"type":"number","default":1.0,"description":"Espaçamento entre amostras — determina a escala das frequências de saída."}}')
WHERE slug = 'fft';

UPDATE techniques SET
  how_it_works = 'Calcula o logaritmo de cada elemento. Base natural (ln) por padrão; aceita também log₂ e log₁₀. Transforma relações multiplicativas em aditivas — útil para linearizar dados que seguem lei de potência ou lognormal.',
  usage_tips = 'Todos os valores de entrada devem ser positivos. Em espectroscopia, a transformação log10 converte absorbância em transmitância (log10(1/T)). Frequentemente combinado com SNV ou MSC antes da modelagem PLS.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de valores positivos (> 0). Zero e negativos causam erro."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Logaritmo de cada elemento — mesmo shape que X."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"base":{"type":"string","default":"natural","enum":["natural","log2","log10"],"description":"Base do logaritmo."}}')
WHERE slug = 'log';

UPDATE techniques SET
  how_it_works = 'Calcula eˣ para cada elemento x do array — a função exponencial, que é a inversa do logaritmo natural. Transforma dados no espaço logarítmico de volta ao espaço linear.',
  usage_tips = 'Útil para desfazer uma transformação log aplicada anteriormente, ou quando o modelo foi ajustado no espaço log e as predições precisam voltar à escala original. Valores grandes de entrada produzem overflow — verifique a faixa dos dados.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada. Valores muito grandes (>709) causam overflow."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"e^x para cada elemento — mesmo shape que X."}}')
WHERE slug = 'exp';

UPDATE techniques SET
  how_it_works = 'Calcula a raiz quadrada de cada elemento do array. Todos os valores devem ser ≥ 0 para resultado real. Lineariza relações onde a grandeza física cresce como o quadrado da variável medida.',
  usage_tips = 'Aplicar sqrt antes da PCA pode ajudar quando os dados seguem distribuição de Poisson (contagens). Também usado para converter variâncias em desvios padrão.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de valores não-negativos. Valores negativos causam erro."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Raiz quadrada de cada elemento — mesmo shape que X."}}')
WHERE slug = 'sqrt';

UPDATE techniques SET
  how_it_works = 'Gera um vetor de N valores igualmente espaçados entre start e stop (inclusive os dois extremos). Ao contrário de range() que trabalha com inteiros, linspace aceita valores de ponto flutuante e garante que o último elemento seja exatamente stop.',
  usage_tips = 'Útil para criar eixos de comprimento de onda, grades de concentrações ou eixos de tempo uniformes. Combine com outras funções: linspace + sin() gera uma onda senoidal.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Vetor 1D com N valores igualmente espaçados de start a stop."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"start":{"type":"number","required":true,"description":"Valor inicial do intervalo."},"stop":{"type":"number","required":true,"description":"Valor final do intervalo (incluído)."},"n":{"type":"integer","default":100,"description":"Número de pontos gerados."}}')
WHERE slug = 'linspace';

UPDATE techniques SET
  how_it_works = 'Arredonda cada elemento para o número especificado de casas decimais. Com decimals=0 (padrão), arredonda para inteiro; com decimals negativo, arredonda para dezenas, centenas, etc.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Array arredondado — mesmo shape que X."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"decimals":{"type":"integer","default":0,"description":"Número de casas decimais. 0=inteiro, negativo=dezenas/centenas."}}')
WHERE slug = 'round';

UPDATE techniques SET
  how_it_works = 'Retorna o maior inteiro menor ou igual a cada elemento (arredonda sempre para baixo, em direção a -∞). floor(-1.5) = -2.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Valores arredondados para baixo — mesmo shape que X."}}')
WHERE slug = 'floor';

UPDATE techniques SET
  how_it_works = 'Retorna o menor inteiro maior ou igual a cada elemento (arredonda sempre para cima, em direção a +∞). ceil(-1.5) = -1.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Valores arredondados para cima — mesmo shape que X."}}')
WHERE slug = 'ceil';

UPDATE techniques SET
  how_it_works = 'Retorna o sinal de cada elemento: -1 para negativos, 0 para zero, +1 para positivos. Separa a magnitude do sinal — pode ser combinado com abs() para reconstruir o valor original.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Array com -1, 0 ou +1 em cada posição."}}')
WHERE slug = 'sign';

UPDATE techniques SET
  how_it_works = 'Calcula o resto da divisão de X por divisor, com resultado do mesmo sinal que o divisor (comportamento MATLAB). Diferente do operador % do Python, que dá resultado do mesmo sinal que o dividendo.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array dividendo."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Resto de X / divisor, elemento a elemento."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"divisor":{"type":"number","required":true,"description":"Valor pelo qual X será dividido."}}')
WHERE slug = 'mod';

UPDATE techniques SET
  how_it_works = 'Calcula o produto cumulativo ao longo de um eixo: cada posição contém o produto de todos os elementos até aquela posição. cumprod([2,3,4]) = [2, 6, 24].',
  usage_tips = 'Útil para calcular fatoriais, produtos cumulativos de probabilidades condicionais, ou simular crescimento composto.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array de entrada."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Produtos cumulativos — mesmo shape que X."}}'),
  parameter_schema = JSON_MERGE_PATCH(COALESCE(parameter_schema,'{}'), '{"axis":{"type":"integer","default":null,"description":"Eixo de acumulação."}}')
WHERE slug = 'cumprod';

UPDATE techniques SET
  how_it_works = 'Retorna os valores únicos (sem repetição) do array, ordenados. Também retorna a contagem de ocorrências de cada valor único — útil para análise de distribuição de rótulos de classe.',
  usage_tips = 'Use unique(y) para verificar quais classes existem e quantas amostras cada uma tem antes de treinar um modelo de classificação. Desequilíbrio entre classes pode exigir estratégias de balanceamento.',
  input_schema = JSON_MERGE_PATCH(COALESCE(input_schema,'{}'), '{"X":{"type":"ndarray","description":"Array 1D ou N-D (será aplainado internamente)."}}'),
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'), '{"result":{"type":"ndarray","description":"Valores únicos, ordenados."},"counts":{"type":"ndarray","description":"Número de ocorrências de cada valor único."}}')
WHERE slug = 'unique';

-- ─── 3. Corrigir discrepâncias A→X nos schemas das estatísticas básicas ────────
-- Python usa inputs["X"] mas catalog_content.json descrevia como porta "A"

UPDATE techniques SET
  input_schema = JSON_SET(COALESCE(input_schema,'{}'),
    '$.X', JSON_MERGE_PATCH(COALESCE(JSON_EXTRACT(input_schema,'$.X'),'{}'), '{"type":"ndarray","description":"Array de entrada."}'))
WHERE slug IN ('mean','median','std','min','max','sum')
  AND JSON_EXTRACT(input_schema,'$.A') IS NOT NULL;

UPDATE techniques SET
  input_schema = JSON_REMOVE(input_schema, '$.A')
WHERE slug IN ('mean','median','std','min','max','sum')
  AND JSON_EXTRACT(input_schema,'$.A') IS NOT NULL;

-- ─── 4. Corrigir output_schema do cross_validation (DB diz "metrics" mas Python retorna model+n_splits) ───
UPDATE techniques SET
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'),
    '{"metrics":{"type":"object","description":"Métricas agregadas das K rodadas (RMSE/R² pra regressão, acurácia/F1 pra classificação)."},"model":{"type":"object","description":"Modelo treinado na última fold."},"n_splits":{"type":"integer","description":"Número de folds usados na validação."}}')
WHERE slug = 'cross_validation';

-- ─── 5. Corrigir output_schema do leverage_influence (DB diz "residuals" mas Python retorna cooks_distance+n_high_leverage) ───
UPDATE techniques SET
  output_schema = JSON_MERGE_PATCH(COALESCE(output_schema,'{}'),
    '{"leverage":{"type":"ndarray","description":"Leverage de cada amostra (influência na estrutura do modelo)."},"cooks_distance":{"type":"ndarray","description":"Distância de Cook — influência combinada de leverage e resíduo."},"n_high_leverage":{"type":"integer","description":"Número de amostras classificadas como alto leverage."},"residuals":{"type":"ndarray","description":"[Legado] Resíduo de cada amostra no modelo — campo mantido para compatibilidade."}}')
WHERE slug = 'leverage_influence';

-- ─── 6. Tags para as novas funções ───────────────────────────────────────────
UPDATE techniques SET tags = '["matlab","math","basic","workspace"]'
WHERE slug IN ('var','abs','sort','cumsum','diff','corr','cov','fft','log','exp','sqrt','linspace',
               'round','floor','ceil','sign','mod','cumprod','unique');
