# Apps da comunidade: Quizzes, Equipamentos e Quadro

Consolida `comunidade_subapps_quizzes.md`, `equipamentos_agendador.md` e `quadro.md`. Os apps ficam na aba **Apps** da comunidade
(`?tab=apps&app=boards|tasks|equipment|quizzes`); o registro `APPS` e as migalhas ficam em `frontend/src/components/apps/AppsNav.jsx`.
Perfil, comunidades e papéis (`cg('<papel>')`): [comunidades_perfil_i18n.md](comunidades_perfil_i18n.md). Rotas: [api_rotas.md](api_rotas.md)
(áreas COMMUNITIES e Equipamentos). Arquivos enviados em qualquer app contam na cota de quem enviou — ver [armazenamento.md](armazenamento.md).

| Parte | App | Testes |
|---|---|---|
| A | Aba Apps, subtópicos e **Quizzes** | `community_quiz_e2e.mjs` (132 checagens) |
| B | **Equipamentos** (agendador com página pública e QR) | `equipment_e2e.mjs` (117) |
| C | **Quadro** (CRM-Lab, estilo monday) | `board_e2e.mjs` (148) |

Histórico de como esses apps foram planejados: [historico/apps_quadro_equipamentos_plano.md](historico/apps_quadro_equipamentos_plano.md).

---

## A. Comunidade: aba Apps, subtópicos e quizzes
> Implementado. Testes: `backend_api/tests/community_quiz_e2e.mjs` (132 checagens). Complementa `comunidades_perfil_i18n.md` §7.

### 1. Subtópicos (estilo Moodle)

`community_sections.parent_id` permite **Parte → Aula → Subaula** (máximo 3 níveis).

- `POST /communities/:id/sections { title, description?, parent? }` — `parent` é o uuid do tópico pai.
- `PUT /communities/:id/sections/:sid { …, parent }` — move o tópico (`null` = nível principal). O servidor recusa mover um
  tópico para dentro de si mesmo ou de um descendente e recusa passar de 3 níveis (422).
- `PUT /communities/:id/sections-order { order }` reordena **entre irmãos**.
- `GET /communities/:id/content` devolve `sections` como lista plana com `parent` (uuid) em cada tópico; o frontend monta a árvore.
- **Ocultar um tópico oculta toda a subárvore** para membros comuns (conteúdo, download de arquivos, quizzes e o acesso
  concedido a workflows/variáveis do tópico). Excluir um tópico exclui os descendentes (arquivos são removidos do disco).
- UI: cartões aninhados e recolhíveis; por tópico: adicionar material, **novo subtópico**, novo quiz, subir/descer, editar
  (inclusive "dentro de" para mover), ocultar e excluir.

### 2. Aba "Apps"

Visível a todos os membros. Para professores (moderator+) mostra os atalhos de criação — **Quiz, PDF/slides/arquivos,
workflow, variável (dataset), projeto, link, texto, tópico** (cada atalho abre o modal já no tipo certo) — e um espaço
"Estudo dirigido — em breve". Abaixo, a lista de quizzes (professor: status e nº de entregas; aluno: situação e nota).

### 3. Pré-visualização sem baixar

| Material | Pré-visualização |
|---|---|
| PDF, imagem | inline no modal (botão "Abrir em nova aba") |
| PPT/PPTX/DOC/XLS… | PDF convertido pelo LibreOffice, inline; original disponível para baixar |
| Variável (dataset) | tabela com as primeiras linhas/colunas e dimensões; multiway (3D+): fatia navegável — seletores escolhem o índice das vias iniciais e a tabela mostra as duas últimas |
| Workflow | diagrama somente leitura (nós e conexões), sem abrir o editor |
| Anexos e respostas de quiz | mesmos modais de pré-visualização |

### 4. Quizzes

Perguntas (`quiz_questions.kind`): **`tf`** (V/F), **`choice`** (múltipla escolha; uma ou várias corretas), **`text`**
(descritiva), **`dataset`** (aluno entrega uma variável do Workspace) e **`workflow`** (aluno entrega um workflow).
Qualquer pergunta pode ter **anexos** (`quiz_attachments`): dados (ex.: o multiway X da turma) e/ou um workflow-modelo.

Ciclo: `draft` → `open` (publicado) → `closed`. Opções: prazo (`due_at`; depois dele não recebe respostas) e
`show_results` (`after_submit` | `after_close` | `never`) que controla quando o aluno vê o gabarito.

| Rota (`/communities/:id/quizzes…`) | Quem |
|---|---|
| `GET /`, `GET /:qid` | membros (rascunho só para moderator+) |
| `POST /`, `PUT /:qid`, `DELETE /:qid`, `PUT /:qid/questions` | moderator+ |
| `POST /:qid/start`, `PUT /:qid/answers/:question`, `POST /:qid/submit` | membros |
| `GET /:qid/submissions`, `GET /:qid/submissions/:sid`, `PUT …/:sid/grade`, `POST …/:sid/reopen` | moderator+ |

