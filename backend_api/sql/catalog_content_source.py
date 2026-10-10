# -*- coding: utf-8 -*-
"""
Conteúdo do módulo Catálogo — as 75 técnicas ativas da versão beta.
Gera o SQL de UPDATE a partir deste dicionário.
"""
import json

# Cada entrada: how_it_works, historical_note (pode ser None), usage_tips (pode ser None),
# inputs: {nome: {"type":..., "description":...}}, outputs: {nome: {"type":..., "description":...}}
T = {}

def add(slug, how, hist, tips, inputs, outputs):
    T[slug] = dict(how_it_works=how, historical_note=hist, usage_tips=tips,
                    inputs=inputs, outputs=outputs)

# ───────────────────────── ANALÍTICAS (37) ─────────────────────────

add("pca",
    "Decompõe a matriz X (amostras × variáveis) em um pequeno número de componentes principais — combinações lineares das variáveis originais, ortogonais entre si, ordenadas pela quantidade de variância que capturam. Calculado por SVD. O resultado são os scores (posição de cada amostra nos novos eixos) e os loadings (peso de cada variável original em cada componente).",
    "Proposto por Karl Pearson em 1901 como um ajuste geométrico de linhas e planos aos dados, e formalizado em termos estatísticos por Harold Hotelling em 1933. É a técnica mais usada em quimiometria para explorar dados multivariados antes de qualquer modelagem.",
    "É quase sempre o primeiro passo de qualquer análise exploratória: usa pra ver agrupamentos, tendências e outliers antes de partir pra um modelo supervisionado. Muitas outras técnicas do catálogo (SIMCA, Leverage/Influência, MCR-ALS) dependem de rodar uma PCA antes.",
    {"X": {"type": "matrix", "description": "Matriz de dados, amostras nas linhas e variáveis (ex: comprimentos de onda) nas colunas. Recomenda-se já ter passado por algum pré-processamento (SNV/MSC/baseline) se forem espectros."}},
    {"scores": {"type": "matrix", "description": "Coordenadas de cada amostra nos componentes principais — shape (amostras, componentes)."},
     "loadings": {"type": "matrix", "description": "Peso de cada variável original em cada componente — shape (variáveis, componentes)."},
     "explained_variance_ratio": {"type": "vector", "description": "Fração da variância total explicada por cada componente, em ordem decrescente."}})

add("hca",
    "Agrupa amostras por similaridade de forma hierárquica: começa tratando cada amostra como seu próprio cluster e vai fundindo os dois clusters mais próximos (por alguma métrica de distância, ex: Euclidiana) repetidamente, até sobrar um só. O resultado é um dendrograma — uma árvore que mostra em que distância cada fusão aconteceu.",
    "O método de linkage mais usado (Ward, 1963) minimiza o aumento de variância dentro dos clusters a cada fusão — é o mais indicado quando os clusters esperados são razoavelmente esféricos e de tamanho parecido.",
    "Não exige escolher o número de clusters antes de rodar (diferente do K-Means) — você decide olhando onde cortar o dendrograma. Dados em escalas muito diferentes devem ser normalizados/autoscaled antes, senão a variável de maior escala domina a distância.",
    {"X": {"type": "matrix", "description": "Matriz amostras × variáveis. Recomenda-se autoscaling prévio se as variáveis tiverem escalas muito diferentes."}},
    {"linkage_matrix": {"type": "matrix", "description": "Matriz de ligação (formato scipy) descrevendo cada fusão de clusters."},
     "dendrogram_data": {"type": "object", "description": "Coordenadas prontas pra desenhar o dendrograma (icoord/dcoord/leaves/cores)."}})

add("pls",
    "Regressão supervisionada que, ao contrário do PCR, escolhe os componentes (variáveis latentes) olhando simultaneamente pra X e pra y — maximiza a covariância entre eles em vez de só a variância de X. Isso costuma dar modelos mais parcimoniosos (menos componentes) quando a propriedade de interesse realmente se relaciona com a estrutura espectral.",
    "Desenvolvido por Herman Wold no fim dos anos 1960/70 (econometria) e adaptado pra química por seu filho Svante Wold e Harald Martens no início dos anos 1980 — se tornou o método padrão de calibração multivariada em NIR/quimiometria desde então.",
    "É o método de regressão mais usado quando as variáveis preditoras (ex: espectro) são muitas e correlacionadas entre si. Escolha o número de componentes por validação cruzada, não visualmente — mais componentes nem sempre é melhor (overfitting).",
    {"X": {"type": "matrix", "description": "Matriz de espectros/variáveis preditoras (amostras × variáveis)."},
     "y": {"type": "vector", "description": "Valor de referência contínuo a ser previsto, uma linha por amostra (ex: concentração medida por método de referência)."}},
    {"model": {"type": "model", "description": "Modelo PLS treinado, pronto pra prever y em novas amostras."},
     "scores": {"type": "matrix", "description": "Projeção das amostras de treino no espaço latente do modelo."}})

add("pls_da",
    "Mesma ideia do PLS, mas usado pra classificação: a variável y vira uma codificação binária/dummy das classes (1 se pertence à classe, 0 se não), e o PLS aprende a separar essas classes no espaço latente. A predição de uma amostra nova é um valor contínuo que se compara a um limiar (threshold) pra decidir a classe.",
    None,
    "Boa escolha quando as classes não são linearmente separáveis de forma óbvia mas o número de variáveis é grande (típico em espectroscopia). Pra detecção de novidade/outlier de classe (\"será que essa amostra nem pertence a nenhuma classe conhecida?\") SIMCA costuma ser mais apropriado que PLS-DA.",
    {"X": {"type": "matrix", "description": "Matriz de espectros/variáveis preditoras."},
     "y": {"type": "vector", "description": "Rótulo de classe de cada amostra (categórica, codificada internamente como dummy)."}},
    {"model": {"type": "model", "description": "Modelo PLS-DA treinado."},
     "predictions": {"type": "labels", "description": "Classe prevista pra cada amostra."}})

