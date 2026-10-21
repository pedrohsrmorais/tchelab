-- =============================================================================
-- Catálogo — portas (input_schema/output_schema) e textos (how_it_works, usage_tips,
-- historical_note) das 94 técnicas ativas. GERADO por gen_catalog_ports_sql.py a partir de
-- catalog_ports_source.py, já validado contra o código Python do worker. NÃO edite à mão.
-- Idempotente: substitui os schemas inteiros (sem JSON_MERGE_PATCH), então nomes de porta
-- antigos/errados não sobrevivem. Vocabulário de tipos: ver docs/workflow.md.
-- Deploy sem recriar o volume:
--   docker compose exec -T mysql mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" < backend_api/sql/catalog_ports.sql
-- =============================================================================
SET NAMES utf8mb4;

-- linspace: o seed antigo inseria a linha com min_order=0/max_order=0, que viola
-- chk_techniques_min_order/max_order (1..20). Como o INSERT era IGNORE, a técnica nunca
-- chegou a existir no banco. Idempotente (INSERT IGNORE + UPDATEs abaixo).
INSERT IGNORE INTO `techniques`
  (`uuid`,`name`,`slug`,`category`,`family`,`description`,`active`,`is_beta`,`min_order`,`max_order`,`requires_sample_axis`,
   `parameter_schema`,`tags`)
VALUES ('a1b2c3d4-0012-4000-8000-000000000012','Espaçamento Linear','linspace','input','01_dados',
  'Gera vetor com N valores igualmente espaçados entre start e stop. Equivalente ao linspace() do MATLAB.',1,0,NULL,NULL,NULL,
  '{"start": {"type": "number", "required": true, "description": "Valor inicial do intervalo."}, "stop": {"type": "number", "required": true, "description": "Valor final do intervalo (incluído)."}, "n": {"type": "integer", "default": 100, "description": "Número de pontos gerados."}}',
  '["matlab","math","basic","workspace"]');
UPDATE `techniques` SET `active` = 1, `min_order` = NULL, `max_order` = NULL, `requires_sample_axis` = NULL
 WHERE `slug` = 'linspace' AND `is_custom` = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada com valores que podem ser negativos."}}',
  output_schema   = '{"result":{"description":"Array com os valores absolutos — mesmo shape que X."}}',
  how_it_works    = 'Retorna o valor absoluto de cada elemento do array — remove o sinal negativo. Para números complexos, retorna o módulo.',
  usage_tips      = 'Útil para calcular o erro absoluto (|y_pred - y_true|), normalizar resíduos e construir métricas como MAE.',
  historical_note = NULL
WHERE slug = 'abs' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada de entrada."}}',
  output_schema   = '{"eigenvalues":{"type":"vector","description":"Autovalores da matriz — objeto com chaves \\"real\\" e \\"imag\\" (listas de floats, pois autovalores podem ser complexos)."}}',
  how_it_works    = 'Calcula os autovalores de uma matriz quadrada — os escalares λ pros quais existe um vetor v não-nulo tal que A·v = λ·v. Pra matrizes de covariância (como em PCA), os autovalores correspondem à variância capturada em cada direção própria.',
  usage_tips      = 'Só aceita matriz quadrada. O resultado vem separado em parte real e imaginária (''real''/''imag''), porque matrizes não simétricas podem ter autovalores complexos. Se precisar dos autovalores e dos autovetores, use `eig` — calcula os dois de uma vez.',
  historical_note = 'O prefixo ''eigen'' (alemão para ''próprio'') foi popularizado por David Hilbert em 1904; o conceito, porém, já aparecia nos trabalhos de Euler, Lagrange e Cauchy no século XVIII/XIX.'
WHERE slug = 'autovalores' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada de entrada."}}',
  output_schema   = '{"eigenvectors":{"type":"matrix","description":"Autovetores da matriz, um por coluna — shape (n, n)."}}',
  how_it_works    = 'Calcula os autovetores de uma matriz quadrada — as direções que a matriz apenas escala (sem rotacionar) quando aplicada a elas. Em matrizes de covariância, são as direções principais de variância dos dados.',
  usage_tips      = 'Cada COLUNA do resultado é um autovetor. Para uma matriz de covariância (simétrica) eles são ortogonais e coincidem — a menos do sinal — com os loadings de uma PCA. Só aceita matriz quadrada; para obter também os autovalores, use `eig`.',
  historical_note = NULL
WHERE slug = 'autovetores' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Valores arredondados para cima — mesmo shape que X."}}',
  how_it_works    = 'Retorna o menor inteiro maior ou igual a cada elemento (arredonda sempre para cima, em direção a +∞). ceil(-1.5) = -1.',
  usage_tips      = 'Útil para converter valores contínuos em contagens inteiras, por exemplo o número mínimo de pontos necessários para cobrir uma janela. Combine com `floor` e `round` conforme o sentido de arredondamento desejado.',
  historical_note = NULL
WHERE slug = 'ceil' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Primeiro array a concatenar."},"B":{"description":"Segundo array a concatenar (mesmo shape em todos os eixos exceto o de concatenação)."}}',
  output_schema   = '{"result":{"description":"Array resultante da concatenação."}}',
  how_it_works    = 'Concatena dois arrays (A e B) ao longo de um eixo já existente (`axis`) — diferente do `stack`, que cria um eixo novo. Exemplo: juntar dois datasets que têm as mesmas variáveis em um só, empilhando as amostras.',
  usage_tips      = 'A e B precisam ter o mesmo número de dimensões e o mesmo tamanho em todos os eixos, exceto no eixo de concatenação. Com axis=0 você junta amostras (mesmas variáveis); com axis=1 você junta variáveis (mesmas amostras).',
  historical_note = NULL
WHERE slug = 'concatenacao' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz 2D (amostras × variáveis). Pelo menos 2 colunas."}}',
  output_schema   = '{"result":{"type":"matrix","description":"Matriz de correlação (variáveis × variáveis), valores entre -1 e +1."}}',
  how_it_works    = 'Calcula os coeficientes de correlação de Pearson entre todas as combinações de pares de colunas (variáveis) da matriz X. Cada elemento (i,j) da matriz resultado indica quão linearmente relacionadas estão as variáveis i e j, variando de -1 a +1.',
  usage_tips      = 'Fundamental para entender co-linearidade entre variáveis antes de modelagem. Em espectroscopia, comprimentos de onda próximos costumam ter correlação próxima de 1. Visualizar como mapa de calor ajuda a identificar grupos de variáveis redundantes.',
  historical_note = NULL
WHERE slug = 'corr' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz 2D (amostras × variáveis)."}}',
  output_schema   = '{"result":{"type":"matrix","description":"Matriz de covariância (variáveis × variáveis)."}}',
  how_it_works    = 'Calcula a matriz de covariância entre todas as variáveis (colunas) de X. Diferente da correlação, preserva as magnitudes originais — o elemento (i,i) é a variância da variável i, e (i,j) é a covariância entre i e j.',
  usage_tips      = 'Usada internamente pelo PCA e LDA. Verificar a matriz de covariância antes da PCA ajuda a entender quais variáveis dominam a análise. Com ddof=1 (padrão estatístico), divisão por N-1 dá estimativa não-viesada da covariância populacional.',
  historical_note = NULL
WHERE slug = 'cov' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Produtos cumulativos — mesmo shape que X."}}',
  how_it_works    = 'Calcula o produto cumulativo ao longo de um eixo: cada posição contém o produto de todos os elementos até aquela posição. cumprod([2,3,4]) = [2, 6, 24].',
  usage_tips      = 'Útil para calcular fatoriais, produtos cumulativos de probabilidades condicionais, ou simular crescimento composto.',
  historical_note = NULL
WHERE slug = 'cumprod' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Array com as somas acumuladas — mesmo shape que X."}}',
  how_it_works    = 'Calcula a soma acumulativa ao longo de um eixo: cada posição do resultado contém a soma de todos os elementos até aquela posição. Útil para calcular distribuições cumulativas e integrais numéricas discretas.',
  usage_tips      = 'Divida por cumsum[-1] para normalizar e obter a CDF empírica. Também útil para integrar espectros.',
  historical_note = NULL
WHERE slug = 'cumsum' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada de entrada."}}',
  output_schema   = '{"det":{"type":"scalar","description":"Determinante da matriz (escalar)."}}',
  how_it_works    = 'Calcula o determinante de uma matriz quadrada — um escalar que indica, entre outras coisas, se a matriz é invertível (determinante zero = singular, não-invertível).',
  usage_tips      = 'Só para matrizes quadradas. Um determinante muito próximo de zero indica matriz quase singular — a inversa será numericamente instável e vale usar `pseudo_inversa`.',
  historical_note = 'Os determinantes surgiram de forma independente com Seki Takakazu e Gottfried Leibniz no fim do século XVII, ligados à resolução de sistemas lineares; o termo ''determinante'' no sentido atual é do início do século XIX (Gauss e Cauchy).'
WHERE slug = 'determinante' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array ou matriz de espectros."}}',
  output_schema   = '{"result":{"description":"Diferenças consecutivas — tem n posições a menos no eixo calculado."}}',
  how_it_works    = 'Calcula a diferença entre elementos consecutivos ao longo de um eixo. A 1ª derivada discreta de um sinal. diff de ordem n=2 é a diferença das diferenças (2ª derivada discreta).',
  usage_tips      = 'A 1ª derivada (n=1) remove offset constante; a 2ª (n=2) remove deriva linear. Muito usado como alternativa mais simples ao Savitzky-Golay para remover linha de base antes de PLS. O array resultante tem n posições a menos que a entrada.',
  historical_note = NULL
WHERE slug = 'diff' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Array dividendo."},"B":{"description":"Array divisor, de shape compatível (sem zeros)."}}',
  output_schema   = '{"result":{"description":"Resultado de A / B, elemento a elemento."}}',
  how_it_works    = 'Divide A por B elemento a elemento. Os shapes devem ser iguais ou compatíveis por broadcast.',
  usage_tips      = 'Divisão por zero gera inf/NaN — verifique B antes. Útil para razões espectrais, como amostra ÷ referência para obter transmitância.',
  historical_note = NULL
WHERE slug = 'divisao_elementwise' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada de entrada."}}',
  output_schema   = '{"eigenvalues":{"type":"vector","description":"Autovalores — objeto com chaves \\"real\\" e \\"imag\\"."},"eigenvectors":{"type":"matrix","description":"Autovetores correspondentes, um por coluna."}}',
  how_it_works    = 'Calcula autovalores e autovetores juntos numa única operação — equivalente a rodar `autovalores` e `autovetores` ao mesmo tempo, mais eficiente que separado quando se precisa dos dois.',
  usage_tips      = 'Prefira `eig` quando precisar dos dois resultados: a decomposição é feita uma única vez. Só aceita matriz quadrada. Os autovalores vêm separados em parte real e imaginária.',
  historical_note = NULL
WHERE slug = 'eig' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada. Valores muito grandes (>709) causam overflow."}}',
  output_schema   = '{"result":{"description":"e^x para cada elemento — mesmo shape que X."}}',
  how_it_works    = 'Calcula eˣ para cada elemento x do array — a função exponencial, que é a inversa do logaritmo natural. Transforma dados no espaço logarítmico de volta ao espaço linear.',
  usage_tips      = 'Útil para desfazer uma transformação log aplicada anteriormente, ou quando o modelo foi ajustado no espaço log e as predições precisam voltar à escala original. Valores grandes de entrada produzem overflow — verifique a faixa dos dados.',
  historical_note = NULL
