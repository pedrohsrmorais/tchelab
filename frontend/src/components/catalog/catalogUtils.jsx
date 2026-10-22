import React from 'react';
import { getPorts } from '../../config/techniqueRegistry';

/** Tipos de dado (sem repetição) das portas de um schema: ['matrix', 'vector']. */
export function typesOf(schema) {
  const seen = [];
  for (const p of getPorts(schema)) if (p.type && !seen.includes(p.type)) seen.push(p.type);
  return seen;
}

/** Chave i18n do rótulo de um tipo de porta ('*' vira 'any'). */
export const portTypeKey = (type) => `catalog.portType.${type === '*' ? 'any' : type}`;

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Destaca (com <mark>) as ocorrências de `q` em `text`, ignorando acentos e maiúsculas. */
export function highlight(text, q) {
  const query = norm(q.trim());
  if (!query || !text) return text;
  const src = String(text);
  const n = norm(src);
  // normalização NFD pode mudar o comprimento (acentos compostos): só destaca se os índices batem
  if (n.length !== src.length) return text;
  const out = []; let i = 0; let k = 0;
  for (let at = n.indexOf(query, i); at !== -1; at = n.indexOf(query, i)) {
    if (at > i) out.push(src.slice(i, at));
    out.push(<mark key={k++} className="cat-mark">{src.slice(at, at + query.length)}</mark>);
    i = at + query.length;
  }
  if (i < src.length) out.push(src.slice(i));
  return out;
}

/** Texto que a busca considera: nome, identificador, descrição, subcategoria e tags. */
export function searchBlob(t, subLabel) {
  let tags = [];
  try { tags = Array.isArray(t.tags) ? t.tags : JSON.parse(t.tags || '[]'); } catch { /* sem tags */ }
  return norm([t.name, t.slug, t.description, subLabel, ...tags].filter(Boolean).join(' '));
}