add("simca",
    "Constrói um modelo PCA separado pra CADA classe, usando só as amostras daquela classe. Uma amostra nova é testada contra cada modelo de classe (via a distância ao modelo, combinando resíduo Q e T² de Hotelling) — ela pode ser classificada em uma classe, em nenhuma (outlier de todas), ou em mais de uma (classes sobrepostas).",
    "Proposto por Svante Wold em 1976 (Soft Independent Modelling of Class Analogies) — é o método clássico de \"one-class modeling\" em quimiometria, anterior e conceitualmente diferente da ideia moderna de One-Class SVM.",
    "Precisa de uma PCA rodada antes pra cada classe — normalmente o próprio bloco de SIMCA já faz isso internamente. É a técnica certa quando você quer saber não só \"qual classe\" mas também \"essa amostra sequer pertence a alguma classe que eu conheço\".",
    {"X_train": {"type": "matrix", "description": "Espectros de treino, organizados por classe."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra de treino."}},
    {"model": {"type": "model", "description": "Conjunto de modelos PCA (um por classe)."},
     "class_distances": {"type": "matrix", "description": "Distância de cada amostra a cada modelo de classe (combinação de Q-residual e T²)."}})

add("pls_oc",
    "Variante one-class do PLS: em vez de discriminar entre classes conhecidas, modela só a classe-alvo e gera pseudo-amostras negativas aleatórias (fora da região da classe) pra calibrar um limiar de decisão — \"essa amostra pertence à classe-alvo ou não?\".",
    None,
    "Útil quando você só tem amostras confiáveis de UMA classe (ex: só tem o produto \"bom\", não tem exemplos rotulados de todos os jeitos de ser \"ruim\"). Nesse cenário é mais indicado que PLS-DA, que precisa de exemplos de todas as classes.",
    {"X": {"type": "matrix", "description": "Espectros da classe-alvo (treino)."}},
    {"model": {"type": "model", "description": "Modelo one-class treinado."},
     "threshold": {"type": "scalar", "description": "Limiar de decisão calibrado contra os pseudo-negativos."}})

add("svm",
    "Encontra a fronteira de decisão que maximiza a margem entre classes. Para dados não linearmente separáveis no espaço original, usa um kernel (RBF é o mais comum) que projeta os dados num espaço de dimensão maior onde a separação linear passa a ser possível, sem precisar calcular essa projeção explicitamente (\"kernel trick\").",
    "Formalizado por Vladimir Vapnik e Corinna Cortes em 1995, com base na teoria de aprendizado estatístico que Vapnik vinha desenvolvendo desde os anos 1960.",
    "Costuma performar bem mesmo com poucas amostras e muitas variáveis (cenário comum em espectroscopia), mas é sensível à escala dos dados — sempre normalize/autoscale antes de treinar.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra."}},
    {"model": {"type": "model", "description": "Modelo SVM treinado (kernel RBF ou linear, conforme parâmetro)."}})

add("random_forest",
    "Treina muitas árvores de decisão independentes, cada uma vendo um subconjunto aleatório das amostras e das variáveis, e combina os votos de todas pra decidir a classe final (ou a média, em regressão). A aleatoriedade entre as árvores reduz overfitting comparado a uma árvore única.",
    "Introduzido por Leo Breiman em 2001, consolidando ideias anteriores de bagging (do próprio Breiman, 1996) com seleção aleatória de variáveis.",
    "Não exige normalização dos dados (é invariante a escala) e dá de graça uma medida de importância de variável — pode ser usado tanto como classificador quanto pra entender quais regiões do espectro mais pesam na decisão.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra."}},
    {"model": {"type": "model", "description": "Floresta de árvores treinada."}})

add("knn",
    "Classifica uma amostra nova olhando as K amostras de treino mais próximas dela (por alguma distância, geralmente Euclidiana) e atribuindo a classe majoritária entre essas K vizinhas. Não existe \"treino\" de verdade — o modelo é só o conjunto de treino guardado.",
    None,
    "Simples e sem suposições sobre a forma da fronteira entre classes, mas sofre em alta dimensão (muitas variáveis espectrais) se não reduzir dimensionalidade antes (ex: usar os scores de uma PCA em vez do espectro bruto). Sensível à escala — normalize antes.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras de treino."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra de treino."}},
    {"model": {"type": "model", "description": "Modelo KNN (guarda o conjunto de treino e o valor de K)."}})

add("snv",
    "Standard Normal Variate: normaliza cada espectro individualmente, subtraindo sua própria média e dividindo pelo seu próprio desvio padrão — linha por linha, não coluna por coluna. Remove efeitos multiplicativos e aditivos de espalhamento de luz (scatter) causados por diferença de tamanho de partícula entre amostras.",
    "Proposto por R.J. Barnes, M.S. Dhanoa e Susan Lister em 1989, especificamente pra corrigir efeitos de espalhamento em espectros NIR de amostras sólidas/em pó.",
    "Quase sempre o primeiro pré-processamento aplicado em espectros NIR de sólidos, antes de qualquer modelagem. Equivalente em efeito ao MSC na maioria dos casos — raramente se usa os dois juntos.",
    {"X": {"type": "matrix", "description": "Matriz de espectros brutos (amostras × comprimentos de onda)."}},
    {"X": {"type": "matrix", "description": "Espectros corrigidos, mesma dimensão da entrada."}})

add("msc",
    "Multiplicative Scatter Correction: regride cada espectro individual contra um espectro de referência (geralmente a média de todas as amostras) e usa os coeficientes dessa regressão (inclinação e intercepto) pra corrigir o efeito multiplicativo/aditivo de espalhamento.",
    "Desenvolvido por Paul Geladi, Hans Martens e Tormod Næs em 1985, praticamente ao mesmo tempo em que o campo da quimiometria NIR se consolidava.",
    "Alternativa ao SNV com resultado quase sempre equivalente — a diferença é que MSC depende de um espectro de referência (calculado a partir do próprio conjunto de treino), então precisa guardar essa referência pra aplicar em dados novos depois.",
    {"X": {"type": "matrix", "description": "Matriz de espectros brutos."}},
    {"X": {"type": "matrix", "description": "Espectros corrigidos, mesma dimensão da entrada."}})

add("autoscaling",
    "Centra cada variável na própria média e depois divide pelo próprio desvio padrão, deixando todas as variáveis com média 0 e variância 1 (também chamado de padronização Z-score, ou UV-scaling em quimiometria).",
    None,
    "Essencial antes de qualquer técnica sensível a escala (PCA de dados não-espectrais, KNN, SVM, clustering) quando as variáveis têm unidades ou magnitudes muito diferentes entre si — sem isso, a variável de maior variância numérica domina o modelo mesmo sem ser a mais relevante quimicamente.",
    {"X": {"type": "matrix", "description": "Matriz de dados a ser escalada."}},
    {"X": {"type": "matrix", "description": "Dados centrados na média e escalados pelo desvio padrão — cada coluna com média 0 e variância 1."}})

add("centering",
    "Subtrai de cada variável (coluna) sua própria média, deixando todas centradas em zero — sem alterar a escala/variância, diferente do autoscaling.",
    None,
    "Pré-requisito matemático da PCA clássica (PCA sem centrar mistura a direção de maior variância com a posição da média, distorcendo os componentes) — a maioria das implementações de PCA já faz isso internamente, mas é bom saber o que está rodando por baixo.",
    {"X": {"type": "matrix", "description": "Matriz de dados a ser centrada."}},
    {"X": {"type": "matrix", "description": "Dados com cada coluna centrada em zero (média subtraída)."}})