WHERE slug = 'exp' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"X_exp":{"description":"Array com um eixo a mais, de tamanho 1."}}',
  how_it_works    = 'Adiciona um novo eixo de tamanho 1 num array, na posição especificada — operação inversa do squeeze, útil pra compatibilizar shapes antes de outra operação (ex: concatenação, broadcast).',
  usage_tips      = 'Útil para alinhar shapes antes de operações com broadcast — por exemplo, transformar um vetor (n,) em coluna (n,1) com axis=1 antes de multiplicá-lo por uma matriz.',
  historical_note = NULL
WHERE slug = 'expand_dims' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Sinal 1D ou matriz de sinais. A FFT é calculada ao longo do eixo especificado."}}',
  output_schema   = '{"frequencies":{"type":"vector","description":"Frequências correspondentes a cada bin, em unidades de 1/sample_spacing."},"magnitude":{"description":"Amplitude de cada componente de frequência."},"phase":{"description":"Fase de cada componente (em radianos)."}}',
  how_it_works    = 'Calcula a Transformada Rápida de Fourier (FFT real) ao longo de um eixo, decompondo o sinal no domínio da frequência. Retorna a magnitude (amplitudes espectrais), a fase e as frequências correspondentes a cada bin de frequência.',
  usage_tips      = 'Multiplique o parâmetro sample_spacing pelo passo de amostragem real (ex: 1/taxa_amostragem) para ter as frequências em Hz. Magnitudes altas em baixas frequências geralmente indicam deriva de linha de base; em altas frequências, ruído.',
  historical_note = 'O algoritmo FFT moderno foi publicado por James Cooley e John Tukey em 1965, mas a ideia já havia sido usada por Gauss por volta de 1805 para calcular órbitas de asteroides.'
WHERE slug = 'fft' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Valores arredondados para baixo — mesmo shape que X."}}',
  how_it_works    = 'Retorna o maior inteiro menor ou igual a cada elemento (arredonda sempre para baixo, em direção a -∞). floor(-1.5) = -2.',
  usage_tips      = 'Útil para converter valores contínuos em índices ou contagens. Para arredondar ao inteiro mais próximo use `round`; para cima, `ceil`.',
  historical_note = NULL
WHERE slug = 'floor' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X_unf":{"type":"matrix","description":"Matriz 2D a ser reorganizada em tensor."}}',
  output_schema   = '{"X":{"type":"tensor","description":"Tensor reconstruído, com o shape informado em `original_shape`."}}',
  how_it_works    = 'Reorganiza ("dobra") uma matriz 2D de volta num tensor de ordem superior, revertendo uma operação de unfolding anterior — útil depois de processar dados desdobrados (ex: num U-PLS) e precisar voltar à estrutura multiway original pra visualização.',
  usage_tips      = 'Para reconstruir o tensor corretamente, `original_shape`, `mode` e `ordering` precisam ser os mesmos usados no `unfolding` correspondente (o `unfolding` devolve `original_shape` e `mode` justamente para isso).',
  historical_note = NULL
WHERE slug = 'folding' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada, disponível na expressão como `X`. Entradas adicionais conectadas ficam disponíveis pelo nome da porta."}}',
  output_schema   = '{"result":{"description":"Resultado da expressão aplicada."}}',
  how_it_works    = 'Aplica uma expressão matemática definida pelo próprio usuário sobre os dados, avaliada com segurança (via um parser de árvore sintática, não `eval` direto) — útil pra operações pontuais que não têm um nó dedicado no catálogo.',
  usage_tips      = 'A entrada conectada fica disponível na expressão pelo nome da porta (por padrão, `X`) e só podem ser usadas as funções da lista de permissão: sqrt, log, log10, exp, abs, mean, std, min, max, sum, transpose, reshape e norm — por exemplo, `sqrt(X) + 2*X`. Qualquer outra chamada, atributo ou nome proibido é rejeitado na validação, por segurança. Outras variáveis conectadas ao bloco também ficam disponíveis pelo nome da porta.',
  historical_note = NULL
WHERE slug = 'formula_customizada' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{}',
  output_schema   = '{"dataset":{"description":"Dados importados como array NumPy."},"dtype":{"description":"Tipo numérico, ex: float64."},"sample_axis":{"type":"scalar","description":"Eixo das amostras conforme parâmetro sample_axis."},"shape":{"type":"vector","description":"Shape do array importado, ex: [200, 1024]."}}',
  how_it_works    = 'Lê um arquivo de dados externo (CSV, Excel, NumPy, HDF5, Zarr) e retorna um dataset pronto pra uso no workflow — é tipicamente o primeiro nó de qualquer pipeline.',
  usage_tips      = 'Informe o caminho no parâmetro `file_path`; com `format=auto` o formato é detectado pela extensão (CSV, XLSX, NPY, NPZ, HDF5 ou Zarr). Em arquivos com vários conjuntos de dados (NPZ, HDF5, Zarr) é lido o primeiro. Em CSV/XLSX a primeira linha é tratada como cabeçalho e as demais colunas precisam ser numéricas. `sample_axis` diz qual eixo representa as amostras.',
  historical_note = NULL
WHERE slug = 'importacao' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada e não-singular."}}',
  output_schema   = '{"A_inv":{"type":"matrix","description":"Matriz inversa de A."}}',
  how_it_works    = 'Calcula a matriz inversa A⁻¹, tal que A·A⁻¹ = identidade. Só existe pra matrizes quadradas não-singulares (determinante ≠ 0).',
  usage_tips      = 'Só existe para matrizes quadradas e não singulares. Se der erro de matriz singular, use `pseudo_inversa`. Em regressão, evite inverter X''X explicitamente — prefira PLS/PCR ou a pseudo-inversa, que são numericamente mais estáveis.',
  historical_note = NULL
WHERE slug = 'inversa' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Amostras × variáveis (sample_axis configurável, aceita N-way)"}}',
  output_schema   = '{"train":{"description":"Subconjunto de calibração/treino"},"test":{"description":"Subconjunto de teste"},"validation":{"description":"Subconjunto de validação (presente apenas quando n_validation/validation_size > 0)"},"train_indices":{"type":"vector","description":"Índices originais (em X) do conjunto de treino"},"test_indices":{"type":"vector","description":"Índices originais (em X) do conjunto de teste"},"validation_indices":{"type":"vector","description":"Índices originais (em X) do conjunto de validação"}}',
  how_it_works    = 'Seleciona iterativamente a amostra mais distante (distância Euclidiana) das já escolhidas, começando pelas duas amostras mais distantes entre si — garante que o conjunto de calibração cubra toda a variabilidade multivariada presente nos dados, em vez de uma divisão aleatória que pode deixar regiões do espaço de amostras mal representadas.',
  usage_tips      = 'O tamanho do treino é definido por `n_train` (número) ou `train_size` (fração; padrão 0,7) e o da validação, opcional, por `n_validation`/`validation_size`; o que sobra vira teste. A porta `validation` só existe quando a validação é pedida. Aplique ANTES de pré-processamentos que aprendem parâmetros dos dados (autoscaling, MSC) para evitar vazamento de informação do teste para o treino. Como o método é determinístico, a mesma entrada sempre gera a mesma divisão.',
  historical_note = 'Proposto por R.W. Kennard e L.A. Stone em 1969 como método de desenho de experimentos ("Computer Aided Design of Experiments"); hoje é o método padrão em quimiometria para dividir dados em treino/teste/validação antes de uma calibração multivariada.'
WHERE slug = 'kennard_stone' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Matriz de dados a limpar."}}',
  output_schema   = '{"X_clean":{"description":"Dados sem as amostras/variáveis problemáticas."},"removed_indices":{"type":"vector","description":"Índices das linhas/colunas removidas."}}',
  how_it_works    = 'Remove amostras ou variáveis problemáticas: com axis=0 remove as linhas (amostras); com axis=1, as colunas (variáveis). Uma linha/coluna é removida se contiver qualquer NaN ou Inf (cada verificação pode ser desligada por parâmetro) ou se sua variância for menor ou igual ao limiar `threshold_zero_variance` (variância zero = não carrega informação).',
  usage_tips      = '`removed_indices` informa exatamente o que saiu. Se você removeu amostras de X, remova as mesmas amostras de y (por exemplo com `selecao_amostras`) para manter X e y alinhados.',
  historical_note = NULL
WHERE slug = 'limpeza' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{}',
  output_schema   = '{"result":{"type":"vector","description":"Vetor 1D com N valores igualmente espaçados de start a stop."}}',
  how_it_works    = 'Gera um vetor de N valores igualmente espaçados entre start e stop (inclusive os dois extremos). Ao contrário de range() que trabalha com inteiros, linspace aceita valores de ponto flutuante e garante que o último elemento seja exatamente stop.',
  usage_tips      = 'Útil para criar eixos de comprimento de onda, grades de concentrações ou eixos de tempo uniformes. Combine com outras funções: linspace + sin() gera uma onda senoidal.',
  historical_note = NULL
WHERE slug = 'linspace' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de valores positivos (> 0). Zero e negativos causam erro."}}',
  output_schema   = '{"result":{"description":"Logaritmo de cada elemento — mesmo shape que X."}}',
  how_it_works    = 'Calcula o logaritmo de cada elemento. Base natural (ln) por padrão; aceita também log₂ e log₁₀. Transforma relações multiplicativas em aditivas — útil para linearizar dados que seguem lei de potência ou lognormal.',
  usage_tips      = 'Todos os valores de entrada devem ser positivos. Em espectroscopia, a transformação log10 converte absorbância em transmitância (log10(1/T)). Frequentemente combinado com SNV ou MSC antes da modelagem PLS.',
  historical_note = NULL
WHERE slug = 'log' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Valor(es) máximo(s) encontrado(s)."}}',
  how_it_works    = 'Retorna o valor máximo de um array, ao longo do eixo especificado.',
  usage_tips      = 'Use `axis` para escolher a direção (axis=0: um valor por variável/coluna; axis=1: um por amostra); sem `axis`, considera o array inteiro. `keepdims=true` preserva o número de eixos e facilita operações seguintes com broadcast.',
  historical_note = NULL
WHERE slug = 'max' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Média calculada (escalar ou vetor, conforme o eixo)."}}',
  how_it_works    = 'Calcula a média dos valores de um array, ao longo do eixo especificado (ou do array todo).',
  usage_tips      = 'Use `axis` para escolher a direção (axis=0: média de cada variável; axis=1: média de cada amostra); sem `axis`, a média é do array inteiro. Com `keepdims=true` o resultado pode ser subtraído direto do original (X − mean(X)) para centrar os dados.',
  historical_note = NULL
WHERE slug = 'mean' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Mediana calculada."}}',
  how_it_works    = 'Calcula a mediana dos valores de um array, ao longo do eixo especificado — mais robusta a outliers do que a média.',
  usage_tips      = 'Prefira a mediana à média quando houver outliers ou distribuição assimétrica — ela praticamente não é afetada por valores extremos. `axis` e `keepdims` funcionam como em `mean`.',
  historical_note = NULL
WHERE slug = 'median' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Valor(es) mínimo(s) encontrado(s)."}}',
  how_it_works    = 'Retorna o valor mínimo de um array, ao longo do eixo especificado.',
  usage_tips      = 'Use `axis` para escolher a direção (axis=0: um valor por variável/coluna; axis=1: um por amostra); sem `axis`, considera o array inteiro. Útil, por exemplo, para localizar a absorbância mínima de cada espectro.',
  historical_note = NULL
