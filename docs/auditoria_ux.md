# Auditoria de UX (2026-10-22): temas, responsividade e traduções

Varredura automatizada com Playwright, em telas logadas como professor, com tema e idioma gravados na conta
(o tema salvo no servidor sobrescreve o `localStorage` a cada carregamento, então a varredura grava as preferências
pela API antes de cada combinação).

**Cobertura:** Dashboard, Projetos, Datasets, Workflows, Catálogo, Comunidades, Perfil, comunidade (visão geral, Apps,
Quadros, Minhas tarefas, Equipamentos, Quizzes), Quadro (tabela, Kanban, painel do item, filtros, modal de novo quadro),
Equipamento e Quiz. Temas dark, light e classic; larguras 1440, 768 e 390 px; idiomas pt, en e es.

**Medições por tela:** rolagem horizontal da página, elementos fora da viewport, chaves de tradução cruas, erros de
console/HTTP, contraste de texto (WCAG: 4,5:1; 3:1 para texto grande), alvos de toque < 28 px no celular, texto cortado;
no Classic, também cantos arredondados e superfícies escuras.

## Resultado

| Item | Resultado |
|---|---|
| Rolagem horizontal da página | **0** ocorrências em todas as telas, temas e larguras |
| Chaves de tradução cruas | **0** |
| Erros de console / HTTP | **0** (exceto um artefato da própria varredura: build trocado no meio da execução) |
| Paridade de chaves pt/en/es | OK (1601 chaves) |
| Classic: cantos arredondados nos apps novos | **0** depois da correção |

## O que foi corrigido

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

## Observações que ficaram

- **Catálogo de técnicas:** descrições vêm do banco em um único idioma (português). Em en/es, nomes de técnicas (já em
  inglês) aparecem, mas as descrições continuam em português. Traduzir pede uma coluna/estrutura por idioma e ~200 textos.
- **Dados criados pelo usuário** (nomes de colunas, status e grupos de um quadro) ficam no idioma em que foram criados:
  os modelos do Quadro são gerados no idioma do usuário no momento da criação.
- **Cores de famílias de técnicas no Catálogo:** em alguns temas ficam entre 2,4 e 3,9:1 (texto colorido por família).
- **Abas da comunidade** em telas estreitas rolam na horizontal sem indicador visual de que há mais abas.
- Alvos de toque restantes abaixo de 28 px: ícones do Catálogo ("Ver detalhes"/"Página completa").

Capturas (não versionadas) saem do script usado nesta auditoria; os de login ficam em `docs/testes_e2e/`.
