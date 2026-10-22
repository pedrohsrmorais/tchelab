# Catálogo de técnicas: tradução, ícones e UX

Entrega da rodada "traduzir o catálogo, revisar ícones e deixar a experiência bonita, detalhada e intuitiva".

## 1. Tradução

- **Cobertura:** as 217 técnicas nativas (94 ativas + 123 "em desenvolvimento") têm tradução en/es em
  `backend_api/src/catalog_i18n/{en,es}.json`: descrição, como funciona, dicas de uso, nota histórica,
  descrição de portas (entrada/saída) e de parâmetros. Antes, só as 94 ativas estavam traduzidas.
- **Regra de nomes:** nomes técnicos consagrados em inglês (PLS, Savitzky-Golay, Random Forest…) ficam iguais nos
  três idiomas. Os poucos nomes em português são traduzidos (ex.: "Outros escalados" → "Other Scalings").
- **Dados do usuário não são traduzidos:** técnicas criadas pelo usuário (`is_custom`), nomes de datasets, projetos,
  quadros etc. aparecem como foram digitados. Só o catálogo nativo passa pelo dicionário.
- **Como funciona:** o português é a fonte no banco; `utils/catalogI18n.js` aplica o dicionário por slug na resposta,
  usando `?lang=` ou `Accept-Language`, com *fallback* campo a campo para o português.
- **Teste:** `node tests/catalog_i18n_check.mjs` (5977 checagens): todo slug nativo tem en/es, nenhum campo ficou em
  português, sem chaves órfãs. Rode sempre que incluir ou alterar uma técnica.
- **Correções de idioma:** telas que carregavam técnicas com dependências `[]` não buscavam de novo quando o idioma
  da conta chegava depois da primeira renderização (Catálogo, detalhe, editor de workflow, modal de projeto,
  operação rápida). Agora o idioma entra nas dependências.
- **Limite de 200:** a API pagina em 200; o Catálogo mostrava só 200 de 217. Agora busca todas as páginas.

## 2. Ícones

Duas camadas, uma biblioteca para cada papel (`frontend/src/config/icons.js`):

| Camada | Biblioteca | Uso |
|---|---|---|
| Interface (botões, setas, ações) | `lucide-react` | traço fino e neutro, já usado em toda a UI |
| Domínio (navegação, famílias, seções) | `@phosphor-icons/react` | pesos *regular* (inativo) e *duotone* (ativo/destaque) |

- Cada uma das 20 famílias tem um ícone próprio (ex.: Regressão = `TrendUp`, Deep Learning = `Brain`,
  Multiway = `Cube`/`Stack`) dentro de um "azulejo" na cor da família (`FamilyIcon`). No tema Classic o azulejo fica
  quadrado, como o resto da interface.
- A sidebar e os atalhos do Dashboard usam o mesmo conjunto (`NAV_ICONS`): um conceito = um ícone.
- O editor de workflow usa os ícones de família nos nós do canvas, nos cabeçalhos de grupo, nos chips de filtro e nos
  cartões da paleta (antes eram bolinhas coloridas).
- Importações sempre nomeadas, para o *tree-shaking* incluir só o que é usado.

## 3. Organização da experiência

Fontes consultadas e o que aplicamos:

| Fonte | Princípio | Onde aparece |
|---|---|---|
| NN/g — *Icon Usability* | ícone sem rótulo é ambíguo; use rótulo + ícone e um estilo visual único | sidebar com texto (a barra recolhida ganha `title`/`aria-label`); Phosphor em toda a navegação |
| Algolia — *Faceted search* | facetas com contagem; filtros gerais primeiro; "limpar filtros" visível | coluna de famílias com contagens que respeitam os outros filtros; "Mostrando X de Y" + "Limpar filtros" |
| NN/g — *Visual complexity* / hierarquia | poucos níveis, agrupamento, destaque do que importa | seções dentro de "Dados & I/O" (63 técnicas viraram 6 seções); título › descrição › fluxo de dados |
| PatternFly — *Card view* | cartões para escanear, lista para leitura densa | alternância grade/lista (preferência salva) |
| NN/g — *Progressive disclosure* | detalhe sob demanda | modal rápido com abas; página completa em `/catalogo/:id` |

Decisões:

1. **Catálogo:** busca com atalho `/` e destaque dos termos (ignora acentos), segmentos Todas/Ativas/Em
   desenvolvimento com contagem, ordenação (etapa do pipeline ou nome), grade/lista, famílias como coluna lateral
   (chips rolando na horizontal no celular), seções recolhíveis, estado vazio com ação de limpar e *skeletons*.
2. **"Dados & I/O":** a família reúne carga de dados, manipulação de arrays, funções matemáticas, estatística e álgebra
   linear. A seção é derivada de `family/subcategory/slug` só na apresentação (`config/techniqueSections.js`); banco e
   worker não mudam.
3. **Detalhe da técnica:** cabeçalho com ícone de família, status e identificador copiável; ação principal "Usar em um
   workflow"; abas Visão geral / Entradas e saídas / Parâmetros / Notas com contagens e navegação por setas.
   Tipos de porta traduzidos (Matriz, Vetor, Escalar… / Matrix, Vector, Scalar…).
4. **Técnicas em desenvolvimento:** cartão tracejado com selo âmbar "Em desenvolvimento", para não parecerem
   utilizáveis, mas continuam documentadas.
5. **Sidebar:** itens agrupados por intenção — Dados e projetos, Análise, Colaboração, IA — com rótulo de seção;
   Dashboard solto no topo.
6. **Temas:** só tokens (`--radius-*`, `--bg-*`, `--text-*`); no Classic os cantos são retos (novo `--radius-pill`).

## 4. Verificação

- `npm run i18n:check` (1705 chaves, paridade pt/en/es) e `npm run build`.
- Playwright: catálogo e detalhe em pt/en/es × dark/light/classic, em 1440, 820 e 390 px (sem rolagem horizontal,
  sem erros no console); 217 técnicas listadas; descrições das técnicas em desenvolvimento traduzidas.