add("savitzky_golay",
    "Ajusta um polinômio de grau baixo a uma janela deslizante de pontos ao redor de cada ponto do espectro, por mínimos quadrados, e usa esse polinômio pra suavizar o ponto (ordem 0) ou calcular sua derivada (1ª ou 2ª ordem) sem precisar de diferenças finitas brutas, que amplificam ruído.",
    "Publicado por Abraham Savitzky e Marcel Golay em 1964 — um dos artigos mais citados da química analítica, por resolver de forma elegante o compromisso entre suavizar ruído e preservar a forma dos picos.",
    "Derivadas (1ª ou 2ª) removem efeitos de linha de base e sobreposição de picos — muito usado antes de PLS em NIR. Janela maior suaviza mais mas também pode distorcer picos estreitos; comece com janela pequena e aumente só se precisar.",
    {"X": {"type": "matrix", "description": "Matriz de espectros."}},
    {"X": {"type": "matrix", "description": "Espectros suavizados ou derivados (conforme parâmetro `derivative`), mesma dimensão da entrada."}})

add("baseline",
    "Estima e subtrai a linha de base (deriva lenta e suave do sinal, não relacionada aos picos de interesse) de cada espectro — por ajuste polinomial, ou pelo método \"rubberband\" (envoltória inferior convexa, como um elástico esticado por baixo do espectro).",
    None,
    "Necessário sempre que o instrumento ou a amostra introduz deriva de fundo (comum em Raman, por exemplo) — sem corrigir, a linha de base pode dominar a variância capturada por uma PCA, mascarando a informação química real.",
    {"X": {"type": "matrix", "description": "Matriz de espectros com deriva de linha de base."}},
    {"X": {"type": "matrix", "description": "Espectros com a linha de base estimada removida."}})

add("n_pls",
    "Generalização do PLS pra dados de ordem superior (tensores, não só matrizes) — em vez de desdobrar o tensor em uma matriz antes de rodar PLS comum, decompõe X e y simultaneamente preservando a estrutura multilinear original (ex: amostra × comprimento de onda de excitação × emissão, no caso de fluorescência EEM).",
    "Proposto por Rasmus Bro em 1996, estendendo o PLS pra dados multiway mantendo a interpretabilidade por modo que se perde ao simplesmente desdobrar o tensor.",
    "Preferível ao U-PLS (desdobrado) quando a estrutura multilinear dos dados é significativa quimicamente (ex: cada modo representa algo fisicamente distinto, como excitação vs. emissão) — preserva mais informação estrutural do que simplesmente achatar o tensor.",
    {"X": {"type": "tensor", "description": "Tensor de dados, ordem ≥ 3 (ex: amostras × excitação × emissão)."},
     "y": {"type": "vector", "description": "Valor de referência a ser previsto, um por amostra."}},
    {"model": {"type": "model", "description": "Modelo N-PLS treinado."}})

add("u_pls",
    "Desdobra (\"unfold\") o tensor de entrada numa matriz 2D (amostras × todas as outras dimensões achatadas em uma só) e roda um PLS comum sobre essa matriz desdobrada — mais simples que N-PLS, mas perde a separação entre os modos originais do tensor.",
    None,
    "Mais rápido e simples de interpretar que N-PLS quando a estrutura multilinear não é o foco — mas se os diferentes modos do tensor tiverem significado físico distinto que você quer preservar na interpretação do modelo, prefira N-PLS.",
    {"X": {"type": "tensor", "description": "Tensor de dados, ordem ≥ 3 — será desdobrado internamente em matriz antes do PLS."},
     "y": {"type": "vector", "description": "Valor de referência a ser previsto."}},
    {"model": {"type": "model", "description": "Modelo PLS treinado sobre os dados desdobrados."}})

add("parafac",
    "Decompõe um tensor de ordem 3 (ou mais) numa soma de componentes trilineares — cada componente é o produto externo de um vetor por modo (ex: perfil de concentração, espectro de excitação, espectro de emissão) — análogo multiway da PCA, mas com a vantagem de ter solução única sob condições brandas (ao contrário da PCA/Tucker, que têm ambiguidade de rotação).",
    "Proposto independentemente por Richard Harshman (1970, como \"PARAFAC\") e J. Douglas Carroll & Jih-Jie Chang (1970, como \"CANDECOMP\") — são o mesmo método, hoje chamado de CP decomposition (CANDECOMP/PARAFAC) na literatura mais recente.",
    "É a técnica de referência pra decompor dados de fluorescência EEM (matriz excitação-emissão) em seus componentes químicos puros, sem precisar de calibração prévia — a unicidade da solução é o que torna isso possível.",
    {"X": {"type": "tensor", "description": "Tensor de ordem ≥ 3 (ex: amostras × excitação × emissão, em fluorescência)."}},
    {"scores": {"type": "matrix", "description": "Perfil de cada amostra em cada componente — shape (amostras, componentes)."},
     "loadings": {"type": "tensor", "description": "Perfis por modo (ex: espectros de excitação e emissão puros de cada componente)."},
     "core_consistency": {"type": "scalar", "description": "Diagnóstico (0-100) de quão apropriado é o número de componentes escolhido — valores baixos sugerem componentes demais."}})

add("tucker3",
    "Decompõe um tensor de ordem 3 num núcleo (core) menor mais três matrizes de loadings, uma por modo — diferente do PARAFAC, permite um número diferente de componentes por modo e captura interações entre componentes de modos diferentes (via o núcleo), mas em troca não tem solução única.",
    "Proposto por Ledyard Tucker em 1966, antes mesmo do PARAFAC — é a generalização multiway mais direta da PCA (PCA é um caso particular de Tucker com um modo só).",
    "Use em vez de PARAFAC quando não há motivo pra esperar trilinearidade exata nos dados, ou quando quer explorar quantos componentes cada modo realmente precisa de forma independente.",
    {"X": {"type": "tensor", "description": "Tensor de ordem ≥ 3."}},
    {"core": {"type": "tensor", "description": "Núcleo da decomposição — interações entre componentes de modos diferentes."},
     "loadings": {"type": "tensor", "description": "Matriz de loadings por modo."}})