Regras:
- Publicar exige ao menos uma pergunta.
- **Editar perguntas com entregas é permitido**, mas exige confirmação: sem `confirm: true` o `PUT /:qid/questions` responde `409 HAS_SUBMISSIONS` (com o nº de entregas). Com a confirmação, `regradeQuiz` descarta respostas que não servem mais (alternativa removida, tipo diferente), recalcula as notas automáticas de todas as tentativas, mantém as notas manuais (limitadas ao novo máximo) e volta a entrega para `submitted` se surgir pergunta manual sem nota.
- O aluno **nunca recebe o gabarito** (V/F, alternativas corretas, resposta-modelo) antes da regra `show_results`.
- Correção: `tf`/`choice` automática (múltipla escolha com várias corretas é tudo-ou-nada); `text`/`dataset`/`workflow`
  manual (nota até o máximo da pergunta + comentário). A entrega vira `graded` quando todas as manuais têm nota; um quiz só
  com perguntas automáticas é corrigido no ato.
- `quiz_answers.value` guarda `{ "v": … }` (o driver devolve JSON já parseado; o envelope evita confundir texto puro com JSON).

#### Acesso a workflows e variáveis (`access.service.js → communityItemLevel`)
1. Material de aula visível → **leitura** (workflow `edit` → edição).
2. Anexo de pergunta de quiz **publicado** → **leitura** para membros (o aluno copia para trabalhar:
   `POST /datasets/:id/copy`, `POST /workflows/:id/fork`).
3. Resposta de aluno **entregue** (`submitted`/`graded`) → **leitura** do workflow/variável da resposta para o dono,
   administradores e moderadores da comunidade. Voltar a entrega ao aluno (`reopen`) revoga o acesso. O aluno só pode
   entregar recursos **dele**.

#### Exemplo: "faça um Tucker3 com o conjunto X"
O professor posta o multiway X, cria uma pergunta do tipo *workflow* com X (e, se quiser, um workflow-modelo) como anexos →
publica → o aluno copia X, monta/executa o workflow no editor e seleciona o resultado na pergunta → entrega → o professor
abre a entrega, pré-visualiza ou **abre o workflow do aluno (somente leitura)** e atribui a nota.

#### Tentativas configuráveis

Em *Configurações* o professor define, por quiz:
- **Tentativas por aluno** (`max_attempts`): `1` (padrão, uma só entrega), `2…50`, ou `0` = ilimitadas.
- **Nota que vale** (`grade_policy`): `highest` (maior nota, padrão), `latest` (última) ou `first` (primeira) — a "nota oficial" considera só tentativas já corrigidas.

