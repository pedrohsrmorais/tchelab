# Equipamentos — agendador da comunidade (2026-10-22)

App da comunidade (ao lado de Quiz e, em breve, Quadro) para listar equipamentos do laboratório, definir quando podem
ser reservados e deixar qualquer pessoa — com ou sem conta — marcar horário via link/QR Code.

## O que existe

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

## Garantias

- Sem sobreposição: criação em transação com `SELECT … FOR UPDATE` na linha do equipamento (teste com 8 requisições
  simultâneas: 1 vence, 7 recebem 409).
- Disponibilidade = janelas − bloqueios − reservas ativas, calculada num único serviço (`equipmentSlots.service.js`).
  Banco em UTC; janelas interpretadas no fuso do equipamento (luxon).
- Limites: 2 reservas ativas por e-mail, 6 por IP, 12 criações/h por IP, rate limit nas rotas públicas.
- Imagem servida com `nosniff` e CSP sandbox; SVG não aceito.

## Configuração

| Variável | Descrição |
|----------|-----------|
| `RESEND_API_KEY` | chave da Resend (no `.env` da raiz, que é ignorado pelo git; nunca versionar) |
| `MAIL_FROM` | remetente; padrão `TcheLab <onboarding@resend.dev>` — o remetente de onboarding da Resend só envia para o e-mail dono da conta; em produção verificar um domínio |
| `MAIL_TRANSPORT` | `resend` (padrão se há chave), `file` (grava JSON em `storage/outbox`, usado nos testes) ou `none` |
| `PUBLIC_BASE_URL` | base dos links nos e-mails e no QR (ex.: `https://tchelab.exemplo.br`) |

> A chave fornecida durante o desenvolvimento ficou apenas no `.env` local. Recomenda-se **rotacioná-la** na Resend antes
> de produção, já que ela circulou em conversa.

## Como testar

Ver `docs/testes_e2e.md` (`equipment_e2e.mjs`). Validação visual em navegador cobriu: fluxo do professor (criar, regras,
bloqueio, QR, etiqueta), fluxo do convidado em celular (reserva → e-mail → confirmação → aprovação), visão do membro e
ausência de rolagem horizontal em telas estreitas.

## Próximos passos

Quadro ("CRM-Lab", estilo monday) — ver `docs/apps_quadro_equipamentos_plano.md` (fases 3–4); depois integrações
(reserva ↔ tarefa).
