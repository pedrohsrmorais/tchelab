# -*- coding: utf-8 -*-
"""
Valida e gera o SQL das portas/textos do Catálogo a partir de catalog_ports_source.py.

Uso (a partir de backend_api/sql/):
    python gen_catalog_ports_sql.py --check          # só valida contra o código Python do worker
    python gen_catalog_ports_sql.py                  # valida + escreve catalog_ports.sql
    python gen_catalog_ports_sql.py --init-mysql     # valida + reescreve o bloco gerado dentro de
                                                     # ../src/config/init.mysql (entre os marcadores)

O que a validação garante (falha com exit 1 se violar):
  1. toda técnica de ENTRIES tem uma classe no worker com o mesmo `slug`;
  2. os NOMES das portas de entrada == chaves lidas de `inputs` por validate()/execute();
  3. os NOMES das portas de saída  == chaves devolvidas por execute();
  4. portas marcadas "opt" são opcionais no código (lidas só via .get / `in`), e as demais
     são realmente lidas;
  5. os tipos pertencem ao vocabulário do contrato (docs/workflow.md): matrix, tensor,
     vector, scalar, model, figures, labels — ou None (porta sem tipo/curinga);
  6. nenhum texto obrigatório (how/tips e descrição de porta) está vazio.

Por quê existe: o ShapeValidatorService exige que `source_port`/`target_port` existam em
output_schema/input_schema e compara os tipos com igualdade estrita; já o worker lê/escreve
as chaves literais. Um nome divergente = aresta rejeitada ou execução quebrada.
"""
import ast
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
CATALOG = HERE.parent.parent / "worker_api" / "catalog"
INIT_MYSQL = HERE.parent / "src" / "config" / "init.mysql"
OUT_SQL = HERE / "catalog_ports.sql"
BEGIN = "-- >>> BEGIN catalog_ports (gerado por backend_api/sql/gen_catalog_ports_sql.py — NÃO edite à mão)"
END = "-- <<< END catalog_ports"

sys.path.insert(0, str(HERE))
from catalog_ports_source import ENTRIES  # noqa: E402

TYPES = {"matrix", "tensor", "vector", "scalar", "model", "figures", "labels", None}

# Saídas montadas dinamicamente no código (dicionário em variável / chave calculada) — o AST não
# consegue resolver. Declaramos aqui o conjunto de chaves possíveis, conferido manualmente:
DYNAMIC_OUTPUTS = {
    "kennard_stone": {"train", "test", "validation", "train_indices", "test_indices", "validation_indices"},
    "split": {"part_1", "part_2", "part_3", "part_4"},  # o código gera part_1..part_N conforme indices_or_sections
    "diffusion": {"model", "X_denoised", "X_augmented", "training_loss"},  # X_denoised OU X_augmented, conforme `task`
    "cross_validation": {"model", "metrics_cv", "n_splits"},
    "autoencoder": {"model", "latent", "reconstruction_error", "history"},
    "transformer": {"model", "history"},
}
# Entradas que o AST vê diferente do que deve ser exposto como porta:
INPUT_EXCEPTIONS = {
    "importacao": (set(), "o caminho do arquivo vem de params.file_path; `inputs.file_path` é só fallback"),
    "formula_customizada": ({"X"}, "as entradas são livres (viram variáveis da expressão); expomos `X`"),
    "concatenacao": ({"A", "B"}, "`extra` é uma lista de arrays — não é conectável por uma única aresta"),
}


# ── extração via AST ──────────────────────────────────────────────────────────
def _s(n):
    return n.value if isinstance(n, ast.Constant) and isinstance(n.value, str) else None


def _inputs_read(fn):
    """(chaves lidas, chaves obrigatórias, dinâmico?)"""
    keys, req, dyn = set(), set(), False
    for n in ast.walk(fn):
        if isinstance(n, ast.Subscript) and isinstance(n.value, ast.Name) and n.value.id == "inputs":
            k = _s(n.slice)
            if k is None:
                dyn = True
            else:
                keys.add(k); req.add(k)
        elif isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "inputs":
                if f.attr in ("get", "pop") and n.args and _s(n.args[0]):
                    keys.add(_s(n.args[0]))
                elif f.attr in ("items", "keys", "values"):
                    dyn = True
            if isinstance(f, ast.Attribute) and f.attr == "_require_key" and len(n.args) >= 2:
                if isinstance(n.args[0], ast.Name) and n.args[0].id == "inputs" and _s(n.args[1]):
                    keys.add(_s(n.args[1])); req.add(_s(n.args[1]))
        elif isinstance(n, ast.Compare) and len(n.ops) == 1 and isinstance(n.ops[0], (ast.In, ast.NotIn)):
            if isinstance(n.comparators[0], ast.Name) and n.comparators[0].id == "inputs" and _s(n.left):
                keys.add(_s(n.left))
    return keys, req, dyn


