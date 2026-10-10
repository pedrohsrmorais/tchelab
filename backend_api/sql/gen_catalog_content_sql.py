# -*- coding: utf-8 -*-
"""
Lê catalog_content.json + actual_schemas.json, corrige nomes de porta que
divergem do schema real (algumas técnicas já tinham input_schema/output_schema
com chaves diferentes das que eu escrevi 'de memória' — ex: svd usa 'A' no meu
conteúdo mas o schema real usa 'X'), e gera o SQL de UPDATE idempotente.

Por quê a correção de nomes existe: técnicas com schema real NÃO VAZIO (parafac,
svd, autovalores/autovetores/eig, determinante, rank, trace, norma, transpose,
reshape, squeeze, expand_dims, mean/median/std/max/min/sum, folding, unfolding,
pca, pls_da) já tinham chaves de porta definidas por quem escreveu o schema
original — e nem sempre bateram com o nome que usei ao escrever o conteúdo.
Sem essa correção, JSON_MERGE_PATCH criaria uma porta FANTASMA (com descrição,
mas nunca populada em execução real) ao lado da porta real (sem descrição) —
o que confundiria qualquer um lendo o Catálogo. Técnicas com schema vazio
({}) não têm esse risco: o merge simplesmente cria o schema do zero.
"""
import json

content = json.load(open("catalog_content.json", encoding="utf-8"))
actual = json.load(open("actual_schemas.json", encoding="utf-8"))

# slug -> {"inputs": {old_key: new_key}, "outputs": {old_key: new_key}}
RENAME = {
    "pca":          {"outputs": {"explained_variance_ratio": "explained_variance"}},
    "svd":          {"inputs": {"X": "A"}},
    "autovalores":  {"outputs": {"eigenvalues": "result"}},
    "autovetores":  {"outputs": {"eigenvectors": "result"}},
    "eig":          {"outputs": {"eigenvalues": "autovalores", "eigenvectors": "autovetores"}},
    "determinante": {"outputs": {"det": "result"}},
    "rank":         {"outputs": {"rank": "result"}},
    "trace":        {"outputs": {"trace": "result"}},
    "norma":        {"inputs": {"A": "X"}, "outputs": {"norm": "result"}},
    "transpose":    {"inputs": {"A": "X"}, "outputs": {"A_t": "X_T"}},
    "reshape":      {"inputs": {"A": "X"}, "outputs": {"A_reshaped": "X_reshaped"}},
    "squeeze":      {"inputs": {"A": "X"}, "outputs": {"A_squeezed": "X_sq"}},
    "expand_dims":  {"inputs": {"A": "X"}, "outputs": {"A_expanded": "X_exp"}},
    "mean":         {"inputs": {"A": "X"}, "outputs": {"mean": "result"}},
    "median":       {"inputs": {"A": "X"}, "outputs": {"median": "result"}},
    "std":          {"inputs": {"A": "X"}, "outputs": {"std": "result"}},
    "max":          {"inputs": {"A": "X"}, "outputs": {"max": "result"}},
    "min":          {"inputs": {"A": "X"}, "outputs": {"min": "result"}},
    "sum":          {"inputs": {"A": "X"}, "outputs": {"sum": "result"}},
    "folding":      {"inputs": {"A": "X_unf"}, "outputs": {"tensor": "X"}},
    "unfolding":    {"outputs": {"X_unfolded": "X_unf"}},
}
# pls_da: 'predictions' não é uma porta real (só 'model' existe) — removida, não renomeada.
DROP_PORTS = {
    "pls_da": {"outputs": {"predictions"}},
}

def apply_fixes(slug, section, d):
    d = dict(d)
    ren = RENAME.get(slug, {}).get(section, {})
    for old, new in ren.items():
        if old in d:
            d[new] = d.pop(old)
    drop = DROP_PORTS.get(slug, {}).get(section, set())
    for k in drop:
        d.pop(k, None)
    return d

def esc(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

lines = []
lines.append("-- TcheLab — Conteúdo do módulo Catálogo (how_it_works, historical_note,")
lines.append("-- usage_tips) e enriquecimento de input_schema/output_schema com descrição")
lines.append("-- por porta, para as 75 técnicas ativas da versão beta.")
lines.append("--")
lines.append("-- Gerado a partir de backend_api/sql/catalog_content_source.py — não editar")
lines.append("-- este arquivo à mão, regenerar a partir da fonte.")
lines.append("--")
lines.append("-- Idempotente: cada UPDATE sobrescreve os mesmos valores, e")
lines.append("-- JSON_MERGE_PATCH com a chave já presente apenas substitui — rodar")
lines.append("-- de novo não duplica nem acumula.")
lines.append("SET NAMES utf8mb4;")
lines.append("")
lines.append("ALTER TABLE techniques")
lines.append("  ADD COLUMN IF NOT EXISTS how_it_works TEXT NULL COMMENT 'Explicação de como o método funciona, pro módulo Catálogo',")
lines.append("  ADD COLUMN IF NOT EXISTS historical_note TEXT NULL COMMENT 'Curiosidade histórica: quem criou, quando, contexto',")
lines.append("  ADD COLUMN IF NOT EXISTS usage_tips TEXT NULL COMMENT 'Orientação prática de uso (ex: pré-requisitos, quando usar)';")
lines.append("")

skipped_empty = []

for slug in sorted(content.keys()):
    c = content[slug]
    inputs = apply_fixes(slug, "inputs", c.get("inputs") or {})
    outputs = apply_fixes(slug, "outputs", c.get("outputs") or {})

    sets = []
    if c.get("how_it_works"):
        sets.append(f"how_it_works = {esc(c['how_it_works'])}")
    if c.get("historical_note"):
        sets.append(f"historical_note = {esc(c['historical_note'])}")
    if c.get("usage_tips"):
        sets.append(f"usage_tips = {esc(c['usage_tips'])}")

    if inputs:
        patch = json.dumps({k: {"description": v["description"]} for k, v in inputs.items()
                             if v.get("description")}, ensure_ascii=False)
        if patch != "{}":
            sets.append(f"input_schema = JSON_MERGE_PATCH(COALESCE(input_schema, '{{}}'), {esc(patch)})")
    if outputs:
        patch = json.dumps({k: {"description": v["description"]} for k, v in outputs.items()
                             if v.get("description")}, ensure_ascii=False)
        if patch != "{}":
            sets.append(f"output_schema = JSON_MERGE_PATCH(COALESCE(output_schema, '{{}}'), {esc(patch)})")

    if not sets:
        skipped_empty.append(slug)
        continue

    lines.append(f"UPDATE techniques SET {', '.join(sets)} WHERE slug = {esc(slug)};")

sql = "\n".join(lines) + "\n"
open("catalog_content.sql", "w", encoding="utf-8").write(sql)
print(f"Gerado catalog_content.sql com {len(content) - len(skipped_empty)} UPDATEs.")
if skipped_empty:
    print("Slugs sem nenhum conteúdo pra aplicar (deve ser só kennard_stone):", skipped_empty)