WHERE slug = 'min' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array dividendo."}}',
  output_schema   = '{"result":{"description":"Resto de X / divisor, elemento a elemento."}}',
  how_it_works    = 'Calcula o resto da divisão de X por divisor, com resultado do mesmo sinal que o divisor (comportamento MATLAB). Diferente do operador % do Python, que dá resultado do mesmo sinal que o dividendo.',
  usage_tips      = 'O resultado tem o mesmo sinal do divisor (convenção MATLAB). Útil para ciclos e periodicidades — por exemplo, índice mod 2 para separar posições pares e ímpares.',
  historical_note = NULL
WHERE slug = 'mod' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Primeiro array."},"B":{"description":"Segundo array, de shape compatível."}}',
  output_schema   = '{"result":{"description":"Resultado de A ⊙ B, elemento a elemento."}}',
  how_it_works    = 'Multiplica A por B elemento a elemento (produto de Hadamard — diferente do produto matricial). Os shapes devem ser iguais ou compatíveis por broadcast.',
  usage_tips      = 'Não confunda com `produto_matricial`. Útil para aplicar uma máscara (0/1) ou um vetor de pesos por variável, anulando ou realçando regiões do espectro.',
  historical_note = NULL
WHERE slug = 'multiplicacao_elementwise' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Vetor ou matriz de entrada."}}',
  output_schema   = '{"result":{"description":"Valor da norma calculada."}}',
  how_it_works    = 'Calcula a norma de um vetor ou matriz (magnitude), conforme o tipo escolhido (L1, L2/Euclidiana, infinito, Frobenius).',
  usage_tips      = 'Sem parâmetros: norma de Frobenius (matrizes) ou L2 (vetores) do array inteiro, devolvida como escalar. `ord` escolhe outros tipos (1, 2, infinito…) e `axis` calcula a norma por linha/coluna, devolvendo um vetor. Dividir cada espectro pela sua norma é uma forma simples de normalização vetorial.',
  historical_note = NULL
WHERE slug = 'norma' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Primeira matriz."},"B":{"type":"matrix","description":"Segunda matriz, com número de linhas igual ao de colunas de A."}}',
  output_schema   = '{"result":{"type":"matrix","description":"Produto A·B."}}',
  how_it_works    = 'Multiplica duas matrizes (A·B), respeitando a regra de compatibilidade de dimensões (colunas de A = linhas de B).',
  usage_tips      = 'O número de colunas de A precisa ser igual ao número de linhas de B; a ordem importa (A·B ≠ B·A). Exemplo clássico: reconstruir dados de uma PCA multiplicando scores por loadings transpostos.',
  historical_note = NULL
WHERE slug = 'produto_matricial' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz de entrada, qualquer formato."}}',
  output_schema   = '{"A_pinv":{"type":"matrix","description":"Pseudo-inversa de A."}}',
  how_it_works    = 'Calcula a pseudo-inversa de Moore-Penrose, que generaliza a inversa pra matrizes não-quadradas ou singulares — é o que torna possível resolver sistemas de mínimos quadrados (como em OLS/MLR) mesmo quando a matriz não é quadrada.',
  usage_tips      = 'Use no lugar da inversa quando a matriz é singular, mal-condicionada ou não quadrada. Exemplo: coeficientes de regressão por mínimos quadrados, b = pinv(X)·y.',
  historical_note = 'Desenvolvida independentemente por Eliakim Moore (1920) e Roger Penrose (1955).'
WHERE slug = 'pseudo_inversa' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz de entrada."}}',
  output_schema   = '{"result":{"type":"scalar","description":"Posto da matriz (número inteiro)."}}',
  how_it_works    = 'Calcula o posto (rank) de uma matriz — o número de linhas/colunas linearmente independentes. Útil pra saber, por exemplo, quantos componentes PARAFAC/PCA fazem sentido extrair no máximo.',
  usage_tips      = 'O posto numérico depende da tolerância `tol`: valores muito pequenos contam ruído como informação. Dá um teto para o número de componentes úteis de PCA/PLS — nunca há mais componentes não nulos que o posto de X.',
  historical_note = NULL
WHERE slug = 'rank' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"X_r":{"description":"Array reorganizado no novo shape."}}',
  how_it_works    = 'Reorganiza os dados de um array num novo formato (shape), mantendo o mesmo número total de elementos — ex: transformar um vetor de 100 pontos numa matriz 10×10.',
  usage_tips      = 'O produto das dimensões de `new_shape` precisa ser igual ao número total de elementos; a ordem dos elementos (linha a linha) é preservada, só a forma muda.',
  historical_note = NULL
WHERE slug = 'reshape' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Array arredondado — mesmo shape que X."}}',
  how_it_works    = 'Arredonda cada elemento para o número especificado de casas decimais. Com decimals=0 (padrão), arredonda para inteiro; com decimals negativo, arredonda para dezenas, centenas, etc.',
  usage_tips      = '`decimals` negativo arredonda para dezenas, centenas etc. Atenção: arredondar dados espectrais descarta informação — use principalmente para exibição ou relatórios, não antes da modelagem.',
  historical_note = NULL
WHERE slug = 'round' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Matriz de dados completa."}}',
  output_schema   = '{"X_sel":{"description":"Subconjunto de amostras selecionado."}}',
  how_it_works    = 'Seleciona um subconjunto de amostras (linhas) de um dataset, por índice explícito ou por máscara booleana.',
  usage_tips      = 'Informe `indices` (lista de posições) ou `mask` (lista de verdadeiro/falso por amostra); `sample_axis` diz qual eixo contém as amostras. Para aplicar a mesma seleção a X e a y, use um bloco para cada array, informando os mesmos `indices`/`mask` nos dois.',
  historical_note = NULL
WHERE slug = 'selecao_amostras' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Matriz de dados completa."}}',
  output_schema   = '{"X_sel":{"description":"Subconjunto de variáveis selecionado."},"selected_indices":{"type":"vector","description":"Índices das variáveis mantidas."}}',
  how_it_works    = 'Seleciona um subconjunto de variáveis de um dataset, por lista de índices, intervalo (`range`: início, fim, passo) ou máscara booleana. O parâmetro `mode` indica o EIXO sobre o qual a seleção é aplicada (padrão 1, as colunas). Diferente das técnicas de seleção ''inteligente'' (como o VIP e o iPLS), aqui a escolha é manual.',
  usage_tips      = 'Muito usado para recortar uma região espectral de interesse antes da modelagem (ex.: range [200, 800]). A saída `selected_indices` registra quais posições foram mantidas — útil para aplicar a mesma seleção a novos dados.',
  historical_note = NULL
WHERE slug = 'selecao_variaveis' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Array com -1, 0 ou +1 em cada posição."}}',
  how_it_works    = 'Retorna o sinal de cada elemento: -1 para negativos, 0 para zero, +1 para positivos. Separa a magnitude do sinal — pode ser combinado com abs() para reconstruir o valor original.',
  usage_tips      = 'Útil para separar o sentido (positivo/negativo) da magnitude: `sign(X) * abs(X)` reconstrói o original. Também serve para contar quantas vezes um sinal cruza zero.',
  historical_note = NULL
WHERE slug = 'sign' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array a recortar (qualquer ordem)."}}',
  output_schema   = '{"X_sl":{"description":"Sub-região selecionada do array original."}}',
  how_it_works    = 'Seleciona uma parte (sub-região) de um ou mais eixos de um array, por intervalo de índices — ex: recortar só uma faixa de comprimentos de onda.',
  usage_tips      = '`ranges` define, por eixo, o recorte [início, fim, passo]. Exemplo: {"1": [100, 400]} mantém as variáveis das posições 100 a 399 e deixa os demais eixos intactos. Os índices começam em 0 e o fim não é incluído.',
  historical_note = NULL
WHERE slug = 'slice' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Primeiro array."},"B":{"description":"Segundo array, de shape compatível."}}',
  output_schema   = '{"result":{"description":"Resultado de A + B, elemento a elemento."}}',
  how_it_works    = 'Soma A + B elemento a elemento. Os shapes devem ser iguais ou compatíveis por broadcast.',
  usage_tips      = 'Com broadcast é possível somar um vetor a cada linha de uma matriz (ex.: restaurar a média depois de centrar os dados).',
  historical_note = NULL
WHERE slug = 'soma' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array a ser ordenado."}}',
  output_schema   = '{"indices":{"description":"Índices originais de cada elemento na ordem resultante."},"result":{"description":"Array com os elementos ordenados."}}',
  how_it_works    = 'Ordena os elementos ao longo do eixo especificado. Retorna tanto os valores ordenados quanto os índices de origem (argsort), permitindo aplicar a mesma ordenação a outros arrays.',
  usage_tips      = 'Use para ordenar espectros por comprimento de onda, amostras por concentração, ou scores por magnitude. Os índices de saída permitem reordenar outras variáveis na mesma ordem.',
  historical_note = NULL
WHERE slug = 'sort' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array a dividir."}}',
  output_schema   = '{"part_1":{"description":"Primeira parte do array dividido."},"part_2":{"description":"Segunda parte do array dividido."},"part_3":{"description":"Terceira parte (só existe se o corte gerar 3 ou mais partes)."},"part_4":{"description":"Quarta parte (só existe se o corte gerar 4 ou mais partes)."}}',
  how_it_works    = 'Divide um array em partes ao longo de um eixo (`axis`). `indices_or_sections` define o corte: um inteiro N divide em N partes iguais (o tamanho do eixo precisa ser divisível por N); uma lista de índices divide nesses pontos.',
  usage_tips      = 'As saídas se chamam part_1, part_2, … e o editor expõe as quatro primeiras; uma saída só existe se o corte gerar pelo menos aquele número de partes. Para uma divisão treino/teste otimizada, veja o Kennard-Stone.',
  historical_note = NULL
WHERE slug = 'split' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de valores não-negativos. Valores negativos causam erro."}}',
  output_schema   = '{"result":{"description":"Raiz quadrada de cada elemento — mesmo shape que X."}}',
  how_it_works    = 'Calcula a raiz quadrada de cada elemento do array. Todos os valores devem ser ≥ 0 para resultado real. Lineariza relações onde a grandeza física cresce como o quadrado da variável medida.',
  usage_tips      = 'Aplicar sqrt antes da PCA pode ajudar quando os dados seguem distribuição de Poisson (contagens). Também usado para converter variâncias em desvios padrão.',
  historical_note = NULL
WHERE slug = 'sqrt' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"X_sq":{"description":"Array sem os eixos de tamanho 1."}}',
  how_it_works    = 'Remove eixos de tamanho 1 de um array, sem alterar os dados — útil pra limpar dimensões redundantes depois de alguma operação.',
  usage_tips      = 'Útil após operações que deixam eixos de tamanho 1 (ex.: `mean` com keepdims, ou fatias). Se `axis` for informado, só esse eixo é removido — e ele precisa ter tamanho 1.',
  historical_note = NULL
