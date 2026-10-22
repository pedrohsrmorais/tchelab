# Novos apps da comunidade: Quadro (gestão do lab) e Equipamentos (agendador)

> **Status: planejamento (nada implementado).** Depois deste plano, a comunidade passa a ter 3 apps na aba **Apps**:
> **Quiz** (pronto), **Quadro** (o "CRM-Lab", estilo monday) e **Equipamentos** (agendador com página pública por QR Code).
> Qualquer comunidade pode usar os três: um quiz para o pessoal do lab, tarefas para uma turma, e assim por diante.

## 0. Decisões de nome e escopo

| Tema | Decisão proposta | Por quê |
|---|---|---|
| Nome do CRM | **Quadro** (`board`; en: *Board*; es: *Tablero*) | "CRM" sugere clientes/vendas. "Quadro" é neutro e combina com o formato monday. Fácil de trocar: o nome fica só nas chaves de i18n. |
| Nome do agendador | **Equipamentos** (`equipment`; en: *Equipment*; es: *Equipos*) | Diz o que é. "Agenda de Equipamentos" fica como subtítulo. |
| Onde vivem | **Dentro da comunidade** (tudo com `community_id`) | Decisão sua. Ver risco em §6. |
| Primeiro a construir | **Equipamentos**, depois **Quadro** | Equipamentos tem escopo mais fechado e é o que mais diferencia o produto. O Quadro é maior em interface. Dá para inverter sem custo. |
| Fora do escopo agora | ERP de laboratório, estoque de reagentes, financeiro, cobrança de uso | Evita virar um sistema gigante antes de validar a demanda. |

---

## 1. App "Equipamentos" (agendador)

### 1.1 Requisitos

**Cadastro (professor/admin da comunidade; moderador+ pode gerenciar)**
- E1. Criar equipamento: nome, descrição, local, responsável (membro da comunidade), status (ativo / em manutenção / arquivado).
- E2. **Especificações** como lista editável chave/valor (ex.: "Faixa espectral: 900–1700 nm"), mais links/manual opcionais.
- E3. **Imagem**: colar da área de transferência (Ctrl+V), arrastar ou escolher arquivo. Validar tipo (JPEG/PNG/WebP), limite de tamanho e gerar miniatura.
- E4. Equipamento em manutenção ou arquivado não aceita reservas, mas o histórico fica.

**Regras de horário (o admin decide o que pode ser marcado)**
- E5. **Janelas abertas para reserva**, por dia da semana (ex.: seg–sex 08:00–18:00), cada uma com **quem pode usar**: só membros, ou membros + público externo.
- E6. **Bloqueios** de período (uso próprio, manutenção, feriado): data/hora início e fim, motivo, e se o motivo aparece ou não para os outros. Podem se repetir (toda terça 14–17).
- E7. Parâmetros por equipamento: duração do slot (ex.: 30 min), duração mínima e máxima por reserva, antecedência máxima (ex.: 30 dias), antecedência mínima (ex.: 2 h), fuso horário (padrão `America/Sao_Paulo`).
- E8. O que está livre = janelas abertas − bloqueios − reservas já confirmadas. Nunca pode existir sobreposição.

**Reservas**
- E9. Membro reserva pelo **modal dentro da comunidade** (escolhe dia e horário, informa finalidade, projeto/amostra opcional).
- E10. Estados: `pendente` → `confirmada` | `recusada`; `cancelada`; `concluída`; `não compareceu`. Aprovação é configurável: automática ou manual, **separada para membros e externos** (padrão: membros automática, externos manual).
- E11. Fila de aprovação para o admin (aprovar/recusar com mensagem).
- E12. Quem reservou pode cancelar até um prazo configurável. O admin pode cancelar qualquer reserva, com motivo.
- E13. Calendário semanal por equipamento (grade de horários), lista "Minhas reservas" e selo "**em uso agora**" com o nome de quem está usando.
- E14. Membros veem quem está usando e quando. Para **externos** mostram nome + instituição; **e-mail e telefone só o admin vê**.