add("multiway_pls_da",
    "Versão do PLS-DA aplicada a dados desdobrados (unfolded) de ordem superior — classifica amostras cujo dado bruto é um tensor (ex: imagem hiperespectral, EEM de fluorescência) desdobrando-o em matriz antes de rodar a discriminação.",
    None,
    "Caminho mais direto pra classificar a partir de dados multiway sem perder tempo construindo um modelo multilinear completo primeiro — bom ponto de partida antes de tentar algo mais sofisticado como PARAFAC-SIMCA.",
    {"X": {"type": "tensor", "description": "Tensor de dados, será desdobrado internamente."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra."}},
    {"model": {"type": "model", "description": "Modelo PLS-DA treinado sobre os dados desdobrados."}})

add("ipls",
    "Interval PLS: divide o espectro em vários intervalos (janelas) de comprimento de onda e treina um PLS separado em cada intervalo, comparando o erro de validação de cada um — os intervalos com melhor desempenho isolado são os que carregam a informação química mais relevante pra propriedade de interesse.",
    "Proposto por Lars Nørgaard e colaboradores em 2000, como alternativa interpretável à seleção de variáveis ponto a ponto.",
    "Bom primeiro passo de seleção de variáveis quando você quer uma resposta interpretável (\"essa faixa espectral é a que importa\") em vez de um subconjunto disperso de pontos individuais, como dá o VIP ou o CARS.",
    {"X": {"type": "matrix", "description": "Matriz de espectros."},
     "y": {"type": "vector", "description": "Valor de referência a ser previsto."}},
    {"best_interval": {"type": "object", "description": "Intervalo espectral com menor erro de validação cruzada."},
     "interval_errors": {"type": "vector", "description": "Erro de validação cruzada de cada intervalo testado."}})

add("vip",
    "Variable Importance in Projection: calcula, pra cada variável de um modelo PLS já treinado, o quanto ela contribuiu pra explicar tanto X quanto y ao longo de todos os componentes do modelo. Variáveis com VIP > 1 (regra prática comum) são consideradas importantes; abaixo disso, candidatas a descarte.",
    "Formalizado por Svante Wold e colaboradores nos anos 1990 como ferramenta de interpretação/seleção de variáveis específica pra modelos PLS.",
    "Precisa de um modelo PLS já treinado como ponto de partida — normalmente usado depois de rodar PLS pra decidir quais regiões do espectro manter num modelo mais enxuto, não como primeiro passo.",
    {"model": {"type": "model", "description": "Modelo PLS já treinado."}},
    {"vip_scores": {"type": "vector", "description": "Score VIP de cada variável — valores > 1 geralmente indicam variável relevante."}})

add("cross_validation",
    "Divide o conjunto de treino em K partes (\"folds\"); treina o modelo K vezes, cada vez deixando uma parte de fora pra testar, e agrega o erro de todas as rodadas. Dá uma estimativa mais honesta do erro do modelo em dados novos do que simplesmente olhar o erro no próprio conjunto de treino.",
    None,
    "Essencial pra escolher hiperparâmetros (ex: número de componentes do PLS) sem usar o conjunto de teste final — usar o erro de treino puro pra essa escolha quase sempre leva a overfitting. Não substitui uma validação externa com dados nunca vistos.",
    {"X": {"type": "matrix", "description": "Matriz de dados de treino."},
     "y": {"type": "vector", "description": "Valor de referência (regressão) ou rótulo (classificação)."}},
    {"metrics": {"type": "object", "description": "Métricas agregadas das K rodadas (RMSE/R² pra regressão, acurácia/F1 pra classificação)."}})

add("outlier_detection",
    "Identifica amostras anômalas de três formas possíveis: distância de Mahalanobis/Hotelling T² (quão longe a amostra está do centro da distribuição, considerando a correlação entre variáveis), ou Isolation Forest (quão fácil é isolar a amostra numa árvore de decisão aleatória — amostras atípicas se isolam com poucos cortes).",
    None,
    "Rode logo depois da PCA exploratória, antes de treinar qualquer modelo supervisionado — amostras com erro de medição grosseiro ou contaminação distorcem o modelo se entrarem no treino sem serem identificadas antes.",
    {"X": {"type": "matrix", "description": "Matriz de dados (idealmente já os scores de uma PCA, não o espectro bruto)."}},
    {"outlier_mask": {"type": "labels", "description": "Máscara booleana marcando quais amostras são consideradas outliers."},
     "scores_": {"type": "vector", "description": "Score de anomalia de cada amostra (maior = mais atípica)."}})

add("metrics_aggregation",
    "Consolida as métricas de desempenho de várias execuções (ex: diferentes modelos testados no mesmo dataset, ou o mesmo modelo em diferentes datasets) numa única tabela comparativa, facilitando decidir qual configuração performou melhor.",
    None,
    "Use ao final de uma bateria de testes (ex: comparando PLS com 3, 5 e 10 componentes) em vez de ficar comparando números espalhados manualmente entre execuções separadas.",
    {"execution_ids": {"type": "vector", "description": "Lista de execuções/jobs cujas métricas serão agregadas."}},
    {"comparison_table": {"type": "object", "description": "Tabela com as métricas lado a lado de cada execução."}})

add("ds",
    "Direct Standardization: calibra uma matriz de transformação que converte espectros medidos no instrumento B pra parecerem com os do instrumento A (ou do mesmo instrumento em outra data), usando um conjunto pequeno de amostras medidas nos dois — assim um modelo treinado em A pode ser aplicado a dados de B sem recalibrar do zero.",
    "Proposto por Yongdong Wang e Bruce Kowalski em 1991, um dos primeiros métodos formais de transferência de calibração entre instrumentos.",
    "Precisa de um conjunto de amostras \"transfer\" medidas nos dois instrumentos/condições — quanto mais representativas da faixa de uso real, melhor a transferência. PDS costuma generalizar melhor quando o desvio entre instrumentos varia ao longo do espectro.",
    {"X_master": {"type": "matrix", "description": "Espectros das amostras de transferência medidas no instrumento/condição de referência."},
     "X_slave": {"type": "matrix", "description": "As mesmas amostras medidas no instrumento/condição a ser padronizado."}},
    {"transform_matrix": {"type": "matrix", "description": "Matriz de transformação a ser aplicada em novos espectros do instrumento \"slave\"."}})

add("pds",
    "Piecewise Direct Standardization: variante local do DS — em vez de uma transformação global, calibra uma transformação diferente pra cada pequena janela de comprimentos de onda, usando os pontos vizinhos. Lida melhor com desvios entre instrumentos que variam ao longo do espectro.",
    "Proposto por Elaine Wang, Yongdong Wang e Bruce Kowalski em 1992, como refinamento do DS original.",
    "Geralmente a escolha padrão sobre DS puro, especialmente quando o desvio entre instrumentos não é uniforme no espectro inteiro — exige um pouco mais de amostras de transferência pra calibrar bem cada janela.",
    {"X_master": {"type": "matrix", "description": "Espectros das amostras de transferência no instrumento de referência."},
     "X_slave": {"type": "matrix", "description": "As mesmas amostras no instrumento a ser padronizado."}},
    {"transform_matrix": {"type": "matrix", "description": "Transformação local (banda-a-banda) a ser aplicada em novos espectros."}})

add("mlp",
    "Rede neural densa clássica: camadas de neurônios totalmente conectadas, cada uma aplicando uma transformação linear seguida de uma não-linearidade (ex: ReLU). Treinada por retropropagação do erro (backpropagation) pra minimizar o erro de predição, seja em regressão ou classificação (controlado pelo parâmetro `task`).",
    "A base teórica (perceptron) é de Frank Rosenblatt (1958); a versão multicamada com backpropagation eficiente que a tornou treinável na prática veio com os trabalhos de Rumelhart, Hinton e Williams em 1986.",
    "Precisa de bem mais amostras de treino que PLS/PCR pra generalizar bem, e é mais sensível a overfitting — considere PLS primeiro como baseline e só suba pra MLP se a relação entre X e y for claramente não-linear.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras."},
     "y": {"type": "vector", "description": "Valor a prever (regressão) ou rótulo de classe (classificação), conforme parâmetro `task`."}},
    {"model": {"type": "model", "description": "Rede MLP treinada."}})

