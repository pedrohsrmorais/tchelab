# Diagnóstico — idioma (pt/en/es), preferências do usuário, perfil e comunidades

Data: 2026-10-21. Somente leitura + testes contra a stack local; **nenhum código de produto foi alterado**
nesta etapa (só este documento). Os achados marcados com 🧪 foram reproduzidos na stack rodando.

## 1. Resumo

| Tema | Situação | Risco ao evoluir |
|------|----------|------------------|
| i18n da interface | Boa base: i18next, pt/en com **714 chaves espelhadas**, quase tudo via `t()` | Baixo se for aditivo (novo `es.js` + fallback) |
| Conteúdo do catálogo (nome/descrição/portas/parâmetros de 94 técnicas) | **Só em português, no banco** | Médio — é o maior volume de tradução |
| Workspace (tela MATLAB) | ~45 textos fixos em pt | Baixo |
| Tema/idioma salvos por usuário | **Não existe**: só `localStorage` do navegador; `users` não tem coluna para isso | Baixo (migração aditiva) |
| Perfil | Banco e API suportam quase tudo; a **tela só edita nome e está quebrada** 🧪 | Baixo |
| Comunidades | Backend razoável, mas **sem convite, sem "entrar", com falhas de autorização e chat quebrado** 🧪 | **Alto — corrigir antes de abrir ao público** |

## 2. Idioma (i18n)

### O que existe
- `frontend/src/i18n/index.js`: `lng` vem de `localStorage.tchelab_lang` (padrão `pt`), `fallbackLng: 'pt'`.
- `locales/pt.js` e `en.js`: 714 chaves cada, **0 divergências**. Maiores grupos: datasets (184), workflows (112),
  projects (53), communities (41).
- Seletor de idioma só na **Sidebar** (após login). A tela de login não tem seletor.
- Datas: `toLocaleString(i18n.language)` em ~12 lugares (funciona com `es`).
- Famílias de técnicas: `FAMILIES[x].label = { pt, en }` em `config/techniqueRegistry.js` (precisa de `es`).

### Lacunas encontradas (varredura do DOM de 19 telas em inglês 🧪)
1. **Catálogo** (`/catalogo`, detalhe, modal, painel do editor): nomes de família, descrições, "O que é / Como funciona /
   Como usar", descrições de portas e parâmetros aparecem em português com a UI em inglês (~193 textos só na
   listagem). Origem: `techniques.description` + JSON `input_schema/output_schema/parameter_schema` ≈ **80 mil
   caracteres** em pt, num único idioma por técnica.
2. **Workspace**: "Operação", "Técnica / Função", "Selecione uma função…", "Nenhuma variável selecionada",
   "Dê duplo-clique…", "Importar Variável — Workspace" etc. fixos em pt (`WorkspacePage.jsx`).
3. **Conteúdo gerado em pt gravado no banco** (ex.: "Gerado a partir de "M" via Inversa de Matriz.", "Operação rápida: …")
   — fica em pt para qualquer idioma.
4. **Backend**: ~216 mensagens de erro/sucesso em pt literais nos controllers (`R.notFound(res, 'Usuário')`, `'Obrigatório.'`…).
   O frontend mostra algumas delas diretamente.
5. `index.html` tem `<html lang="pt-BR">` fixo (afeta leitores de tela, hifenização e corretor do navegador).
6. Primeira visita sempre em `pt` (não considera `navigator.language`).
7. Pluralização manual: "1 membros" (`CommunityDetailPage`), embora o i18next suporte `_one/_other` (já usado em `workflows`).
8. Textos "de marca" intencionais (TcheLab, PLUS, BETA, PCA) — ok manter.

### Plano seguro para adicionar espanhol (sem tocar no que funciona)
1. Criar `locales/es.js` com **a mesma árvore** de `pt.js`. Registrar em `i18n/index.js` com
   `fallbackLng: { es: ['en','pt'], en: ['pt'], default: ['pt'] }` — chave faltante nunca aparece como chave crua.
2. **Teste de paridade** (script Node, roda em CI e no `npm run build`): falha se `es`/`en` tiverem chaves a mais/menos
   que `pt`, ou se os placeholders `{{x}}` / sufixos `_one/_other` divergirem. É a rede de segurança contra regressão.
3. Seletor de idioma com 3 opções na Sidebar **e** no login; `document.documentElement.lang` sincronizado;
   detecção inicial por `navigator.language` (só se não houver preferência salva).
4. Mover os textos fixos do Workspace para `t()` (chaves novas, pt como fonte).
5. **Conteúdo do catálogo**: não duplicar colunas. Arquivos laterais `catalog_i18n/{en,es}.json` indexados por
   `slug` (nome, descrição, how_it_works, usage_tips, descrições de portas/parâmetros), mesclados no
   `technique.controller` conforme `?lang=` (ou `Accept-Language`), **com fallback para o pt do banco**. O
   `gen_catalog_ports_sql.py --check` já existente passa a validar que en/es cobrem as mesmas portas/parâmetros.
