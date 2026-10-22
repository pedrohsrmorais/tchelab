# Comunidade: aba Apps, subtópicos e quizzes

> Implementado. Testes: `backend_api/tests/community_quiz_e2e.mjs` (92 checagens). Complementa `comunidades_perfil_i18n.md` §7.

## 1. Subtópicos (estilo Moodle)

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

## 2. Aba "Apps"

Visível a todos os membros. Para professores (moderator+) mostra os atalhos de criação — **Quiz, PDF/slides/arquivos,
workflow, variável (dataset), projeto, link, texto, tópico** (cada atalho abre o modal já no tipo certo) — e um espaço
"Estudo dirigido — em breve". Abaixo, a lista de quizzes (professor: status e nº de entregas; aluno: situação e nota).

## 3. Pré-visualização sem baixar

| Material | Pré-visualização |
|---|---|
| PDF, imagem | inline no modal (botão "Abrir em nova aba") |
| PPT/PPTX/DOC/XLS… | PDF convertido pelo LibreOffice, inline; original disponível para baixar |
| Variável (dataset) | tabela com as primeiras linhas/colunas e dimensões (multiway: dimensões + aviso) |
| Workflow | diagrama somente leitura (nós e conexões), sem abrir o editor |
| Anexos e respostas de quiz | mesmos modais de pré-visualização |

## 4. Quizzes

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
- Publicar exige ao menos uma pergunta. Com entregas feitas, as perguntas ficam bloqueadas (409): devolva as entregas ou crie outro quiz.
- O aluno **nunca recebe o gabarito** (V/F, alternativas corretas, resposta-modelo) antes da regra `show_results`.
- Correção: `tf`/`choice` automática (múltipla escolha com várias corretas é tudo-ou-nada); `text`/`dataset`/`workflow`
  manual (nota até o máximo da pergunta + comentário). A entrega vira `graded` quando todas as manuais têm nota; um quiz só
  com perguntas automáticas é corrigido no ato.
- `quiz_answers.value` guarda `{ "v": … }` (o driver devolve JSON já parseado; o envelope evita confundir texto puro com JSON).

### Acesso a workflows e variáveis (`access.service.js → communityItemLevel`)
1. Material de aula visível → **leitura** (workflow `edit` → edição).
2. Anexo de pergunta de quiz **publicado** → **leitura** para membros (o aluno copia para trabalhar:
   `POST /datasets/:id/copy`, `POST /workflows/:id/fork`).
3. Resposta de aluno **entregue** (`submitted`/`graded`) → **leitura** do workflow/variável da resposta para o dono,
   administradores e moderadores da comunidade. Voltar a entrega ao aluno (`reopen`) revoga o acesso. O aluno só pode
   entregar recursos **dele**.

### Exemplo: "faça um Tucker3 com o conjunto X"
O professor posta o multiway X, cria uma pergunta do tipo *workflow* com X (e, se quiser, um workflow-modelo) como anexos →
publica → o aluno copia X, monta/executa o workflow no editor e seleciona o resultado na pergunta → entrega → o professor
abre a entrega, pré-visualiza ou **abre o workflow do aluno (somente leitura)** e atribui a nota.

## 5. Próximos sub-apps
Novos módulos entram como nova entrada na aba Apps (card de criação + lista) e rotas `/communities/:id/<app>`; o controle de
papéis (`guard`) e o acesso derivado de submissões acima servem de modelo. Previsto: *estudo dirigido*, notas exportáveis (CSV),
recorrência de exercícios periódicos.
