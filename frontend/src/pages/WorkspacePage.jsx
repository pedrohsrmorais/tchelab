/**
 * WorkspacePage — Módulo Workspace estilo MATLAB para TcheLab.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Toolbar: [Import] [Clear]  [técnica ▼] [▶ Run]                 │
 *   ├─────────────┬────────────────────────────────────────────────────┤
 *   │ Variable    │  Operation / Preview panel                         │
 *   │ Browser     │                                                    │
 *   │             │                                                    │
 *   ├─────────────┴────────────────────────────────────────────────────┤
 *   │  >> console history (MATLAB-like)                                │
 *   └──────────────────────────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import client from '../api/client';
import {
  Play, Trash2, Plus, Eye, Terminal, RefreshCw,
  X, ChevronDown, ChevronRight, AlertCircle,
  Table2, Layers, Hash, Clock, Search,
  Upload, FileText, Braces,
} from 'lucide-react';

// ─── Utilitários ──────────────────────────────────────────────────────────────

function parseJson(v, fb = null) {
  if (v == null) return fb;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

/** Formata dimensões como "100×5" ou "4×1×3" */
function fmtDims(dims) {
  if (!Array.isArray(dims) || !dims.length) return '—';
  return dims.join('×');
}

/** Formata o tipo em sigla MATLAB-like */
function fmtType(dataType) {
  const map = { matrix: 'double', tensor: 'tensor', spectral: 'spectral', tabular: 'table' };
  return map[dataType] || dataType || 'double';
}

/** Extrai preview de valor de um tensor (primeiros 4 números) */
function tensorPreview(metadata) {
  try {
    const meta = parseJson(metadata, {});
    const t = meta?.data?.tensor ?? meta?.data?.matrix;
    if (!t) return null;
    const flat = Array.isArray(t[0]) ? t.flat(Infinity) : t;
    const nums = flat.slice(0, 4).map(n => {
      if (typeof n !== 'number') return '?';
      return Math.abs(n) < 0.01 ? n.toExponential(2) : n.toPrecision(4);
    });
    return nums.join(', ') + (flat.length > 4 ? '...' : '');
  } catch { return null; }
}

/** Analisa texto "1,2,3;4,5,6" e retorna { tensor, dimensions } */
function parseInlineData(text) {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  const rowTexts = cleaned.split(';').map(r => r.trim()).filter(Boolean);
  if (!rowTexts.length) return null;
  const rows = rowTexts.map(r =>
    r.split(',').map(v => {
      const n = parseFloat(v.trim());
      if (isNaN(n)) throw new Error(`Valor inválido: "${v.trim()}"`);
      return n;
    })
  );
  if (rows.length === 1) {
    return { tensor: rows[0], dimensions: [rows[0].length] };
  }
  const cols = rows[0].length;
  if (!rows.every(r => r.length === cols)) throw new Error('Número de colunas inconsistente entre as linhas.');
  return { tensor: rows, dimensions: [rows.length, cols] };
}

/** Formata elapsed ms */
function fmtMs(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const POLL_INTERVAL = 1200;
const MAX_POLL = 120;

// ─── Estilos compartilhados ──────────────────────────────────────────────────

const S = {
  panelHeader: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    padding: '0.5rem 0.75rem 0.25rem',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    background: 'var(--bg-surface)',
    userSelect: 'none',
  },
  btn: (variant = 'default', active = false) => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.35rem 0.75rem',
    fontSize: '0.78rem', fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    border: variant === 'primary' ? 'none' : '1px solid var(--border)',
    background: variant === 'primary' ? 'var(--accent)' : active ? 'var(--bg-hover)' : 'var(--bg-elevated)',
    color: variant === 'primary' ? '#fff' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.12s, opacity 0.12s',
    whiteSpace: 'nowrap',
  }),
  btnIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0.3rem', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  label: {
    fontSize: '0.72rem', fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '0.25rem',
    display: 'block',
  },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.375rem 0.5rem',
    fontSize: '0.8rem',
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  select: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.375rem 0.5rem',
    fontSize: '0.8rem',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    outline: 'none',
    cursor: 'pointer',
  },
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

