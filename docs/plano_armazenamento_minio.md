# Plano: MinIO/S3, cota por usuário e custo por usuário

Status: **plano para aprovação** (nenhum código alterado). Diagnóstico de partida: seção "Onde cada coisa fica" da
conversa de 22/10/2026 (resumo no fim deste arquivo).

## 1. Objetivos

1. Todo arquivo e todo dado volumoso em **object storage** (MinIO hoje, S3 da AWS depois, trocando só endpoint e
   credenciais).
2. **Cota de armazenamento por usuário**, aplicada no servidor: ao chegar perto do limite, a plataforma bloqueia a ação
   que consumiria espaço até o usuário liberar espaço (ou, no futuro, contratar mais).
3. **Custo conhecido por usuário** (armazenamento + processamento + memória), para precificar licenças
   ("laboratório com 10 usuários = R$ X/mês") com números medidos, não estimados.
4. Garantir que a soma das cotas nunca ultrapasse a capacidade do servidor.

## 2. Arquitetura-alvo

```
 navegador ──HTTPS──► backend_api ──S3 API──► MinIO (bucket privado `tchelab`)
                          │  ▲                    ▲
                          │  └── cota (MySQL) ────┤
                          ▼                       │
                        Redis ──► worker Python ──┘   (lê e grava direto no bucket)
```

- **Bucket único e privado**, chaves por dono: `u/<user_uuid>/datasets/<ds_uuid>.npy`,
  `u/<user_uuid>/outputs/<exec_uuid>/<node>.npy`, `c/<community_uuid>/items/<item_uuid>.<ext>`, `tmp/<uuid>` etc.
  O prefixo permite somar por dono, aplicar política de ciclo de vida e apagar tudo de um usuário de uma vez.
- **MinIO no `docker-compose`** com volume próprio, sem porta pública (só rede interna `tchelab`); console de admin
  acessível só por túnel/rede interna. Chaves separadas: uma para o backend, outra (mínimo privilégio) para o worker.
- **Camada `StorageService`** no backend com interface única: `putStream`, `get`, `stat`, `delete`, `deletePrefix`,
  `presignGet`. Drivers `local` (como hoje, útil em desenvolvimento e testes) e `s3` (`@aws-sdk/client-s3` +
  `@aws-sdk/lib-storage`, que serve MinIO e AWS). Nenhum controller toca em `fs` direto depois da migração.
- **Upload pelo backend com streaming** (não por URL assinada direto no MinIO): permite medir bytes reais, reservar cota
  antes e recusar no meio do envio. Mais simples de proteger e não expõe o MinIO. URLs assinadas ficam para
  **download** de arquivos grandes (evita o backend carregar o tráfego) quando necessário.
- **Dataset deixa de viver no MySQL**: tensor/matriz em `.npy` no bucket; `datasets.metadata` guarda só resumo
  (dimensões, cabeçalhos, estatísticas) e uma **prévia** (primeiras N linhas). `storage_path` vira a chave S3.
  O mesmo vale para saídas grandes de execução: o worker grava no bucket e o MySQL guarda só a referência e o resumo.
- **Execução por referência**: o `dispatch` deixa de reenviar o tensor pelo navegador. O backend valida acesso ao dataset
  e manda ao worker a **chave** do objeto; o worker lê direto (boto3). Isso remove o teto de 10 MB, tira o tensor da
  fila Redis e do payload do job.

## 3. Cota por usuário

### 3.1 O que conta

| Conta na cota | Não conta |
|---|---|
| Objetos do usuário no bucket: datasets, saídas de execução guardadas, modelos, PDFs de artigo, avatar | Linhas pequenas do MySQL (nomes, configurações, comentários) |
| JSON grande que sobrar no MySQL (`datasets.metadata`, `execution_nodes.*`), medido em bytes | Datasets de outras pessoas apenas **visualizados/usados em workflow sem copiar** (cópia e importação contam) |
| Arquivos de comunidade, na cota de quem enviou | Arquivos temporários (`tmp/`), que expiram sozinhos |

Para a cota ficar previsível, o MySQL passa a ter **teto por linha** (ex.: 1 MB de JSON por dataset/execução);
acima disso o dado vai para o bucket.

### 3.2 Contabilidade (fonte única da verdade no MySQL)

- `storage_plans` (`id, name, quota_bytes, max_file_bytes, max_concurrent_jobs, monthly_cpu_seconds`): hoje um plano
  "Beta" (e depois "Pago X" sem mudar código).
- `users.storage_plan_id`, `users.storage_quota_bytes` (sobrescreve o plano, para casos especiais),
  `users.storage_used_bytes`, `users.storage_reserved_bytes`.