WHERE slug = 'squeeze' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Primeiro array a empilhar."},"B":{"description":"Segundo array, de shape idêntico a A."}}',
  output_schema   = '{"result":{"description":"Array resultante com um eixo a mais que os de entrada."}}',
  how_it_works    = 'Empilha dois arrays (A e B) de mesmo shape ao longo de um NOVO eixo, criando um array de dimensão maior — por exemplo, empilhar dois espectros 1D numa matriz 2D, ou duas matrizes num tensor 3D.',
  usage_tips      = 'A e B precisam ter shape idêntico. `axis` define onde o novo eixo é inserido: duas matrizes (n, p) empilhadas com axis=0 viram um tensor (2, n, p). Para juntar ao longo de um eixo existente, use `concatenacao`.',
  historical_note = NULL
WHERE slug = 'stack' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Desvio padrão calculado."}}',
  how_it_works    = 'Calcula o desvio padrão dos valores de um array, ao longo do eixo especificado — mede a dispersão dos dados em torno da média.',
  usage_tips      = 'Por padrão calcula o desvio padrão populacional (ddof=0); use ddof=1 para o desvio amostral (divisão por N−1). `axis=0` dá um valor por variável, a base do autoscaling.',
  historical_note = 'O termo ''desvio padrão'' foi introduzido por Karl Pearson em 1893.'
WHERE slug = 'std' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"description":"Primeiro array (minuendo)."},"B":{"description":"Segundo array (subtraendo), de shape compatível."}}',
  output_schema   = '{"result":{"description":"Resultado de A - B, elemento a elemento."}}',
  how_it_works    = 'Subtrai B de A (A − B) elemento a elemento. Os shapes devem ser iguais ou compatíveis por broadcast.',
  usage_tips      = 'Com broadcast, subtrair um vetor-média de cada linha de X equivale a centrar os dados. Também útil para remover um espectro de referência/branco.',
  historical_note = NULL
WHERE slug = 'subtracao' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada."}}',
  output_schema   = '{"result":{"description":"Soma calculada."}}',
  how_it_works    = 'Soma todos os valores de um array, ao longo do eixo especificado.',
  usage_tips      = 'Use `axis` para somar em uma direção (axis=0: total de cada variável; axis=1: total de cada amostra). Em espectros, somar sobre o eixo espectral dá a intensidade total de cada amostra — base de uma normalização por área.',
  historical_note = NULL
WHERE slug = 'sum' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz de entrada, qualquer formato (não precisa ser quadrada)."}}',
  output_schema   = '{"S":{"type":"vector","description":"Valores singulares, em ordem decrescente."},"U":{"type":"matrix","description":"Vetores singulares à esquerda."},"Vt":{"type":"matrix","description":"Vetores singulares à direita (transpostos)."}}',
  how_it_works    = 'Decompõe qualquer matriz X em três matrizes: U (vetores singulares à esquerda), Σ (valores singulares, em ordem decrescente de importância) e Vᵀ (vetores singulares à direita), de forma que X = U·Σ·Vᵀ. É a operação matemática por trás da PCA — os valores singulares ao quadrado são proporcionais à variância explicada.',
  usage_tips      = 'Saídas: U, S (valores singulares, em ordem decrescente) e Vt. Com `full_matrices=false` (padrão) o cálculo é econômico. Para dados centrados, os scores de uma PCA são U·S e os loadings são as linhas de Vt — mas para análise exploratória o bloco `pca` já entrega tudo pronto.',
  historical_note = 'O teorema da decomposição em valores singulares remonta a trabalhos independentes de Eugenio Beltrami e Camille Jordan na década de 1870 — muito antes de qualquer aplicação computacional existir.'
WHERE slug = 'svd' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"A":{"type":"matrix","description":"Matriz quadrada de entrada."}}',
  output_schema   = '{"result":{"type":"scalar","description":"Traço da matriz."}}',
  how_it_works    = 'Calcula o traço de uma matriz quadrada — a soma dos elementos da diagonal principal.',
  usage_tips      = 'A soma dos autovalores é igual ao traço. Para uma matriz de covariância, o traço é a variância total dos dados — o denominador da variância explicada por componente na PCA.',
  historical_note = NULL
WHERE slug = 'trace' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada, qualquer ordem."}}',
  output_schema   = '{"X_T":{"description":"Array com os eixos transpostos/permutados."}}',
  how_it_works    = 'Transpõe (permuta) os eixos de uma matriz ou tensor N-way — troca linhas por colunas (ou reordena os modos, em tensores).',
  usage_tips      = 'Sem informar `axes`, a ordem dos eixos é invertida (em matrizes, troca linhas por colunas). Em tensores, `axes` define a permutação desejada — por exemplo [1, 0, 2] troca os dois primeiros modos.',
  historical_note = NULL
WHERE slug = 'transpose' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Matriz de dados com valores ausentes."}}',
  output_schema   = '{"X_filled":{"description":"Dados após tratamento dos valores ausentes."}}',
  how_it_works    = 'Trata valores ausentes (NaN) segundo a estratégia escolhida em `strategy`: ''mean'' ou ''median'' (preenche com a média/mediana da coluna), ''zero'' (preenche com 0), ''interpolate'' (interpolação linear ao longo de cada linha) ou ''drop'' (remove as amostras que contêm NaN). Para imputações mais sofisticadas, veja a família ''Dados Faltantes'' (ainda em desenvolvimento nesta versão).',
  usage_tips      = 'Com ''drop'', lembre de remover as mesmas amostras de y. ''interpolate'' faz sentido para espectros (pontos vizinhos são parecidos); ''mean''/''median'' são mais apropriados para variáveis independentes. Sempre inspecione quantos NaN existiam antes: preencher muitos valores distorce o modelo.',
  historical_note = NULL
WHERE slug = 'tratamento_missing' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array com 2 ou mais dimensões (tensor N-way) a ser desdobrado em matriz."}}',
  output_schema   = '{"X_unf":{"type":"matrix","description":"Matriz 2D resultante do desdobramento ao longo do modo escolhido."},"mode":{"type":"scalar","description":"Modo usado como linhas do desdobramento (o mesmo parâmetro `mode`)."},"original_shape":{"type":"vector","description":"Shape do tensor original, necessário para reverter com `folding`."}}',
  how_it_works    = 'Desdobra ("achata") um tensor de ordem superior numa matriz 2D, ao longo de um modo escolhido — passo necessário antes de aplicar qualquer técnica que só aceita entrada 2D (ex: PCA comum) sobre dados originalmente multiway.',
  usage_tips      = 'Passo típico antes de aplicar PCA ou PLS em dados multiway. `mode` escolhe qual modo vira as LINHAS da matriz (mode=0 mantém as amostras como linhas). Guarde `original_shape` e `mode`: são necessários para desfazer a operação com `folding`.',
  historical_note = NULL
WHERE slug = 'unfolding' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array 1D ou N-D (será aplainado internamente)."}}',
  output_schema   = '{"counts":{"type":"vector","description":"Número de ocorrências de cada valor único."},"result":{"description":"Valores únicos, ordenados."}}',
  how_it_works    = 'Retorna os valores únicos (sem repetição) do array, ordenados. Também retorna a contagem de ocorrências de cada valor único — útil para análise de distribuição de rótulos de classe.',
  usage_tips      = 'Use unique(y) para verificar quais classes existem e quantas amostras cada uma tem antes de treinar um modelo de classificação. Desequilíbrio entre classes pode exigir estratégias de balanceamento.',
  historical_note = NULL
WHERE slug = 'unique' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"description":"Array de entrada cujo quadrado do desvio padrão será calculado."}}',
  output_schema   = '{"result":{"description":"Variância calculada ao longo do eixo escolhido."}}',
  how_it_works    = 'Calcula a dispersão dos dados em torno da média — média dos quadrados dos desvios. Com ddof=0 (padrão) é a variância populacional; com ddof=1 é a amostral (divisão por N-1).',
  usage_tips      = 'Use var(X) antes de escalar os dados para entender quanto cada variável contribui para a variância total. var(X, axis=0) calcula por coluna (por variável), axis=1 por linha (por amostra).',
  historical_note = NULL
WHERE slug = 'var' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados a ser escalada."}}',
  output_schema   = '{"X_as":{"type":"matrix","description":"Dados centrados e escalados (média 0, variância 1 por coluna)."},"mean_":{"type":"vector","description":"Médias por coluna usadas no centramento."},"std_":{"type":"vector","description":"Desvios padrão por coluna usados no escalonamento."}}',
  how_it_works    = 'Centra cada variável na própria média e depois divide pelo próprio desvio padrão, deixando todas as variáveis com média 0 e variância 1 (também chamado de padronização Z-score, ou UV-scaling em quimiometria).',
  usage_tips      = 'Essencial antes de qualquer técnica sensível a escala (PCA de dados não-espectrais, KNN, SVM, clustering) quando as variáveis têm unidades ou magnitudes muito diferentes entre si — sem isso, a variável de maior variância numérica domina o modelo mesmo sem ser a mais relevante quimicamente.',
  historical_note = NULL
WHERE slug = 'autoscaling' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros com deriva de linha de base."}}',
  output_schema   = '{"X_bl":{"type":"matrix","description":"Espectros com linha de base estimada e removida."}}',
  how_it_works    = 'Estima e subtrai a linha de base (deriva lenta e suave do sinal, não relacionada aos picos de interesse) de cada espectro. Métodos disponíveis em `method`: ajuste linear, polinomial (grau em `degree`), ''rubberband'' (envoltória inferior convexa, como um elástico esticado por baixo do espectro) e ALS (suavização assimétrica por mínimos quadrados, controlada por `lambda_`).',
  usage_tips      = 'Necessário sempre que o instrumento ou a amostra introduz deriva de fundo (comum em Raman, por exemplo) — sem corrigir, a linha de base pode dominar a variância capturada por uma PCA, mascarando a informação química real.',
  historical_note = NULL
WHERE slug = 'baseline' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados a ser centrada."}}',
  output_schema   = '{"X_c":{"type":"matrix","description":"Dados centrados na média (cada coluna com média zero)."},"mean_":{"type":"vector","description":"Vetor de médias por coluna usado na centralização — necessário para aplicar em novos dados."}}',
  how_it_works    = 'Subtrai de cada variável (coluna) sua própria média, deixando todas centradas em zero — sem alterar a escala/variância, diferente do autoscaling.',
  usage_tips      = 'Pré-requisito matemático da PCA clássica (PCA sem centrar mistura a direção de maior variância com a posição da média, distorcendo os componentes) — a maioria das implementações de PCA já faz isso internamente, mas é bom saber o que está rodando por baixo.',
  historical_note = NULL
WHERE slug = 'centering' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros brutos."}}',
  output_schema   = '{"X_msc":{"type":"matrix","description":"Espectros corrigidos por MSC."},"reference_used":{"type":"vector","description":"Espectro de referência usado na correção (normalmente a média do conjunto de treino)."}}',
  how_it_works    = 'Multiplicative Scatter Correction: regride cada espectro individual contra um espectro de referência (geralmente a média de todas as amostras) e usa os coeficientes dessa regressão (inclinação e intercepto) pra corrigir o efeito multiplicativo/aditivo de espalhamento.',
  usage_tips      = 'Alternativa ao SNV com resultado quase sempre equivalente — a diferença é que MSC depende de um espectro de referência (calculado a partir do próprio conjunto de treino), então precisa guardar essa referência pra aplicar em dados novos depois.',
  historical_note = 'Desenvolvido por Paul Geladi, Hans Martens e Tormod Næs em 1985, praticamente ao mesmo tempo em que o campo da quimiometria NIR se consolidava.'
