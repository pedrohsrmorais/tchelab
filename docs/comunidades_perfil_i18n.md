# Idiomas (pt/en/es), perfil, comunidades e projetos compartilhados

> Complementa `diagnostico_idioma_usuario_comunidades.md` (o diagnóstico/proposta) com o que foi **implementado**.
> Testes: `backend_api/tests/access_e2e.mjs` (132 checagens de acesso), `backend_api/tests/catalog_i18n_check.mjs`
> (cobertura da tradução do catálogo), `frontend`: `npm run i18n:check` (paridade de chaves e `{{placeholders}}`).

## 1. Idioma e tema por usuário

- Idiomas: **pt** (padrão), **en**, **es**. Fallback de texto: `es → en → pt`, `en → pt`.
- Preferências ficam na coluna JSON `users.preferences` (`{ language, theme, … }`), editável em *Perfil → Preferências*.
  O servidor vence o `localStorage`: ao entrar em outro dispositivo valem as preferências salvas na conta.
- Temas: `dark`, `light`, `classic` (MATLAB). `PreferencesSync` aplica idioma/tema ao logar e ao salvar.
- Textos novos entram em `frontend/src/i18n/locales/extra.js` como tuplas `[pt, en, es]` (fonte única, mesclada em
  `i18n/index.js`). `npm run i18n:check` falha se faltar uma chave em algum idioma ou se os `{{placeholders}}` divergirem.
- Datas/números usam `currentLocale()` (Intl) — nunca o código de idioma cru.
- O axios envia `Accept-Language` em toda requisição (ver §6).

## 2. Perfil

`GET/PUT /users/:id`, `POST/DELETE /users/:id/avatar`. Campos: foto, nome, iniciais, instituição, área de pesquisa,
bio, links (Lattes, LinkedIn, GitHub/GitLab), cor da capa. `birth_date` é guardada, mas só aparece no perfil público se o
usuário ativar a opção. Perfil público: `/users/:id` (frontend) — mostra os **projetos públicos** do usuário (somente
leitura) e as comunidades públicas.

## 3. Comunidades

Papéis: **owner > admin > moderator > member**.

| Ação | Quem pode |
|---|---|
| Excluir comunidade, transferir posse, promover/rebaixar admin | só **owner** |
| Editar comunidade, mudar papéis, ver/remover banimentos | admin (e owner) |
| Remover membro | moderator+, mas **admin não remove nem rebaixa outro admin** (só o owner) |
| Criar/revogar convites (limite de usos e validade) | admin e moderator |
| Criar/editar tópicos e itens (PDF, imagem, lista de links) | admin e moderator |
| Vincular projeto | admin, moderator, ou membro com `can_link` (concedido pelo admin) |
| Chat, ver conteúdo e projetos vinculados | todos os membros |

- Visibilidade: pública (qualquer um vê e entra) ou privada (**404** para não-membros; **403** para papel insuficiente).
- Convites: código `XXXX-XXXX-XXXX` ou link `/join/:code`; `max_uses` e `expires_at` definidos por admin/moderator.
  `GET /communities/invite/:code` mostra uma prévia; `POST /communities/join` entra com o código.
- Tela estilo Moodle: **tópicos** (`community_sections`) com **itens** (`community_items`): PDF/arquivo (multer, baixado
  por rota autenticada e exibido inline), imagem ou lista de links. Reordenação via `PUT /sections-order`.
- Tabelas novas (criadas por `config/migrate.js`, idempotente, executada na inicialização do servidor — instalações
  novas e antigas passam pelo mesmo caminho): `community_invites`, `community_bans`, `community_sections`,
  `community_items`, `project_techniques`; colunas `users.preferences`, `communities.cover_color`,
  `community_members.can_link`, `community_projects.access|section_id|position`.

## 4. Projetos e níveis de acesso

Nível efetivo no projeto (`services/access.service.js`): `NONE 0 < READ 1 < EDIT 2 < ADMIN 3 < OWNER 4`, vindo de
dono/admin da plataforma, `project_members`, **vínculo com comunidade** (`access = read` → leitura, `edit` → edição) ou
projeto público (leitura). Workflows e datasets herdam o nível dos projetos a que pertencem.

- O professor vincula um projeto a uma comunidade escolhendo **leitura** (só vê o workflow; o editor abre somente-leitura)
  ou **edição** (o aluno pode modificar). Pode trocar depois (`PUT /communities/:id/projects/:pid`).
