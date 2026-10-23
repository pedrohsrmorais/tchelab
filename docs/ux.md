# Interface (UX): temas, auditoria e catálogo

Consolida o que antes eram três documentos (`tema_classic.md`, `auditoria_ux.md`, `ux_catalogo.md`).

| Parte | Assunto |
|---|---|
| [1. Tema Classic](#1-tema-classic-estilo-matlab) | tokens, onde cada ajuste vive, auditoria visual |
| [2. Auditoria de UX](#2-auditoria-de-ux-2026-10-22-temas-responsividade-e-traduções) | varredura temas × larguras × idiomas e correções |
| [3. Catálogo de técnicas](#3-catálogo-de-técnicas-tradução-ícones-e-ux) | tradução en/es, ícones, organização da experiência |

Regras gerais de UI do projeto: usar tokens (`var(--bg-*)`, `--text-*`, `--border`, `--radius-*`) e nunca hex fixo; textos sempre por i18n
(tuplas `[pt,en,es]` em `frontend/src/i18n/locales/*.strings.js`, conferidas por `npm run i18n:check`); sem rolagem horizontal da página;
alvos de toque ≥ 32 px no celular; contraste WCAG 4,5:1 (3:1 texto grande). O medidor de armazenamento e o consumo de CPU ficam em
[armazenamento.md](armazenamento.md) §3 e §3.1.

---

## 1. Tema Classic (estilo MATLAB)
O tema **Classic** imita a interface clara do MATLAB (R2020+): janela cinza, painéis brancos, bordas
finas, cantos quase retos, texto compacto, azul de seleção e a paleta padrão de linhas do MATLAB.
Selecionado em *Sidebar → tema → Classic* (`localStorage.tchelab_theme = "classic"`, atributo
`data-theme="classic"` em `<html>`).

### Onde cada coisa vive

| O quê | Onde |
|-------|------|
| Tokens (`--bg-*`, `--border*`, `--accent`, `--radius*`, `--node-bg`, fonte) | `frontend/src/index.css`, bloco `[data-theme="classic"]` |
| Fonte base 14 px (UI mais densa, como o MATLAB) | `html[data-theme="classic"]` |
| Cantos retos (utilitários `rounded-*`, pílulas, `border-radius` inline; círculos/avatares preservados) | seção "Classic: ajustes para parecer com o MATLAB" em `index.css` |
| Cores inline claras (pensadas para o tema escuro) → equivalentes legíveis | mesma seção — seletores `[style^="color: rgb(...)"]`; as cromáticas valem também para o tema Claro |
| Degradês azul/roxo decorativos → azul chapado | idem |
| Cabeçalhos de tabela cinza claro / texto preto | idem (`thead`) |
| React Flow (minimapa, controles, arestas) | idem |
| Tela de login (sem blobs/órbitas, painel branco) | classes `login-*` em `LoginPage.jsx` + regras em `index.css` |
| Cores das famílias de técnicas no editor/catálogo | `techniqueRegistry.js` → `matlabize()` (paleta MATLAB levemente escurecida: o original não passa de contraste 3:1 como texto) |
| Gráficos Plotly: cores das séries (ordem MATLAB), **colormap parula** no heatmap, eixos em caixa | `components/viz/chartTheme.js` (`activeColorway`, `activeHeatmapScale`, `isClassicTheme`) |
| Workspace (toolbar, barras de título cinza, Variable Editor, **Command Window branca**) | `pages/WorkspacePage.jsx` (`useWsStyles`) |

Observações de implementação:

- Cores calculadas em JS leem `document.documentElement.dataset.theme`. `ThemeContext.setTheme` aplica o
  atributo **antes** do re-render e o `AppLayout` remonta a página (`key={theme}`) ao trocar de tema, para
  que essas cores sejam recalculadas.
- Os gráficos continuam com fundo branco (são pensados como figura de artigo); só a paleta muda.
- Para um componente novo ficar correto no Classic: use `var(--bg-*)`/`var(--border)`/`var(--text-*)`
  em vez de hex fixos; se precisar de cor própria, evite tons claros de Tailwind em fundo claro.

### Auditoria (2026-10-21)

Script Playwright percorrendo 17 telas (+ login) em 1440×900 e medindo, por elemento visível:
`border-radius` > 4,5 px (exceto círculos), fundos escuros e contraste de texto < 3:1.
Resultado final no Classic: **0** cantos arredondados, únicas superfícies escuras = azul de seleção
(`#0a5fa8`), **0** falhas de contraste. Também verificadas as camadas interativas (modais, diálogos do
Workspace, painéis do editor). Capturas em `docs/testes_e2e/classic_*.png`.

Fora do escopo / diferenças conhecidas: a fonte é `Segoe UI → Tahoma → Arial` (a Segoe UI só existe no
Windows; no Linux cai em outra sans-serif); as 3D/Surface do Plotly seguem o colormap do próprio gráfico.

---

## 2. Auditoria de UX (2026-10-22): temas, responsividade e traduções

Varredura automatizada com Playwright, em telas logadas como professor, com tema e idioma gravados na conta
(o tema salvo no servidor sobrescreve o `localStorage` a cada carregamento, então a varredura grava as preferências
pela API antes de cada combinação).

**Cobertura:** Dashboard, Projetos, Datasets, Workflows, Catálogo, Comunidades, Perfil, comunidade (visão geral, Apps,
Quadros, Minhas tarefas, Equipamentos, Quizzes), Quadro (tabela, Kanban, painel do item, filtros, modal de novo quadro),
Equipamento e Quiz. Temas dark, light e classic; larguras 1440, 768 e 390 px; idiomas pt, en e es.

**Medições por tela:** rolagem horizontal da página, elementos fora da viewport, chaves de tradução cruas, erros de
console/HTTP, contraste de texto (WCAG: 4,5:1; 3:1 para texto grande), alvos de toque < 28 px no celular, texto cortado;
no Classic, também cantos arredondados e superfícies escuras.

### Resultado

| Item | Resultado |
|---|---|
| Rolagem horizontal da página | **0** ocorrências em todas as telas, temas e larguras |
| Chaves de tradução cruas | **0** |
| Erros de console / HTTP | **0** (exceto um artefato da própria varredura: build trocado no meio da execução) |
| Paridade de chaves pt/en/es | OK (1601 chaves) |
| Classic: cantos arredondados nos apps novos | **0** depois da correção |

### O que foi corrigido

| Problema | Correção |
|---|---|
| Login no tema **Claro**: fundo escuro, título "TcheLab" e rótulos quase invisíveis | Login claro de verdade no tema Claro (`index.css`, classes `login-*`) |
| Login no **Classic**: botões EN/ES do seletor de idioma ilegíveis; brilho azul nas abas | Seletor e abas com cores do Classic |
| Texto "muted" fraco nos 3 temas (escuro 3,4:1; claro 2,5:1; Classic 3,9:1) | Tokens `--text-muted` recalibrados (≥ 4,5:1); `text-slate-500` clareado no escuro |
| Texto branco sobre rótulos de status claros (ex.: "Feito" 2,2:1) | `ink()` escolhe preto ou branco pelo maior contraste (WCAG) |
| Títulos de grupo do Quadro (cor do grupo sobre fundo claro, 1,9–2,7:1) | Cor escurecida por `color-mix` nos temas Claro e Classic |
| Cabeçalho do equipamento no celular: título coberto pelos botões | Título com `flex-basis`; ações quebram para a linha de baixo |
| Botões Tabela/Kanban sem nome acessível no celular | `aria-label` e `title` |
| Modelo selecionado no modal "Novo quadro" quase sem destaque no Classic | Anel de destaque (`box-shadow`) e `aria-pressed` |
| "+ + Adicionar item" (ícone e sinal duplicados) | Texto sem o "+" |
| Plurais improvisados ("6 item(ns)", "aluno(s)", "reserva(s)") | Plural real do i18next (`_one`/`_other`) em 19 mensagens |
| Alvos de toque pequenos no celular (migalhas, "voltar", caixas de seleção e menus do Quadro) | Altura mínima de 32 px em links de navegação; caixas 18 px; menus com mais área |
| Classic: barras de progresso, chips e botões de status arredondados | Cantos quase retos (`--radius-sm`) |
| Badge verde "Pública" no tema Claro (3,3:1); cabeçalho "hoje" da agenda (2,9:1) | Tons mais escuros / `--text-accent` |

### Observações que ficaram (status atual)

- **Catálogo de técnicas:** *resolvido depois desta auditoria* — as 217 técnicas nativas têm descrições em en/es (ver parte 3).
- **Dados criados pelo usuário** (nomes de colunas, status e grupos de um quadro) ficam no idioma em que foram criados:
  os modelos do Quadro são gerados no idioma do usuário no momento da criação.
- **Cores de famílias de técnicas no Catálogo:** em alguns temas ficam entre 2,4 e 3,9:1 (texto colorido por família).
- **Abas da comunidade** em telas estreitas rolam na horizontal sem indicador visual de que há mais abas.
- Alvos de toque restantes abaixo de 28 px: ícones do Catálogo ("Ver detalhes"/"Página completa").

Capturas (não versionadas) saem do script usado nesta auditoria; os de login ficam em `docs/testes_e2e/`.

---

## 3. Catálogo de técnicas: tradução, ícones e UX

Entrega da rodada "traduzir o catálogo, revisar ícones e deixar a experiência bonita, detalhada e intuitiva".

### 1. Tradução

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

### 2. Ícones

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

### 3. Organização da experiência

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

### 4. Verificação

- `npm run i18n:check` (1705 chaves, paridade pt/en/es) e `npm run build`.
- Playwright: catálogo e detalhe em pt/en/es × dark/light/classic, em 1440, 820 e 390 px (sem rolagem horizontal,
  sem erros no console); 217 técnicas listadas; descrições das técnicas em desenvolvimento traduzidas.