/** Linha de variável no browser */
function VarRow({ v, selected, onClick, onDelete }) {
  const dims = parseJson(v.dimensions, []);
  const preview = tensorPreview(v.metadata);

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{ padding: '0.3rem 0.4rem 0.3rem 0.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-accent)', whiteSpace: 'nowrap' }}>
        {v.name}
      </td>
      <td style={{ padding: '0.3rem 0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {fmtDims(dims)}
      </td>
      <td style={{ padding: '0.3rem 0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {fmtType(v.data_type)}
      </td>
      <td style={{ padding: '0.3rem 0.75rem 0.3rem 0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {preview}
      </td>
      <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right' }}>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ ...S.btnIcon, padding: '0.15rem', border: 'none', background: 'none' }}
          title="Remover variável"
        >
          <Trash2 size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
      </td>
    </tr>
  );
}

/** Painel de preview de uma variável selecionada */
function VariablePreview({ variable }) {
  const dims = parseJson(variable.dimensions, []);
  const meta = parseJson(variable.metadata, {});
  const tensor = meta?.data?.tensor ?? meta?.data?.matrix ?? null;

  const rows2D = useMemo(() => {
    if (!tensor) return null;
    if (!Array.isArray(tensor[0])) {
      return [tensor.slice(0, 12)]; // 1D → show as 1 row
    }
    return tensor.slice(0, 8).map(r => (Array.isArray(r) ? r.slice(0, 8) : [r]));
  }, [tensor]);

  return (
    <div style={{ padding: '0.875rem 1rem', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-accent)' }}>
          {variable.name}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
          {fmtDims(dims)} {fmtType(variable.data_type)}
        </span>
      </div>

      {rows2D && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <tbody>
              {rows2D.map((row, ri) => (
                <tr key={ri}>
                  <td style={{ padding: '0.2rem 0.5rem', color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--border)' }}>
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '0.2rem 0.65rem', textAlign: 'right', color: 'var(--text-primary)', borderRight: '1px solid var(--border)' }}>
                      {typeof cell === 'number' ? (Math.abs(cell) < 0.001 ? cell.toExponential(3) : cell.toPrecision(5)) : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(dims[0] > 8 || dims[1] > 8) && (
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Mostrando até 8×8 de {fmtDims(dims)}
            </p>
          )}
        </div>
      )}

      {!rows2D && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sem dados numéricos para exibir.</p>
      )}
    </div>
  );
}

/** Editor de parâmetros a partir do parameter_schema */
function ParamEditor({ schema, values, onChange }) {
  if (!schema || !Object.keys(schema).length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {Object.entries(schema).map(([key, def]) => {
        const val = values[key] ?? def.default ?? '';
        return (
          <div key={key}>
            <label style={S.label}>
              {def.label || key}
              {def.required && <span style={{ color: 'var(--danger)' }}> *</span>}
            </label>
            {def.type === 'enum' ? (
              <select
                style={S.select}
                value={val}
                onChange={e => onChange({ ...values, [key]: e.target.value })}
              >
                {(def.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : def.type === 'boolean' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[true, false].map(bv => (
                  <button
                    key={String(bv)}
                    style={{ ...S.btn('default', val === bv), flex: 1 }}
                    onClick={() => onChange({ ...values, [key]: bv })}
                    type="button"
                  >
                    {bv ? 'true' : 'false'}
                  </button>
                ))}
              </div>
            ) : (
              <input
                style={S.input}
                type={def.type === 'integer' || def.type === 'float' ? 'number' : 'text'}
                step={def.type === 'float' ? 'any' : 1}
                min={def.min}
                max={def.max}
                value={val}
                onChange={e => {
                  const raw = e.target.value;
                  const num = def.type === 'integer' ? parseInt(raw, 10) : def.type === 'float' ? parseFloat(raw) : raw;
                  onChange({ ...values, [key]: isNaN(num) ? raw : num });
                }}
              />
            )}
            {def.description && (
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{def.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Linha no console history */
function ConsoleLine({ entry }) {
  const statusColor = entry.status === 'ok' ? 'var(--success)' : entry.status === 'error' ? 'var(--danger)' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', padding: '0.15rem 0' }}>
      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', flexShrink: 0 }}>&gt;&gt;</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all' }}>
        {entry.cmd}
      </span>
      {entry.info && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          [{entry.info}]
        </span>
      )}
      {entry.ms && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{entry.ms}</span>
      )}
      <span style={{ fontSize: '0.68rem', color: statusColor, flexShrink: 0 }}>
        {entry.status === 'ok' ? '✓' : entry.status === 'error' ? '✗' : '…'}
      </span>
    </div>
  );
}

// ─── Modal de Import ─────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }) {
  const [tab, setTab] = useState('inline');   // 'inline' | 'csv'
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  async function submit() {
    setError('');
    const varName = name.trim();
    if (!varName) return setError('Dê um nome à variável.');

    setLoading(true);
    try {
      if (tab === 'inline') {
        if (!raw.trim()) { setError('Insira os dados.'); setLoading(false); return; }
        let parsed;
        try { parsed = parseInlineData(raw); } catch (e) { setError(e.message); setLoading(false); return; }
        await client.post('/datasets/import', {
          name: varName,
          tensor: parsed.tensor,
          dimensions: parsed.dimensions,
        });
      } else {
        if (!file) { setError('Selecione um arquivo.'); setLoading(false); return; }
        const form = new FormData();
        form.append('file', file);
        form.append('name', varName);
        await client.post('/datasets/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onImported(varName);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Erro ao importar.');
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
        width: 460, maxWidth: '95vw',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Importar Variável</span>
          <button onClick={onClose} style={{ ...S.btnIcon, border: 'none', background: 'none' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Nome */}
          <div>
            <label style={S.label}>Nome da variável</label>
            <input
              style={S.input}
              placeholder="ex: X"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              autoFocus
            />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            {[{ id: 'inline', icon: Braces, label: 'Inline' }, { id: 'csv', icon: FileText, label: 'CSV / arquivo' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ ...S.btn('default', tab === t.id), border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent' }}>
                <t.icon size={12} />{t.label}
              </button>
            ))}
          </div>

          {tab === 'inline' && (
            <div>
              <label style={S.label}>Dados (vírgula = colunas, ponto-e-vírgula = linhas)</label>
              <textarea
                style={{ ...S.input, height: 80, resize: 'vertical' }}
                placeholder={'1, 2, 3, 4\n% ou para 2D:\n1, 2; 3, 4'}
                value={raw}
                onChange={e => setRaw(e.target.value)}
              />
              <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Ex: <code style={{ background: 'var(--bg-hover)', padding: '0 3px', borderRadius: 2 }}>1,2,3,4</code> → vetor 1×4 &nbsp;|&nbsp;
                <code style={{ background: 'var(--bg-hover)', padding: '0 3px', borderRadius: 2 }}>1,2;3,4</code> → matriz 2×2
              </p>
            </div>
          )}

          {tab === 'csv' && (
            <div>
              <label style={S.label}>Arquivo CSV ou JSON</label>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '1.25rem', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-base)' }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={20} style={{ color: 'var(--text-muted)', marginBottom: 6 }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {file ? file.name : 'Clique para selecionar'}
                </p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.json" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem' }}>
              <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <button style={S.btn()} onClick={onClose}>Cancelar</button>
          <button
            style={{ ...S.btn('primary'), opacity: loading ? 0.6 : 1 }}
            onClick={submit}
            disabled={loading}
          >
            {loading ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { theme } = useTheme();

  // Dados
  const [variables, setVariables]     = useState([]);
  const [techniques, setTechniques]   = useState([]);
  const [loadingVars, setLoadingVars] = useState(true);

  // Seleção e operação
  const [selectedVar, setSelectedVar]         = useState(null);   // { uuid, name, ... }
  const [selectedTech, setSelectedTech]       = useState(null);   // técnica completa
  const [techFilter, setTechFilter]           = useState('');
  const [techDropOpen, setTechDropOpen]       = useState(false);
  const [inputBindings, setInputBindings]     = useState({});     // { portName: varUuid }
  const [params, setParams]                   = useState({});
  const [outputNames, setOutputNames]         = useState({});     // { portName: varName }
  const [runningOp, setRunningOp]             = useState(null);   // { op_id, cmd, startMs }

  // UI state
  const [showImport, setShowImport]   = useState(false);
  const [varFilter, setVarFilter]     = useState('');
  const [history, setHistory]         = useState([]);
  const [activePanel, setActivePanel] = useState('operation'); // 'operation' | 'preview'

  const pollRef    = useRef(null);
  const consoleRef = useRef(null);
  const techDropRef = useRef(null);

  // ── Carrega variáveis ────────────────────────────────────────────────────────
  const loadVars = useCallback(async () => {
    try {
      setLoadingVars(true);
      const res = await client.get('/datasets');
      const all = res.data?.data ?? res.data ?? [];
      setVariables(all.filter(d => !d.deleted_at));
    } catch { /* silencioso */ } finally { setLoadingVars(false); }
  }, []);

  // ── Carrega técnicas ─────────────────────────────────────────────────────────
  const loadTechs = useCallback(async () => {
    try {
      const res = await client.get('/techniques?limit=500');
      const all = res.data?.data ?? res.data ?? [];
      setTechniques(all);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    loadVars();
    loadTechs();
  }, [loadVars, loadTechs]);

  // Fecha dropdown de técnica ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (techDropRef.current && !techDropRef.current.contains(e.target)) setTechDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll console ao fim
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [history]);

  // ── Quando muda técnica, inicializa params/outputs ──────────────────────────
  useEffect(() => {
    if (!selectedTech) { setParams({}); setOutputNames({}); setInputBindings({}); return; }
    const schema = parseJson(selectedTech.parameter_schema, {});
    const defaults = {};
    Object.entries(schema).forEach(([k, def]) => { if (def.default !== undefined) defaults[k] = def.default; });
    setParams(defaults);

    const outSchema = parseJson(selectedTech.output_schema, {});
    const outNames = {};
    const techSlug = selectedTech.slug || '';
    Object.keys(outSchema).forEach((k, i) => {
      outNames[k] = i === 0 ? `${techSlug.split('_')[0]}_out` : `${techSlug.split('_')[0]}_${k}`;
    });
    setOutputNames(outNames);

    // Reset input bindings; se houver variável selecionada, pré-vincula
    const inSchema = parseJson(selectedTech.input_schema, {});
    const bindings = {};
    Object.keys(inSchema).forEach((k, i) => {
      if (i === 0 && selectedVar) bindings[k] = selectedVar.uuid;
    });
    setInputBindings(bindings);
  }, [selectedTech, selectedVar]);

  // ── Delete variável ──────────────────────────────────────────────────────────
  async function deleteVar(v) {
    if (!window.confirm(`Remover variável "${v.name}" do workspace?`)) return;
    try {
      await client.delete(`/datasets/${v.uuid}`);
      setVariables(vs => vs.filter(x => x.uuid !== v.uuid));
      if (selectedVar?.uuid === v.uuid) setSelectedVar(null);
      addHistory({ cmd: `clear ${v.name}`, status: 'ok' });
    } catch (e) {
      addHistory({ cmd: `clear ${v.name}`, status: 'error', info: e.response?.data?.message || 'Erro' });
    }
  }

  // ── Executa operação ─────────────────────────────────────────────────────────
  async function runOperation() {
    if (!selectedTech) return;
    const inSchema = parseJson(selectedTech.input_schema, {});
    const inKeys = Object.keys(inSchema);
    const primaryKey = inKeys[0] || 'X';
    const primaryVarId = inputBindings[primaryKey];

    if (!primaryVarId) {
      addHistory({ cmd: `${selectedTech.slug}(?)`, status: 'error', info: `Vincula a entrada "${primaryKey}"` });
      return;
    }

    const primaryVar = variables.find(v => v.uuid === primaryVarId);
    if (!primaryVar) return;

    // Monta extra_inputs
    const extra_inputs = {};
    inKeys.slice(1).forEach(k => {
      const varId = inputBindings[k];
      if (varId) extra_inputs[k] = { type: 'dataset', dataset_id: varId };
    });

    // Nome do workflow: "workspace_<slug>_<timestamp>"
    const ts = Date.now();
    const wfName = `workspace_${selectedTech.slug}_${ts}`;

    // Nome da variável de saída (usa o primeiro output)
    const outKeys = Object.keys(parseJson(selectedTech.output_schema, {}));
    const firstOutName = outputNames[outKeys[0]] || `${selectedTech.slug}_out`;

    // Monta cmd para console
    const inStr = inKeys.map(k => {
      const v = variables.find(x => x.uuid === inputBindings[k]);
      return v?.name || '?';
    }).join(', ');
    const paramStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ');
    const cmd = `${firstOutName} = ${selectedTech.slug}(${inStr}${paramStr ? ', ' + paramStr : ''})`;

    const histId = ts;
    addHistory({ id: histId, cmd, status: 'pending' });

    try {
      const res = await client.post(`/datasets/${primaryVarId}/operations`, {
        technique_id: selectedTech.uuid,
        params,
        workflow_name: wfName,
        save_mode: 'new_dataset',
        new_dataset_name: firstOutName,
        extra_inputs,
      });
      const opId = res.data?.data?.operation_id;
      setRunningOp({ op_id: opId, histId, startMs: Date.now(), firstOutName, cmd });
      startPolling(opId, histId, Date.now(), firstOutName);
    } catch (e) {
      const msg = e.response?.data?.errors?.[0]?.message || e.response?.data?.message || e.message;
      updateHistory(histId, { status: 'error', info: msg });
      setRunningOp(null);
    }
  }

  function startPolling(opId, histId, startMs, outName) {
    let count = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      count++;
      if (count > MAX_POLL) {
        clearInterval(pollRef.current);
        updateHistory(histId, { status: 'error', info: 'Timeout' });
        setRunningOp(null);
        return;
      }
      try {
        const r = await client.get(`/operations/${opId}`);
        const op = r.data?.data ?? r.data;
        const status = op?.execution_status || op?.status;
        if (status === 'completed' || status === 'done') {
          clearInterval(pollRef.current);
          const elapsed = Date.now() - startMs;
          await loadVars();
          updateHistory(histId, { status: 'ok', ms: fmtMs(elapsed) });
          setRunningOp(null);
        } else if (status === 'failed' || status === 'error') {
          clearInterval(pollRef.current);
          updateHistory(histId, { status: 'error', info: op?.error_message || 'Falha' });
          setRunningOp(null);
        }
      } catch { /* continua polling */ }
    }, POLL_INTERVAL);
  }

  function addHistory(entry) {
    setHistory(h => [...h, { id: entry.id || Date.now() + Math.random(), ...entry }]);
  }
  function updateHistory(id, patch) {
    setHistory(h => h.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  // ── Filtragem ─────────────────────────────────────────────────────────────────
  const filteredVars = useMemo(() =>
    variables.filter(v => !varFilter || v.name.toLowerCase().includes(varFilter.toLowerCase())),
    [variables, varFilter]
  );

  const filteredTechs = useMemo(() => {
    const q = techFilter.toLowerCase();
    return techniques.filter(t => !q || t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q) || t.family?.includes(q));
  }, [techniques, techFilter]);

  // Agrupa técnicas por família para o dropdown
  const techsByFamily = useMemo(() => {
    const groups = {};
    filteredTechs.forEach(t => {
      const fam = t.family || 'outros';
      if (!groups[fam]) groups[fam] = [];
      groups[fam].push(t);
    });
    return groups;
  }, [filteredTechs]);

  // ── Schemas da técnica selecionada ─────────────────────────────────────────
  const inSchema  = selectedTech ? parseJson(selectedTech.input_schema, {}) : {};
  const outSchema = selectedTech ? parseJson(selectedTech.output_schema, {}) : {};
  const paramSchema = selectedTech ? parseJson(selectedTech.parameter_schema, {}) : {};

  // ── CSS do workspace (classic overrides) ──────────────────────────────────
  const isClassic = theme === 'classic';

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: 'var(--bg-base)',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Toolbar estilo MATLAB ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.45rem 0.875rem',
        background: isClassic ? '#d4d0c8' : 'var(--bg-surface)',
        borderBottom: isClassic ? '2px solid #aca899' : '1px solid var(--border)',
        flexShrink: 0,
        boxShadow: isClassic ? 'inset 0 -1px 0 #fff' : 'none',
      }}>
        {/* Logo/title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <Table2 size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', letterSpacing: isClassic ? 0 : '-0.01em' }}>
            Workspace
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 0.25rem' }} />

        {/* Import */}
        <button
          style={S.btn('default')}
          onClick={() => setShowImport(true)}
          title="Importar nova variável"
        >
          <Plus size={12} /> Importar
        </button>

        {/* Refresh */}
        <button
          style={{ ...S.btnIcon, opacity: loadingVars ? 0.5 : 1 }}
          onClick={loadVars}
          title="Recarregar variáveis"
        >
          <RefreshCw size={13} style={{ animation: loadingVars ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Indicator quando rodando */}
        {runningOp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', animation: 'pulse 1.2s infinite' }} />
            Executando…
          </div>
        )}

        {/* Tag de tema */}
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
          {theme}
        </span>
      </div>

      {/* ── Body: 3 painéis ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Painel esquerdo: Variable Browser ────────────────────────────────── */}
        <div style={{
          width: 270, flexShrink: 0,
          borderRight: `1px solid var(--border)`,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            ...S.panelHeader,
            background: isClassic ? '#d4d0c8' : 'var(--bg-surface)',
            borderBottom: isClassic ? '1px solid #aca899' : '1px solid var(--border)',
          }}>
            <Layers size={11} />
            WORKSPACE
            <span style={{ marginLeft: 'auto', fontWeight: 400, opacity: 0.6 }}>{variables.length} var</span>
          </div>

          {/* Search */}
          <div style={{ padding: '0.375rem 0.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.5rem' }}>
              <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                placeholder="filtrar..."
                value={varFilter}
                onChange={e => setVarFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{
                  background: isClassic ? '#4a90d9' : 'var(--bg-elevated)',
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  {['Nome', 'Tamanho', 'Tipo', 'Valor', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: i === 0 ? '0.3rem 0.4rem 0.3rem 0.75rem' : '0.3rem 0.4rem',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: isClassic ? '#fff' : 'var(--text-muted)',
                      textAlign: 'left', letterSpacing: '0.04em',
                      borderBottom: `1px solid ${isClassic ? '#357abd' : 'var(--border)'}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingVars && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Carregando…</td></tr>
                )}
                {!loadingVars && filteredVars.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '1.25rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Workspace vazio.<br />
                      <span style={{ fontSize: '0.68rem' }}>Clique em <b>Importar</b> para adicionar variáveis.</span>
                    </td>
                  </tr>
                )}
                {filteredVars.map(v => (
                  <VarRow
                    key={v.uuid}
                    v={v}
                    selected={selectedVar?.uuid === v.uuid}
                    onClick={() => {
                      setSelectedVar(v);
                      setActivePanel(selectedTech ? 'operation' : 'preview');
                    }}
                    onDelete={() => deleteVar(v)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Painel central: Operação / Preview ──────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Sub-tabs */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '0 0.75rem',
            background: isClassic ? '#d4d0c8' : 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0, gap: 0,
          }}>
            {[
              { id: 'operation', label: 'Operação', icon: Play },
              { id: 'preview', label: 'Preview', icon: Eye },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                style={{
                  ...S.btn('default'),
                  border: 'none', borderBottom: activePanel === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  borderRadius: 0,
                  background: 'none',
                  color: activePanel === tab.id ? 'var(--text-accent)' : 'var(--text-muted)',
                  fontWeight: activePanel === tab.id ? 600 : 400,
                  padding: '0.5rem 0.75rem',
                }}
              >
                <tab.icon size={11} />{tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

            {/* ── Preview ─────────────────────────────────────────────────────── */}
            {activePanel === 'preview' && (
              <div>
                {selectedVar
                  ? <VariablePreview variable={selectedVar} />
                  : <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      Selecione uma variável no painel esquerdo.
                    </div>
                }
              </div>
            )}

            {/* ── Operação ────────────────────────────────────────────────────── */}
            {activePanel === 'operation' && (
              <div style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Técnica */}
                <div ref={techDropRef} style={{ position: 'relative' }}>
                  <label style={S.label}>Técnica / Função</label>
                  <button
                    onClick={() => setTechDropOpen(v => !v)}
                    style={{
                      ...S.select, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.375rem 0.5rem', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <span style={{ color: selectedTech ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {selectedTech ? `${selectedTech.slug} — ${selectedTech.name}` : 'Selecione uma técnica…'}
                    </span>
                    <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </button>

                  {techDropOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                      maxHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Search size={11} style={{ color: 'var(--text-muted)' }} />
                        <input
                          autoFocus
                          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                          placeholder="buscar técnica…"
                          value={techFilter}
                          onChange={e => setTechFilter(e.target.value)}
                        />
                      </div>
                      <div style={{ overflowY: 'auto' }}>
                        {Object.entries(techsByFamily).map(([fam, techs]) => (
                          <div key={fam}>
                            <div style={{ padding: '0.35rem 0.65rem', fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', background: 'var(--bg-base)', position: 'sticky', top: 0 }}>
                              {fam.replace(/^\d+_/, '').toUpperCase()}
                            </div>
                            {techs.map(t => (
                              <button
                                key={t.uuid}
                                onClick={() => { setSelectedTech(t); setTechDropOpen(false); setTechFilter(''); setActivePanel('operation'); }}
                                style={{
                                  width: '100%', textAlign: 'left',
                                  padding: '0.35rem 0.875rem',
                                  background: selectedTech?.uuid === t.uuid ? 'var(--bg-hover)' : 'none',
                                  border: 'none', cursor: 'pointer',
                                  display: 'flex', alignItems: 'baseline', gap: '0.5rem',
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { if (selectedTech?.uuid !== t.uuid) e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                                onMouseLeave={e => { if (selectedTech?.uuid !== t.uuid) e.currentTarget.style.background = 'none'; }}
                              >
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-accent)', flexShrink: 0 }}>{t.slug}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                        {!filteredTechs.length && (
                          <p style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>Nenhuma técnica encontrada.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Inputs */}
                {selectedTech && Object.keys(inSchema).length > 0 && (
                  <div>
                    <label style={{ ...S.label, marginBottom: '0.5rem' }}>Entradas</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {Object.entries(inSchema).map(([key, def]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-accent)', fontWeight: 600, minWidth: 40 }}>{key}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{def.type}</span>
                          <select
                            style={{ ...S.select, flex: 1 }}
                            value={inputBindings[key] || ''}
                            onChange={e => setInputBindings(b => ({ ...b, [key]: e.target.value }))}
                          >
                            <option value="">— selecionar variável —</option>
                            {variables.map(v => {
                              const dims = parseJson(v.dimensions, []);
                              return (
                                <option key={v.uuid} value={v.uuid}>
                                  {v.name} [{fmtDims(dims)} {fmtType(v.data_type)}]
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parâmetros */}
                {selectedTech && Object.keys(paramSchema).length > 0 && (
                  <div>
                    <label style={{ ...S.label, marginBottom: '0.5rem' }}>Parâmetros</label>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.625rem 0.75rem' }}>
                      <ParamEditor schema={paramSchema} values={params} onChange={setParams} />
                    </div>
                  </div>
                )}

                {/* Saídas */}
                {selectedTech && Object.keys(outSchema).length > 0 && (
                  <div>
                    <label style={{ ...S.label, marginBottom: '0.5rem' }}>Nome(s) da(s) saída(s)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {Object.keys(outSchema).map(k => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 60 }}>{k} =</span>
                          <input
                            style={{ ...S.input, flex: 1 }}
                            placeholder={`nome_variavel`}
                            value={outputNames[k] || ''}
                            onChange={e => setOutputNames(o => ({ ...o, [k]: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Run button */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    style={{
                      ...S.btn('primary'),
                      opacity: (!selectedTech || !!runningOp) ? 0.5 : 1,
                      fontSize: '0.825rem',
                      padding: '0.45rem 1.25rem',
                    }}
                    onClick={runOperation}
                    disabled={!selectedTech || !!runningOp}
                  >
                    <Play size={13} />
                    {runningOp ? 'Executando…' : 'Executar'}
                  </button>
                  {selectedTech && (
                    <button style={S.btn()} onClick={() => { setSelectedTech(null); setParams({}); setInputBindings({}); }}>
                      <X size={11} /> Limpar
                    </button>
                  )}
                  {!selectedTech && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Selecione uma técnica e configure as entradas para executar.
                    </span>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* ── Console (history) ─────────────────────────────────────────────── */}
          <div style={{
            height: 150, flexShrink: 0,
            borderTop: `1px solid ${isClassic ? '#aca899' : 'var(--border)'}`,
            background: isClassic ? '#1e1e1e' : '#0d1117',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Console header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              background: isClassic ? '#2d2d2d' : '#161b22',
              borderBottom: `1px solid ${isClassic ? '#444' : '#21262d'}`,
              flexShrink: 0,
            }}>
              <Terminal size={11} style={{ color: '#8b949e' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#8b949e', letterSpacing: '0.08em' }}>COMMAND WINDOW</span>
              <button
                onClick={() => setHistory([])}
                style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                limpar
              </button>
            </div>

            {/* Console body */}
            <div ref={consoleRef} style={{ flex: 1, overflowY: 'auto', padding: '0.375rem 0.75rem' }}>
              {history.length === 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#555', padding: '0.25rem 0' }}>
                  % TcheLab Workspace — pronto
                </div>
              )}
              {history.map(e => <ConsoleLine key={e.id} entry={e} />)}
              {/* Cursor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.15rem 0' }}>
                <span style={{ color: '#555', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>&gt;&gt;</span>
                <span style={{ display: 'inline-block', width: 7, height: 13, background: '#4b8eed', animation: 'blink 1.1s step-end infinite' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal import ─────────────────────────────────────────────────────── */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={(name) => {
            loadVars();
            addHistory({ cmd: `${name} = importdata(...)`, status: 'ok', info: 'importado' });
          }}
        />
      )}

      {/* ── CSS keyframes ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