WHERE slug = 'msc' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros."}}',
  output_schema   = '{"X_sg":{"type":"matrix","description":"Espectros suavizados ou derivados pelo filtro Savitzky-Golay."}}',
  how_it_works    = 'Ajusta um polinômio de grau baixo a uma janela deslizante de pontos ao redor de cada ponto do espectro, por mínimos quadrados, e usa esse polinômio pra suavizar o ponto (ordem 0) ou calcular sua derivada (1ª ou 2ª ordem) sem precisar de diferenças finitas brutas, que amplificam ruído.',
  usage_tips      = 'Derivadas (1ª ou 2ª) removem efeitos de linha de base e sobreposição de picos — muito usado antes de PLS em NIR. Janela maior suaviza mais mas também pode distorcer picos estreitos; comece com janela pequena e aumente só se precisar.',
  historical_note = 'Publicado por Abraham Savitzky e Marcel Golay em 1964 — um dos artigos mais citados da química analítica, por resolver de forma elegante o compromisso entre suavizar ruído e preservar a forma dos picos.'
WHERE slug = 'savitzky_golay' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros brutos (amostras × comprimentos de onda)."}}',
  output_schema   = '{"X_snv":{"type":"matrix","description":"Espectros SNV-corrigidos (cada espectro centrado e escalado pelo próprio desvio padrão)."}}',
  how_it_works    = 'Standard Normal Variate: normaliza cada espectro individualmente, subtraindo sua própria média e dividindo pelo seu próprio desvio padrão — linha por linha, não coluna por coluna. Remove efeitos multiplicativos e aditivos de espalhamento de luz (scatter) causados por diferença de tamanho de partícula entre amostras.',
  usage_tips      = 'Quase sempre o primeiro pré-processamento aplicado em espectros NIR de sólidos, antes de qualquer modelagem. Equivalente em efeito ao MSC na maioria dos casos — raramente se usa os dois juntos.',
  historical_note = 'Proposto por R.J. Barnes, M.S. Dhanoa e Susan Lister em 1989, especificamente pra corrigir efeitos de espalhamento em espectros NIR de amostras sólidas/em pó.'
WHERE slug = 'snv' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz amostras × variáveis. Recomenda-se autoscaling prévio se as variáveis tiverem escalas muito diferentes."}}',
  output_schema   = '{"dendrogram_data":{"description":"Coordenadas prontas pra desenhar o dendrograma (icoord/dcoord/leaves/cores)."},"linkage_matrix":{"type":"matrix","description":"Matriz de ligação (formato scipy) descrevendo cada fusão de clusters."}}',
  how_it_works    = 'Agrupa amostras por similaridade de forma hierárquica: começa tratando cada amostra como seu próprio cluster e vai fundindo os dois clusters mais próximos (por alguma métrica de distância, ex: Euclidiana) repetidamente, até sobrar um só. O resultado é um dendrograma — uma árvore que mostra em que distância cada fusão aconteceu.',
  usage_tips      = 'Escolha `method` (padrão ''ward'') e `metric` (padrão ''euclidean''; o Ward exige distância euclidiana e a impõe automaticamente). Não exige definir o número de clusters antes: você decide olhando onde cortar o dendrograma. Dados em escalas muito diferentes devem passar por autoscaling antes, senão a variável de maior escala domina a distância. As saídas fornecem a matriz de ligação (formato SciPy) e as coordenadas já prontas do dendrograma.',
  historical_note = 'O método de linkage mais usado (Ward, 1963) minimiza o aumento de variância dentro dos clusters a cada fusão — é o mais indicado quando os clusters esperados são razoavelmente esféricos e de tamanho parecido.'
WHERE slug = 'hca' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados (idealmente já os scores de uma PCA, não o espectro bruto)."}}',
  output_schema   = '{"outlier_mask":{"type":"vector","description":"Máscara booleana marcando quais amostras são consideradas outliers."},"scores_":{"type":"vector","description":"Score de anomalia de cada amostra (maior = mais atípica)."},"threshold":{"type":"scalar","description":"Limiar de decisão usado: amostras com score acima dele são marcadas como outliers (χ² para Mahalanobis/Hotelling; percentil dos scores para Isolation Forest)."}}',
  how_it_works    = 'Identifica amostras anômalas por um de três métodos (`method`): ''hotelling'' (padrão) e ''mahalanobis'', que medem a distância de Mahalanobis de cada amostra ao centro dos dados (considerando a correlação entre variáveis) e marcam como outlier quem ultrapassa o limiar χ² para o nível `alpha`; ou ''isolation_forest'', que mede quão fácil é isolar a amostra em árvores aleatórias — amostras atípicas se isolam com poucos cortes.',
  usage_tips      = 'Rode logo depois da exploração por PCA e antes de treinar qualquer modelo supervisionado: amostras com erro de medição grosseiro ou contaminação distorcem o modelo se entrarem no treino. Nesta versão ''hotelling'' e ''mahalanobis'' usam o mesmo cálculo. Com poucas amostras em relação às variáveis a matriz de covariância fica mal condicionada — nesse caso aplique a detecção sobre os scores de uma PCA.',
  historical_note = NULL
WHERE slug = 'outlier_detection' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados, amostras nas linhas e variáveis (ex: comprimentos de onda) nas colunas. Recomenda-se já ter passado por algum pré-processamento (SNV/MSC/baseline) se forem espectros."}}',
  output_schema   = '{"explained_variance":{"type":"vector","description":"Variância absoluta explicada por cada componente."},"explained_variance_ratio":{"type":"vector","description":"Fração da variância total explicada por cada componente (soma ≤ 1)."},"loadings":{"type":"matrix","description":"Peso de cada variável em cada componente."},"scores":{"type":"matrix","description":"Coordenadas das amostras nos componentes principais."}}',
  how_it_works    = 'Decompõe a matriz X (amostras × variáveis) em um pequeno número de componentes principais — combinações lineares das variáveis originais, ortogonais entre si, ordenadas pela quantidade de variância que capturam. Calculado por SVD. O resultado são os scores (posição de cada amostra nos novos eixos) e os loadings (peso de cada variável original em cada componente).',
  usage_tips      = 'É quase sempre o primeiro passo de qualquer análise exploratória: usa pra ver agrupamentos, tendências e outliers antes de partir pra um modelo supervisionado. Muitas outras técnicas do catálogo (SIMCA, Leverage/Influência, MCR-ALS) dependem de rodar uma PCA antes.',
  historical_note = 'Proposto por Karl Pearson em 1901 como um ajuste geométrico de linhas e planos aos dados, e formalizado em termos estatísticos por Harold Hotelling em 1933. É a técnica mais usada em quimiometria para explorar dados multivariados antes de qualquer modelagem.'
WHERE slug = 'pca' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados (amostras × variáveis) usada para ajustar um modelo PCA por classe."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra de treino."}}',
  output_schema   = '{"classes":{"type":"vector","description":"Rótulos das classes encontradas em y, na ordem dos modelos."},"distances":{"description":"Distância ortogonal de cada amostra ao modelo de cada classe (um vetor por classe)."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Resumo do modelo SIMCA (tipo e número de componentes por classe)."},"thresholds":{"description":"Limiar de distância de cada classe (acima dele, a amostra não pertence à classe)."}}',
  how_it_works    = 'Constrói um modelo PCA separado para CADA classe, usando só as amostras dela. Cada amostra é testada contra o modelo de cada classe pela distância ortogonal (soma dos quadrados do resíduo após projetar no modelo da classe), comparada a um limiar derivado de uma distribuição χ² ao nível `alpha`. A amostra é atribuída à classe de menor distância dentro do limiar; as métricas de calibração são calculadas sobre essa atribuição.',
  usage_tips      = 'É a escolha certa quando você quer saber não só ''qual classe'', mas também se a amostra pertence a alguma classe conhecida. `n_components` vale para todos os modelos de classe (é reduzido automaticamente se a classe tiver poucas amostras). Classes com poucas amostras geram modelos instáveis — confira `thresholds` e `distances`.',
  historical_note = 'Proposto por Svante Wold em 1976 (Soft Independent Modelling of Class Analogies) — é o método clássico de "one-class modeling" em quimiometria, anterior e conceitualmente diferente da ideia moderna de One-Class SVM.'
WHERE slug = 'simca' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros."},"y":{"type":"vector","description":"Valor de referência a ser previsto."}}',
  output_schema   = '{"all_intervals":{"description":"Lista com, para cada intervalo testado, seu índice, posição inicial/final e o RMSECV obtido."},"best_interval":{"description":"Intervalo espectral com menor erro de validação cruzada."},"model":{"type":"model","description":"Resumo da execução do iPLS (técnica e número de intervalos)."},"selected_indices":{"type":"vector","description":"Índices das variáveis que pertencem ao melhor intervalo — pronto para recortar X com `selecao_variaveis`."}}',
  how_it_works    = 'Interval PLS: divide o espectro em `n_intervals` janelas contíguas de mesmo tamanho e treina um PLS separado (validação cruzada com `n_folds` partes) em cada uma, comparando o erro RMSECV. O intervalo com menor erro é o que carrega a informação química mais relevante para a propriedade de interesse.',
  usage_tips      = 'Bom primeiro passo de seleção de variáveis quando você quer uma resposta interpretável (''essa faixa espectral é a que importa'') em vez de um subconjunto disperso de pontos, como dão o VIP ou o CARS. Os intervalos são fixos e consecutivos, então escolha `n_intervals` de modo que cada janela tenha pontos suficientes para o número de componentes usado.',
  historical_note = 'Proposto por Lars Nørgaard e colaboradores em 2000, como alternativa interpretável à seleção de variáveis ponto a ponto.'
WHERE slug = 'ipls' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras."},"y":{"type":"vector","description":"Valor de referência a ser previsto."}}',
  output_schema   = '{"coefficients":{"type":"vector","description":"Coeficientes da regressão linear de y sobre os scores."},"loadings":{"type":"matrix","description":"Loadings da PCA de X (peso de cada variável em cada componente)."},"metrics_cal":{"description":"Métricas de calibração (ajuste no próprio conjunto de treino): RMSEC, R2C e bias."},"model":{"type":"model","description":"Metadados do modelo PCR treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores da PCA de X (posição das amostras nos componentes usados na regressão)."}}',
  how_it_works    = 'Regressão por Componentes Principais: primeiro roda uma PCA em X (sem olhar pra y), depois regride y linearmente sobre os scores desses componentes. Diferente do PLS, a escolha dos componentes não leva em conta a relação com y — só a variância de X.',
  usage_tips      = 'É o contraponto clássico pra comparar com PLS: em geral o PLS precisa de menos componentes pra atingir o mesmo erro, porque já otimiza pensando em y desde o início — mas PCR pode ser mais robusto quando y é ruidoso, já que a etapa de PCA é cega a esse ruído.',
  historical_note = 'A regressão por componentes principais foi popularizada por William Massy em 1965 como forma de lidar com a multicolinearidade na regressão.'