6. **Backend**: devolver `error.code` estável (já existe em parte) e traduzir no frontend; mensagens novas já
   nascem com código. Não reescrever os 216 textos de uma vez.
7. Formatos: usar BCP-47 completo (`pt-BR`, `en-US`, `es-ES`) em datas/números.

Ordem de risco: (1)→(3) é puramente aditivo; (4) mexe em uma página; (5) é opt-in por parâmetro.

## 3. Preferências salvas por usuário (tema + idioma)

Hoje: `tchelab_theme` e `tchelab_lang` só em `localStorage` → não acompanham o usuário entre navegadores/dispositivos.

Proposta:
- Migração aditiva: `ALTER TABLE users ADD COLUMN preferences JSON NULL` (extensível: `theme`, `language`,
  `sidebarCollapsed`, `defaultHome`…) com **whitelist de chaves/valores** no backend. (Alternativa: duas colunas
  `theme`/`language` ENUM — mais simples, menos flexível.) Atualizar `init.mysql` + script de migração idempotente.
- `GET /auth/me` já alimenta o store: passa a devolver `preferences`. `PUT /users/:id` aceita `preferences`.
- Frontend: após login/`me`, **servidor vence** e atualiza tema/idioma; ao mudar, grava em `localStorage`
  (cache, útil antes do login) **e** faz `PUT` com debounce. Falha de rede nunca bloqueia a troca local.
- Usuários existentes (sem preferência): mantêm o que já está no navegador e gravam no primeiro uso.

## 4. Perfil do usuário

### Banco (`users`) — já tem
`name, initials, bio, research_area, institution, birth_date, lattes_url, linkedin_url, github_url, avatar_url,
cover_color` + contadores. API: `PUT /users/:id` (permite quase todos, **não** `birth_date`), `POST /users/:id/avatar`.

### Problemas 🧪
1. **Tela de perfil quebrada**: "Salvar" chama `api.user.update({name})` mas a função é `update(id, d)` →
   `PUT /users/[object Object]` (404 silencioso, nada muda após recarregar). "Alterar senha" chama
   `api.user.changePassword`, que **não existe** (erro JS `e is not a function`) e **não há rota no backend** para
   troca de senha de usuário logado.
2. A tela só edita o nome; avatar é uma letra com gradiente; o campo `plan` não existe em `users` (sempre "free").
3. **Privacidade**: `GET /users/:id` devolve a qualquer usuário logado `birth_date`, `role`, `is_active`,
   `email_verified_at` e contadores privados.
4. URLs (Lattes/LinkedIn/GitHub) sem validação — risco de `javascript:` ao virar `<a href>`.
5. Avatar: ver limites/validação em `utils/multer.js` (tipo, tamanho) antes de abrir para todos.

### Plano
- Corrigir (1) já: chamar `update(user.uuid, …)`, atualizar o store, e criar `POST /auth/change-password`
  (senha atual + nova, mínimo 8, invalida refresh tokens).
- Formulário completo: nome, iniciais, bio, área, instituição, Lattes/LinkedIn/GitHub (validação `https://` +
  domínio esperado), foto (upload com pré-visualização, MIME/tamanho), cor de capa (presets).
- **Serializador público vs privado**: público = nome, avatar, bio, área, instituição, links, contadores
  públicos; privado (só o dono/admin) = e-mail, nascimento, etc. Opção "mostrar/ocultar" por campo em `preferences`.
- Página de perfil público (`/users/:id`) e avatar na Sidebar/listas de membros.

## 5. Comunidades

### O que existe
Tabelas `communities` (`owner_id`, `visibility public|private`), `community_members` (`member|moderator|admin`),
`community_projects`, `community_datasets`, `community_workflows`, `messages`. Rotas para CRUD, membros, vínculo de
projeto/dataset/workflow e chat. A UI tem: criar comunidade, abas Minhas/Públicas, detalhe com Chat/Projetos/Membros
e "Vincular Projeto".

### Falhas reproduzidas 🧪 (usuário B, **não membro**, contra comunidade **privada** de A)
| Ação de B | Resultado | Esperado |
|-----------|-----------|----------|
| `GET /communities/:id` | 200 | 403/404 |
| `GET …/members` | 200 (lista membros) | 403 |
| `GET …/messages` | 200 | 403 |
| `POST …/projects` com **projeto de A** | 201 | só membro, só projeto próprio |
| `GET …/projects` | 200, devolve a linha completa do projeto de A | só membros; só campos públicos |
| `DELETE …/projects/:pid` | 204 | só quem vinculou/admin |
| `POST …/messages` (como **qualquer** usuário, inclusive o admin) | **500** — `Field 'uuid' doesn't have a default value` | **o chat está quebrado para todos** |