- `storage_objects` (`id, owner_user_id, key, kind, size_bytes, ref_table, ref_id, status[pending|ready|deleted],
  created_at, deleted_at`): um registro por objeto; é daqui que se reconcilia com o bucket.
- `storage_ledger` (`user_id, delta_bytes, reason, object_id, created_at`): trilha de auditoria (quem consumiu o quê,
  quando).

### 3.3 Aplicação (reservar → gravar → confirmar)

1. **Reservar** antes de qualquer gravação, de forma atômica:
   `UPDATE users SET storage_reserved_bytes = storage_reserved_bytes + :n WHERE id = :id AND storage_used_bytes +
   storage_reserved_bytes + :n <= quota` (0 linhas afetadas = estourou). Sem condição de corrida entre uploads
   simultâneos.
2. **Gravar** no bucket em streaming. O `Content-Length` declarado serve para a reserva inicial; durante o envio, o
   backend conta os bytes reais e aborta se passarem do reservado.
3. **Confirmar**: move reservado → usado e marca o objeto `ready`; em falha, **libera** a reserva.
4. **Excluir**: marca `deleted`, devolve os bytes e apaga o objeto (imediato ou após a lixeira, ver 3.5).
5. Resposta de bloqueio padronizada: HTTP 413/402 com código `STORAGE_QUOTA_EXCEEDED`, trazendo `used`, `quota`,
   `needed`. O frontend usa esse código para abrir o diálogo de "liberar espaço".

Ações cobertas: importar dataset (arquivo ou colado), copiar variável, resultados de execução guardados, upload de
PDF/material de comunidade, avatar, foto de equipamento, salvar modelo.

### 3.4 Experiência do usuário

- **Medidor de uso** no perfil e na sidebar ("182 MB de 500 MB"), com cores aos 80% e 95%.
- **Aviso** ao passar de 80% e antes de importar algo que não cabe ("este arquivo tem 60 MB, faltam 12 MB").
- **Diálogo de bloqueio**: lista dos datasets do usuário ordenados por tamanho, com botão de excluir; e, no futuro, o
  botão "Aumentar espaço".
- **Leitura nunca é bloqueada**: com a cota cheia o usuário ainda abre, consulta, baixa e **exclui**. Só gravar é
  recusado. Execução de workflow é recusada com mensagem clara quando não há espaço mínimo livre.
- **Admin**: tela de uso por usuário, ajuste de cota/plano, e painel de capacidade (ver 3.6).

### 3.5 Limpeza (resolve o item 4)

- Prefixo `tmp/` com **ciclo de vida de 24 h** (política do bucket, funciona igual no S3).
- **Lixeira**: excluir dataset marca `deleted_at` e a cota é devolvida na hora (ou após N dias, se preferir lixeira
  que conta); um job diário apaga o objeto de verdade depois de N dias.
- **Saídas de execução** não expiram (decisão 3): o usuário vê quanto cada uma ocupa e exclui.
- **Reconciliação semanal**: compara `storage_objects` × bucket × `users.storage_used_bytes`, corrige divergência,
  remove órfãos e gera relatório.

### 3.6 Proteção do servidor

- Painel admin com **cota alocada × capacidade real** do volume (ex.: 40 usuários × 500 MB = 20 GB alocados de 200 GB)
  e razão de sobrealocação configurável.
- **Trava global**: se o disco do MinIO passar de 90%, novas gravações são recusadas para todos, com aviso ao admin.
- Limite por arquivo (hoje 2 GB sem processamento real) passa a vir do plano: **20 MB** no Beta; o parser lê em streaming.

## 4. Custo por usuário (armazenamento + processamento + memória)

Para saber o custo exato é preciso **medir**, então o plano inclui instrumentação:

**Processamento e memória (worker)**
- Colunas novas em `jobs`: `wall_seconds`, `cpu_seconds`, `peak_rss_mb`, `input_bytes`, `output_bytes`.
- O worker mede por job (`resource.getrusage` + pico de RSS) e devolve no resultado; o `resultConsumer` grava.
- Tabela `usage_monthly (user_id, month, storage_gb_hours, cpu_seconds, gb_seconds_ram, jobs, egress_bytes)`
  alimentada por agregação diária.
- **Limites de proteção por usuário**: jobs simultâneos (plano), timeout por job (já existe, 300 s) e **teto de
  memória por job** (rejeitar ou matar quem passar), para um usuário não derrubar o worker dos outros.

**Armazenamento**
- `storage_gb_hours` medido pela contabilidade (cota usada integrada no tempo), não só o pico.

