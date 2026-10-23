# Changelog

Entregas por data, da mais recente para a mais antiga. Cada item aponta para a documentação do assunto; os hashes são commits do `master`.
Datas em 2026.

## 22/10 — Armazenamento, cota e consumo; consolidação da documentação

- **Documentação consolidada**: índice (`docs/README.md`), README da raiz, [arquitetura.md](arquitetura.md), rotas geradas do código ([api_rotas.md](api_rotas.md)),
  fusão de UX ([ux.md](ux.md)) e de apps ([apps_comunidade.md](apps_comunidade.md)); planejamentos antigos em `historico/`.
- **Orçamento mensal de CPU bloqueia a execução** (`c321ff0`): 402 `CPU_BUDGET_EXCEEDED` ao despachar; nós não iniciados falham, em andamento terminam;
  orçamento por plano e por usuário (Beta 10 h, Equipe 200 h — exemplos). [armazenamento.md §3.1](armazenamento.md#31-consumo-de-processamento-e-custo-por-usuário-22102026)
- **Script de verificação com MinIO real** (`d2fb043`): `scripts/verify_minio.sh` e teste do driver com credenciais reais (ainda a rodar com Docker).
- **Medição por job e calculadora de custo** (`bc8781a`): CPU, pico/atribuição de memória e bytes por job (worker), consumo mensal por usuário,
  GB·hora de armazenamento, custo real × teto por plano e nº de licenças; painel no Admin e aba "Consumo" no Perfil.
- **Plano da Fase 3** (`310cb43`): tensores fora do MySQL, despacho por referência, worker lendo do bucket.
- **Cota de armazenamento por usuário** (`96e418b`): planos (Beta 100 MB/usuário, 20 MB/arquivo), reserva atômica, ledger, 413/503, medidor, "o que ocupa espaço",
  diálogo de bloqueio, administração de planos/cotas, backfill dos dados existentes, `DELETE /executions/:id` devolve cota.
- **StorageService + MinIO** (`3807d0c`, plano em `42be488`): drivers `local` e `s3` (MinIO/AWS), MinIO no compose.
- **Catálogo** (`f0e52cd`): tradução en/es das 217 técnicas, ícones Phosphor por família, nova organização (facetas, grade/lista, detalhe com abas). [ux.md](ux.md#3-catálogo-de-técnicas-tradução-ícones-e-ux)
- **Auditoria de UX** (`17a5cbd`): temas × larguras × idiomas; contraste, alvos de toque, plurais, login claro. [ux.md](ux.md#2-auditoria-de-ux-2026-10-22-temas-responsividade-e-traduções)
- **Quadro** (`4214dc5`): app estilo monday (tabela, Kanban, minhas tarefas, painel do item, 9 tipos de coluna, políticas de edição). [apps_comunidade.md](apps_comunidade.md#c-quadro-crm-lab-estilo-monday)
- **Equipamentos** (`58fddf3`): agendador com página pública/QR, e-mails (Resend), aprovação, bloqueios. [apps_comunidade.md](apps_comunidade.md#b-equipamentos--agendador-da-comunidade)
- **Quizzes** (`ffbe3e9`, `03f09d7`): subtópicos em 3 níveis, aba Apps, 5 tipos de pergunta, tentativas configuráveis, recorreção, pré-visualização. [apps_comunidade.md](apps_comunidade.md#a-comunidade-aba-apps-subtópicos-e-quizzes)
- **Aula completa** (`7b90fcc`): PPT/PDF, workflow, variável e projeto como material; preview Office→PDF; cópia pelo aluno.
- **Workspace por projeto e i18n** (`6b6eac6`), **tradução do catálogo** (`673b253`), **docs de idiomas/perfil/comunidades** (`331adf8`).

## 21/10 — Idiomas, perfil, comunidades e MATLAB-like

- **Perfil, preferências, comunidades com papéis, convites e projetos compartilhados** (`140f0d8`, frontend `86be5c9`); diagnóstico em `289f2aa`
  ([historico/](historico/diagnostico_idioma_usuario_comunidades.md)); [comunidades_perfil_i18n.md](comunidades_perfil_i18n.md).
- **Tema Classic (estilo MATLAB)** e persistência das conexões do canvas (`061011d`); encadeamento de nós corrigido e relatório e2e (`438ae95`). [ux.md](ux.md#1-tema-classic-estilo-matlab)
- **Auditoria de portas/tipos/textos do catálogo**, modal de técnica (`ccb7518`, `e838cce`).
- **Seed MATLAB consolidado** em `init.mysql` e documentação atualizada (`800f95f`).
- **Módulo Workspace estilo MATLAB**, funções e painel de informação da técnica (`cfe920d`, `5429cf7`, `49b180d`).

## 14/10

- Visualização de dados em padrão de publicação científica — Fase 1 (`a409e8a`).

## Em aberto

Ver [README.md — pendências](README.md#pendências-e-próximos-passos): verificação com MinIO real, preços e orçamentos reais, rotação da chave da Resend,
Fase 3 (dados fora do MySQL), Fase 4 (ciclo de vida) e limite de jobs simultâneos.