add("cnn_1d",
    "Rede neural convolucional adaptada pra sinais 1D (espectros): em vez de olhar o espectro inteiro de uma vez como o MLP faz, aplica filtros pequenos que deslizam ao longo do eixo espectral, aprendendo padrões locais (formas de picos, derivadas) que se repetem em posições diferentes — compartilhando os mesmos pesos em toda a extensão do espectro.",
    None,
    "Mais indicada que MLP quando há muitos pontos espectrais e padrões locais importam mais que a posição exata — mas exige um conjunto de treino consideravelmente maior pra não fazer overfitting. Teste PLS/PCR antes como baseline.",
    {"X": {"type": "matrix", "description": "Matriz de espectros (amostras × comprimentos de onda)."},
     "y": {"type": "vector", "description": "Valor a prever ou rótulo de classe."}},
    {"model": {"type": "model", "description": "Rede CNN-1D treinada."}})

add("autoencoder",
    "Rede neural treinada pra reconstruir sua própria entrada, passando por um \"gargalo\" central de dimensão bem menor que a entrada — força a rede a aprender uma representação compacta dos dados. O erro de reconstrução de uma amostra nova (quão mal o autoencoder consegue reconstruí-la) é um sinal de quão atípica/anômala ela é.",
    "A ideia de redes que aprendem a comprimir e reconstruir sua própria entrada remonta aos anos 1980; a versão variacional (geração probabilística, não só compressão) foi formalizada por Kingma e Welling em 2013.",
    "Útil pra detecção de anomalias em dados complexos onde PCA linear não captura a estrutura (o autoencoder aprende compressões não-lineares) — e também pra redução de dimensionalidade antes de outro modelo.",
    {"X": {"type": "matrix", "description": "Matriz de dados de treino."}},
    {"model": {"type": "model", "description": "Autoencoder treinado."},
     "reconstruction_error": {"type": "vector", "description": "Erro de reconstrução de cada amostra — valores altos sugerem amostra atípica."}})

add("rnn",
    "Rede neural recorrente (LSTM ou GRU, conforme parâmetro): processa o espectro como uma sequência, mantendo um \"estado\" interno que carrega informação dos pontos anteriores ao processar cada novo ponto — pensada originalmente pra dados sequenciais no tempo, mas pode ser aplicada a espectros tratando o eixo espectral como uma sequência.",
    "A arquitetura LSTM foi proposta por Sepp Hochreiter e Jürgen Schmidhuber em 1997, resolvendo o problema de gradientes que desaparecem em RNNs simples; GRU é uma simplificação posterior (Cho et al., 2014).",
    "Menos comum que CNN-1D pra dados espectrais puros (que não têm uma noção forte de \"ordem temporal\"), mas pode valer a pena se os dados tiverem componente temporal real (ex: monitoramento de processo ao longo do tempo).",
    {"X": {"type": "matrix", "description": "Matriz de sequências (amostras × passos), ex: espectro tratado como sequência, ou série temporal de processo."},
     "y": {"type": "vector", "description": "Valor a prever ou rótulo de classe."}},
    {"model": {"type": "model", "description": "Rede RNN (LSTM/GRU) treinada."}})

add("transformer",
    "Arquitetura baseada em mecanismo de atenção (self-attention): em vez de processar a sequência ponto a ponto como a RNN, calcula diretamente o quanto cada ponto do espectro \"deveria prestar atenção\" em cada outro ponto, capturando relações entre regiões distantes do espectro sem precisar de recorrência.",
    "Introduzido por Vaswani et al. em 2017 (\"Attention Is All You Need\"), originalmente pra tradução automática — hoje é a base dos grandes modelos de linguagem, e vem sendo adaptado também pra sinais espectrais.",
    "É a arquitetura mais pesada em dados/computação do catálogo — só vale a pena com volume considerável de dados de treino; pra datasets pequenos, PLS ou CNN-1D tendem a generalizar melhor.",
    {"X": {"type": "matrix", "description": "Matriz de espectros (amostras × comprimentos de onda)."},
     "y": {"type": "vector", "description": "Valor a prever ou rótulo de classe."}},
    {"model": {"type": "model", "description": "Modelo Transformer treinado."}})

add("diffusion",
    "Modelo generativo que aprende a reverter um processo de adição gradual de ruído: durante o treino, ruído é progressivamente adicionado a espectros reais até virarem ruído puro, e a rede aprende a desfazer esse processo passo a passo — uma vez treinada, pode tanto remover ruído de espectros reais (denoising) quanto gerar espectros sintéticos plausíveis do zero.",
    "A formulação moderna (\"Denoising Diffusion Probabilistic Models\") foi proposta por Ho, Jain e Abbeel em 2020, hoje a base de geradores de imagem como Stable Diffusion e DALL-E — aplicação a espectros é uma adaptação bem mais recente.",
    "Pensado pra dois usos: limpar ruído de espectros reais, ou gerar dados sintéticos pra aumentar um conjunto de treino pequeno demais. É o modelo mais experimental/pesado do catálogo — espere tempos de treino bem maiores que os demais.",
    {"X": {"type": "matrix", "description": "Matriz de espectros de treino."}},
    {"model": {"type": "model", "description": "Modelo de difusão treinado."},
     "generated_samples": {"type": "matrix", "description": "Espectros sintéticos gerados pelo modelo (quando aplicável)."}})