**Calculadora de licença** (admin): parâmetros de preço editáveis e fórmula
`custo/mês = GB_alocados × preço_GB_mês + CPU_h × preço_CPU_h + GB·h_RAM × preço_RAM + egress_GB × preço_egress`.
Com dois modos: **teto** (todos usando 100% da cota e do orçamento de CPU, o pior caso) e **real** (média medida).
Para "10 usuários": `10 × plano` dá o teto exato; depois de 1–2 meses de uso real o painel mostra o custo médio por
usuário. Os preços entram como parâmetros (S3 Standard fica na casa de US$ 0,02/GB·mês; a conferir na tabela atual da
AWS e no custo real do seu servidor/disco).

## 5. Fases de execução

> Status (22/10/2026): fases 1 e 2 entregues; **fase 6 parcial** (medição por job, `usage_monthly`, calculadora de custo/licença e bloqueio por orçamento de CPU feitos; falta o limite de jobs simultâneos por usuário); fases 3, 4, 5 (migração de tensores) e 7 (checklist com MinIO real) pendentes. Mais: — ver `armazenamento.md`. As chaves mantiveram a pasta por tipo (`datasets/`, `communities/`…) em vez de `u/<usuario>/…`; o dono fica em `storage_objects`. O backfill (`backend_api/scripts/storage_backfill.js`) já cobre parte da fase 5.

| Fase | Entrega | Resolve | Risco |
|---|---|---|---|
| **0** | Decisões fechadas (seção 6); medir tamanho real dos dados atuais | — | baixo |
| **1** ✅ | MinIO no compose (+ bucket e chaves no bootstrap), `StorageService` (drivers local e s3), testes do driver | base | baixo |
| **2** ✅ | Cota: tabelas, reserva/confirmação/liberação, erro padronizado, endpoint `GET /storage/usage`, medidor no perfil/sidebar, diálogo de bloqueio, admin de cotas; ligada primeiro em **uploads de arquivo** (comunidade, avatar, equipamento, PDF) | item 6 + cota | médio |
| **3** | Datasets e saídas no bucket (`.npy` + resumo/prévia no MySQL); importação em streaming; `dispatch` por referência; worker lendo do bucket (credencial própria); teto de JSON por linha | itens 3 e teto de 10 MB | **alto** (toca o caminho de execução) |
| **4** | Limpeza: lifecycle de `tmp/`, lixeira, expiração de saídas, reconciliação semanal | item 4 | baixo |
| **5** | Migração dos dados atuais (script com `--dry-run`, idempotente, com verificação de hash/tamanho e driver `local` como leitura de segurança até concluir) | — | médio |
| **6** ◐ | Medição de processamento/memória, `usage_monthly`, limites por usuário, painel de custo e calculadora de licença | item "custo exato" | médio |
| **7** | Testes e2e (cota sob concorrência, bloqueio, exclusão libera, leitura com cota cheia, falha no meio do upload libera reserva, reconciliação) + docs + checklist de produção (backup do MinIO, troca para S3) | — | baixo |

Cada fase fecha com build, testes e commit próprio. As fases 1–2 já entregam valor sozinhas (cota funcionando para
arquivos); a 3 é a mais delicada e a que remove o teto de 10 MB.

## 6. Decisões tomadas (22/10/2026)

1. **Tudo que entra no Workspace conta na cota**, inclusive cópia/importação de dataset da plataforma ou de comunidade
   e variáveis geradas por operações.
2. **Arquivo de comunidade conta na cota de quem enviou** (professor ou aluno).
3. **Saídas de execução contam na cota e não expiram**: o usuário libera espaço excluindo. Consequências adotadas:
   - o MySQL deixa de guardar a **entrada** de cada nó (só referência), para a mesma matriz não ser cobrada duas vezes;
   - **teto de saída por job** (20 MB, igual ao teto por arquivo) para uma execução não estourar a cota de uma vez;
   - antes de executar, a plataforma confere se há espaço mínimo livre; sem espaço, bloqueia a execução e mostra o
     diálogo de "liberar espaço". Se a saída final não couber, o nó falha com `STORAGE_QUOTA_EXCEEDED` (não grava
     parcial).
4. **Plano Beta: 100 MB por usuário e 20 MB por arquivo** (configurável por plano e por usuário, sem deploy).

Com 100 MB de cota, cuidar do consumo vira parte da experiência: o medidor de uso e a lista "o que ocupa espaço"
(datasets e saídas, por tamanho) são parte da entrega da fase 2, não um extra.

## 7. Apêndice: situação atual (resumo)

Tudo em disco local no volume `storage_data` (`tmp`, `communities`, `avatars`, `equipment`, `outbox`; `datasets`,
`models`, `outputs` quase sem uso); dados numéricos dos datasets em JSON no MySQL; execução move o tensor
navegador → API → Redis → worker (teto de 10 MB); o worker não monta o volume; nada é limpo; não há cota nem medição de
processamento.