def _outputs_returned(fn):
    keys, unresolved = set(), False
    assigned = {}
    for n in ast.walk(fn):
        if isinstance(n, ast.Assign):
            for t in n.targets:
                if isinstance(t, ast.Name) and isinstance(n.value, ast.Dict):
                    assigned.setdefault(t.id, set()).update(_s(k) for k in n.value.keys if k is not None and _s(k))
                elif isinstance(t, ast.Subscript) and isinstance(t.value, ast.Name) and _s(t.slice):
                    assigned.setdefault(t.value.id, set()).add(_s(t.slice))
    for n in ast.walk(fn):
        if isinstance(n, ast.Return) and n.value is not None:
            v = n.value
            if isinstance(v, ast.Dict):
                keys.update(_s(k) for k in v.keys if k is not None and _s(k))
            elif isinstance(v, ast.Name) and v.id in assigned:
                keys |= assigned[v.id]
            else:
                unresolved = True
    return keys, unresolved


def load_code():
    code = {}
    for py in sorted(CATALOG.rglob("scripts.py")):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
            slug = next((_s(st.value) for st in cls.body if isinstance(st, ast.Assign)
                         and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name)
                         and st.targets[0].id == "slug" and _s(st.value)), None)
            if not slug:
                continue
            fns = {f.name: f for f in cls.body if isinstance(f, ast.FunctionDef)}
            if "execute" not in fns:
                continue
            ik, ireq, idyn = _inputs_read(fns["execute"])
            if "validate" in fns:
                vk, vreq, vdyn = _inputs_read(fns["validate"])
                ik |= vk; ireq |= vreq; idyn |= vdyn
            ok, unres = _outputs_returned(fns["execute"])
            code[slug] = dict(inputs=ik, required=ireq, outputs=ok, unresolved=unres, dyn_inputs=idyn,
                              file=str(py.relative_to(CATALOG)))
    return code


def validate():
    code, errs = load_code(), []
    for slug, e in ENTRIES.items():
        c = code.get(slug)
        if not c:
            errs.append(f"{slug}: não existe classe com este slug em worker_api/catalog")
            continue
        # entradas
        decl_in = set(e["inputs"])
        exp_in = c["inputs"]
        if slug in INPUT_EXCEPTIONS:
            exp_in = INPUT_EXCEPTIONS[slug][0]
        if decl_in != exp_in:
            errs.append(f"{slug}: ENTRADAS divergem — fonte={sorted(decl_in)} código={sorted(exp_in)}")
        for name, port in e["inputs"].items():
            optional = len(port) > 2
            if slug not in INPUT_EXCEPTIONS and name in c["inputs"]:
                if optional and name in c["required"]:
                    errs.append(f"{slug}.{name}: marcada 'opt' mas o código a exige")
                if not optional and name not in c["required"]:
                    errs.append(f"{slug}.{name}: não é 'opt' mas o código só a lê com .get/in")
        # saídas
        decl_out = set(e["outputs"])
        if slug in DYNAMIC_OUTPUTS:
            exp_out = DYNAMIC_OUTPUTS[slug]
            if not c["outputs"] <= exp_out and not c["unresolved"]:
                errs.append(f"{slug}: código tem saída fora de DYNAMIC_OUTPUTS: {sorted(c['outputs'] - exp_out)}")
        else:
            exp_out = c["outputs"]
            if c["unresolved"]:
                errs.append(f"{slug}: saída não resolvida pelo AST — adicione a DYNAMIC_OUTPUTS")
        if decl_out != exp_out:
            errs.append(f"{slug}: SAÍDAS divergem — fonte={sorted(decl_out)} código={sorted(exp_out)}")
        # tipos e textos
        for side in ("inputs", "outputs"):
            for name, port in e[side].items():
                if port[0] not in TYPES:
                    errs.append(f"{slug}.{name}: tipo inválido {port[0]!r} (use {sorted(t for t in TYPES if t)} ou None)")
                if not port[1] or len(port[1].strip()) < 8:
                    errs.append(f"{slug}.{name}: descrição de porta vazia/curta")
        for f in ("how", "tips"):
            if not e.get(f) or len(e[f].strip()) < 20:
                errs.append(f"{slug}: campo '{f}' vazio/curto")
    return errs


