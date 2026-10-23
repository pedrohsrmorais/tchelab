# Documentação do TcheLab

Comece por [../README.md](../README.md) (como subir) e [arquitetura.md](arquitetura.md) (como as peças se encaixam). O restante está agrupado abaixo.
Última consolidação: 2026-10-22. Histórico de mudanças: [CHANGELOG.md](CHANGELOG.md).

## Visão geral e arquitetura
| Documento | Conteúdo |
|---|---|
| [requisitos.md](requisitos.md) | requisitos funcionais e não funcionais; nota de status do que já foi entregue |
| [arquitetura.md](arquitetura.md) | componentes, fluxo de uma execução, armazenamento, cota e medição, variáveis de ambiente, implantação |
| [CHANGELOG.md](CHANGELOG.md) | o que foi entregue, por data e por tema |

## API, dados e execução
| Documento | Conteúdo |
|---|---|
| [api_rotas.md](api_rotas.md) | **todas as 268 rotas**, geradas do código (`backend_api/scripts/gen_routes_doc.js`) |
| [api.md](api.md) | contrato do núcleo da API (autenticação, projetos, datasets, workflows, execuções…) com exemplos |
| [database.md](database.md) | esquema do banco, relacionamentos e migrações |
| [workflow.md](workflow.md) | modelo de workflow, execução em DAG, nós, medição e bloqueio por orçamento de CPU |
| [api-python.md](api-python.md) | contrato fila Redis ↔ worker (`JobRequest`/`JobResult`, métricas) |
| [catalogo_scripts.md](catalogo_scripts.md) | catálogo de técnicas e scripts do worker |

## Armazenamento, cota e consumo
| Documento | Conteúdo |
|---|---|
| [armazenamento.md](armazenamento.md) | **referência**: onde cada arquivo mora, cota por usuário, planos, consumo de CPU/RAM, calculadora de custo, bloqueio, MinIO/AWS, checklist de produção |
| [plano_armazenamento_minio.md](plano_armazenamento_minio.md) | plano em fases (1–2 ✅, 6 parcial) e a **Fase 3** detalhada (tensores fora do MySQL, worker lendo do bucket), Fase 4 (ciclo de vida) |

## Funcionalidades
| Documento | Conteúdo |
|---|---|
| [comunidades_perfil_i18n.md](comunidades_perfil_i18n.md) | idiomas, perfil, comunidades estilo Moodle, papéis, projetos compartilhados |
| [apps_comunidade.md](apps_comunidade.md) | aba Apps: subtópicos, **Quizzes**, **Equipamentos** (agendador/QR), **Quadro** (monday-like) |

## Interface
| Documento | Conteúdo |
|---|---|
| [ux.md](ux.md) | tema Classic (MATLAB), auditoria de temas/responsividade/idiomas, catálogo (tradução, ícones, navegação) |

## Testes e qualidade
| Documento | Conteúdo |
|---|---|
| [testes_e2e.md](testes_e2e.md) | suítes automatizadas, como rodar todas, relatório da bateria visual de 2026-10-21 |
| [testes_e2e/](testes_e2e/) | capturas de tela citadas nos relatórios |

## Histórico (somente consulta)
Planejamentos já executados, mantidos pelo contexto das decisões: [historico/apps_quadro_equipamentos_plano.md](historico/apps_quadro_equipamentos_plano.md),
[historico/diagnostico_idioma_usuario_comunidades.md](historico/diagnostico_idioma_usuario_comunidades.md).

## Pendências e próximos passos
1. **Rodar `./scripts/verify_minio.sh` com Docker** — o MinIO real nunca foi exercitado no ambiente de desenvolvimento (testes usaram `moto` para S3).
2. Definir **preços reais** (US$/GB·mês, US$/CPU-hora) e **orçamentos de CPU** por plano em *Admin → Armazenamento* — os valores atuais são exemplos.
3. **Rotacionar a chave da Resend** (circulou em conversa).
4. **Fase 3** (tensores como `.npy` no bucket, despacho por referência, worker com credencial restrita) e **Fase 4** (lixeira, purga, reconciliação semanal) — ver o plano.
5. **Limite de jobs simultâneos por usuário** (`max_concurrent_jobs` existe nos planos, mas não é aplicado; falta decidir fila × rejeição).

## Como manter a documentação
- Rotas: não edite `api_rotas.md`; rode `node backend_api/scripts/gen_routes_doc.js` (e `--check` em CI).
- Mudou tabela/coluna em `migrate.js` → atualizar [database.md](database.md). Mudou contrato do worker → [api-python.md](api-python.md).
- Entrega nova → uma linha em [CHANGELOG.md](CHANGELOG.md). Texto de interface novo → `*.strings.js` com as três línguas.