Fluxo do aluno: `POST /:qid/start` devolve a tentativa atual (cria a #1 se não houver); depois de entregar, `POST /:qid/start { "new_attempt": true }` abre a próxima (em branco), desde que o quiz aceite respostas e ainda haja tentativas (senão `409 NO_ATTEMPTS_LEFT`). `GET /:qid` traz `attempts` (histórico), `attempts_used`, `attempts_left` (`null` = ilimitadas), `can_retry`, `official_score`/`official_attempt`. Reduzir o limite depois não apaga tentativas já feitas; só impede novas. Cada tentativa é uma linha em `quiz_submissions` (`attempt`, único por `quiz_id,user_id,attempt`); o professor vê todas, com o selo "vale" na oficial, e corrige cada uma separadamente. `submission_count` e "X de N alunos entregaram" contam **alunos**, não tentativas.

### 5. Próximos sub-apps
Novos módulos entram como nova entrada na aba Apps (card de criação + lista) e rotas `/communities/:id/<app>`; o controle de
papéis (`guard`) e o acesso derivado de submissões acima servem de modelo. Previsto: *estudo dirigido*, notas exportáveis (CSV),
recorrência de exercícios periódicos.

---

## B. Equipamentos — agendador da comunidade
App da comunidade (ao lado de Quiz e, em breve, Quadro) para listar equipamentos do laboratório, definir quando podem
ser reservados e deixar qualquer pessoa — com ou sem conta — marcar horário via link/QR Code.

### O que existe

- **Cadastro**: nome, descrição, local, especificações (chave/valor), imagem (upload ou Ctrl+V; JPEG/PNG/WebP até 5 MB).
- **Regras**: janelas semanais de uso por dia da semana e público (`members` ou `public`), fuso do equipamento,
  duração do slot, antecedência mínima/máxima, aprovação de externos (padrão: exige aprovação), prazo de cancelamento.
- **Bloqueios**: o administrador reserva períodos para uso próprio (únicos ou semanais até uma data); reservas em conflito
  são listadas e podem ser canceladas na mesma operação.
- **Agenda semanal**: membros veem quem usa o equipamento, inclusive externos (nome/instituição); e-mail, telefone e
  finalidade só aparecem para staff e para o próprio autor.
- **Reservas**: aprovar, rejeitar, cancelar, marcar falta; "Minhas reservas" por usuário.
- **Página pública `/e/:token`** (sem login): só mostra horários ocupados (sem dados de terceiros), formulário com
  consentimento e honeypot. O token pode ser rotacionado; ao desativar o acesso público o token é mantido para que o
  QR impresso volte a funcionar quando for reativado. Se o visitante estiver logado e for membro, a página reconhece
  e reserva como membro.
- **QR Code / etiqueta**: aba "Acesso público" gera QR (SVG/PNG) e uma etiqueta para impressão.
- **E-mail** (Resend): confirmação do e-mail do convidado (reserva fica em espera por 15 min), recebido, confirmado,
  rejeitado, cancelado e aviso à equipe, em pt/en/es.
- **Link de gerenciamento** `/e/:token/b/:manageToken`: o convidado confirma/cancela sem conta. O token só é guardado como
  hash; sem e-mail configurado ele é devolvido na resposta e a reserva já nasce `pending`/`confirmed`.

### Garantias

- Sem sobreposição: criação em transação com `SELECT … FOR UPDATE` na linha do equipamento (teste com 8 requisições
  simultâneas: 1 vence, 7 recebem 409).
- Disponibilidade = janelas − bloqueios − reservas ativas, calculada num único serviço (`equipmentSlots.service.js`).
  Banco em UTC; janelas interpretadas no fuso do equipamento (luxon).
- Limites: 2 reservas ativas por e-mail, 6 por IP, 12 criações/h por IP, rate limit nas rotas públicas.
- Imagem servida com `nosniff` e CSP sandbox; SVG não aceito.

### Configuração

| Variável | Descrição |
|----------|-----------|
| `RESEND_API_KEY` | chave da Resend (no `.env` da raiz, que é ignorado pelo git; nunca versionar) |
| `MAIL_FROM` | remetente; padrão `TcheLab <onboarding@resend.dev>` — o remetente de onboarding da Resend só envia para o e-mail dono da conta; em produção verificar um domínio |
| `MAIL_TRANSPORT` | `resend` (padrão se há chave), `file` (grava JSON em `storage/outbox`, usado nos testes) ou `none` |
| `PUBLIC_BASE_URL` | base dos links nos e-mails e no QR (ex.: `https://tchelab.exemplo.br`) |

> A chave fornecida durante o desenvolvimento ficou apenas no `.env` local. Recomenda-se **rotacioná-la** na Resend antes
> de produção, já que ela circulou em conversa.

### Como testar

Ver [testes_e2e.md](testes_e2e.md) (`equipment_e2e.mjs`). Validação visual em navegador cobriu: fluxo do professor (criar, regras,
bloqueio, QR, etiqueta), fluxo do convidado em celular (reserva → e-mail → confirmação → aprovação), visão do membro e
ausência de rolagem horizontal em telas estreitas.

### Próximos passos

O Quadro (parte C) já foi entregue; falta integrar reserva de equipamento ↔ tarefa.

---

## C. Quadro (CRM-Lab, estilo monday)
App da comunidade para organizar tarefas, tickets e projetos em quadros personalizáveis. Fica na aba **Apps** da comunidade, junto de Quiz e Equipamentos.

### 1. O que o usuário vê

- **Apps → Quadros**: lista de quadros da comunidade (arrastar para reordenar) e botão **Novo quadro** com modelos.
- **Modelos**: Em branco, Tarefas do laboratório, Tickets (com número `#seq`), Curso/Turma. Disponíveis em pt, en e es; cada um traz grupos, colunas e um item de exemplo.
- **Visão Tabela**: grupos coloridos e recolhíveis; cabeçalho e 1ª coluna fixos; linhas, colunas e grupos podem ser arrastados; largura de coluna ajustável; seleção em lote (mover, duplicar, excluir); barra de resumo por coluna de status.
- **Visão Kanban**: uma raia por rótulo da coluna de status escolhida; arrastar o cartão muda o status; criação rápida em cada raia.
- **Minhas tarefas**: tudo que está atribuído ao usuário em todos os quadros da comunidade.
- **Painel do item** (gaveta): todos os campos, **Atualizações** (comentários) e **Atividade** (histórico). Link direto: `?item=<uuid>`.
- **Filtros / ordenação / busca / colunas ocultas** por quadro; preferências (visão, grupos recolhidos, larguras) ficam no navegador do usuário.
- Atualização quase em tempo real: consulta a cada 10 s com `?rev=N`; se nada mudou, a resposta é `{unchanged:true}`.

### 2. Tipos de coluna

| Tipo | Valor | Configuração |
|---|---|---|
| `text` | texto | – |
| `status` | id do rótulo | `labels:[{id,label,color,done}]` |
| `dropdown` | id da opção | `options` |
| `people` | lista de uuids de membros | `{multiple}` |
| `date` | `YYYY-MM-DD` | – |
| `timeline` | `{start,end}` | – |
| `number` | número | `{unit,decimals}` |
| `checkbox` | booleano | – |
| `link` | `{url,text}` | – |

Atribuições (`people`) são normalizadas em `board_item_people` e filtradas na leitura: quem saiu da comunidade deixa de aparecer.

### 3. Permissões

- **Estrutura** (grupos, colunas, configurações, excluir quadro): moderador ou superior.
- **Conteúdo**, conforme a política do quadro (`edit_policy`):
  - `members`: qualquer membro cria e edita tudo.
  - `own` (padrão dos modelos de tickets): membro cria e edita apenas o que criou ou o que foi atribuído a ele.
  - `staff`: só a equipe edita; quem é responsável por um item ainda altera as colunas de **status** e **checkbox** dele.
- Cada item sai da API com `access` = `all` | `status` | `none`, e a interface desabilita o que não pode ser editado.
- Excluir item: equipe, ou o criador quando a política não é `staff`. Comentar: qualquer membro.
- Conflitos pedem confirmação (HTTP 409): `HAS_ITEMS` (excluir grupo), `HAS_VALUES` (excluir/mudar tipo de coluna com dados), `LABEL_IN_USE` (remover rótulo de status em uso; aceita `remap`).

### 4. API (`/api/v1/communities/:cid/…`)

| Método e rota | Função |
|---|---|
| `GET boards`, `POST boards`, `PUT boards/reorder` | listar, criar (com `template`), reordenar |
| `GET boards/my-items` | minhas tarefas |
| `GET/PUT/DELETE boards/:bid` | quadro completo (aceita `?rev=`), configurações, exclusão |
| `POST boards/:bid/groups`, `PUT groups/reorder`, `PUT/DELETE groups/:gid` | grupos |
| `POST boards/:bid/columns`, `PUT columns/reorder`, `PUT/DELETE columns/:colid` | colunas |
| `POST boards/:bid/items`, `POST items/bulk`, `GET/PUT/DELETE items/:iid` | itens |
| `POST items/:iid/move`, `POST items/:iid/duplicate` | mover / duplicar |
| `PUT items/:iid/cells/:colid` | grava **uma** célula, de forma atômica |
| `POST items/:iid/comments`, `DELETE comments/:cmid` | atualizações |

### 5. Detalhes técnicos

- Tabelas: `boards` (com `next_seq` e `rev`), `board_groups`, `board_columns`, `board_items` (células em JSON por uuid da coluna, `position` decimal), `board_item_people`, `board_comments`, `board_activity`.
- Célula gravada com `JSON_SET`/`JSON_REMOVE`: duas pessoas editando colunas diferentes do mesmo item não se sobrescrevem.
- **Concorrência**: toda escrita de um quadro roda em `txBoard`, cuja primeira instrução é `UPDATE boards SET rev = rev + 1`. Isso trava o quadro primeiro e mantém a ordem de travas (quadro → item → filhos), eliminando deadlocks por chave estrangeira que apareciam com gravações paralelas (500 intermitente). `rev` sobe em toda mudança, e é isso que o polling compara.
- **Fuso do banco**: cada conexão do pool executa `SET time_zone = '+00:00'` (`db.config.js`). Sem isso, um servidor MariaDB em fuso diferente do driver deslocava `NOW()` e os horários apareciam como "há 3 h".
- Número do ticket (`seq`) alocado atomicamente com `LAST_INSERT_ID` em `next_seq`.

### 6. Navegação unificada dos apps

`components/apps/AppsNav.jsx` define o registro `APPS` e o componente `AppCrumbs` (migalhas + seletor de app), usado nas páginas de Quadro, Equipamentos e Quiz. A aba Apps da comunidade sincroniza com a URL (`?tab=apps&app=boards|tasks|equipment|quizzes`), então voltar/compartilhar link leva ao mesmo lugar.

### 7. Testes

`backend_api/tests/board_e2e.mjs` (148 checagens; ver `testes_e2e.md`). Frontend: `npm run i18n:check` (paridade pt/en/es) e `npm run build`.

### 8. Próximos passos possíveis

Visão calendário/linha do tempo, subitens, itens recorrentes, modelos salvos pelo usuário, vínculos com reservas de equipamento/quiz/workflow e notificações de atribuição e prazo.
