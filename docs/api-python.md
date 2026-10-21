# TcheLab — Worker Python (`worker_api/`)

> Reescrito do zero em 2026-10-13. A versão anterior deste arquivo descrevia, por engano, um
> esqueleto **Node.js** antigo (`middleware/`, `config/database.js`...) que nunca existiu em
> `worker_api/` — provavelmente um corta-e-cola de uma fase inicial de planejamento da API
> Node. Para a API REST real (Node.js), ver `api.md`. Para a infraestrutura operacional do
> worker (por que ele precisa ficar sempre rodando, como subir em produção, troubleshooting de
> pm2/systemd), ver `worker_api/README.md` — este arquivo aqui documenta a estrutura de código.

---

## Estrutura real

```
worker_api/
├── worker.py           # processo principal — loop BLPOP → valida → executa → publica resultado
├── factory.py          # ScriptFactory: auto-descoberta e registro de técnicas do catálogo
├── config.py            # configuração (Redis, fila, concorrência) via variáveis de ambiente
├── redis_queue.py       # dequeue_job / publish_result / get_redis
├── schemas.py           # JobPayload, JobResult, JobStatus (dataclasses/validação do job)
├── jsonable.py          # serialização de arrays numpy/objetos pra JSON (to_jsonable)
├── catalog/
│   ├── __init__.py
│   ├── base.py          # BaseScript — classe abstrata que toda técnica herda
│   └── familia_NN_*/
│       └── scripts.py   # as classes concretas (uma por técnica) desta família
└── tests/
    ├── helpers.py
    ├── run_all.py
    └── test_familia_*.py
```

As 20 famílias em `catalog/` (`familia_01_dados` … `familia_20_utilitarios`) são as mesmas que
aparecem em `family` na tabela `techniques` e nos grupos do catálogo no frontend
(`techniqueRegistry.js`). `catalogo_scripts.md` documenta o conteúdo de cada família;
este arquivo documenta só a mecânica de como uma técnica é declarada e executada.

---

## O contrato `BaseScript`

Toda técnica do catálogo é uma classe em `catalog/familia_NN_*/scripts.py` que herda de
`catalog/base.py::BaseScript`:

```python
class BaseScript(abc.ABC):
    slug: str = ""       # identificador único, snake_case — bate com techniques.slug
    nome: str = ""
    familia: str = ""    # ex: "01_dados" — bate com techniques.family
    descricao: str = ""

    @abc.abstractmethod
    def validate(self, inputs: dict, params: dict) -> None:
        """Levanta ValueError com mensagem descritiva se inválido. Sem efeito colateral."""

    @abc.abstractmethod
    def execute(self, inputs: dict, params: dict) -> dict:
        """Roda sobre entradas já validadas. Retorna as saídas da técnica."""
```

`inputs` e `params` são dicts simples (não um objeto tipado) — a técnica lê o que precisa via
`inputs["X"]` / `inputs.get("X")` / `self._require_key(inputs, "X")`, e `params.get("chave",
default)`. Isso é o que faz o `input_schema`/`parameter_schema` de `techniques` **documentação,
não validação em tempo de tipo** — se o schema no banco não bater com as chaves que o código lê
de verdade, o pipeline não quebra em tempo de import, só silenciosamente ignora ou falha na hora
de executar (ver a auditoria de hiperparâmetros e de portas em `backend_api/sql/CATALOG_AUDIT.md`
§8 — isso já mordeu este projeto: 9 `parameter_schema` e ~52 `input_schema`/`output_schema`
estavam com chaves divergentes do código real até serem corrigidos).

`BaseScript` também traz helpers estáticos compartilhados por várias técnicas:
`_require_key`, `_require_ndim`, `_require_ndim_range`, `_require_shapes_match`,
`_require_dtype_float` — todos levantam `ValueError` com mensagem explicando o que faltou.

---

## `ScriptFactory` — auto-descoberta

`factory.py` nunca importa uma técnica específica por nome. Em vez disso:

1. `ScriptFactory.autodiscover()` roda `pkgutil.walk_packages` sobre todo o pacote `catalog/`,
   importando cada módulo.
2. Um hook em `BaseScript.__init_subclass__` registra automaticamente toda subclasse concreta
   (com `slug` não-vazio) no dict `ScriptFactory._registry` assim que a classe é definida —
   então basta a classe existir em algum `scripts.py` dentro de `catalog/` pra aparecer no
   catálogo; não precisa editar nenhuma lista central.
3. `ScriptFactory.get(slug)` instancia e retorna a técnica pelo slug; levanta `KeyError` com a
   lista de slugs disponíveis se não encontrar.

Isso é o que a mensagem de log `ScriptFactory: N scripts registrados.` no boot do worker conta —
hoje **188** (169 originais + 19 funções MATLAB-like adicionadas em 2026-10-21; `worker_api/README.md`
já cita esse número certo). O worker nunca executa código arbitrário — só o que está registrado
aqui, e só o que tem `slug` declarado.

---

## O loop do worker (`worker.py`)

```
1. BLPOP na fila Redis (tchelab_fila, configurável via JOB_QUEUE)
2. Instancia a técnica via ScriptFactory.get(payload.slug)
3. script.validate(payload.inputs, payload.params)
4. script.execute(payload.inputs, payload.params)
5. Publica um JobResult (sucesso ou falha) no canal de resultados
```

Concorrência via `ThreadPoolExecutor` (`WORKER_CONCURRENCY`, default 4). O Node
(`backend_api`) só enfileira (`job.service.js`) e escuta os resultados
(`resultConsumer.service.js`) — nunca executa a técnica em si. Detalhes operacionais
(por que esse processo precisa estar sempre de pé, como subir em produção, diagnóstico de
restart em pm2) estão em `worker_api/README.md`, não aqui.