WHERE slug = 'pcr' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras (amostras × variáveis)."},"Y":{"description":"Variável(is) resposta (amostras × respostas) — Y maiúsculo."}}',
  output_schema   = '{"metrics_cal":{"description":"Métricas de calibração: RMSEC, R2C, bias."},"model":{"type":"model","description":"Objeto do modelo PLS treinado com pesos internos."},"regression_vector":{"type":"vector","description":"Vetor de regressão (coeficientes espectrais)."},"x_loadings":{"type":"matrix","description":"Loadings de X."},"x_scores":{"type":"matrix","description":"Scores de X (projeção das amostras no espaço latente)."},"x_weights":{"type":"matrix","description":"Pesos de X."},"y_loadings":{"type":"matrix","description":"Loadings de Y."}}',
  how_it_works    = 'Regressão supervisionada que, ao contrário do PCR, escolhe os componentes (variáveis latentes) olhando simultaneamente pra X e pra y — maximiza a covariância entre eles em vez de só a variância de X. Isso costuma dar modelos mais parcimoniosos (menos componentes) quando a propriedade de interesse realmente se relaciona com a estrutura espectral.',
  usage_tips      = 'É o método de regressão mais usado quando as variáveis preditoras (ex: espectro) são muitas e correlacionadas entre si. Escolha o número de componentes por validação cruzada, não visualmente — mais componentes nem sempre é melhor (overfitting).',
  historical_note = 'Desenvolvido por Herman Wold no fim dos anos 1960/70 (econometria) e adaptado pra química por seu filho Svante Wold e Harald Martens no início dos anos 1980 — se tornou o método padrão de calibração multivariada em NIR/quimiometria desde então.'
WHERE slug = 'pls' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras de treino."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra de treino."}}',
  output_schema   = '{"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo KNN treinado (tipo e principais hiperparâmetros)."}}',
  how_it_works    = 'Classifica uma amostra nova olhando as K amostras de treino mais próximas dela (por alguma distância, geralmente Euclidiana) e atribuindo a classe majoritária entre essas K vizinhas. Não existe "treino" de verdade — o modelo é só o conjunto de treino guardado.',
  usage_tips      = 'Simples e sem suposições sobre a forma da fronteira entre classes, mas sofre em alta dimensão (muitas variáveis espectrais) se não reduzir dimensionalidade antes (ex: usar os scores de uma PCA em vez do espectro bruto). Sensível à escala — normalize antes.',
  historical_note = 'O método dos vizinhos mais próximos foi proposto por Evelyn Fix e Joseph Hodges em 1951 e analisado teoricamente por Thomas Cover e Peter Hart em 1967.'
WHERE slug = 'knn' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras (idealmente scores de PCA, não espectro bruto, se houver mais variáveis que amostras)."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra."}}',
  output_schema   = '{"loadings":{"type":"matrix","description":"Coeficientes (scalings) de cada variável em cada eixo discriminante."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo LDA treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores discriminantes: projeção das amostras nos eixos que melhor separam as classes."}}',
  how_it_works    = 'Linear Discriminant Analysis: encontra a combinação linear das variáveis que melhor separa as classes conhecidas, maximizando a distância entre as médias das classes relativa à dispersão dentro de cada classe. Assume que as classes têm a mesma matriz de covariância (fronteiras de decisão lineares).',
  usage_tips      = 'Baseline clássico pra comparar com PLS-DA: mais simples e interpretável, mas assume que o número de amostras é bem maior que o de variáveis (o que raramente é o caso em espectroscopia crua) — por isso, aplique sobre scores de PCA, não sobre o espectro bruto.',
  historical_note = 'Proposto por Ronald Fisher em 1936 ("discriminante linear de Fisher") — um dos métodos de classificação mais antigos da estatística, ainda hoje usado como baseline.'
WHERE slug = 'lda' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros/variáveis preditoras."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra (categórica, codificada internamente como dummy)."}}',
  output_schema   = '{"classes":{"type":"vector","description":"Rótulos das classes, na ordem das colunas da resposta dummy."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo PLS-DA treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores do PLS-DA (posição das amostras no espaço latente)."},"x_loadings":{"type":"matrix","description":"Loadings de X nos componentes latentes."},"x_weights":{"type":"matrix","description":"Pesos de X nos componentes latentes."}}',
  how_it_works    = 'Mesma ideia do PLS, mas usado pra classificação: a variável y vira uma codificação binária/dummy das classes (1 se pertence à classe, 0 se não), e o PLS aprende a separar essas classes no espaço latente. A predição de uma amostra nova é um valor contínuo que se compara a um limiar (threshold) pra decidir a classe.',
  usage_tips      = 'Boa escolha quando há muitas variáveis correlacionadas (típico em espectroscopia), em que LDA/SVM sofrem. Escolha `n_components` por validação cruzada. Para detectar amostras que não pertencem a nenhuma classe conhecida, SIMCA costuma ser mais apropriado que PLS-DA, que sempre atribui a amostra a alguma classe.',
  historical_note = NULL
WHERE slug = 'pls_da' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de amostras (de todas as classes). A classe-alvo, escolhida em `target_class`, é a usada para ajustar o modelo."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra; a classe-alvo é escolhida em `target_class` (padrão: a primeira classe encontrada)."}}',
  output_schema   = '{"T2_scores":{"type":"vector","description":"Valor de T² de cada amostra da classe-alvo no espaço dos scores do PLS."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo PLS one-class treinado (tipo e principais hiperparâmetros)."},"threshold_T2":{"type":"scalar","description":"Limiar de T² de Hotelling para aceitar uma amostra como pertencente à classe-alvo."}}',
  how_it_works    = 'Variante one-class do PLS: modela só a classe-alvo (`target_class`). Para calibrar a fronteira, gera pseudo-amostras negativas como permutações aleatórias dos valores da própria classe-alvo, ajusta um PLS entre amostras reais (1) e pseudo-negativas (0) e define um limiar baseado no T² de Hotelling dos scores da classe-alvo (nível `alpha`).',
  usage_tips      = 'Útil quando você só tem amostras confiáveis de UMA classe (ex: só tem o produto "bom", não tem exemplos rotulados de todos os jeitos de ser "ruim"). Nesse cenário é mais indicado que PLS-DA, que precisa de exemplos de todas as classes.',
  historical_note = NULL
WHERE slug = 'pls_oc' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra."}}',
  output_schema   = '{"feature_importances":{"type":"vector","description":"Importância de cada variável na decisão do conjunto de árvores (soma 1)."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo Random Forest treinado (tipo e principais hiperparâmetros)."}}',
  how_it_works    = 'Treina muitas árvores de decisão independentes, cada uma vendo um subconjunto aleatório das amostras e das variáveis, e combina os votos de todas para decidir a classe final. A aleatoriedade entre as árvores reduz o overfitting em comparação com uma árvore única. Nesta versão o bloco é um classificador.',
  usage_tips      = 'Não exige normalização dos dados (é invariante a escala) e dá de graça uma medida de importância de variável — pode ser usado tanto como classificador quanto pra entender quais regiões do espectro mais pesam na decisão.',
  historical_note = 'Introduzido por Leo Breiman em 2001, consolidando ideias anteriores de bagging (do próprio Breiman, 1996) com seleção aleatória de variáveis.'
WHERE slug = 'random_forest' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra."}}',
  output_schema   = '{"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo SVM treinado (tipo e principais hiperparâmetros)."},"support_vectors":{"type":"matrix","description":"Amostras de treino que definem a fronteira de decisão (vetores de suporte)."}}',
  how_it_works    = 'Encontra a fronteira de decisão que maximiza a margem entre classes. Para dados não linearmente separáveis no espaço original, usa um kernel (RBF é o mais comum) que projeta os dados num espaço de dimensão maior onde a separação linear passa a ser possível, sem precisar calcular essa projeção explicitamente ("kernel trick").',
  usage_tips      = 'Costuma performar bem mesmo com poucas amostras e muitas variáveis (cenário comum em espectroscopia), mas é sensível à escala dos dados — sempre normalize/autoscale antes de treinar.',
  historical_note = 'Formalizado por Vladimir Vapnik e Corinna Cortes em 1995, com base na teoria de aprendizado estatístico que Vapnik vinha desenvolvendo desde os anos 1960.'
WHERE slug = 'svm' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados de treino."}}',
  output_schema   = '{"model":{"type":"model","description":"Metadados do modelo Autoencoder treinado (tipo e principais hiperparâmetros)."},"latent":{"type":"matrix","description":"Representação comprimida de cada amostra no espaço latente (amostras × latent_dim)."},"reconstruction_error":{"type":"scalar","description":"Erro médio de reconstrução do treino (média, entre as amostras, da soma dos quadrados do erro de cada amostra). Valor único: indica quão bem a rede representa os dados, não o erro de cada amostra."},"history":{"description":"Métricas da última época do treinamento (ex.: loss e, se disponíveis, métricas de validação)."}}',
  how_it_works    = 'Rede neural treinada para reconstruir a própria entrada passando por um ''gargalo'' central (`latent_dim`) bem menor que a entrada, o que força a aprender uma representação compacta dos dados. O parâmetro `variant` escolhe a versão padrão ou variacional. O bloco devolve a representação comprimida de cada amostra (`latent`) e o erro médio de reconstrução do treino.',
  usage_tips      = 'Útil para redução de dimensionalidade não linear — use `latent` como entrada de outro modelo — e para ter uma noção de quão comprimíveis os dados são. Nesta versão o erro de reconstrução é um único valor (média das amostras), não um por amostra; para identificar amostras anômalas individuais, aplique `outlier_detection` sobre `latent`.',
  historical_note = 'A ideia de redes que aprendem a comprimir e reconstruir sua própria entrada remonta aos anos 1980; a versão variacional (geração probabilística, não só compressão) foi formalizada por Kingma e Welling em 2013.'
WHERE slug = 'autoencoder' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros (amostras × comprimentos de onda)."},"y":{"type":"vector","description":"Valor a prever ou rótulo de classe."}}',
  output_schema   = '{"history":{"description":"Métricas da última época do treinamento (ex.: loss e, se disponíveis, métricas de validação)."},"model":{"type":"model","description":"Metadados do modelo CNN-1D treinado (tipo e principais hiperparâmetros)."}}',
  how_it_works    = 'Rede neural convolucional adaptada pra sinais 1D (espectros): em vez de olhar o espectro inteiro de uma vez como o MLP faz, aplica filtros pequenos que deslizam ao longo do eixo espectral, aprendendo padrões locais (formas de picos, derivadas) que se repetem em posições diferentes — compartilhando os mesmos pesos em toda a extensão do espectro.',
  usage_tips      = 'Mais indicada que MLP quando há muitos pontos espectrais e padrões locais importam mais que a posição exata — mas exige um conjunto de treino consideravelmente maior pra não fazer overfitting. Teste PLS/PCR antes como baseline.',
  historical_note = 'As redes convolucionais remontam ao trabalho de Yann LeCun e colaboradores no fim dos anos 1980 (reconhecimento de dígitos manuscritos); a aplicação a sinais 1D e espectros é bem mais recente.'
WHERE slug = 'cnn_1d' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros de treino."}}',
  output_schema   = '{"model":{"type":"model","description":"Metadados do modelo de difusão treinado (tipo e principais hiperparâmetros)."},"X_denoised":{"type":"matrix","description":"Espectros com ruído removido (só quando task = ''denoise'')."},"X_augmented":{"type":"matrix","description":"Espectros sintéticos gerados (só quando task = ''augment'')."},"training_loss":{"description":"Perda final do treinamento (média das últimas épocas)."}}',
  how_it_works    = 'Modelo generativo que aprende a reverter um processo de adição gradual de ruído a espectros reais. Conforme `task`, ele remove ruído dos espectros de entrada (task=''denoise'', o padrão → saída `X_denoised`) ou gera espectros sintéticos para aumentar o conjunto de treino (task=''augment'' → saída `X_augmented`, com `n_augment` amostras).',
  usage_tips      = 'Pensado para dois usos: limpar ruído de espectros reais ou gerar dados sintéticos para aumentar um conjunto de treino pequeno demais. Só uma das duas saídas (`X_denoised` ou `X_augmented`) é preenchida, conforme `task`. É o modelo mais experimental e pesado do catálogo — espere tempos de treino bem maiores que os demais.',
  historical_note = 'A formulação moderna ("Denoising Diffusion Probabilistic Models") foi proposta por Ho, Jain e Abbeel em 2020, hoje a base de geradores de imagem como Stable Diffusion e DALL-E — aplicação a espectros é uma adaptação bem mais recente.'
