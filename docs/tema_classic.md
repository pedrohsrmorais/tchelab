# Tema Classic (estilo MATLAB)

O tema **Classic** imita a interface clara do MATLAB (R2020+): janela cinza, painéis brancos, bordas
finas, cantos quase retos, texto compacto, azul de seleção e a paleta padrão de linhas do MATLAB.
Selecionado em *Sidebar → tema → Classic* (`localStorage.tchelab_theme = "classic"`, atributo
`data-theme="classic"` em `<html>`).

## Onde cada coisa vive

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

## Auditoria (2026-10-21)

Script Playwright percorrendo 17 telas (+ login) em 1440×900 e medindo, por elemento visível:
`border-radius` > 4,5 px (exceto círculos), fundos escuros e contraste de texto < 3:1.
Resultado final no Classic: **0** cantos arredondados, únicas superfícies escuras = azul de seleção
(`#0a5fa8`), **0** falhas de contraste. Também verificadas as camadas interativas (modais, diálogos do
Workspace, painéis do editor). Capturas em `docs/testes_e2e/classic_*.png`.

Fora do escopo / diferenças conhecidas: a fonte é `Segoe UI → Tahoma → Arial` (a Segoe UI só existe no
Windows; no Linux cai em outra sans-serif); as 3D/Surface do Plotly seguem o colormap do próprio gráfico.