Outras lacunas do código:
- **Não há como entrar numa comunidade pública** (`addMember` exige já ser membro/moderador) nem **convite**:
  não existe tabela, rota ou UI de código/link.
- Hierarquia frouxa: `removeMember` deixa um moderador remover admin ou **o dono**; `updateMemberRole` deixa um admin
  rebaixar o dono; sem transferência de propriedade; dono removido deixa a comunidade órfã.
- `addMember` por e-mail adiciona o usuário **sem consentimento** e revela se o e-mail existe (404 vs 201).
- `shareDataset`/`shareWorkflow` têm o mesmo problema do `linkProject` (sem checar posse nem associação).
- `updateCommunity` com `COALESCE` impede apagar a descrição.
- UI: sem editar comunidade, sem papéis, sem remover membro, sem sair, sem convite, sem "Entrar" nas públicas.

### Modelo proposto
**Papéis** (precedência): `owner` (`communities.owner_id`) > `admin` > `moderator` > `member`.

| Ação | owner | admin | moderator | member |
|------|:----:|:----:|:----:|:----:|
| Editar comunidade / visibilidade | ✔ | ✔ | – | – |
| Excluir comunidade / transferir posse | ✔ | – | – | – |
| Promover/rebaixar | ✔ | ✔ (até `admin`, não o owner) | – | – |
| Remover membro | ✔ | ✔ (não owner; admin só o owner remove) | ✔ só `member` | – |
| Criar/revogar convite | ✔ | ✔ | ✔ (opcional) | – |
| Vincular projeto **próprio** | ✔ | ✔ | ✔ | ✔ (configurável) |
| Desvincular | ✔ | ✔ | ✔ | só o que vinculou |
| Chat: apagar mensagem alheia | ✔ | ✔ | ✔ | – |
| Sair | ✔* | ✔ | ✔ | ✔ (*owner só após transferir) |

**Convites**: tabela `community_invites (id, community_id, code UNIQUE, created_by, role, expires_at, max_uses, uses,
revoked_at, created_at)`. Código aleatório curto (ex.: 10 caracteres base32, ≥ 50 bits) e link
`/communities/join/<código>`. Endpoints: `POST/GET/DELETE /communities/:id/invites`, `POST /communities/join`
`{code}` (idempotente; valida expiração/uso/revogação/banimento) e `POST /communities/:id/join` para comunidades
**públicas** (sem código). Rate-limit no `join` para impedir adivinhação. Tabela opcional `community_bans` para que
quem foi removido não volte pelo mesmo link. Eventos em `audit_logs` (já existe) para convite/remoção/promoção.

**Visibilidade**: privada = só membros veem detalhes, membros, chat, projetos; pública = qualquer usuário logado vê
nome/descrição/contagem e **projetos marcados como públicos**, mas só membros veem chat e participam.
Projetos vinculados continuam pertencendo ao dono; membros ganham leitura conforme `visibility` do projeto
(decisão de produto abaixo).

## 6. Sequência recomendada (do mais seguro ao mais invasivo)

| Fase | Entrega | Mexe no que funciona? |
|------|---------|-----------------------|
| 0 | Correções: salvar perfil/senha; `uuid` do chat; checagens de autorização nas comunidades; serializador de usuário; validação de URL | Corrige bugs, sem mudar UX |
| 1 | `es.js` + fallback + teste de paridade + `<html lang>` + seletor (sidebar/login) + Workspace em `t()` | Aditivo |
| 2 | `users.preferences` + sincronização tema/idioma | Aditivo (migração) |
| 3 | Perfil completo (formulário, avatar, perfil público, privacidade) | Substitui só `ProfilePage` |
| 4 | Comunidades: papéis, convites, entrar/sair, gestão de membros, vínculo seguro de projetos | Reescreve controller de comunidades + UI |
| 5 | Tradução do catálogo (en/es) por arquivos laterais | Opt-in por `?lang=` |

Cada fase com teste automatizado (paridade de i18n; testes de API de autorização com 2–3 usuários) e captura de
tela nos 3 temas × 3 idiomas antes de seguir.

## 7. Decisões que dependem de você
1. **Quem traduz** o catálogo (≈ 80 mil caracteres) para en/es: posso gerar a tradução técnica e você revisa?
2. **Preferências**: coluna JSON `preferences` (recomendado) ou colunas `theme`/`language`?
3. **Hierarquia**: admin pode remover **outro admin**? (proposta: não; só o owner.) Existe o papel `moderator` na UI?
4. **Convites**: reutilizáveis com expiração/limite de usos (proposta) ou de uso único? Admin e moderador criam?
5. **Dados pessoais**: `birth_date` é realmente necessário? Se sim, nunca público.
6. **Projeto vinculado**: membros da comunidade passam a **ver** (somente leitura) projetos privados vinculados, ou só
   projetos públicos aparecem?
7. Membro comum pode vincular o **próprio** projeto, ou só admin/moderador?