- Membros só enxergam, na comunidade, os projetos **vinculados àquela comunidade**.
- Projetos agrupam workflows, datasets, artigos, **técnicas favoritas** (`/projects/:id/techniques`) e, no futuro,
  técnicas próprias. `GET /projects` devolve `my_access` real; `GET /workflows/:id` devolve `my_access` e `can_edit`.

## 5. Workspace × projetos

O Workspace tem um **seletor de projeto**: "todas as variáveis" (visão pessoal) ou as variáveis de um projeto
(`/projects/:id/datasets`). No modo projeto: importar já vincula a variável ao projeto, "remover" = desvincular,
"adicionar existente" vincula uma variável sua, e as saídas de operações herdam o projeto. Projeto somente-leitura
desabilita importar/alterar. As listagens aceitam `?with_metadata=1` para trazer os dados (preview/editor de variável).

## 6. Tradução do catálogo de técnicas

O banco guarda o texto em **pt** (idioma-fonte). A tradução fica em arquivos laterais
`backend_api/src/catalog_i18n/{en,es}.json`, indexados por `slug`:

```json
{ "pca": { "name": "…", "description": "…", "how_it_works": "…", "usage_tips": "…", "historical_note": "…",
           "input": {"X": "…"}, "output": {"scores": "…"}, "params": {"n_components": "…"} } }
```

- `utils/catalogI18n.js` aplica a tradução na resposta de `GET /techniques` e `GET /techniques/:id`. O idioma vem de
  `?lang=` (prioridade) ou `Accept-Language`; qualquer outro valor devolve pt. **Fallback por campo**: o que não tiver
  tradução continua em pt — nada quebra.
- Cobertura atual: **217 técnicas nativas (94 ativas + 123 em desenvolvimento) × (en, es)** — nome, descrição, "como funciona", dicas, nota histórica e a
  descrição de cada porta de entrada/saída e parâmetro. Nomes técnicos (siglas, `PLS`, `SNV`…) não são traduzidos.
- Famílias: rótulos em `frontend/src/config/techniqueRegistry.js` (`FAMILIES[...].label.{pt,en,es}`).
- Ao incluir/alterar uma técnica no banco, atualize os dois JSON e rode `node tests/catalog_i18n_check.mjs`
  (falha se faltar tradução, sobrar chave órfã ou o código entre crases divergir).

## 7. A aula completa na comunidade (professor)

Dentro de **Conteúdo**, o professor monta a aula em tópicos. *Adicionar material* abre um único modal com seis tipos:

| Tipo | O que é | Como o aluno usa |
|---|---|---|
| Arquivo / PDF | PDF, **PPT/PPTX/ODP**, DOC/DOCX, XLS/XLSX, imagem, ZIP (até 100 MB; vários de uma vez, arrastando) | Pré-visualiza no navegador e baixa o original |
| Workflow | workflow do professor, com acesso **leitura** ou **edição** | Abre (somente-leitura ou editável) e pode **copiar para os próprios workflows** |
| Variável do Workspace | dataset do professor (somente leitura) | Visualiza e **copia para o próprio Workspace** |
| Projeto | projeto que o professor administra (leitura/edição) | Como na seção 4 |
| Link | URL externa | Abre em nova aba |
| Texto | instruções/anotações | Leitura no modal |

- Itens e tópicos podem ser **editados, movidos (sobe/desce), ocultados e excluídos**. Tópico oculto esconde os itens e
  bloqueia o download direto do arquivo para os alunos.
- Um item workflow/variável concede ao membro acesso **apenas de leitura** (workflow com `access = edit` concede edição)
  enquanto o item estiver visível; ao removê-lo o acesso some. Referência apagada aparece como "indisponível".
- **PPT/DOC/XLS → PDF**: conversão em segundo plano com o LibreOffice (`soffice --headless`, fila serial). Variável
  opcional `SOFFICE_BIN` aponta para o executável. Se o `soffice` não existir ou a conversão falhar, o item fica com
  `preview_status = failed` e a tela oferece apenas o download — nada quebra. A lista recarrega sozinha enquanto houver
  conversão pendente (`preview_status = pending`).
- Tópicos aceitam `parent` (até 3 níveis) e `GET …/content` traz também `quizzes` por tópico.
- API nova: `PUT /communities/:id/items-order`, `GET …/items/:iid/file?preview=1`, `POST /datasets/:id/copy`;
  `POST /communities/:id/items` aceita `type = workflow|dataset` com `ref` (uuid) e `access`.
- Tabela `community_items`: colunas `ref_id`, `access`, `preview_path`, `preview_status`.

Subtópicos, aba **Apps**, pré-visualização e **quizzes**: `docs/comunidade_subapps_quizzes.md`.