## 8. Fase 3 detalhada — dados fora do MySQL, busca rápida, modelos lendo do bucket

Objetivo: **listar/buscar rápido** (o MySQL guarda só o que se consulta), **os modelos continuam funcionando** (os scripts
recebem os mesmos `numpy` de hoje) e o **volume pesado vai para o bucket**.

### 8.1 Modelo de dados

| Onde | O que guarda |
|---|---|
| MySQL `datasets` | linha **pequena**: nome, tipo, `dimensions`, `n_samples/n_variables`, cabeçalhos, comprimentos de onda, estatísticas por coluna, **prévia** (até 50 linhas × 50 colunas) e a chave do payload. É o que as listagens e a busca leem. |
| Bucket `datasets/<uuid>/data.npy` | a matriz/tensor inteiro, `float64`, ordem C (formato `.npy`: o `numpy` lê direto, sem converter). Sidecar `datasets/<uuid>/extra.json` para rótulos de linha, colunas extras e classes. |
| Bucket `runs/<execução>/<nó>/<porta>.npy` | cada saída de array de um nó. Saídas não-array pequenas (< 64 KB: métricas, escalares) ficam inline no manifesto; maiores viram `.json` no bucket. |
| MySQL `execution_nodes` | `input_data`/`output_data` passam a ser **manifestos** (`{porta: {key, shape, dtype, bytes}}` ou valor inline pequeno), nunca a matriz. `jobs.result` guarda só o manifesto. |

### 8.2 Passos (cada um entregável e testado; leitura aceita o formato antigo até a migração)

1. **Formato e serviço** — leitor/gravador `.npy` em Node (cabeçalho v1, float64/float32/int), `datasetStore.service`
   (gravar, ler inteiro, ler fatia de linhas, montar resumo e prévia). Teste de ida e volta Node ⇄ Python.
2. **Datasets novos já nascem enxutos** — importação CSV, colar tensor, copiar, "salvar saída como dataset" (cópia dentro do
   bucket, sem passar por JSON). Novos endpoints `GET /datasets/:id/data` (stream; `?rows=a-b`, `?format=json|npy`) e prévia
   leve. A cota passa a contar linha pequena + bytes do `.npy`. **Frontend**: Workspace (hoje carrega `with_metadata` de até 200
   datasets), detalhe, heatmap/visualização, pré-visualização de comunidade e editor de workflow passam a usar resumo/prévia e
   buscam o payload só quando precisam (com redução de pontos no servidor para gráficos).
3. **Dispatch por referência** — o navegador deixa de baixar o tensor e reenviá-lo: manda só `{dataset: uuid}`; o backend
   confere o acesso e monta `{"$ref": chave, shape, dtype}`. O **worker lê e grava no bucket com credencial própria**
   (usuário MinIO/IAM restrito aos prefixos `datasets/` e `runs/`; leitura nos dois, escrita só em `runs/`), entrega `ndarray` aos
   scripts (já usam `np.asarray`, então nenhum script muda) e devolve um manifesto no lugar de `outputs`. O encadeamento
   (SNV → PCA) passa a ser por chave de objeto. O backend confere o tamanho real (`stat`) antes de registrar a saída na cota
   (> máximo do plano → apaga o objeto e falha o nó). Excluir execução apaga o prefixo `runs/<execução>/`.
4. **Migração e limpeza** — `scripts/migrate_tensors_to_bucket.js` (idempotente, `--dry-run`, confere ida e volta antes de
   esvaziar a coluna) para datasets e execuções existentes; remove os caminhos antigos e o teto de 10 MB de JSON (o limite
   efetivo passa a ser o máximo por arquivo do plano); recalcula a cota.
5. **Provas** — e2e: ida e volta, dispatch por referência com o worker de verdade (PLS e cadeia SNV → PCA), cota de saídas,
   exclusão apagando o bucket, dado legado ainda legível; **medição** do tempo de listagem (200 datasets) e do tamanho do corpo
   do `dispatch` antes/depois; docs e checklist de produção (credencial do worker, rede worker ↔ MinIO).

### 8.3 Riscos e como os cobrimos
- *Scripts que esperam listas*: o worker já converte tudo com `np.asarray`; a suíte `worker_api/tests` roda com entradas `ndarray` e o e2e roda o PLS real.
- *Objeto no bucket sem linha no banco (ou o contrário)*: grava-se primeiro o objeto, depois a linha; falha no meio libera a reserva e apaga o objeto. Órfãos residuais entram na reconciliação da fase 4.
- *Implantação*: leitura dos dois formatos até a migração rodar; só depois removemos o caminho legado.
- *Memória do worker*: carregar `.npy` é mais leve que `JSON → listas`; a medição por job (CPU/pico de memória) é a fase 6.