WHERE slug = 'diffusion' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras."},"y":{"type":"vector","description":"Valor a prever (regressão) ou rótulo de classe (classificação), conforme parâmetro `task`."}}',
  output_schema   = '{"history":{"description":"Métricas da última época do treinamento (ex.: loss e, se disponíveis, métricas de validação)."},"model":{"type":"model","description":"Metadados do modelo MLP treinado (tipo e principais hiperparâmetros)."}}',
  how_it_works    = 'Rede neural densa clássica: camadas de neurônios totalmente conectadas, cada uma aplicando uma transformação linear seguida de uma não-linearidade (ex: ReLU). Treinada por retropropagação do erro (backpropagation) pra minimizar o erro de predição, seja em regressão ou classificação (controlado pelo parâmetro `task`).',
  usage_tips      = 'Precisa de bem mais amostras de treino que PLS/PCR pra generalizar bem, e é mais sensível a overfitting — considere PLS primeiro como baseline e só suba pra MLP se a relação entre X e y for claramente não-linear.',
  historical_note = 'A base teórica (perceptron) é de Frank Rosenblatt (1958); a versão multicamada com backpropagation eficiente que a tornou treinável na prática veio com os trabalhos de Rumelhart, Hinton e Williams em 1986.'
WHERE slug = 'mlp' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de sequências (amostras × passos), ex: espectro tratado como sequência, ou série temporal de processo."},"y":{"type":"vector","description":"Valor a prever ou rótulo de classe."}}',
  output_schema   = '{"history":{"description":"Métricas da última época do treinamento (ex.: loss e, se disponíveis, métricas de validação)."},"model":{"type":"model","description":"Metadados do modelo RNN treinado (tipo e principais hiperparâmetros)."}}',
  how_it_works    = 'Rede neural recorrente (LSTM ou GRU, conforme parâmetro): processa o espectro como uma sequência, mantendo um "estado" interno que carrega informação dos pontos anteriores ao processar cada novo ponto — pensada originalmente pra dados sequenciais no tempo, mas pode ser aplicada a espectros tratando o eixo espectral como uma sequência.',
  usage_tips      = 'Menos comum que CNN-1D pra dados espectrais puros (que não têm uma noção forte de "ordem temporal"), mas pode valer a pena se os dados tiverem componente temporal real (ex: monitoramento de processo ao longo do tempo).',
  historical_note = 'A arquitetura LSTM foi proposta por Sepp Hochreiter e Jürgen Schmidhuber em 1997, resolvendo o problema de gradientes que desaparecem em RNNs simples; GRU é uma simplificação posterior (Cho et al., 2014).'
WHERE slug = 'rnn' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de espectros (amostras × comprimentos de onda)."},"y":{"type":"vector","description":"Valor a prever ou rótulo de classe."}}',
  output_schema   = '{"model":{"type":"model","description":"Metadados do modelo Transformer treinado (tipo e principais hiperparâmetros)."},"history":{"description":"Métricas da última época do treinamento (ex.: loss e, se disponíveis, métricas de validação)."}}',
  how_it_works    = 'Arquitetura baseada em mecanismo de atenção (self-attention): em vez de processar a sequência ponto a ponto como a RNN, calcula diretamente o quanto cada ponto do espectro "deveria prestar atenção" em cada outro ponto, capturando relações entre regiões distantes do espectro sem precisar de recorrência.',
  usage_tips      = 'É a arquitetura mais pesada em dados/computação do catálogo — só vale a pena com volume considerável de dados de treino; pra datasets pequenos, PLS ou CNN-1D tendem a generalizar melhor.',
  historical_note = 'Introduzido por Vaswani et al. em 2017 ("Attention Is All You Need"), originalmente pra tradução automática — hoje é a base dos grandes modelos de linguagem, e vem sendo adaptado também pra sinais espectrais.'
WHERE slug = 'transformer' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de misturas (ex: espectros ao longo do tempo de uma reação) — amostras/tempo × comprimento de onda."}}',
  output_schema   = '{"C":{"type":"matrix","description":"Perfis de concentração estimados: amostras × componentes."},"S":{"type":"matrix","description":"Espectros puros estimados: variáveis × componentes (cada coluna é o espectro de um componente)."},"X_reconstructed":{"type":"matrix","description":"Reconstrução de X a partir do modelo (C·Sᵀ)."},"fit":{"type":"scalar","description":"Qualidade do ajuste: 1 − ‖X − C·Sᵀ‖/‖X‖ (quanto mais perto de 1, melhor)."},"model":{"type":"model","description":"Resumo da execução do MCR-ALS (técnica e número de componentes)."}}',
  how_it_works    = 'Multivariate Curve Resolution — Alternating Least Squares: decompõe um conjunto de misturas (X ≈ C·Sᵀ) nos perfis de concentração (C) e nos espectros puros (S) dos componentes, sem precisar saber de antemão quais são. Alterna entre estimar C e S por mínimos quadrados — com restrição de não-negatividade ativada por padrão (`non_neg_C`, `non_neg_S`) — até a perda variar menos que `tol` ou atingir `n_iter` iterações.',
  usage_tips      = 'A técnica clássica para decompor misturas desconhecidas em componentes puros — comum em monitoramento de reações e análise de misturas sem padrões. O resultado depende do número de componentes escolhido (`n_components`) e das restrições; como a inicialização é aleatória (com semente fixa), teste mais de um número de componentes e confira o ajuste (`fit`) e se os espectros puros fazem sentido químico.',
  historical_note = 'O algoritmo ALS pra MCR foi desenvolvido por Romà Tauler e Anna de Juan ao longo dos anos 1990, consolidando trabalho anterior de resolução de curvas que remonta a Lawton e Sylvestre (1971).'
WHERE slug = 'mcr_als' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"tensor","description":"Tensor de ordem ≥ 3 (ex: amostras × excitação × emissão, em fluorescência)."}}',
  output_schema   = '{"core_consistency":{"description":"Reservado para o diagnóstico de consistência do núcleo — ainda não calculado nesta versão (o valor retornado é sempre nulo)."},"factors":{"description":"Lista de matrizes de fatores, uma por modo do tensor."},"fit":{"type":"scalar","description":"Qualidade do ajuste (1 - ||X - X_rec|| / ||X||), de 0 a 1."},"model":{"type":"model","description":"Metadados do modelo: type e rank."},"weights":{"type":"vector","description":"Pesos normalizados de cada componente."}}',
  how_it_works    = 'Decompõe um tensor de ordem 3 (ou mais) numa soma de componentes trilineares — cada componente é o produto externo de um vetor por modo (ex: perfil de concentração, espectro de excitação, espectro de emissão) — análogo multiway da PCA, mas com a vantagem de ter solução única sob condições brandas (ao contrário da PCA/Tucker, que têm ambiguidade de rotação).',
  usage_tips      = 'É a técnica de referência para decompor dados de fluorescência EEM (matriz excitação-emissão) em componentes químicos puros, sem calibração prévia — a unicidade da solução é o que torna isso possível. `rank` é o número de componentes: teste vários valores e compare `fit`. O diagnóstico de consistência do núcleo (core consistency) ainda não é calculado nesta versão.',
  historical_note = 'Proposto independentemente por Richard Harshman (1970, como "PARAFAC") e J. Douglas Carroll & Jih-Jie Chang (1970, como "CANDECOMP") — são o mesmo método, hoje chamado de CP decomposition (CANDECOMP/PARAFAC) na literatura mais recente.'
WHERE slug = 'parafac' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"tensor","description":"Tensor de ordem ≥ 3."}}',
  output_schema   = '{"core":{"type":"tensor","description":"Tensor núcleo da decomposição Tucker."},"factors":{"description":"Lista de matrizes de loadings, uma por modo."},"fit":{"type":"scalar","description":"Qualidade do ajuste (1 - ||X - X_rec|| / ||X||), de 0 a 1."},"model":{"type":"model","description":"Metadados: type e ranks por modo."}}',
  how_it_works    = 'Decompõe um tensor de ordem 3 num núcleo (core) menor mais três matrizes de loadings, uma por modo — diferente do PARAFAC, permite um número diferente de componentes por modo e captura interações entre componentes de modos diferentes (via o núcleo), mas em troca não tem solução única.',
  usage_tips      = 'Use em vez de PARAFAC quando não há motivo pra esperar trilinearidade exata nos dados, ou quando quer explorar quantos componentes cada modo realmente precisa de forma independente.',
  historical_note = 'Proposto por Ledyard Tucker em 1966, antes mesmo do PARAFAC — é a generalização multiway mais direta da PCA (PCA é um caso particular de Tucker com um modo só).'
WHERE slug = 'tucker3' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"tensor","description":"Tensor de dados, ordem ≥ 3 (ex: amostras × excitação × emissão)."},"y":{"type":"vector","description":"Valor de referência a ser previsto, um por amostra."}}',
  output_schema   = '{"metrics_cal":{"description":"Métricas de calibração (ajuste no próprio conjunto de treino): RMSEC, R2C e bias."},"model":{"type":"model","description":"Metadados do modelo N-PLS treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores das amostras no espaço latente (amostras × componentes)."},"x_loadings":{"type":"matrix","description":"Loadings do PLS sobre o tensor desdobrado (variáveis desdobradas × componentes)."}}',
  how_it_works    = 'Interface de PLS para dados de ordem superior (tensores). Nesta versão beta o ajuste é feito desdobrando o tensor numa matriz (amostras × demais modos achatados) e aplicando um PLS comum; o N-PLS trilinear original (Bro, 1996), que preserva a estrutura de cada modo, ainda não está implementado — na prática o resultado equivale a um PLS sobre o tensor desdobrado.',
  usage_tips      = 'Use quando X tem 3 ou mais modos (ex.: amostras × excitação × emissão em fluorescência). Os scores e loadings devolvidos referem-se ao tensor desdobrado, então a interpretação por modo não está disponível. Compare com o `u_pls`, que acrescenta normalização por coluna antes do PLS.',
  historical_note = 'Proposto por Rasmus Bro em 1996, estendendo o PLS pra dados multiway mantendo a interpretabilidade por modo que se perde ao simplesmente desdobrar o tensor.'
WHERE slug = 'n_pls' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"tensor","description":"Tensor de dados, ordem ≥ 3 — será desdobrado internamente em matriz antes do PLS."},"y":{"type":"vector","description":"Valor de referência a ser previsto."}}',
  output_schema   = '{"metrics_cal":{"description":"Métricas de calibração (ajuste no próprio conjunto de treino): RMSEC, R2C e bias."},"model":{"type":"model","description":"Metadados do modelo U-PLS treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores das amostras no espaço latente (amostras × componentes)."}}',
  how_it_works    = 'Desdobra (unfold) o tensor de entrada numa matriz 2D (amostras × todos os outros modos achatados), normaliza cada coluna (média 0, desvio 1) e roda um PLS comum sobre ela — mais simples que um N-PLS verdadeiro, mas perde a separação entre os modos originais.',
  usage_tips      = 'Mais rápido e simples de interpretar que N-PLS quando a estrutura multilinear não é o foco — mas se os diferentes modos do tensor tiverem significado físico distinto que você quer preservar na interpretação do modelo, prefira N-PLS.',
  historical_note = NULL