**Página pública (sem login) e QR Code**
- E15. Cada equipamento tem um **modo de acesso**: `só comunidade` (só quem está logado e é membro, pelo modal interno) ou `público` (qualquer pessoa com o link/QR, sem login). O professor liga e desliga quando quiser.
- E16. Link público com **token aleatório e longo**, ex.: `/e/<token>`. O admin pode **girar o token** (invalida QR antigo) ou desligar a página.
- E17. A página pública mostra foto, nome, especificações e as **janelas que o admin liberou para público**. Horários ocupados aparecem só como "ocupado" (sem dados de ninguém).
- E18. Formulário do convidado: nome, e-mail, instituição, telefone (opcional), finalidade, aceite dos termos (LGPD). Resultado: reserva `pendente` ou `confirmada`, conforme a regra do equipamento.
- E19. Convidado recebe **link de cancelamento** (tela de confirmação e e-mail, quando houver e-mail configurado).
- E20. **O mesmo modal serve aos dois casos**: dentro da comunidade (autenticado, já preenchido com o usuário) e na página pública. Se um membro logado abrir o link público, a reserva é vinculada à conta dele.
- E21. **QR Code**: gerar e baixar (SVG/PNG) e **imprimir etiqueta** (A4/A6 com nome, foto, QR e link curto) direto do detalhe do equipamento.
- E22. A página pública funciona bem no celular (a pessoa chega, aponta a câmera, marca).

**Proteção da página pública**
- E23. Limite de requisições por IP e por e-mail; campo "armadilha" (honeypot); máximo de reservas ativas por e-mail (ex.: 2) e por IP; reserva de externo só dentro das janelas públicas, respeitando duração máxima e antecedência.
- E24. Confirmação de e-mail antes de segurar o horário (opcional, ligada se houver SMTP). Sem SMTP, a reserva externa fica `pendente` para o admin aprovar. Possibilidade de ligar CAPTCHA (Turnstile/hCaptcha) por configuração.
- E25. Nenhum dado pessoal de terceiros na resposta pública; auditoria de quem aprovou/cancelou.

**Depois (v2)**
- E26. **Ficha de uso** imprimível: operador, amostra, projeto, método, observações, horário real. Preenchida a partir da reserva.
- E27. Histórico de uso e manutenção; exportação ICS (agenda no celular); notificações dentro do app; habilitação (só quem foi treinado pode reservar).
- E28. Vincular reserva a uma tarefa do Quadro e a um dataset/workflow do Workspace.

### 1.2 Modelo de dados (migrações idempotentes em `migrate.js`)

| Tabela | Campos principais |
|---|---|
| `equipment` | `uuid`, `community_id`, `name`, `description`, `location`, `responsible_user_id`, `specs` (JSON lista chave/valor), `image_path`, `status`, `timezone`, `slot_minutes`, `min_minutes`, `max_minutes`, `min_notice_minutes`, `max_advance_days`, `cancel_until_minutes`, `member_approval` (auto/manual), `guest_approval` (auto/manual), `access` (community/public), `public_token` (único, nulo se desligado), `created_by` |
| `equipment_windows` | `equipment_id`, `weekday` 0–6, `start_time`, `end_time`, `audience` (members/public) |
| `equipment_blocks` | `equipment_id`, `start_at`, `end_at`, `reason`, `show_reason`, `repeat_rule` (JSON: semanal até data, opcional), `created_by` |
| `equipment_bookings` | `uuid`, `equipment_id`, `start_at`, `end_at` (UTC), `status`, `user_id` (nulo se convidado), `guest_name`, `guest_email`, `guest_phone`, `guest_institution`, `purpose`, `project_note`, `source` (member/public), `cancel_token_hash`, `decided_by`, `decided_at`, `decision_note`, `created_at` |

Notas:
- Datas em **UTC**; as janelas semanais ficam no **fuso do equipamento**. Cálculo de horários livres feito no backend (uma função só, usada por modal interno, página pública e validação da reserva).
- **Sem sobreposição**: a criação roda em transação com `SELECT … FOR UPDATE` na linha do equipamento, confere conflito com reservas `pendente|confirmada` e bloqueios, e só então insere. Teste de concorrência: N requisições simultâneas para o mesmo horário, exatamente 1 vence.
- `ON DELETE CASCADE` a partir de `communities`/`equipment`.

### 1.3 API (`/api/v1`)

Autenticadas (dentro da comunidade, mesma guarda de papéis dos quizzes):
```
GET/POST   /communities/:id/equipment
GET/PUT/DELETE /communities/:id/equipment/:eid
POST       /communities/:id/equipment/:eid/image         (multipart; só imagem)
PUT        /communities/:id/equipment/:eid/windows
GET/POST/DELETE /communities/:id/equipment/:eid/blocks
GET        /communities/:id/equipment/:eid/availability?from=&to=
GET/POST   /communities/:id/equipment/:eid/bookings
POST       /communities/:id/equipment/:eid/bookings/:bid/{approve|reject|cancel}
GET        /communities/:id/equipment/bookings/mine
POST       /communities/:id/equipment/:eid/public-token   (gera/gira)  · DELETE (desliga)
```
Públicas (**sem `authenticate`**, com limitador próprio):
```
GET  /public/equipment/:token                       (ficha pública, sem dados pessoais)
GET  /public/equipment/:token/availability?from=&to=
POST /public/equipment/:token/bookings              (convidado)
POST /public/bookings/:cancelToken/cancel
```
Se o token existir mas o acesso for `community`, responder 404 (não vazar existência).