add("pcr",
    "Regressão por Componentes Principais: primeiro roda uma PCA em X (sem olhar pra y), depois regride y linearmente sobre os scores desses componentes. Diferente do PLS, a escolha dos componentes não leva em conta a relação com y — só a variância de X.",
    None,
    "É o contraponto clássico pra comparar com PLS: em geral o PLS precisa de menos componentes pra atingir o mesmo erro, porque já otimiza pensando em y desde o início — mas PCR pode ser mais robusto quando y é ruidoso, já que a etapa de PCA é cega a esse ruído.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras."},
     "y": {"type": "vector", "description": "Valor de referência a ser previsto."}},
    {"model": {"type": "model", "description": "Modelo PCR treinado (PCA + regressão linear sobre os scores)."}})

add("mcr_als",
    "Multivariate Curve Resolution — Alternating Least Squares: decompõe um conjunto de misturas (ex: espectros de reações químicas ao longo do tempo) nos espectros puros dos componentes individuais e seus perfis de concentração, sem precisar saber de antemão quais são esses componentes — alterna entre estimar concentrações e estimar espectros até convergir, sob restrições como não-negatividade.",
    "O algoritmo ALS pra MCR foi desenvolvido por Romà Tauler e Anna de Juan ao longo dos anos 1990, consolidando trabalho anterior de resolução de curvas que remonta a Lawton e Sylvestre (1971).",
    "A técnica clássica pra decompor misturas químicas desconhecidas em seus componentes puros — muito usada em monitoramento de reações e análise de misturas sem padrões de referência disponíveis. Resultado depende de boas restrições (não-negatividade, unimodalidade) pra convergir numa solução quimicamente sensata.",
    {"X": {"type": "matrix", "description": "Matriz de misturas (ex: espectros ao longo do tempo de uma reação) — amostras/tempo × comprimento de onda."}},
    {"concentrations": {"type": "matrix", "description": "Perfil de concentração estimado de cada componente puro ao longo das amostras/tempo."},
     "pure_spectra": {"type": "matrix", "description": "Espectro puro estimado de cada componente."}})

add("lda",
    "Linear Discriminant Analysis: encontra a combinação linear das variáveis que melhor separa as classes conhecidas, maximizando a distância entre as médias das classes relativa à dispersão dentro de cada classe. Assume que as classes têm a mesma matriz de covariância (fronteiras de decisão lineares).",
    "Proposto por Ronald Fisher em 1936 (\"discriminante linear de Fisher\") — um dos métodos de classificação mais antigos da estatística, ainda hoje usado como baseline.",
    "Baseline clássico pra comparar com PLS-DA: mais simples e interpretável, mas assume que o número de amostras é bem maior que o de variáveis (o que raramente é o caso em espectroscopia crua) — por isso, aplique sobre scores de PCA, não sobre o espectro bruto.",
    {"X": {"type": "matrix", "description": "Matriz de variáveis preditoras (idealmente scores de PCA, não espectro bruto, se houver mais variáveis que amostras)."},
     "y": {"type": "labels", "description": "Rótulo de classe de cada amostra."}},
    {"model": {"type": "model", "description": "Modelo LDA treinado."}})

add("leverage_influence",
    "Calcula, pra cada amostra de um modelo (PCA ou PLS) já treinado, duas medidas diagnósticas: leverage (hat matrix — o quanto a amostra influencia a própria estrutura do modelo, por estar \"longe\" no espaço dos componentes) e resíduo (o quão mal o modelo explica aquela amostra). Amostras com leverage e resíduo altos são as mais suspeitas de serem outliers influentes.",
    None,
    "Complementa a Detecção de Outliers: enquanto outlier_detection foca na distância da amostra à distribuição geral, leverage/influência foca especificamente em quanto cada amostra pesa na formação do próprio modelo — rode depois de treinar PCA ou PLS pra auditar se alguma amostra está distorcendo o modelo sozinha.",
    {"model": {"type": "model", "description": "Modelo PCA ou PLS já treinado."}},
    {"leverage": {"type": "vector", "description": "Leverage de cada amostra (influência na estrutura do modelo)."},
     "residuals": {"type": "vector", "description": "Resíduo de cada amostra (quão mal o modelo a explica)."}})

ANALYTICAL_SLUGS = list(T.keys())
assert len(ANALYTICAL_SLUGS) == 37, f"esperava 37 analíticas, tenho {len(ANALYTICAL_SLUGS)}"

# ───────────────────────── FAMÍLIA 01 — DADOS & UTILITÁRIOS (38) ─────────────────────────
# Mais curtas — são operações determinísticas, não "modelos" no sentido estatístico.

def addu(slug, how, hist, inputs, outputs):
    T[slug] = dict(how_it_works=how, historical_note=hist, usage_tips=None,
                    inputs=inputs, outputs=outputs)

addu("kennard_stone",
    "Seleciona iterativamente a amostra mais distante (distância Euclidiana) das já escolhidas, começando pelas duas amostras mais distantes entre si — garante que o conjunto de calibração cubra toda a variabilidade multivariada presente nos dados, em vez de uma divisão aleatória que pode deixar regiões do espaço de amostras mal representadas.",
    "Proposto por R.W. Kennard e L.A. Stone em 1969 como método de desenho de experimentos (\"Computer Aided Design of Experiments\"); hoje é o método padrão em quimiometria para dividir dados em treino/teste/validação antes de uma calibração multivariada.",
    {}, {})  # inputs/outputs: schema completo já definido em seed_kennard_stone.sql — não sobrescreve

addu("svd",
     "Decompõe qualquer matriz X em três matrizes: U (vetores singulares à esquerda), Σ (valores singulares, em ordem decrescente de importância) e Vᵀ (vetores singulares à direita), de forma que X = U·Σ·Vᵀ. É a operação matemática por trás da PCA — os valores singulares ao quadrado são proporcionais à variância explicada.",
     "O teorema da decomposição em valores singulares remonta a trabalhos independentes de Eugenio Beltrami e Camille Jordan na década de 1870 — muito antes de qualquer aplicação computacional existir.",
     {"X": {"type": "matrix", "description": "Matriz de entrada, qualquer formato (não precisa ser quadrada)."}},
     {"U": {"type": "matrix", "description": "Vetores singulares à esquerda."},
      "S": {"type": "vector", "description": "Valores singulares, em ordem decrescente."},
      "Vt": {"type": "matrix", "description": "Vetores singulares à direita (transpostos)."}})

addu("autovalores",
     "Calcula os autovalores de uma matriz quadrada — os escalares λ pros quais existe um vetor v não-nulo tal que A·v = λ·v. Pra matrizes de covariância (como em PCA), os autovalores correspondem à variância capturada em cada direção própria.",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada de entrada."}},
     {"eigenvalues": {"type": "vector", "description": "Autovalores da matriz, geralmente ordenados."}})

