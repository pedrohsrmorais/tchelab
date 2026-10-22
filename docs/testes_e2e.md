# Testes end-to-end visuais — 2026-10-21

Teste manual-automatizado da stack completa (frontend servido pelo backend Node em `:3003`, MariaDB,
Redis, worker Python) usando Chromium headless via Playwright, com capturas de tela de cada fluxo.
As capturas citadas estão em [`docs/testes_e2e/`](testes_e2e/); o restante (≈110 imagens) ficou só na
sessão de teste.

**Viewports:** 1440×900 (desktop), 768×1024 (tablet), 375×812 (mobile). **Temas:** Escuro, Claro, Clássico.
**Idiomas:** pt-BR e en.

## Resultado resumido

| Área | Resultado |
|------|-----------|
| Cadastro / login / logout / erro de senha | OK (após correção do bug do erro de login invisível) |
| Projetos (criar/listar) | OK |
| Datasets (importar CSV espectral e tabular, detalhe, heatmap) | OK |
| Workflow: criar, adicionar técnica, conectar, autosave, persistir após reload | OK |
| Workflow: executar PLS no worker e visualizar resultados | OK (R2C 0,99997; saídas = portas auditadas) |
| Workflow: **encadear técnicas (Dataset → SNV → PCA)** | **Estava quebrado — corrigido** (ver bug #1) |
| Workflow: falha de um nó propaga `skipped` aos seguintes | OK (novo) |
| Workspace (importar inline, executar `inversa`, painel de info, modal de detalhes) | OK |
| Catálogo (busca, filtro por família, modal, página de detalhe) | OK |
| Temas e i18n | OK (corrigido contraste no Claro/Clássico) |
| Responsividade (rotas principais em 1440/768/375) | OK — sem scroll horizontal, sem erros de API |
| Jobs / Modelos (vazio) / Dashboard | OK (Dashboard com atividade placeholder, ver pendências) |
| Execução real das 94 técnicas vs schema do banco | 83 OK, 2 dinâmicas por parâmetro, 9 não exercitadas |

## Bugs encontrados e corrigidos

1. **Encadeamento de nós não funcionava (crítico).** `dispatchExecutionCore` enfileirava todos os nós de
   uma vez, só com `dataset_bindings`; as arestas técnica→técnica só ordenavam a fila. Qualquer nó
   alimentado por outro falhava com `Campo obrigatório ausente: input['X']`. Agora só os nós raiz vão
   para a fila; `executionPipeline.service.js::advanceExecution` libera os seguintes com as saídas dos
   anteriores e marca `skipped` os dependentes de um nó que falhou. Verificado: PCA recebeu 30 linhas do
   SNV (`execution_nodes.input_data`); com SNV forçado a falhar, PCA ficou `skipped` e só 1 job foi
   enfileirado. Documentado em `docs/api.md` (seção `execution.controller.js`).
   Capturas: `f21_result.png`, `f22_skipped_panel.png`.
2. **Pipeline "válido" com entrada obrigatória sem fonte.** O editor só validava tipos de conexão. Agora
   mostra "N entradas obrigatórias sem fonte" e bloqueia **Executar** com mensagem apontando nó e porta
   (`f20_b_blocked_toast.png`). Documentado em `docs/workflow.md`.
3. **Modal renderizando fora da tela** em containers com `transform` → `createPortal` para `document.body`,
   Esc fecha, `role="dialog"`, altura máxima da viewport.
4. **Sem layout responsivo:** sidebar virou drawer no mobile (`f15_mobile_drawer.png`), Workspace empilha
   painéis < 720 px, altura via `--page-h`, toolbar com wrap.
5. **Erro de login invisível:** o interceptor do axios tratava 401 de `/auth/login` como sessão expirada e
   recarregava a página. Chamadas de auth agora são ignoradas pelo refresh.
6. **Badge "0" solto** (renderização `&&` com número) e **visualizador de resultado vazio** para saídas em
   dicionário (agora vira tabela chave/valor).
7. **Contraste no tema Claro/Clássico** para chips azul/roxo/verde/âmbar/vermelho (`f17_light_catalog.png`).
8. **tensorly 0.10:** `kruskal_to_tensor` não existe mais → `parafac` e técnicas da família 10 falhavam.
   Helper `cp_to_tensor` em `worker_api/catalog/base.py` (compatível com as duas APIs).
9. **SIMCA** com rótulos numéricos/desconhecidos e **PLS-OC** com classe pequena quebravam; corrigidos e
   cobertos por testes de regressão em `tests/test_familia_05_classificacao.py`.
10. **Descrições de saída dos modelos** imprecisas no catálogo (16 técnicas) e **página de detalhe
    duplicando** o código do modal → `TechniqueDetails` compartilhado.

## Pendências / observações (não corrigidas)

- **Dashboard:** o card "atividade recente" ainda usa dados placeholder.
- **Nós novos no canvas** podem nascer sobrepostos (posição inicial fixa).
- **Nomes de variável duplicados** no Workspace não são impedidos.
- **Salvar dataset** usa `window.prompt` (frágil e fora do design system).
- **Nome padrão de saída** é truncado na UI.
- **Deep Learning (6 técnicas)** não foi exercitado: o sandbox não tem TensorFlow. Só o schema/descrição foram
  validados.
- **`importacao`, `metrics_aggregation`, `folding`** exigem entradas especiais e não entraram na checagem
  automática de runtime.
- **`tensorly` sem versão fixa** em `worker_api/requirements.txt` (o código agora aceita ambas as APIs).
- **Seção "Restrições"** das técnicas é texto manual na documentação.
- Artefatos do sandbox, não bugs do app: fuso do MariaDB (-03) vs backend (`+00:00`) desloca timestamps;
  fontes externas bloqueadas (`ERR_TUNNEL`); rate limiter de login (20/15 min) esgota em testes repetidos.

## Atualização — persistência das conexões e tema Classic (2026-10-21, tarde)

### Bug: conexões/dataset perdidos ao sair do workflow (corrigido)

Reproduzido: com Dataset→SNV→PCA conectados, ao sair e reabrir sobravam 1 aresta e o dataset
selecionado sumia ("Nenhum dataset selecionado").

- **Causa raiz (backend):** `updateWorkflowDefinition()` em `workflowNode.controller.js` e
  `workflowEdge.controller.js` sobrescrevia `workflows.definition` inteiro com `{nodes, edges}`, apagando o
  `canvas` (dataset escolhido + ligações dataset→porta) que o autosave do editor grava. Qualquer
  criação/movimento de nó ou criação de aresta *depois* de ligar o dataset apagava a ligação.
- **Correção:** novo `services/workflowDefinition.service.js::patchDefinition` (merge raso por chave de 1º
  nível), usado pelos controllers de nó/aresta; `PUT /workflows/:id` também faz merge de `definition`.
- **Segunda brecha (frontend):** o autosave debounced (800 ms) era cancelado ao desmontar o editor, então
  conectar e sair rápido perdia o salvamento. Agora há *flush* no unmount.
- **Nós novos nasciam colados/sobrepostos** (grade de 240 px ≈ largura do nó, impossibilitando conectar):
  agora são posicionados à direita do último, com folga.
- **Verificado** (nova criação de workflow pela UI, SPA → Voltar → reabrir): esperar autosave, sair após
  100 ms, sair imediatamente e sair ~600 ms após ligar o dataset → em todos, 2 arestas, dataset mantido e
  "Pipeline válido".
- **Limitação:** workflows que já tiveram o canvas apagado pelo bug não são recuperáveis — é preciso
  religar o dataset uma vez.

### Tema Classic

Ver [`tema_classic.md`](tema_classic.md). Antes: editor com nós navy ilegíveis, famílias em cores neon,
botões/abas com cores claras de tema escuro, login escuro, Workspace em bege estilo Windows XP com Command
Window preta. Agora: paleta cinza/branco/azul MATLAB em todas as telas, Command Window branca, heatmap em
parula, cores MATLAB nos gráficos e nas famílias. Capturas: `classic_workspace.png`, `classic_editor.png`,
`classic_dataset.png`, `classic_viz_heat.png`, `classic_login.png`.

### Pendências adicionais
- Restaurar versão de workflow (`restoreVersion`) só regrava `definition`; não recria `workflow_nodes`/
  `workflow_edges` (e apaga o `canvas`). Recurso incompleto, não corrigido.
- Excluir nó no canvas (ícone de lixeira) não pede confirmação e remove arestas/ligações em cascata.
- Tema Claro: textos cinza claros (`#94a3b8`) ficam abaixo de 3:1 em várias telas (auditoria Claro: 48 casos).

## Capturas incluídas

| Arquivo | Fluxo |
|---------|-------|
| `f1_project_created.png` | Projeto criado |
| `f2_dataset_viz.png` | Dataset espectral — heatmap |
| `f9_after_reload.png` | Workflow persistido após reload (autosave) |
| `f11_x_scores.png` | Resultado PLS — scores |
| `f12_executed.png`, `f12_fullmodal.png` | Workspace: execução e modal de detalhes |
| `f13_modal_pca.png`, `desktop_catalogo.png` | Catálogo: modal da técnica e listagem |
| `f15_mobile_drawer.png`, `f16_editor_m.png`, `tablet_workspace.png` | Responsivo |
| `f17_light_catalog.png`, `f17_english.png` | Tema Claro e inglês |
| `f20_b_blocked_toast.png` | Bloqueio por entrada obrigatória sem fonte |
| `f21_result.png`, `f22_skipped_panel.png` | Encadeamento SNV → PCA e propagação de falha |

## Testes automatizados de acesso, comunidades e catálogo

| Teste | Como rodar | O que cobre |
|-------|-----------|-------------|
| `backend_api/tests/access_e2e.mjs` | `node tests/access_e2e.mjs [http://localhost:3003]` (backend no ar) | 132 checagens: papéis de comunidade, convites (limite/expiração), banimento, vínculo de projeto `read`/`edit`, visibilidade de projetos públicos/privados, herança para workflows/datasets, arquivos da comunidade |
| `backend_api/tests/community_content_e2e.mjs` | `node tests/community_content_e2e.mjs [http://localhost:3003]` (backend no ar; usa `tests/fixtures/aula.pptx`) | 51 checagens da "aula completa": upload de PPTX/PDF, pré-visualização em PDF, itens workflow/variável com acesso leitura/edição, cópia de workflow/variável pelo aluno, reordenação, tópicos ocultos (inclusive download bloqueado), exclusão com limpeza de arquivos |
| `backend_api/tests/community_quiz_e2e.mjs` | `node tests/community_quiz_e2e.mjs [http://localhost:3003]` (backend no ar) | 132 checagens: subtópicos (3 níveis, ciclos, ocultação herdada, exclusão em cascata), quizzes com V/F, múltipla escolha, texto, variável e workflow, anexos, publicação, correção automática e manual, acesso do professor ao trabalho do aluno só após a entrega, tentativas configuráveis (limite, ilimitadas, políticas de nota, nova tentativa) e edição de perguntas com entregas + recorreção |
| `backend_api/tests/equipment_e2e.mjs` | `MAIL_TRANSPORT=file node server.js` e `node tests/equipment_e2e.mjs [http://localhost:3003]` (e-mails gravados em `OUTBOX_DIR`, padrão `/tmp/tl_storage/outbox`) | 117 checagens do agendador de equipamentos: janelas semanais (sem sobreposição), bloqueios (únicos e recorrentes, conflito/cancelamento de reservas), disponibilidade, reservas de membros, página pública sem login (token, 404 quando desativada, sem dados pessoais de terceiros), reserva de convidado com confirmação por e-mail, aprovação/rejeição, cancelamento por link, limites por e-mail/IP, honeypot, imagem (tipo/tamanho) e 8 requisições concorrentes no mesmo horário (só 1 vence) |
| `backend_api/tests/board_e2e.mjs` | `node tests/board_e2e.mjs [http://localhost:3003]` (backend no ar; reinicie o backend antes se o limitador de login acusar 429) | 148 checagens do Quadro: quadros por modelo, grupos, colunas (9 tipos), itens, células atômicas (`JSON_SET`), 8 gravações paralelas em colunas diferentes do mesmo item e 5 na mesma coluna, status em uso (409 `LABEL_IN_USE` + remapeamento), políticas de edição (`staff`/`own`/`members`), ações em lote, comentários e atividade, "Minhas tarefas", membro removido e exclusão em cascata |
| `backend_api/tests/catalog_i18n_check.mjs` | `node tests/catalog_i18n_check.mjs` (usa `DB_*`) | Cobertura da tradução en/es das **217 técnicas nativas** (ativas e em desenvolvimento): descrição, como funciona, dicas, nota histórica, portas e parâmetros; sobras em português; nomes; chaves órfãs |
| `frontend`: `npm run i18n:check` | na pasta `frontend` | Paridade de chaves e `{{placeholders}}` entre pt/en/es |

Verificações manuais em navegador (Playwright): fluxo professor → comunidade → tópico/PDF → vínculo de projeto com acesso de
edição → convite → aluno entra por `/join/CÓDIGO` e edita; troca para leitura e o editor abre somente-leitura; Workspace
por projeto; idioma/tema persistidos entre dispositivos; Catálogo em pt/en/es.