### 1.4 Interface
- **Aba Apps:** novo card "Equipamentos" + lista dos equipamentos da comunidade (foto, status, "em uso agora").
- **Detalhe** (`/communities/:id/equipment/:eid`): cabeçalho com foto e especificações; abas **Agenda** (grade semanal, bloquear arrastando para staff), **Reservas** (fila e histórico), **Regras** (janelas, bloqueios, parâmetros), **Acesso público** (liga/desliga, QR, imprimir etiqueta, girar token).
- **Modal de reserva** (componente único `BookingModal`, `mode="member" | "guest"`): calendário de dias → horários livres → dados → confirmação.
- **Página pública** `/e/:token`: layout próprio, sem menu lateral, mobile-first, em pt/en/es pelo idioma do navegador. Confirmação mostra o link de cancelamento.
- **Rotas novas no front:** `communities/:id/equipment/:eid` (dentro do shell) e `/e/:token` (fora do `ProtectedRoute`, como o `/login`).

---

## 2. App "Quadro" (gestão do lab, estilo monday)

### 2.1 Requisitos

**Estrutura**
- Q1. Uma comunidade tem **vários quadros** (ex.: "Tarefas do Lab", "Prazos da disciplina"). Quadro pode ficar dentro de um tópico, como os quizzes.
- Q2. Quadro tem **grupos** (ex.: "Esta semana", "Backlog") recolhíveis, com cor e ordem.
- Q3. **Linhas (itens)** editáveis direto na tabela; criar, duplicar, mover entre grupos, arrastar para reordenar, arquivar.
- Q4. **Colunas personalizáveis**: texto, **status**, **pessoa**, data, intervalo de datas (timeline), número, caixa de seleção, link, lista de opções. Criar, renomear, reordenar, redimensionar, ocultar, excluir.

**Status personalizáveis (pedido central)**
- Q5. Cada coluna de status tem **rótulos próprios** (nome + cor), ordem, e um marcador "**conta como concluído**". Padrão: A fazer / Em andamento / Bloqueado / Feito.
- Q6. Uma coluna de status "concluído" alimenta a barra de progresso do grupo/quadro e o destaque de **atrasado** (prazo vencido e não concluído).

**Pessoas**
- Q7. Coluna **pessoa** escolhe entre os **membros da comunidade** (um ou vários responsáveis), com avatar.
- Q8. Visão **Minhas tarefas** (tudo o que está atribuído a mim, em todos os quadros da comunidade) e filtro por pessoa.

**Uso**
- Q9. Filtros, ordenação e busca por coluna; agrupar por status ou por pessoa.
- Q10. Edição por célula (um valor por vez), então duas pessoas editando colunas diferentes não se sobrescrevem; atualização automática da tela (re-busca periódica) e atualização otimista.
- Q11. Permissões por quadro: `quem edita` = só staff **ou** todos os membros; um responsável sempre pode atualizar o status do **próprio** item.
- Q12. Comentários por item e histórico de alterações (quem mudou o quê).

**Depois (v2/v3)**
- Q13. Visualizações **Kanban** (por qualquer coluna de status), **Calendário** e **Linha do tempo**; subitens; tarefas recorrentes; modelos de quadro (ex.: "Rotina do Lab", "Cronograma de disciplina").
- Q14. **Vincular** item a quiz, workflow, dataset, projeto ou **reserva de equipamento** (reaproveitando o padrão de links que já existe nas comunidades).
- Q15. Importar/exportar CSV; automações simples ("quando status = Feito, avisar o responsável").

### 2.2 Modelo de dados