addu("autovetores",
     "Calcula os autovetores de uma matriz quadrada — as direções que a matriz apenas escala (sem rotacionar) quando aplicada a elas. Em matrizes de covariância, são as direções principais de variância dos dados.",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada de entrada."}},
     {"eigenvectors": {"type": "matrix", "description": "Autovetores da matriz, um por coluna."}})

addu("eig",
     "Calcula autovalores e autovetores juntos numa única operação — equivalente a rodar `autovalores` e `autovetores` ao mesmo tempo, mais eficiente que separado quando se precisa dos dois.",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada de entrada."}},
     {"eigenvalues": {"type": "vector", "description": "Autovalores da matriz."},
      "eigenvectors": {"type": "matrix", "description": "Autovetores correspondentes, um por coluna."}})

addu("inversa",
     "Calcula a matriz inversa A⁻¹, tal que A·A⁻¹ = identidade. Só existe pra matrizes quadradas não-singulares (determinante ≠ 0).",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada e não-singular."}},
     {"A_inv": {"type": "matrix", "description": "Matriz inversa de A."}})

addu("pseudo_inversa",
     "Calcula a pseudo-inversa de Moore-Penrose, que generaliza a inversa pra matrizes não-quadradas ou singulares — é o que torna possível resolver sistemas de mínimos quadrados (como em OLS/MLR) mesmo quando a matriz não é quadrada.",
     "Desenvolvida independentemente por Eliakim Moore (1920) e Roger Penrose (1955).",
     {"A": {"type": "matrix", "description": "Matriz de entrada, qualquer formato."}},
     {"A_pinv": {"type": "matrix", "description": "Pseudo-inversa de A."}})

addu("determinante",
     "Calcula o determinante de uma matriz quadrada — um escalar que indica, entre outras coisas, se a matriz é invertível (determinante zero = singular, não-invertível).",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada de entrada."}},
     {"det": {"type": "scalar", "description": "Determinante da matriz."}})

addu("rank",
     "Calcula o posto (rank) de uma matriz — o número de linhas/colunas linearmente independentes. Útil pra saber, por exemplo, quantos componentes PARAFAC/PCA fazem sentido extrair no máximo.",
     None,
     {"A": {"type": "matrix", "description": "Matriz de entrada."}},
     {"rank": {"type": "scalar", "description": "Posto da matriz (número inteiro)."}})

addu("trace",
     "Calcula o traço de uma matriz quadrada — a soma dos elementos da diagonal principal.",
     None,
     {"A": {"type": "matrix", "description": "Matriz quadrada de entrada."}},
     {"trace": {"type": "scalar", "description": "Traço da matriz."}})

addu("norma",
     "Calcula a norma de um vetor ou matriz (magnitude), conforme o tipo escolhido (L1, L2/Euclidiana, infinito, Frobenius).",
     None,
     {"A": {"type": "matrix", "description": "Vetor ou matriz de entrada."}},
     {"norm": {"type": "scalar", "description": "Valor da norma calculada."}})

addu("produto_matricial",
     "Multiplica duas matrizes (A·B), respeitando a regra de compatibilidade de dimensões (colunas de A = linhas de B).",
     None,
     {"A": {"type": "matrix", "description": "Primeira matriz."}, "B": {"type": "matrix", "description": "Segunda matriz, com número de linhas igual ao de colunas de A."}},
     {"result": {"type": "matrix", "description": "Produto A·B."}})

addu("transpose",
     "Transpõe (permuta) os eixos de uma matriz ou tensor N-way — troca linhas por colunas (ou reordena os modos, em tensores).",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada, qualquer ordem."}},
     {"A_t": {"type": "tensor", "description": "Array com os eixos transpostos/permutados."}})

