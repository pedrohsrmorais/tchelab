# Quadro (CRM‑Lab, estilo monday)

App da comunidade para organizar tarefas, tickets e projetos em quadros personalizáveis. Fica na aba **Apps** da comunidade, junto de Quiz e Equipamentos.

## 1. O que o usuário vê

- **Apps → Quadros**: lista de quadros da comunidade (arrastar para reordenar) e botão **Novo quadro** com modelos.
- **Modelos**: Em branco, Tarefas do laboratório, Tickets (com número `#seq`), Curso/Turma. Disponíveis em pt, en e es; cada um traz grupos, colunas e um item de exemplo.
- **Visão Tabela**: grupos coloridos e recolhíveis; cabeçalho e 1ª coluna fixos; linhas, colunas e grupos podem ser arrastados; largura de coluna ajustável; seleção em lote (mover, duplicar, excluir); barra de resumo por coluna de status.
- **Visão Kanban**: uma raia por rótulo da coluna de status escolhida; arrastar o cartão muda o status; criação rápida em cada raia.
- **Minhas tarefas**: tudo que está atribuído ao usuário em todos os quadros da comunidade.
- **Painel do item** (gaveta): todos os campos, **Atualizações** (comentários) e **Atividade** (histórico). Link direto: `?item=<uuid>`.
- **Filtros / ordenação / busca / colunas ocultas** por quadro; preferências (visão, grupos recolhidos, larguras) ficam no navegador do usuário.
- Atualização quase em tempo real: consulta a cada 10 s com `?rev=N`; se nada mudou, a resposta é `{unchanged:true}`.

## 2. Tipos de coluna

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

## 3. Permissões

- **Estrutura** (grupos, colunas, configurações, excluir quadro): moderador ou superior.
- **Conteúdo**, conforme a política do quadro (`edit_policy`):
  - `members`: qualquer membro cria e edita tudo.
  - `own` (padrão dos modelos de tickets): membro cria e edita apenas o que criou ou o que foi atribuído a ele.
  - `staff`: só a equipe edita; quem é responsável por um item ainda altera as colunas de **status** e **checkbox** dele.
- Cada item sai da API com `access` = `all` | `status` | `none`, e a interface desabilita o que não pode ser editado.
- Excluir item: equipe, ou o criador quando a política não é `staff`. Comentar: qualquer membro.
- Conflitos pedem confirmação (HTTP 409): `HAS_ITEMS` (excluir grupo), `HAS_VALUES` (excluir/mudar tipo de coluna com dados), `LABEL_IN_USE` (remover rótulo de status em uso; aceita `remap`).

## 4. API (`/api/v1/communities/:cid/…`)

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

## 5. Detalhes técnicos

- Tabelas: `boards` (com `next_seq` e `rev`), `board_groups`, `board_columns`, `board_items` (células em JSON por uuid da coluna, `position` decimal), `board_item_people`, `board_comments`, `board_activity`.
- Célula gravada com `JSON_SET`/`JSON_REMOVE`: duas pessoas editando colunas diferentes do mesmo item não se sobrescrevem.
- **Concorrência**: toda escrita de um quadro roda em `txBoard`, cuja primeira instrução é `UPDATE boards SET rev = rev + 1`. Isso trava o quadro primeiro e mantém a ordem de travas (quadro → item → filhos), eliminando deadlocks por chave estrangeira que apareciam com gravações paralelas (500 intermitente). `rev` sobe em toda mudança, e é isso que o polling compara.
- **Fuso do banco**: cada conexão do pool executa `SET time_zone = '+00:00'` (`db.config.js`). Sem isso, um servidor MariaDB em fuso diferente do driver deslocava `NOW()` e os horários apareciam como "há 3 h".
- Número do ticket (`seq`) alocado atomicamente com `LAST_INSERT_ID` em `next_seq`.

## 6. Navegação unificada dos apps

`components/apps/AppsNav.jsx` define o registro `APPS` e o componente `AppCrumbs` (migalhas + seletor de app), usado nas páginas de Quadro, Equipamentos e Quiz. A aba Apps da comunidade sincroniza com a URL (`?tab=apps&app=boards|tasks|equipment|quizzes`), então voltar/compartilhar link leva ao mesmo lugar.

## 7. Testes

`backend_api/tests/board_e2e.mjs` (148 checagens; ver `testes_e2e.md`). Frontend: `npm run i18n:check` (paridade pt/en/es) e `npm run build`.

## 8. Próximos passos possíveis

Visão calendário/linha do tempo, subitens, itens recorrentes, modelos salvos pelo usuário, vínculos com reservas de equipamento/quiz/workflow e notificações de atribuição e prazo.