| Tabela | Campos principais |
|---|---|
| `boards` | `uuid`, `community_id`, `section_id` (nulo), `title`, `description`, `edit_policy` (staff/members), `position`, `created_by` |
| `board_groups` | `uuid`, `board_id`, `title`, `color`, `position`, `collapsed` |
| `board_columns` | `uuid`, `board_id`, `title`, `type`, `config` (JSON: rótulos de status `[{id,label,color,done}]`, opções, formato), `position`, `width`, `hidden` |
| `board_items` | `uuid`, `board_id`, `group_id`, `title`, `values` (JSON: `{ "<uuid da coluna>": valor }`), `position`, `archived_at`, `created_by` |
| `board_item_people` | `item_id`, `column_id`, `user_id` (tabela normalizada para consultar "minhas tarefas" e filtrar por pessoa rápido) |
| `board_item_comments` | `item_id`, `user_id`, `body`, `created_at` |
| `board_activity` | `board_id`, `item_id`, `user_id`, `column_id`, `old`, `new`, `created_at` |

Notas:
- `values` em JSON mantém o modelo simples e flexível; atualização de uma célula usa `JSON_SET` (atômica, não regrava a linha toda). A coluna **pessoa** vive na tabela normalizada para as consultas entre quadros.
- Mudar tipo de coluna ou excluir um rótulo de status em uso **pede confirmação** e migra/limpa valores (mesma ideia da recorreção de quiz).
- Escala-alvo: centenas de linhas por quadro, então filtro e ordenação podem ser no cliente nesta fase; paginar só se necessário.

### 2.3 API
```
GET/POST   /communities/:id/boards            GET/PUT/DELETE /communities/:id/boards/:bid
POST/PUT/DELETE  …/boards/:bid/groups[/:gid]  (+ reorder)
POST/PUT/DELETE  …/boards/:bid/columns[/:cid] (+ reorder)
POST/PUT/DELETE  …/boards/:bid/items[/:iid]   (+ move, duplicate)
PUT   …/boards/:bid/items/:iid/cells/:cid     { value }      ← edição de célula
GET/POST …/boards/:bid/items/:iid/comments
GET   /communities/:id/boards/my-items        (minhas tarefas na comunidade)
```

### 2.4 Interface
- **Aba Apps:** card "Quadro" + lista de quadros.
- **Página do quadro** (`/communities/:id/boards/:bid`): tabela com cabeçalho fixo, grupos recolhíveis, edição inline por tipo de coluna (seletor de status colorido, seletor de pessoas, calendário), botão "+ coluna", menu da coluna (renomear, tipo, rótulos de status, ocultar, excluir), barra de filtros, painel lateral do item (comentários e histórico).
- **Celular:** a tabela rola na horizontal dentro do próprio quadro (a página não rola); em tela pequena, "Minhas tarefas" em cartões.

---

## 3. Integração com o que já existe

- **Apps tab:** hoje os cards são fixos. Passa a um **registro de apps** (`quiz`, `board`, `equipment`) com ícone, título, permissão para criar e rota. Os próximos apps entram só adicionando uma linha.
- **Permissões:** reuso de `guard(min)` e `isStaff`. Criar/configurar = moderator+; usar = membro. Comunidade privada continua devolvendo 404 a quem não é membro; a **única** rota fora disso é a pública do equipamento, que só existe com o acesso ligado.
- **Excluir comunidade** apaga quadros, equipamentos e reservas (cascata).
- **i18n:** chaves `board.*`, `equipment.*`, `publicBooking.*` em pt/en/es no `extra.js`, validadas por `npm run i18n:check`. A página pública escolhe o idioma pelo navegador.
- **Ajuste de comunidade por tipo (opcional, v2):** "predefinição" de comunidade (Aula ou Laboratório) só reordena o que aparece primeiro na aba Apps; todos os apps ficam sempre disponíveis.

---

## 4. Plano de implementação

Tamanhos relativos: **P** (≤ meio dia), **M** (1 dia), **G** (2–3 dias).