WHERE slug = 'u_pls' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"tensor","description":"Tensor de dados, será desdobrado internamente."},"y":{"type":"vector","description":"Rótulo de classe de cada amostra."}}',
  output_schema   = '{"classes":{"type":"vector","description":"Rótulos das classes, na ordem das colunas da resposta dummy."},"metrics_cal":{"description":"Métricas de classificação na calibração: acurácia e acurácia balanceada."},"model":{"type":"model","description":"Metadados do modelo PLS-DA multiway treinado (tipo e principais hiperparâmetros)."},"scores":{"type":"matrix","description":"Scores das amostras no espaço latente do PLS-DA (amostras × componentes)."}}',
  how_it_works    = 'Versão do PLS-DA aplicada a dados desdobrados (unfolded) de ordem superior — classifica amostras cujo dado bruto é um tensor (ex: imagem hiperespectral, EEM de fluorescência) desdobrando-o em matriz antes de rodar a discriminação.',
  usage_tips      = 'Caminho mais direto pra classificar a partir de dados multiway sem perder tempo construindo um modelo multilinear completo primeiro — bom ponto de partida antes de tentar algo mais sofisticado como PARAFAC-SIMCA.',
  historical_note = NULL
WHERE slug = 'multiway_pls_da' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de variáveis preditoras (amostras × variáveis)."},"y":{"type":"vector","description":"Resposta (valor de referência) de cada amostra."}}',
  output_schema   = '{"model":{"type":"model","description":"Resumo do PLS interno usado (técnica e número de componentes efetivo)."},"n_selected":{"type":"scalar","description":"Quantidade de variáveis selecionadas."},"selected_indices":{"type":"vector","description":"Índices das variáveis com VIP ≥ threshold."},"threshold":{"type":"scalar","description":"Limiar de VIP usado na seleção."},"vip_scores":{"type":"vector","description":"Score VIP de cada variável — valores > 1 geralmente indicam variável relevante."}}',
  how_it_works    = 'Variable Importance in Projection: ajusta internamente um modelo PLS (`n_components`) de y sobre X e calcula, para cada variável, sua contribuição para explicar y ao longo de todos os componentes (os pesos de cada componente são ponderados pela variância de y que ele explica). Variáveis com VIP maior ou igual a `threshold` (padrão 1,0, regra prática comum) são selecionadas.',
  usage_tips      = 'Recebe X e y diretamente — não é preciso rodar um PLS antes, o bloco treina o seu. Use `selected_indices` para recortar X (com `selecao_variaveis`) e re-treinar o PLS com menos variáveis. Para evitar vazamento de informação, calcule o VIP usando apenas o conjunto de treino.',
  historical_note = 'Formalizado por Svante Wold e colaboradores nos anos 1990 como ferramenta de interpretação/seleção de variáveis específica pra modelos PLS.'
WHERE slug = 'vip' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de dados de treino."},"y":{"type":"vector","description":"Valor de referência (regressão) ou rótulo (classificação)."}}',
  output_schema   = '{"model":{"type":"model","description":"Metadados do modelo validado: tipo e estratégia de CV."},"metrics_cv":{"description":"Métricas calculadas sobre as predições de todas as rodadas de validação cruzada. Regressão: RMSEC, R2C e bias (os nomes das chaves são os mesmos da calibração, mas os valores vêm da validação cruzada); classificação: acurácia e acurácia balanceada."},"n_splits":{"type":"scalar","description":"Número efetivo de divisões realizadas."}}',
  how_it_works    = 'Divide os dados em partes, treina o modelo várias vezes deixando uma parte de fora para testar e agrega o erro de todas as rodadas. O esquema vem de `cv_type`: ''kfold'' (`n_folds` partes), ''loo'' (leave-one-out) ou ''montecarlo'' (`n_iter` divisões aleatórias com `test_size` de teste). O modelo avaliado é escolhido em `method` (padrão ''pls''). Dá uma estimativa mais honesta do erro em dados novos do que olhar o erro do próprio treino.',
  usage_tips      = 'Essencial pra escolher hiperparâmetros (ex: número de componentes do PLS) sem usar o conjunto de teste final — usar o erro de treino puro pra essa escolha quase sempre leva a overfitting. Não substitui uma validação externa com dados nunca vistos.',
  historical_note = 'A validação cruzada como critério de escolha de modelos foi formalizada por Mervyn Stone (1974) e Seymour Geisser (1975), de forma independente.'
WHERE slug = 'cross_validation' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X":{"type":"matrix","description":"Matriz de preditoras (amostras × variáveis). Com muitas variáveis, prefira os scores de uma PCA."},"y":{"type":"vector","description":"Resposta (valor de referência) de cada amostra."}}',
  output_schema   = '{"cooks_distance":{"type":"vector","description":"Distância de Cook — influência combinada de leverage e resíduo."},"high_leverage_samples":{"type":"vector","description":"Índices das amostras com leverage acima do limiar."},"leverage":{"type":"vector","description":"Leverage de cada amostra (influência na estrutura do modelo)."},"model":{"type":"model","description":"Resumo do diagnóstico (técnica usada)."},"n_high_leverage":{"type":"scalar","description":"Número de amostras classificadas como alto leverage."},"threshold_leverage":{"type":"scalar","description":"Limiar de leverage usado para marcar amostras como de alta influência."}}',
  how_it_works    = 'Ajusta uma regressão linear de y sobre X (mínimos quadrados) e calcula, para cada amostra, o leverage (diagonal da hat matrix H = X(XᵀX)⁻¹Xᵀ — quão atípica a amostra é no espaço das variáveis, ou seja, sua influência potencial) e a distância de Cook (combina leverage e tamanho do resíduo — influência efetiva). Amostras com leverage acima do limiar (padrão 2p/n, ou `threshold_leverage`) são listadas em `high_leverage_samples`.',
  usage_tips      = 'Complementa a Detecção de Outliers: ali o foco é a distância da amostra à distribuição geral; aqui é o quanto cada amostra pesa no ajuste. Como a hat matrix é calculada diretamente sobre as variáveis de X, com espectros (muito mais variáveis que amostras) todos os leverages tendem a 1 e deixam de discriminar — nesse caso aplique o bloco sobre os scores de uma PCA (poucos componentes).',
  historical_note = NULL
WHERE slug = 'leverage_influence' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X_new":{"type":"matrix","description":"Espectros do instrumento secundário a corrigir. Opcional: se omitido, corrige o próprio X_secondary.","required":false},"X_primary":{"type":"matrix","description":"Espectros das amostras de transferência medidos no instrumento/condição de referência (primário)."},"X_secondary":{"type":"matrix","description":"As MESMAS amostras de transferência medidas no instrumento/condição a ser padronizado (secundário)."}}',
  output_schema   = '{"F":{"type":"matrix","description":"Matriz de transformação (variáveis × variáveis) que leva espectros do secundário ao espaço do primário."},"X_corrected":{"type":"matrix","description":"Espectros do secundário (X_new) convertidos para o espaço do instrumento primário."},"model":{"type":"model","description":"Resumo da execução (técnica usada)."}}',
  how_it_works    = 'Direct Standardization: calcula uma matriz de transformação global F = pinv(X_secondary)·X_primary a partir de amostras de transferência medidas nos dois instrumentos (ou condições) e a aplica para converter espectros do instrumento secundário em espectros ''como se'' medidos no primário (X_corrected = X_new·F). Assim um modelo calibrado no primário pode ser usado com dados do secundário sem recalibrar do zero.',
  usage_tips      = 'Precisa de um conjunto de amostras "transfer" medidas nos dois instrumentos/condições — quanto mais representativas da faixa de uso real, melhor a transferência. PDS costuma generalizar melhor quando o desvio entre instrumentos varia ao longo do espectro.',
  historical_note = 'Proposto no grupo de Bruce Kowalski, no início dos anos 1990, como um dos primeiros métodos formais de transferência de calibração entre instrumentos.'
WHERE slug = 'ds' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"X_new":{"type":"matrix","description":"Espectros do instrumento secundário a corrigir. Opcional: se omitido, corrige o próprio X_secondary.","required":false},"X_primary":{"type":"matrix","description":"Espectros das amostras de transferência medidos no instrumento/condição de referência (primário)."},"X_secondary":{"type":"matrix","description":"As MESMAS amostras de transferência medidas no instrumento/condição a ser padronizado (secundário), com o mesmo shape de X_primary."}}',
  output_schema   = '{"X_corrected":{"type":"matrix","description":"Espectros do secundário (X_new) convertidos para o espaço do instrumento primário."},"model":{"type":"model","description":"Resumo da execução (técnica, janela e número de componentes)."}}',
  how_it_works    = 'Piecewise Direct Standardization: variante local do DS. Para cada variável do instrumento primário, ajusta um PLS (`n_components`) usando só uma pequena janela de variáveis vizinhas do instrumento secundário (`window` pontos), e usa esses modelos locais para corrigir novos espectros. Lida melhor com diferenças entre instrumentos que variam ao longo do espectro.',
  usage_tips      = 'Em geral é a escolha padrão sobre o DS puro, principalmente quando a diferença entre instrumentos não é uniforme no espectro todo. X_primary e X_secondary precisam ter o mesmo shape (as mesmas amostras e variáveis) e exige um pouco mais de amostras de transferência para calibrar bem cada janela.',
  historical_note = 'Refinamento local do DS, também originado do grupo de Bruce Kowalski no início dos anos 1990.'
WHERE slug = 'pds' AND is_custom = 0;

UPDATE techniques SET
  input_schema    = '{"results":{"description":"Lista de dicionários de métricas, um por experimento (ex.: a saída `metrics_cal` de vários modelos)."}}',
  output_schema   = '{"best_experiment":{"description":"Primeiro experimento da lista ordenada (o melhor segundo `sort_by`)."},"model":{"type":"model","description":"Resumo da execução (técnica usada)."},"n_experiments":{"type":"scalar","description":"Quantidade de experimentos agregados."},"sorted_results":{"description":"Os resultados originais, ordenados pela métrica `sort_by`."},"summary":{"description":"Estatísticas (média, desvio padrão, mínimo, máximo e valores) de cada métrica agregada."}}',
  how_it_works    = 'Recebe uma lista de resultados de experimentos (cada um um dicionário de métricas, ex.: RMSEC e R2C de vários modelos) e consolida: calcula média, desvio padrão, mínimo e máximo de cada métrica numérica (`summary`) e devolve os resultados ordenados pela métrica escolhida em `sort_by`.',
  usage_tips      = 'Use ao final de uma bateria de testes (ex.: comparar PLS com 3, 5 e 10 componentes) em vez de comparar números espalhados à mão. Por padrão todas as métricas numéricas são agregadas; use `metrics` para escolher quais. A ordenação é crescente: com `sort_by` num erro (RMSE), o melhor experimento vem primeiro.',
  historical_note = NULL
WHERE slug = 'metrics_aggregation' AND is_custom = 0;
