# Comunidade institucional: sub-apps e quizzes (proposta de arquitetura)

> Status: **proposta** — a base de "aula completa" (tópicos, arquivos/PPT, workflows, variáveis, projetos) já está
> implementada (`comunidades_perfil_i18n.md` §7). Este documento define como encaixar quizzes e outros sub-apps sem
> reescrever a comunidade.

## 1. Objetivo

Uma comunidade deve aceitar vários **sub-apps** (módulos) que o professor liga/desliga. O primeiro são os **exercícios/quizzes**:

- perguntas de **múltipla escolha**, **descritivas** e **resposta por workflow/Workspace**;
- exercícios **periódicos** com **dados da comunidade** (ex.: um multiway X) — "faça um Tucker3 com o conjunto X";
- o professor abre a resposta e vê **o workflow/variável do aluno**.

## 2. Modelo de sub-apps

Registro de módulos por comunidade, em vez de colunas soltas:

```
community_apps(id, community_id, app_key, title, is_enabled, position, config JSON, created_at)
```

- `app_key` ∈ `content` (já existe, sempre ativo), `quizzes`, e futuros (`assignments`, `grades`, `calendar`, `forum`).
- Frontend: um **registry** `communityApps = { quizzes: { icon, tab, component, i18n } }`; a página lê
  `GET /communities/:id/apps` e renderiza uma aba por app habilitado. Novo sub-app = nova entrada no registry +
  rotas `/communities/:id/<app_key>/…` + migração própria. O papel (`guard('moderator')` etc.) é reaproveitado.
- Itens de conteúdo podem **apontar para um sub-app** (`community_items.type = 'quiz'`, `ref_id`), de modo que um quiz
  apareça dentro de um tópico da aula, ao lado do PPT.

## 3. Quizzes — esquema de dados

```
quizzes(id, uuid, community_id, section_id NULL, title, description, status ENUM('draft','open','closed'),
        opens_at, due_at, attempts_allowed, shuffle, show_feedback ENUM('never','after_submit','after_due'),
        created_by, created_at)
quiz_questions(id, uuid, quiz_id, position, kind ENUM('single','multiple','text','workflow','dataset'),
               prompt, points, config JSON)
   -- single/multiple: config={options:[{id,text,correct}]}
   -- text:           config={rubric?}
   -- workflow:       config={required_technique?:'tucker3', input_dataset_uuid?, template_workflow_uuid?, hint}
   -- dataset:        config={expected_dims?}   (aluno entrega uma variável do Workspace)
quiz_attachments(question_id, kind ENUM('dataset','file','workflow'), ref_id)   -- dados X fornecidos ao aluno
quiz_submissions(id, uuid, quiz_id, user_id, attempt, status ENUM('in_progress','submitted','graded'),
                 submitted_at, score, graded_by, feedback)
quiz_answers(id, submission_id, question_id, value JSON, ref_type ENUM('workflow','dataset') NULL, ref_id NULL,
             points, feedback)
```

## 4. Exercício com dados da comunidade (Tucker3)

1. O professor cria a questão `workflow`, anexa o multiway X (variável do Workspace dele, 3 vias) e, opcionalmente,
   um workflow-modelo e a técnica exigida (`tucker3`).
2. Ao abrir a questão, o aluno vê o enunciado e o botão **"Começar com os dados da turma"**: o sistema **copia X** para
   o Workspace dele (`POST /datasets/:id/copy`, já existe) e **copia o workflow-modelo** (`POST /workflows/:id/fork`, já
   existe) apontando para a cópia.
3. O aluno executa no editor normal. Para responder, escolhe o **workflow (ou variável) resultante** na questão.
4. A resposta grava `ref_type/ref_id`. Isso concede ao professor (e moderadores) **leitura** do workflow/variável do
   aluno **enquanto a submissão existir** — mesma ideia do `communityItemLevel` de hoje:
   `quiz_answers` → nível READ para `quizzes.created_by` e papéis moderator+ da comunidade.
5. Na correção, o professor clica na resposta e abre o workflow do aluno em somente-leitura (resultados, parâmetros,
   gráficos). Validações automáticas opcionais: o workflow contém a técnica exigida; a execução terminou com sucesso.

## 5. Correção e periodicidade

- Múltipla escolha: nota automática. Descritiva/workflow: nota manual (`points` + `feedback` por resposta).
- Exercícios periódicos: `opens_at`/`due_at` + `status` mudando por tarefa agendada (job existente do worker/cron);
  recorrência opcional `config.recurrence = {every:'week', count:N}` gera rascunhos clonados do modelo.
- Visão do professor: matriz alunos × questões com status (pendente/entregue/corrigido) e link direto para a resposta.

## 6. API prevista

```
GET/PUT   /communities/:id/apps                        # liga/desliga sub-apps
GET/POST  /communities/:id/quizzes                     # moderator+ cria; membros veem open/closed
GET/PUT/DELETE /communities/:id/quizzes/:qid
PUT       /communities/:id/quizzes/:qid/questions-order
POST      /communities/:id/quizzes/:qid/start          # cria/continua a submissão do aluno
PUT       /communities/:id/quizzes/:qid/answers/:qn    # grava resposta (valor ou ref de workflow/variável)
POST      /communities/:id/quizzes/:qid/submit
GET       /communities/:id/quizzes/:qid/submissions    # moderator+: lista; aluno: só a própria
PUT       /communities/:id/quizzes/:qid/submissions/:sid/grade
```

## 7. Regras de acesso e segurança

- Aluno nunca recebe `correct` das opções antes da regra `show_feedback`.
- Referência a workflow/variável na resposta só é aceita se pertencer ao próprio aluno (`level >= READ` e `owner`).
- A leitura concedida ao professor é derivada da submissão (sem copiar dados) e some se a submissão for apagada.
- Todos os endpoints reutilizam `guard()` da comunidade (404 para privada/não-membro, 403 papel insuficiente).

## 8. Plano de entrega

1. `community_apps` + registry de abas (sem mudar o comportamento atual).
2. Quizzes só com múltipla escolha/descritiva + correção.
3. Questão `workflow`/`dataset` com cópia de X e leitura do trabalho do aluno.
4. Periodicidade, matriz de correção, notas exportáveis (CSV).