| Fase | Entrega | Principais tarefas | Tam. |
|---|---|---|---|
| **0. Base** | Infra comum | Registro de apps na aba Apps; rota/layout público fora do `ProtectedRoute`; limitador próprio para `/public/*`; variável `PUBLIC_BASE_URL`; helper de fuso horário; upload de imagem (reuso do `multer`, só imagem + miniatura); esqueleto de i18n | M |
| **1. Equipamentos — núcleo** | Cadastro e reserva interna | Migrações; CRUD de equipamento, especificações, imagem (inclui colar); janelas e bloqueios; função única de disponibilidade; reserva de membro em transação sem sobreposição; aprovação/cancelamento; fila do admin; "em uso agora"; telas (lista, detalhe, agenda semanal, regras); `BookingModal` modo membro | G |
| **2. Equipamentos — público** | Página por QR | Token e rotação; API pública sem dados pessoais; reserva de convidado com limites, honeypot e aprovação; link de cancelamento; página `/e/:token` mobile-first; QR (SVG/PNG) e etiqueta imprimível; e-mail de confirmação **se houver SMTP** (ver §6); `BookingModal` modo convidado | G |
| **3. Quadro — núcleo** | Tabela estilo monday | Migrações; quadros, grupos, colunas, itens; edição de célula por `JSON_SET`; status personalizáveis com "conta como concluído"; coluna pessoa; progresso e atraso; edição inline; arrastar para reordenar; filtros; "Minhas tarefas"; permissões do quadro | G |
| **4. Quadro — extras** | Colaboração e visões | Comentários e histórico; Kanban; calendário/linha do tempo; subitens; recorrência; modelos; vínculo com quiz/workflow/dataset/projeto | G |
| **5. Integração e acabamento** | Ligar os apps | Reserva ↔ tarefa do Quadro; ficha de uso imprimível; ICS; notificações; histórico e manutenção; predefinições de comunidade; documentação final | M–G |

**Cada fase termina com:** testes e2e de API (`tests/equipment_e2e.mjs`, `tests/board_e2e.mjs`), `npm run i18n:check` e `npm run build`, validação no navegador (desktop e celular 375 px, sem rolagem horizontal da página), doc atualizada, commit e push.

### Testes que valem ouro
- **Equipamentos:** sobreposição (reservas simultâneas: só uma vence); janela fechada e bloqueio recusam; duração/antecedência; fuso e virada de dia; convidado nunca recebe dado pessoal de ninguém; token girado invalida o antigo; modo `só comunidade` devolve 404 na rota pública; limite por e-mail/IP; membro de outra comunidade não reserva; cancelamento por token só cancela a própria reserva.
- **Quadro:** edições concorrentes em células diferentes não se perdem; excluir rótulo de status em uso; permissões `staff`/`members`; "Minhas tarefas" só mostra o que é seu e da comunidade; membro removido da comunidade some das colunas pessoa.

---

## 5. Ordem sugerida de entrega
1. Fase 0 + 1 (já dá para o lab trocar a planilha por reservas internas).
2. Fase 2 (o QR Code; é o que mais encanta no uso real).
3. Fases 3 e 4 (Quadro).
4. Fase 5.

## 6. Riscos e perguntas em aberto (com o padrão que vou adotar)

| Tema | Risco | Padrão adotado |
|---|---|---|
| **Equipamento dentro da comunidade** | Um lab com várias comunidades teria o equipamento duplicado, ou uma agenda por comunidade. | v1: o equipamento pertence a **uma** comunidade; recomenda-se uma comunidade "Lab" como dona. O desenho com `community_id` permite subir para um nível "organização" depois, sem refazer reservas e quadros. |
| **E-mail** | O backend tem `nodemailer` instalado mas **não há configuração SMTP nem envio de e-mail hoje**. | Fase 2 funciona sem e-mail: reserva externa fica **pendente para aprovação** e o link de cancelamento aparece na tela. Com SMTP configurado (`SMTP_*`), ligam-se a confirmação de e-mail e os avisos. **Preciso saber se existe SMTP em produção.** |
| **Spam/abuso na página pública** | Reservas falsas segurando horário. | Aprovação manual para externos por padrão, limites por IP/e-mail, honeypot, janelas públicas pequenas; CAPTCHA opcional. |
| **LGPD** | Coleta nome/e-mail/telefone de externos. | Só o necessário, aceite explícito, visível só ao admin, e opção de apagar dados de convidados antigos (retenção configurável). |
| **Fuso/horário** | Erros em virada de dia. | UTC no banco, regras no fuso do equipamento, testes específicos. |
| **Tabela estilo monday** | Escopo infinito (automações, fórmulas…). | v1 só com colunas, status, pessoa, filtros e "Minhas tarefas"; o resto em fases 4–5. |
| **Tempo real** | Duas pessoas no mesmo quadro. | Edição por célula + re-busca periódica; WebSocket só se a demanda aparecer. |

**Perguntas que mudam o plano (responda só se discordar do padrão):**
1. Reserva de **externo** deve ser **automática** ou **aprovada pelo admin**? (padrão: aprovada)
2. Há **SMTP** disponível para enviar e-mails (confirmação/cancelamento)?
3. Posso começar por **Equipamentos** e deixar o **Quadro** para depois?
4. Os nomes **Quadro** e **Equipamentos** servem?
