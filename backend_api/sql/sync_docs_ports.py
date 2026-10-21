#!/usr/bin/env python3
"""Sincroniza as linhas **Inputs:** / **Outputs:** / **Parâmetros:** de docs/catalogo_scripts.md
com a fonte da verdade (catalog_ports_source.ENTRIES + parameter_schema do seed).

Uso:  python3 sync_docs_ports.py [--params params.json] [--check]
  --params  JSON {slug: parameter_schema} (dump do banco). Sem ele, só Inputs/Outputs são tocados.
  --check   não escreve; sai com código 1 se a doc estiver desatualizada.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from catalog_ports_source import ENTRIES          # noqa: E402
from gen_catalog_ports_sql import DYNAMIC_OUTPUTS  # noqa: E402

DOC = HERE.parent.parent / "docs" / "catalogo_scripts.md"


def fmt_ports(ports):
    out = []
    for name, spec in ports.items():
        typ, opt = spec[0], len(spec) > 2 and spec[2] == "opt"
        extra = ", ".join(x for x in ([typ] if typ else []) + (["opcional"] if opt else []))
        out.append(f"`{name}`" + (f" ({extra})" if extra else ""))
    return ", ".join(out) if out else "—"


def fmt_param(name, d):
    d = d if isinstance(d, dict) else {}
    opts = d.get("enum") or d.get("options")
    if opts:
        return f"`{name}` ({' | '.join(str(o) for o in opts)})"
    return f"`{name}`" + (f" ({d['type']})" if d.get("type") else "")


def main():
    check = "--check" in sys.argv
    params = {}
    if "--params" in sys.argv:
        params = json.load(open(sys.argv[sys.argv.index("--params") + 1], encoding="utf-8"))
    text = DOC.read_text(encoding="utf-8")
    parts = re.split(r"(?m)^(?=## `)", text)
    changed = 0
    for i, sec in enumerate(parts):
        m = re.match(r"## `([^`]+)`", sec)
        if not m or m.group(1) not in ENTRIES:
            continue
        slug, e = m.group(1), ENTRIES[m.group(1)]
        new = {
            "Inputs": fmt_ports(e["inputs"]),
            "Outputs": fmt_ports(e["outputs"]) + (" (+ chaves dinâmicas)" if slug in DYNAMIC_OUTPUTS and slug != "kennard_stone" else ""),
        }
        if params.get(slug) is not None:
            new["Parâmetros"] = ", ".join(fmt_param(k, v) for k, v in params[slug].items()) or "—"
        for label, val in new.items():
            pat = re.compile(rf"(?m)^\*\*{label}:\*\* .*$")
            line = f"**{label}:** {val}  "
            if pat.search(sec):
                sec2 = pat.sub(lambda _m: line, sec, count=1)
            else:
                continue
            if sec2 != sec:
                sec, changed = sec2, changed + 1
        parts[i] = sec
    out = "".join(parts)
    if check:
        print("desatualizado" if out != text else "OK")
        sys.exit(1 if out != text else 0)
    DOC.write_text(out, encoding="utf-8")
    print(f"{changed} linhas atualizadas")


main()