# ── SQL ───────────────────────────────────────────────────────────────────────
def q(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def schema_json(ports):
    d = {}
    for name, p in ports.items():
        o = {}
        if p[0]:
            o["type"] = p[0]
        o["description"] = p[1]
        if len(p) > 2:
            o["required"] = False
        d[name] = o
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


LINSPACE_REPAIR = """\
-- linspace: o seed antigo inseria a linha com min_order=0/max_order=0, que viola
-- chk_techniques_min_order/max_order (1..20). Como o INSERT era IGNORE, a técnica nunca
-- chegou a existir no banco. Idempotente (INSERT IGNORE + UPDATEs abaixo).
INSERT IGNORE INTO `techniques`
  (`uuid`,`name`,`slug`,`category`,`family`,`description`,`active`,`is_beta`,`min_order`,`max_order`,`requires_sample_axis`,
   `parameter_schema`,`tags`)
VALUES ('a1b2c3d4-0012-4000-8000-000000000012','Espaçamento Linear','linspace','input','01_dados',
  'Gera vetor com N valores igualmente espaçados entre start e stop. Equivalente ao linspace() do MATLAB.',1,0,NULL,NULL,NULL,
  '{"start": {"type": "number", "required": true, "description": "Valor inicial do intervalo."}, "stop": {"type": "number", "required": true, "description": "Valor final do intervalo (incluído)."}, "n": {"type": "integer", "default": 100, "description": "Número de pontos gerados."}}',
  '["matlab","math","basic","workspace"]');
UPDATE `techniques` SET `active` = 1, `min_order` = NULL, `max_order` = NULL, `requires_sample_axis` = NULL
 WHERE `slug` = 'linspace' AND `is_custom` = 0;
"""


def build_sql():
    lines = [
        "-- =============================================================================",
        "-- Catálogo — portas (input_schema/output_schema) e textos (how_it_works, usage_tips,",
        "-- historical_note) das 94 técnicas ativas. GERADO por gen_catalog_ports_sql.py a partir de",
        "-- catalog_ports_source.py, já validado contra o código Python do worker. NÃO edite à mão.",
        "-- Idempotente: substitui os schemas inteiros (sem JSON_MERGE_PATCH), então nomes de porta",
        "-- antigos/errados não sobrevivem. Vocabulário de tipos: ver docs/workflow.md.",
        "-- Deploy sem recriar o volume:",
        "--   docker compose exec -T mysql mysql -u root -p\"$DB_ROOT_PASSWORD\" \"$DB_NAME\" < backend_api/sql/catalog_ports.sql",
        "-- =============================================================================",
        "SET NAMES utf8mb4;",
        "",
        LINSPACE_REPAIR,
    ]
    for slug, e in ENTRIES.items():
        lines.append(
            f"UPDATE techniques SET\n"
            f"  input_schema    = {q(schema_json(e['inputs']))},\n"
            f"  output_schema   = {q(schema_json(e['outputs']))},\n"
            f"  how_it_works    = {q(e['how'])},\n"
            f"  usage_tips      = {q(e['tips'])},\n"
            f"  historical_note = {q(e['hist'])}\n"
            f"WHERE slug = {q(slug)} AND is_custom = 0;\n"
        )
    return "\n".join(lines)


def main():
    errs = validate()
    if errs:
        print(f"{len(errs)} problema(s):")
        for e in errs:
            print("  -", e)
        sys.exit(1)
    print(f"OK — {len(ENTRIES)} técnicas conferidas contra worker_api/catalog.")
    if "--check" in sys.argv:
        return
    sql = build_sql()
    if "--init-mysql" in sys.argv:
        text = INIT_MYSQL.read_text(encoding="utf-8")
        block = f"{BEGIN}\n{sql}\n{END}\n"
        if BEGIN in text:
            pre, rest = text.split(BEGIN, 1)
            _, post = rest.split(END, 1)
            text = pre + block + "\n" + post.lstrip("\n")
        else:
            footer = "/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;"
            idx = text.rindex(footer)
            text = text[:idx] + block + "\n" + text[idx:]
        INIT_MYSQL.write_text(text, encoding="utf-8")
        print(f"bloco gerado gravado em {INIT_MYSQL}")
    else:
        OUT_SQL.write_text(sql, encoding="utf-8")
        print(f"escrito {OUT_SQL}")


if __name__ == "__main__":
    main()