addu("reshape",
     "Reorganiza os dados de um array num novo formato (shape), mantendo o mesmo número total de elementos — ex: transformar um vetor de 100 pontos numa matriz 10×10.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"A_reshaped": {"type": "tensor", "description": "Array com o novo shape especificado."}})

addu("slice",
     "Seleciona uma parte (sub-região) de um ou mais eixos de um array, por intervalo de índices — ex: recortar só uma faixa de comprimentos de onda.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"A_slice": {"type": "tensor", "description": "Sub-região selecionada do array original."}})

addu("split",
     "Divide um array em partes menores ao longo de um eixo, em pontos de corte especificados.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"parts": {"type": "tensor", "description": "Lista de sub-arrays resultantes da divisão."}})

addu("stack",
     "Empilha vários arrays de mesmo shape ao longo de um novo eixo, criando um array de dimensão maior (ex: empilhar vários espectros 1D numa matriz 2D).",
     None,
     {"arrays": {"type": "tensor", "description": "Lista de arrays de mesmo shape a empilhar."}},
     {"stacked": {"type": "tensor", "description": "Array resultante, com um eixo a mais que os de entrada."}})

addu("squeeze",
     "Remove eixos de tamanho 1 de um array, sem alterar os dados — útil pra limpar dimensões redundantes depois de alguma operação.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"A_squeezed": {"type": "tensor", "description": "Array sem os eixos de tamanho 1."}})

addu("expand_dims",
     "Adiciona um novo eixo de tamanho 1 num array, na posição especificada — operação inversa do squeeze, útil pra compatibilizar shapes antes de outra operação (ex: concatenação, broadcast).",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"A_expanded": {"type": "tensor", "description": "Array com um eixo a mais, de tamanho 1."}})

addu("concatenacao",
     "Concatena dois ou mais arrays ao longo de um eixo já existente (diferente do stack, que cria um eixo novo) — ex: juntar dois datasets com as mesmas variáveis em um só, empilhando as amostras.",
     None,
     {"arrays": {"type": "tensor", "description": "Lista de arrays a concatenar, compatíveis em todos os eixos exceto o de concatenação."}},
     {"result": {"type": "tensor", "description": "Array resultante da concatenação."}})

addu("soma",
     "Soma elemento a elemento dois arrays de mesmo shape (ou compatíveis por broadcast).",
     None,
     {"A": {"type": "tensor", "description": "Primeiro array."}, "B": {"type": "tensor", "description": "Segundo array, de shape compatível."}},
     {"result": {"type": "tensor", "description": "Resultado de A + B, elemento a elemento."}})

addu("subtracao",
     "Subtrai elemento a elemento dois arrays de mesmo shape (ou compatíveis por broadcast).",
     None,
     {"A": {"type": "tensor", "description": "Primeiro array (minuendo)."}, "B": {"type": "tensor", "description": "Segundo array (subtraendo), de shape compatível."}},
     {"result": {"type": "tensor", "description": "Resultado de A - B, elemento a elemento."}})

addu("multiplicacao_elementwise",
     "Multiplica elemento a elemento dois arrays de mesmo shape (produto de Hadamard — diferente do produto matricial).",
     None,
     {"A": {"type": "tensor", "description": "Primeiro array."}, "B": {"type": "tensor", "description": "Segundo array, de shape compatível."}},
     {"result": {"type": "tensor", "description": "Resultado de A ⊙ B, elemento a elemento."}})

addu("divisao_elementwise",
     "Divide elemento a elemento dois arrays de mesmo shape.",
     None,
     {"A": {"type": "tensor", "description": "Array dividendo."}, "B": {"type": "tensor", "description": "Array divisor, de shape compatível (sem zeros)."}},
     {"result": {"type": "tensor", "description": "Resultado de A / B, elemento a elemento."}})

addu("mean",
     "Calcula a média dos valores de um array, ao longo do eixo especificado (ou do array todo).",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"mean": {"type": "tensor", "description": "Média calculada (escalar ou vetor, conforme o eixo)."}})

addu("median",
     "Calcula a mediana dos valores de um array, ao longo do eixo especificado — mais robusta a outliers do que a média.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"median": {"type": "tensor", "description": "Mediana calculada."}})

addu("std",
     "Calcula o desvio padrão dos valores de um array, ao longo do eixo especificado — mede a dispersão dos dados em torno da média.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"std": {"type": "tensor", "description": "Desvio padrão calculado."}})

addu("max",
     "Retorna o valor máximo de um array, ao longo do eixo especificado.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"max": {"type": "tensor", "description": "Valor(es) máximo(s) encontrado(s)."}})

addu("min",
     "Retorna o valor mínimo de um array, ao longo do eixo especificado.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"min": {"type": "tensor", "description": "Valor(es) mínimo(s) encontrado(s)."}})

addu("sum",
     "Soma todos os valores de um array, ao longo do eixo especificado.",
     None,
     {"A": {"type": "tensor", "description": "Array de entrada."}},
     {"sum": {"type": "tensor", "description": "Soma calculada."}})

addu("folding",
     "Reorganiza (\"dobra\") uma matriz 2D de volta num tensor de ordem superior, revertendo uma operação de unfolding anterior — útil depois de processar dados desdobrados (ex: num U-PLS) e precisar voltar à estrutura multiway original pra visualização.",
     None,
     {"A": {"type": "matrix", "description": "Matriz 2D a ser reorganizada em tensor."}},
     {"tensor": {"type": "tensor", "description": "Tensor reconstruído, ordem ≥ 3."}})

addu("unfolding",
     "Desdobra (\"achata\") um tensor de ordem superior numa matriz 2D, ao longo de um modo escolhido — passo necessário antes de aplicar qualquer técnica que só aceita entrada 2D (ex: PCA comum) sobre dados originalmente multiway.",
     None,
     {"X": {"type": "tensor", "description": "Tensor de ordem ≥ 3 a ser desdobrado."}},
     {"X_unfolded": {"type": "matrix", "description": "Matriz 2D resultante do desdobramento ao longo do modo escolhido."}})

addu("importacao",
     "Lê um arquivo de dados externo (CSV, Excel, NumPy, HDF5, Zarr) e retorna um dataset pronto pra uso no workflow — é tipicamente o primeiro nó de qualquer pipeline.",
     None,
     {"file": {"type": "dataset", "description": "Caminho ou referência ao arquivo a importar."}},
     {"X": {"type": "matrix", "description": "Dados importados, já como matriz/tensor."}})

addu("limpeza",
     "Remove amostras ou variáveis problemáticas de um dataset: linhas/colunas inteiras de NaN, valores infinitos, ou variáveis com variância zero (que não carregam informação nenhuma).",
     None,
     {"X": {"type": "matrix", "description": "Matriz de dados a limpar."}},
     {"X_clean": {"type": "matrix", "description": "Dados limpos, sem as amostras/variáveis problemáticas."}})

addu("tratamento_missing",
     "Trata valores ausentes (NaN) num dataset — por remoção das amostras/variáveis afetadas ou por preenchimento simples. Pra estratégias mais sofisticadas de imputação, veja a família \"Dados Faltantes\" (ainda em desenvolvimento nesta versão).",
     None,
     {"X": {"type": "matrix", "description": "Matriz de dados com valores ausentes."}},
     {"X_filled": {"type": "matrix", "description": "Dados após tratamento dos valores ausentes."}})

addu("selecao_amostras",
     "Seleciona um subconjunto de amostras (linhas) de um dataset, por índice explícito ou por máscara booleana.",
     None,
     {"X": {"type": "matrix", "description": "Matriz de dados completa."}},
     {"X_selected": {"type": "matrix", "description": "Subconjunto de amostras selecionado."}})

addu("selecao_variaveis",
     "Seleciona um subconjunto de variáveis (colunas) de um dataset, por índice, intervalo ou máscara booleana — diferente das técnicas de seleção de variáveis \"inteligentes\" da família 11 (VIP, CARS, etc.), aqui a escolha é manual/direta.",
     None,
     {"X": {"type": "matrix", "description": "Matriz de dados completa."}},
     {"X_selected": {"type": "matrix", "description": "Subconjunto de variáveis selecionado."}})

addu("formula_customizada",
     "Aplica uma expressão matemática definida pelo próprio usuário sobre os dados, avaliada com segurança (via um parser de árvore sintática, não `eval` direto) — útil pra operações pontuais que não têm um nó dedicado no catálogo.",
     None,
     {"X": {"type": "tensor", "description": "Array de entrada disponível na expressão."}},
     {"result": {"type": "tensor", "description": "Resultado da expressão aplicada."}})

UTILITY_SLUGS = [
    "kennard_stone", "svd", "autovalores", "autovetores", "eig", "inversa", "pseudo_inversa",
    "determinante", "rank", "trace", "norma", "produto_matricial", "transpose", "reshape",
    "slice", "split", "stack", "squeeze", "expand_dims", "concatenacao", "soma", "subtracao",
    "multiplicacao_elementwise", "divisao_elementwise", "mean", "median", "std", "max", "min",
    "sum", "folding", "unfolding", "importacao", "limpeza", "tratamento_missing",
    "selecao_amostras", "selecao_variaveis", "formula_customizada",
]
assert len(UTILITY_SLUGS) == 38, f"esperava 38 utilitárias, tenho {len(UTILITY_SLUGS)}"
assert set(UTILITY_SLUGS) <= set(T.keys())
assert len(T) == 75, f"esperava 75 entradas no total, tenho {len(T)}"

if __name__ == "__main__":
    print(f"{len(T)} técnicas com conteúdo escrito.")
    json.dump(T, open("/tmp/claude-0/-home-claude-tchelab/41cdf2e0-29f9-593f-b26d-06984bae9341/scratchpad/catalog_content.json", "w"), ensure_ascii=False, indent=2)
    print("JSON salvo.")
