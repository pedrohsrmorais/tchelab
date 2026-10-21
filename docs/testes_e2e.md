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
