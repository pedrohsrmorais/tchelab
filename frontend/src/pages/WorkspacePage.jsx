/**
 * WorkspacePage — Interface estilo MATLAB para o TcheLab.
 *
 * Estrutura fiel ao MATLAB R2023:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  [Toolbar com grupos de ações]                                      │
 *   ├──────────────────────┬──────────────────────────────────────────────┤
 *   │  Workspace           │  Painel direito: Operação / Variable Editor  │
 *   │  ──────────────────  │                                              │
 *   │  Name  Value  Size…  │                                              │
 *   │  X     [1,2…  1×4   │                                              │
 *   │  Y     [3,4…  2×2   │                                              │
 *   │                      │                                              │
 *   ├──────────────────────┴──────────────────────────────────────────────┤
 *   │  Command Window  >>  cursor█                                        │
 *   └─────────────────────────────────────────────────────────────────────┘
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { api } from '../api';
import TechniqueModal from '../components/ui/TechniqueModal';
import {
  Play, Trash2, Plus, Eye, Terminal, RefreshCw,
  X, ChevronDown, Search, Upload, FileText,
  Braces, AlertCircle, Table2, Layers, TriangleAlert,
  FolderOpen, Save, Copy, ChevronRight, ArrowRight,
  Info, BookOpen, Zap, ChevronUp,
} from 'lucide-react';

// ─── Utils ────────────────────────────────────────────────────────────────────

const pj = (v, fb = null) => {
  if (v == null) return fb;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fb; }
};

const fmtDims = (dims) => {
  if (!Array.isArray(dims) || !dims.length) return '—';
  return dims.join('×');
};

const fmtBytes = (dims) => {
  if (!Array.isArray(dims) || !dims.length) return '—';
  const elems = dims.reduce((a, b) => a * b, 1);
  const bytes = elems * 8; // float64
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const fmtClass = (dataType) => {
  const m = { matrix: 'double', tensor: 'double', spectral: 'double', tabular: 'double' };
  return m[dataType] || 'double';
};

const fmtSizeMat = (dims) => {
  if (!Array.isArray(dims) || !dims.length) return '—';
  return dims.join('x'); // "100x5" like MATLAB
};

const tensorPreview = (metadata) => {
  try {
    const meta = pj(metadata, {});
    const t = meta?.data?.tensor ?? meta?.data?.matrix;
    if (!t) return null;
    const flat = Array.isArray(t[0]) ? t.flat(Infinity) : t;
    const nums = flat.slice(0, 5).map(n => {
      if (typeof n !== 'number') return '?';
      const abs = Math.abs(n);
      if (abs === 0) return '0';
      if (abs < 0.001 || abs >= 1e6) return n.toExponential(3);
      return parseFloat(n.toPrecision(5)).toString();
    });
    return '[' + nums.join(', ') + (flat.length > 5 ? ', …' : '') + ']';
  } catch { return null; }
};

/** Erro com chave i18n — traduzido por quem captura (ver ImportModal). */
const i18nError = (key, vars) => Object.assign(new Error(key), { i18n: [key, vars] });

const parseInline = (text) => {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  const rowTexts = cleaned.split(';').map(r => r.trim()).filter(Boolean);
  if (!rowTexts.length) return null;
  const rows = rowTexts.map(r =>
    r.split(',').map(v => {
      const n = parseFloat(v.trim());
      if (isNaN(n)) throw i18nError('workspace.invalidValue', { value: v.trim() });
      return n;
    })
  );
  if (rows.length === 1) return { tensor: rows[0], dimensions: [rows[0].length] };
  const cols = rows[0].length;
  if (!rows.every(r => r.length === cols)) throw i18nError('workspace.inconsistentCols');
  return { tensor: rows, dimensions: [rows.length, cols] };
};

const fmtMs = (ms) => {
  if (ms == null) return '';
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
};

const POLL_MS = 1200;
const MAX_POLLS = 120;

// ─── Tema / estilo helpers ─────────────────────────────────────────────────────

/**
 * Retorna estilos dependentes do tema atual.
 * classic → visual MATLAB R2023 clássico (Windows-like)
 * dark/light → design moderno do TcheLab
 */
function useWsStyles(theme) {
  const cl = theme === 'classic';
  const dk = theme === 'dark';

  return {
    // Toolbar principal
    toolbar: {
      display: 'flex', alignItems: 'center', gap: '0.25rem',
      padding: cl ? '3px 6px' : '0.4rem 0.75rem',
      background: cl
        ? '#f5f5f5'
        : 'var(--bg-surface)',
      borderBottom: cl ? '1px solid #aca899' : '1px solid var(--border)',
      flexShrink: 0,
      boxShadow: cl ? '0 1px 0 #fff inset' : 'none',
    },

    // Separador vertical na toolbar
    sep: {
      width: 1, height: 22,
      background: cl ? '#c8c8c8' : 'var(--border)',
      margin: '0 4px', flexShrink: 0,
    },

    // Botão toolbar (plano, estilo MATLAB)
    tbBtn: (active = false) => ({
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: cl ? '3px 8px' : '0.3rem 0.65rem',
      fontSize: cl ? '0.78rem' : '0.76rem',
      fontFamily: cl ? 'var(--font-sans)' : 'inherit',
      fontWeight: 500,
      border: cl
        ? (active ? '1px solid #0a5fa8' : '1px solid transparent')
        : '1px solid var(--border)',
      background: cl
        ? (active ? '#d6e6f5' : 'transparent')
        : (active ? 'var(--bg-hover)' : 'var(--bg-elevated)'),
      borderRadius: cl ? 2 : 'var(--radius-sm)',
      color: cl ? '#1a1a1a' : 'var(--text-secondary)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: cl ? 'none' : 'background 0.1s',
    }),

    // Panel header (title strip like MATLAB panel headers)
    panelHdr: {
      display: 'flex', alignItems: 'center', gap: '0.35rem',
      padding: cl ? '2px 8px' : '0.35rem 0.75rem',
      background: cl
        ? '#e6e6e6'
        : 'var(--bg-surface)',
      color: cl ? '#333' : 'var(--text-muted)',
      fontSize: cl ? '0.72rem' : '0.67rem',
      fontWeight: cl ? 700 : 700,
      letterSpacing: '0.06em',
      borderBottom: cl ? '1px solid #c8c8c8' : '1px solid var(--border)',
      flexShrink: 0,
      userSelect: 'none',
      textShadow: 'none',
    },

    // Tabela workspace
    tbl: {
      width: '100%', borderCollapse: 'collapse',
      fontFamily: 'var(--font-mono)',
    },
    tblHead: {
      background: cl ? '#f0f0f0' : 'var(--bg-elevated)',
      position: 'sticky', top: 0, zIndex: 1,
    },
    tblTh: (i) => ({
      padding: cl ? '3px 6px' : '0.28rem 0.5rem',
      fontSize: '0.67rem',
      fontWeight: 700,
      color: cl ? '#555' : 'var(--text-muted)',
      textAlign: 'left',
      letterSpacing: '0.04em',
      borderBottom: cl ? '1px solid #ccc' : '1px solid var(--border)',
      borderRight: cl && i < 4 ? '1px solid #ddd' : 'none',
      paddingLeft: i === 0 ? (cl ? 8 : '0.75rem') : undefined,
      whiteSpace: 'nowrap',
      fontFamily: cl ? 'var(--font-sans)' : 'inherit',
    }),

    // Linha de variável
    varRow: (selected) => ({
      cursor: 'pointer',
      background: selected
        ? (cl ? '#c2d8f0' : 'var(--bg-hover)')
        : 'transparent',
      borderBottom: `1px solid ${cl ? '#e8e8e8' : 'var(--border)'}`,
    }),
    varTd: (i, selected) => ({
      padding: cl ? '3px 6px' : '0.3rem 0.5rem',
      fontSize: cl ? '0.76rem' : '0.74rem',
      fontFamily: 'var(--font-mono)',
      color: i === 0
        ? (cl ? (selected ? '#003880' : '#003880') : 'var(--text-accent)')
        : (cl ? '#2a2a2a' : 'var(--text-secondary)'),
      fontWeight: i === 0 ? 600 : 400,
      paddingLeft: i === 0 ? (cl ? 8 : '0.75rem') : undefined,
      borderRight: cl && i < 4 ? '1px solid #e8e8e8' : 'none',
      whiteSpace: 'nowrap',
      maxWidth: i === 1 ? 100 : undefined,
      overflow: i === 1 ? 'hidden' : undefined,
      textOverflow: i === 1 ? 'ellipsis' : undefined,
    }),

    // Input/select
    input: {
      width: '100%', boxSizing: 'border-box',
      padding: cl ? '3px 6px' : '0.35rem 0.5rem',
      fontSize: cl ? '0.8rem' : '0.78rem',
      fontFamily: 'var(--font-mono)',
      background: cl ? '#fff' : 'var(--bg-base)',
      border: cl ? '1px solid #aaa' : '1px solid var(--border)',
      borderRadius: cl ? 1 : 'var(--radius-sm)',
      color: 'var(--text-primary)',
      outline: 'none',
      boxShadow: cl ? 'inset 0 1px 2px rgba(0,0,0,0.12)' : 'none',
    },
    select: {
      width: '100%', boxSizing: 'border-box',
      padding: cl ? '3px 6px' : '0.35rem 0.5rem',
      fontSize: cl ? '0.8rem' : '0.78rem',
      background: cl ? '#fff' : 'var(--bg-base)',
      border: cl ? '1px solid #aaa' : '1px solid var(--border)',
      borderRadius: cl ? 1 : 'var(--radius-sm)',
      color: 'var(--text-primary)',
      outline: 'none',
      cursor: 'pointer',
      boxShadow: cl ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
    },

    // Label
    label: {
      display: 'block',
      fontSize: cl ? '0.76rem' : '0.72rem',
      fontWeight: cl ? 600 : 600,
      color: cl ? '#333' : 'var(--text-secondary)',
      marginBottom: cl ? 3 : '0.25rem',
      fontFamily: cl ? 'var(--font-sans)' : 'inherit',
    },

    // Botão primário
    btnPrimary: (disabled = false) => ({
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: cl ? '4px 14px' : '0.38rem 1rem',
      fontSize: cl ? '0.8rem' : '0.8rem',
      fontWeight: 600,
      border: cl ? '1px solid #084d8a' : 'none',
      background: cl
        ? 'var(--accent)'
        : 'var(--accent)',
      borderRadius: cl ? 2 : 'var(--radius-sm)',
      color: '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      boxShadow: cl ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
      textShadow: 'none',
    }),

    btnSecondary: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: cl ? '4px 10px' : '0.35rem 0.7rem',
      fontSize: cl ? '0.78rem' : '0.77rem',
      fontWeight: 500,
      border: cl ? '1px solid #aaa' : '1px solid var(--border)',
      background: cl
        ? '#f5f5f5'
        : 'var(--bg-elevated)',
      borderRadius: cl ? 2 : 'var(--radius-sm)',
      color: cl ? '#333' : 'var(--text-secondary)',
      cursor: 'pointer',
      boxShadow: cl ? '0 1px 1px rgba(0,0,0,0.12)' : 'none',
    },

    // Painel de operação
    opPanel: {
      flex: 1, overflowY: 'auto',
      background: cl ? '#f5f5f5' : 'var(--bg-base)',
      padding: cl ? '10px 12px' : '0.875rem 1rem',
    },

    // Console
    console: {
      background: cl ? '#ffffff' : '#0d1117',
      color: cl ? '#1a1a1a' : '#c9d1d9',
    },
    consoleHdr: {
      background: cl ? '#f0f0f0' : '#161b22',
      borderBottom: cl ? '1px solid #c8c8c8' : '1px solid #21262d',
      padding: cl ? '3px 8px' : '0.3rem 0.75rem',
      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
    },
    consolePrompt: { color: cl ? '#1a1a1a' : '#7ee787' },  // laranja (MATLAB) ou verde
    consoleText: { color: cl ? '#1a1a1a' : '#c9d1d9' },
    consoleOk: { color: cl ? '#1f7a3d' : '#3fb950' },
    consoleErr: { color: cl ? '#d32f2f' : '#f85149' },
    consolePending: { color: cl ? '#777' : '#8b949e' },
  };
}

// ─── Componentes menores ───────────────────────────────────────────────────────

function ParamEditor({ schema, values, onChange, s }) {
  if (!schema || !Object.keys(schema).length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(schema).map(([key, def]) => {
        const val = values[key] ?? def.default ?? '';
        return (
          <div key={key}>
            <label style={s.label}>{def.label || key}{def.required && <span style={{ color: 'var(--danger)' }}> *</span>}</label>
            {def.type === 'enum' ? (
              <select style={s.select} value={val} onChange={e => onChange({ ...values, [key]: e.target.value })}>
                {(def.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : def.type === 'boolean' ? (
              <div style={{ display: 'flex', gap: 4 }}>
                {[true, false].map(bv => (
                  <button key={String(bv)} type="button"
                    style={{ ...s.btnSecondary, flex: 1, justifyContent: 'center', fontWeight: val === bv ? 700 : 400, color: val === bv ? 'var(--accent)' : undefined }}
                    onClick={() => onChange({ ...values, [key]: bv })}>
                    {String(bv)}
                  </button>
                ))}
              </div>
            ) : (
              <input style={s.input}
                type={def.type === 'integer' || def.type === 'float' ? 'number' : 'text'}
                step={def.type === 'float' ? 'any' : 1} min={def.min} max={def.max}
                value={val}
                onChange={e => {
                  const raw = e.target.value;
                  const num = def.type === 'integer' ? parseInt(raw, 10) : def.type === 'float' ? parseFloat(raw) : raw;
                  onChange({ ...values, [key]: isNaN(num) ? raw : num });
                }} />
            )}
            {def.description && <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{def.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ConsoleLine({ e, s }) {
  const statusColor = e.status === 'ok' ? s.consoleOk.color : e.status === 'error' ? s.consoleErr.color : s.consolePending.color;
  const mark = e.status === 'ok' ? '✓' : e.status === 'error' ? '✗' : '…';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '1px 0', lineHeight: 1.5 }}>
      <span style={{ ...s.consolePrompt, fontFamily: 'var(--font-mono)', fontSize: '0.73rem', flexShrink: 0 }}>&gt;&gt;</span>
      <span style={{ ...s.consoleText, fontFamily: 'var(--font-mono)', fontSize: '0.73rem', flex: 1, wordBreak: 'break-all' }}>{e.cmd}</span>
      {e.info && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#666', flexShrink: 0 }}>{e.info}</span>}
      {e.ms && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#666', flexShrink: 0 }}>{e.ms}</span>}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: statusColor, flexShrink: 0 }}>{mark}</span>
    </div>
  );
}

/** Preview da variável no estilo Variable Editor do MATLAB */
function VarEditor({ variable, s, theme }) {
  const { t: tr } = useTranslation();
  const cl = theme === 'classic';
  const dims = pj(variable.dimensions, []);
  const meta = pj(variable.metadata, {});
  const tensor = meta?.data?.tensor ?? meta?.data?.matrix ?? null;

  const rows2D = useMemo(() => {
    if (!tensor) return null;
    if (!Array.isArray(tensor[0])) return [tensor.slice(0, 20)];
    return tensor.slice(0, 12).map(r => (Array.isArray(r) ? r.slice(0, 12) : [r]));
  }, [tensor]);

  const colCount = rows2D?.[0]?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title bar */}
      <div style={{
        ...s.panelHdr,
        background: cl
          ? '#e6e6e6'
          : 'var(--bg-surface)',
        color: cl ? '#333' : 'var(--text-muted)',
      }}>
        <Table2 size={11} />
        {variable.name}
        <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.8 }}>— {fmtSizeMat(dims)} {fmtClass(variable.data_type)}</span>
      </div>

      {rows2D ? (
        <div style={{ flex: 1, overflowAuto: 'auto', overflow: 'auto' }}>
          <table style={{
            borderCollapse: 'collapse', fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            background: cl ? '#fff' : 'var(--bg-elevated)',
          }}>
            <thead>
              <tr>
                <th style={{ padding: cl ? '2px 6px' : '3px 8px', background: cl ? '#f0f0f0' : 'var(--bg-base)', color: 'var(--text-muted)', fontSize: '0.65rem', border: cl ? '1px solid #ddd' : '1px solid var(--border)', textAlign: 'center', fontFamily: cl ? 'var(--font-sans)' : 'inherit' }}></th>
                {Array.from({ length: colCount }, (_, i) => (
                  <th key={i} style={{ padding: cl ? '2px 10px' : '3px 12px', background: cl ? '#e8f0fb' : 'var(--bg-base)', color: cl ? '#2a4a80' : 'var(--text-muted)', fontSize: '0.67rem', border: cl ? '1px solid #c0d0e8' : '1px solid var(--border)', textAlign: 'center', fontWeight: 700, fontFamily: cl ? 'var(--font-sans)' : 'inherit' }}>
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows2D.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? (cl ? '#fff' : 'transparent') : (cl ? '#f8f8ff' : 'rgba(255,255,255,0.02)') }}>
                  <td style={{ padding: cl ? '2px 8px' : '2px 8px', color: cl ? '#2a4a80' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.67rem', textAlign: 'center', background: cl ? '#e8f0fb' : 'var(--bg-base)', border: cl ? '1px solid #c0d0e8' : '1px solid var(--border)', fontFamily: cl ? 'var(--font-sans)' : 'inherit' }}>
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: cl ? '2px 10px' : '2px 12px', textAlign: 'right', color: cl ? '#1a1a1a' : 'var(--text-primary)', border: cl ? '1px solid #e8e8e8' : '1px solid var(--border)' }}>
                      {typeof cell === 'number'
                        ? (Math.abs(cell) < 0.001 || Math.abs(cell) >= 1e6 ? cell.toExponential(4) : parseFloat(cell.toPrecision(6)).toString())
                        : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(dims[0] > 12 || (dims[1] && dims[1] > 12)) && (
            <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', padding: '4px 8px', background: cl ? '#f8f8f8' : 'transparent' }}>
              {tr('workspace.showingUpTo', { size: fmtSizeMat(dims) })}
            </p>
          )}
        </div>
      ) : (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          {tr('workspace.noNumeric')}
        </div>
      )}
    </div>
  );
}

// ─── Modal de Import ──────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported, s, theme }) {
  const { t: tr } = useTranslation();
  const cl = theme === 'classic';
  const [tab, setTab] = useState('inline');
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  async function submit() {
    setError('');
    const varName = name.trim();
    if (!varName) return setError(tr('workspace.needName'));
    setLoading(true);
    let created = null;
    try {
      if (tab === 'inline') {
        if (!raw.trim()) { setError(tr('workspace.needData')); setLoading(false); return; }
        let parsed;
        try { parsed = parseInline(raw); } catch (e) { setError(e.i18n ? tr(...e.i18n) : e.message); setLoading(false); return; }
        created = await client.post('/datasets/import', { name: varName, tensor: parsed.tensor, dimensions: parsed.dimensions });
      } else {
        if (!file) { setError(tr('workspace.needFile')); setLoading(false); return; }
        const form = new FormData();
        form.append('file', file);
        form.append('name', varName);
        created = await client.post('/datasets/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onImported(varName, created?.data?.data?.uuid);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error?.message || e.response?.data?.message || e.message || tr('workspace.importError'));
    } finally { setLoading(false); }
  }

  const overlayBg = cl ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.6)';
  const dlgBg = cl ? '#f5f5f5' : 'var(--bg-elevated)';
  const dlgBorder = cl ? '2px solid #aca899' : '1px solid var(--border)';
  const hdrBg = cl ? '#e6e6e6' : 'var(--bg-surface)';
  const hdrColor = cl ? '#333' : 'var(--text-primary)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: overlayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: cl ? 'none' : 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: dlgBg, border: dlgBorder, borderRadius: cl ? 2 : 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: 440, maxWidth: '95vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Title bar */}
        <div style={{ background: hdrBg, padding: cl ? '4px 10px' : '0.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: hdrColor, fontSize: cl ? '0.82rem' : '0.875rem', fontWeight: 700, textShadow: 'none', fontFamily: cl ? 'var(--font-sans)' : 'inherit' }}>
            {tr('workspace.importTitle')}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: hdrColor, cursor: 'pointer', opacity: 0.8, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: cl ? '12px' : '1rem', display: 'flex', flexDirection: 'column', gap: cl ? 10 : 14 }}>
          {/* Nome */}
          <div>
            <label style={s.label}>{tr('workspace.varName')}</label>
            <input style={s.input} placeholder={tr('workspace.varNamePh')} autoFocus
              value={name} onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${cl ? '#ccc' : 'var(--border)'}`, marginBottom: -1 }}>
            {[{ id: 'inline', label: tr('workspace.tabInline'), icon: Braces }, { id: 'csv', label: tr('workspace.tabFile'), icon: FileText }].map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: cl ? '4px 10px' : '5px 12px',
                fontSize: cl ? '0.77rem' : '0.75rem',
                background: tab === tb.id ? (cl ? '#fff' : 'var(--bg-elevated)') : 'transparent',
                border: cl ? `1px solid ${tab === tb.id ? '#ccc' : 'transparent'}` : 'none',
                borderBottom: tab === tb.id ? `2px solid ${cl ? '#4a7fbf' : 'var(--accent)'}` : '2px solid transparent',
                cursor: 'pointer',
                color: tab === tb.id ? (cl ? '#003880' : 'var(--text-accent)') : 'var(--text-muted)',
                fontWeight: tab === tb.id ? 700 : 400,
                borderRadius: cl ? '2px 2px 0 0' : 0,
                marginBottom: -1,
              }}>
                <tb.icon size={11} />{tb.label}
              </button>
            ))}
          </div>

          {tab === 'inline' && (
            <div>
              <label style={s.label}>{tr('workspace.data')}</label>
              <textarea style={{ ...s.input, height: 72, resize: 'vertical', fontFamily: 'var(--font-mono)' }}
                placeholder={tr('workspace.dataPh')}
                value={raw} onChange={e => setRaw(e.target.value)} />
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 3 }}>
                {tr('workspace.dataHint')}
              </p>
            </div>
          )}

          {tab === 'csv' && (
            <div>
              <label style={s.label}>{tr('workspace.fileLabel')}</label>
              <div onClick={() => fileRef.current?.click()} style={{
                border: cl ? '1px solid #aaa' : '2px dashed var(--border)',
                borderRadius: cl ? 2 : 'var(--radius-sm)',
                padding: '1rem', textAlign: 'center', cursor: 'pointer',
                background: cl ? '#fff' : 'var(--bg-base)',
              }}>
                <Upload size={18} style={{ color: 'var(--text-muted)', marginBottom: 4 }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{file ? file.name : tr('workspace.clickSelect')}</p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.json" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: cl ? 1 : 'var(--radius-sm)', padding: '6px 10px' }}>
              <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{error}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: cl ? '8px 12px' : '0.65rem 1rem', borderTop: cl ? '1px solid #ccc' : '1px solid var(--border)', background: cl ? '#ece8e0' : 'transparent' }}>
          <button style={s.btnSecondary} onClick={onClose}>{tr('common.cancel')}</button>
          <button style={s.btnPrimary(loading)} onClick={submit} disabled={loading}>
            {loading ? tr('workspace.importing') : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de info de técnica ────────────────────────────────────────────────

/** Renderiza a descrição completa de uma técnica: how_it_works, inputs, outputs, tips */
function TechInfoPanel({ tech, s, theme, onOpenModal }) {
  const { t } = useTranslation();
  const cl = theme === 'classic';
  const [collapsed, setCollapsed] = useState(false);

  if (!tech) return null;

  const iSchema = pj(tech.input_schema, {});
  const oSchema = pj(tech.output_schema, {});
  const isMatlabFn = (pj(tech.tags, []) || []).includes('matlab');

  const headerBg = cl
    ? '#f0f0f0'
    : 'var(--bg-elevated)';
  const borderColor = cl ? '#c8c8c8' : 'var(--border)';
  const codeBg = cl ? '#f8f8f8' : 'rgba(255,255,255,0.04)';
  const codeColor = cl ? '#003880' : 'var(--text-accent)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: cl ? 2 : 'var(--radius-sm)',
      overflow: 'hidden',
      background: cl ? '#fff' : 'var(--bg-card)',
      fontSize: '0.75rem',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: cl ? '5px 8px' : '6px 10px',
          background: headerBg,
          borderBottom: collapsed ? 'none' : `1px solid ${borderColor}`,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <BookOpen size={11} style={{ color: cl ? '#4a7fbf' : 'var(--text-accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '0.72rem', color: cl ? '#1a1a1a' : 'var(--text-primary)', flex: 1, fontFamily: cl ? 'var(--font-sans)' : 'inherit', letterSpacing: '0.04em' }}>
          {isMatlabFn ? '⚡ ' : ''}{tech.name}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, opacity: 0.6, marginLeft: 6, fontSize: '0.68rem' }}>
            {tech.slug}
          </span>
        </span>
        {collapsed
          ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          : <ChevronUp size={11} style={{ color: 'var(--text-muted)' }} />}
      </div>

      {!collapsed && (
        <div style={{ padding: cl ? '10px 10px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Description / how it works */}
          {(tech.how_it_works || tech.description) && (
            <div>
              <p style={{ margin: 0, lineHeight: 1.55, color: cl ? '#2a2a2a' : 'var(--text-secondary)', fontSize: '0.73rem' }}>
                {tech.how_it_works || tech.description}
              </p>
            </div>
          )}

          {/* Inputs */}
          {Object.keys(iSchema).length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.06em', color: cl ? '#4a7fbf' : 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                {t('workspace.techInputs')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(iSchema).map(([port, def]) => (
                  <div key={port} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <code style={{ background: codeBg, color: codeColor, padding: '1px 5px', borderRadius: cl ? 1 : 3, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', flexShrink: 0, fontWeight: 700 }}>
                      {port}
                    </code>
                    {def.type && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0, marginTop: 1, fontStyle: 'italic' }}>
                        {def.type}
                      </span>
                    )}
                    {def.description && (
                      <span style={{ color: cl ? '#555' : 'var(--text-secondary)', lineHeight: 1.45, fontSize: '0.72rem' }}>
                        — {def.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outputs */}
          {Object.keys(oSchema).length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.06em', color: cl ? '#2a7a40' : '#3fb950', marginBottom: 4, textTransform: 'uppercase' }}>
                {t('workspace.techOutputs')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(oSchema).map(([port, def]) => (
                  <div key={port} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <code style={{ background: codeBg, color: cl ? '#2a7a40' : '#3fb950', padding: '1px 5px', borderRadius: cl ? 1 : 3, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', flexShrink: 0, fontWeight: 700 }}>
                      {port}
                    </code>
                    {def.type && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0, marginTop: 1, fontStyle: 'italic' }}>
                        {def.type}
                      </span>
                    )}
                    {def.description && (
                      <span style={{ color: cl ? '#555' : 'var(--text-secondary)', lineHeight: 1.45, fontSize: '0.72rem' }}>
                        — {def.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {tech.usage_tips && (
            <div style={{
              background: cl ? '#fffbe6' : 'rgba(245,158,11,0.08)',
              border: cl ? '1px solid #e8d48a' : '1px solid rgba(245,158,11,0.25)',
              borderRadius: cl ? 2 : 'var(--radius-sm)',
              padding: '5px 8px',
              display: 'flex', gap: 6, alignItems: 'flex-start',
            }}>
              <Info size={11} style={{ color: cl ? '#c08000' : '#f59e0b', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: '0.71rem', color: cl ? '#7a5a00' : '#d97706', lineHeight: 1.5 }}>
                {tech.usage_tips}
              </p>
            </div>
          )}

          {/* Historical note */}
          {tech.historical_note && (
            <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-muted)', borderTop: `1px solid ${borderColor}`, paddingTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>
              📖 {tech.historical_note}
            </p>
          )}

          {/* Open full modal */}
          {onOpenModal && (
            <button
              onClick={onOpenModal}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                width: '100%', padding: '4px 0',
                background: 'none',
                border: `1px solid ${borderColor}`,
                borderRadius: cl ? 2 : 'var(--radius-sm)',
                cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                color: cl ? '#4a7fbf' : 'var(--text-accent)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              <Info size={11} /> {t('catalog.viewFullDetails')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { t: tr } = useTranslation();
  const { theme } = useTheme();
  const s = useWsStyles(theme);
  const cl = theme === 'classic';

  // <720px: painéis empilhados (variáveis em cima, operação embaixo) em vez de lado a lado.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [variables, setVariables]       = useState([]);
  const [techniques, setTechniques]     = useState([]);
  const [loadingVars, setLoadingVars]   = useState(true);

  // Escopo por projeto: o workspace mostra todas as variáveis do usuário ou só as de um projeto.
  const [projects, setProjects]   = useState([]);
  const [ownList, setOwnList]     = useState([]);
  const [projectId, setProjectId] = useState(() => {
    try { return localStorage.getItem('tchelab_ws_project') || ''; } catch { return ''; }
  });
  const project = projects.find(p => p.uuid === projectId) || null;
  const projectCanEdit = !!project && ['owner', 'admin', 'editor'].includes(project.my_access);

  const [selectedVar, setSelectedVar]   = useState(null);
  const [selectedTech, setSelectedTech] = useState(null);
  const [techFilter, setTechFilter]     = useState('');
  const [techDropOpen, setTechDropOpen] = useState(false);
  const [inputBindings, setInputBindings] = useState({});
  const [params, setParams]             = useState({});
  const [outputNames, setOutputNames]   = useState({});
  const [runningOp, setRunningOp]       = useState(null);

  const [showImport, setShowImport]     = useState(false);
  const [varFilter, setVarFilter]       = useState('');
  const [history, setHistory]           = useState([]);
  const [activePanel, setActivePanel]   = useState('operation'); // 'operation'|'editor'
  const [varSort, setVarSort]           = useState('name'); // 'name'|'size'|'class'
  const [techModalOpen, setTechModalOpen] = useState(false);

  const pollRef    = useRef(null);
  const consoleRef = useRef(null);
  const techDropRef = useRef(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadVars = useCallback(async () => {
    try {
      setLoadingVars(true);
      const res = projectId
        ? await api.projects.listDatasets(projectId, { with_metadata: 1 })
        : await client.get('/datasets', { params: { limit: 200, with_metadata: 1 } });
      const all = res.data?.data ?? res.data ?? [];
      setVariables(all.filter(d => !d.deleted_at));
    } catch { /* silencioso */ } finally { setLoadingVars(false); }
  }, [projectId]);

  // Lista de projetos (próprios + compartilhados) para o seletor de escopo
  useEffect(() => {
    api.projects.list({ scope: 'all' }).then(res => {
      const list = res.data?.data ?? res.data ?? [];
      setProjects(Array.isArray(list) ? list : []);
      setProjectId(cur => (cur && !list.some(p => p.uuid === cur) ? '' : cur));
    }).catch(() => {});
  }, []);

  // Variáveis do usuário que ainda não estão no projeto (para "adicionar existente")
  const loadOwn = useCallback(async () => {
    try {
      const res = await client.get('/datasets', { params: { limit: 200 } });
      setOwnList((res.data?.data ?? res.data ?? []).filter(d => !d.deleted_at));
    } catch { /* silencioso */ }
  }, []);
  useEffect(() => { if (projectId && projectCanEdit) loadOwn(); }, [projectId, projectCanEdit, loadOwn, variables.length]);

  const chooseProject = (id) => {
    setProjectId(id); setSelectedVar(null);
    try { if (id) localStorage.setItem('tchelab_ws_project', id); else localStorage.removeItem('tchelab_ws_project'); } catch { /* storage indisponível */ }
  };

  async function linkToProject(datasetUuid) {
    if (!projectId || !projectCanEdit || !datasetUuid) return;
    try {
      await api.projects.addDataset(projectId, datasetUuid);
      addHist({ cmd: `link ${ownList.find(d => d.uuid === datasetUuid)?.name || ''}`, status: 'ok', info: project?.name });
      await loadVars();
    } catch (e) {
      addHist({ cmd: 'link', status: 'error', info: e.response?.data?.error?.message || e.message });
    }
  }

  // Saídas de operações herdam o projeto selecionado
  async function linkOutputs(names) {
    if (!projectId || !projectCanEdit || !names.length) return;
    try {
      const res = await client.get('/datasets', { params: { limit: 200 } });
      const all = res.data?.data ?? res.data ?? [];
      for (const nm of names) {
        const cand = all.filter(d => d.name === nm).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (cand) await api.projects.addDataset(projectId, cand.uuid).catch(() => {});
      }
    } catch { /* silencioso */ }
  }

  const loadTechs = useCallback(async () => {
    try {
      const res = await client.get('/techniques?limit=500');
      const all = res.data?.data ?? res.data ?? [];
      setTechniques(all);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadVars(); loadTechs(); }, [loadVars, loadTechs]);

  // Close tech dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (techDropRef.current && !techDropRef.current.contains(e.target)) setTechDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [history]);

  // ── Técnica selecionada: init defaults ─────────────────────────────────────
  useEffect(() => {
    if (!selectedTech) { setParams({}); setOutputNames({}); setInputBindings({}); return; }
    const pSchema = pj(selectedTech.parameter_schema, {});
    const defaults = {};
    Object.entries(pSchema).forEach(([k, def]) => { if (def.default !== undefined) defaults[k] = def.default; });
    setParams(defaults);

    const oSchema = pj(selectedTech.output_schema, {});
    const oNames = {};
    const slug = selectedTech.slug || '';
    const prefix = slug.replace(/_/g, '').slice(0, 6);
    Object.keys(oSchema).forEach((k, i) => { oNames[k] = i === 0 ? `${prefix}_out` : `${prefix}_${k}`; });
    setOutputNames(oNames);

    const iSchema = pj(selectedTech.input_schema, {});
    const bindings = {};
    Object.keys(iSchema).forEach((k, i) => { if (i === 0 && selectedVar) bindings[k] = selectedVar.uuid; });
    setInputBindings(bindings);
  }, [selectedTech, selectedVar]);

  // ── Delete variável ──────────────────────────────────────────────────────────
  async function deleteVar(v) {
    if (projectId) {
      // No escopo de um projeto, "remover" só desvincula — o dataset continua no workspace geral.
      if (!projectCanEdit) return;
      if (!window.confirm(tr('workspace.unlinkConfirm', { name: v.name }))) return;
      try {
        await api.projects.removeDataset(projectId, v.uuid);
        setVariables(vs => vs.filter(x => x.uuid !== v.uuid));
        if (selectedVar?.uuid === v.uuid) setSelectedVar(null);
        addHist({ cmd: `unlink ${v.name}`, status: 'ok' });
      } catch (e) {
        addHist({ cmd: `unlink ${v.name}`, status: 'error', info: e.response?.data?.error?.message || tr('workspace.errorGeneric') });
      }
      return;
    }
    if (!window.confirm(tr('workspace.deleteConfirm', { name: v.name }))) return;
    try {
      await client.delete(`/datasets/${v.uuid}`);
      setVariables(vs => vs.filter(x => x.uuid !== v.uuid));
      if (selectedVar?.uuid === v.uuid) setSelectedVar(null);
      addHist({ cmd: `clear ${v.name}`, status: 'ok' });
    } catch (e) {
      addHist({ cmd: `clear ${v.name}`, status: 'error', info: e.response?.data?.message || tr('workspace.errorGeneric') });
    }
  }

  // ── Executar operação ─────────────────────────────────────────────────────────
  async function runOperation() {
    if (!selectedTech) return;
    const iSchema = pj(selectedTech.input_schema, {});
    const iKeys = Object.keys(iSchema);
    const primaryKey = iKeys[0] || 'X';
    const primaryId = inputBindings[primaryKey];
    if (!primaryId) {
      addHist({ cmd: `${selectedTech.slug}(?)`, status: 'error', info: tr('workspace.bindInput', { key: primaryKey }) });
      return;
    }

    const extra_inputs = {};
    iKeys.slice(1).forEach(k => {
      if (inputBindings[k]) extra_inputs[k] = { type: 'dataset', dataset_id: inputBindings[k] };
    });

    const ts = Date.now();
    const wfName = `workspace_${selectedTech.slug}_${ts}`;
    const oSchema = pj(selectedTech.output_schema, {});
    const oKeys = Object.keys(oSchema);
    const firstOutName = outputNames[oKeys[0]] || `${selectedTech.slug}_out`;

    const inStr = iKeys.map(k => {
      const v = variables.find(x => x.uuid === inputBindings[k]);
      return v?.name || '?';
    }).join(', ');
    const pStr = Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${v}`).join(', ');
    const cmd = `${firstOutName} = ${selectedTech.slug}(${inStr}${pStr ? ', ' + pStr : ''})`;

    const histId = ts;
    addHist({ id: histId, cmd, status: 'pending' });

    try {
      const res = await client.post(`/datasets/${primaryId}/operations`, {
        technique_id: selectedTech.uuid,
        params,
        workflow_name: wfName,
        save_mode: 'new_dataset',
        new_dataset_name: firstOutName,
        extra_inputs,
      });
      const opId = res.data?.data?.operation_id;
      setRunningOp({ op_id: opId, histId, startMs: ts });
      startPoll(opId, histId, ts, oKeys.map(k => outputNames[k]).filter(Boolean));
    } catch (e) {
      const msg = e.response?.data?.errors?.[0]?.message || e.response?.data?.message || e.message;
      updHist(histId, { status: 'error', info: msg });
      setRunningOp(null);
    }
  }

  function startPoll(opId, histId, startMs, outs = []) {
    let n = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (++n > MAX_POLLS) {
        clearInterval(pollRef.current);
        updHist(histId, { status: 'error', info: tr('workspace.timeout') });
        setRunningOp(null);
        return;
      }
      try {
        const r = await client.get(`/operations/${opId}`);
        const op = r.data?.data ?? r.data;
        const st = op?.execution_status || op?.status;
        if (st === 'completed' || st === 'done') {
          clearInterval(pollRef.current);
          await linkOutputs(outs);
          await loadVars();
          updHist(histId, { status: 'ok', ms: fmtMs(Date.now() - startMs) });
          setRunningOp(null);
        } else if (st === 'failed' || st === 'error') {
          clearInterval(pollRef.current);
          updHist(histId, { status: 'error', info: op?.error_message || tr('workspace.failed') });
          setRunningOp(null);
        }
      } catch { /* continua */ }
    }, POLL_MS);
  }

  function addHist(entry) { setHistory(h => [...h, { id: entry.id || Date.now() + Math.random(), ...entry }]); }
  function updHist(id, patch) { setHistory(h => h.map(e => e.id === id ? { ...e, ...patch } : e)); }

  // ── Filtragem / ordenação ──────────────────────────────────────────────────
  const filteredVars = useMemo(() => {
    let list = variables.filter(v => !varFilter || v.name.toLowerCase().includes(varFilter.toLowerCase()));
    if (varSort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (varSort === 'size') list = [...list].sort((a, b) => {
      const da = (pj(a.dimensions, []) || []).reduce((x, y) => x * y, 1);
      const db = (pj(b.dimensions, []) || []).reduce((x, y) => x * y, 1);
      return db - da;
    });
    return list;
  }, [variables, varFilter, varSort]);

  const filteredTechs = useMemo(() => {
    const q = techFilter.toLowerCase();
    return techniques.filter(t => !q || t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q));
  }, [techniques, techFilter]);

  const techsByFamily = useMemo(() => {
    const g = {};
    filteredTechs.forEach(t => {
      const f = t.family || 'outros';
      if (!g[f]) g[f] = [];
      g[f].push(t);
    });
    return g;
  }, [filteredTechs]);

  // Separate MATLAB-like functions for their dedicated section in the dropdown
  const matlabFuncs = useMemo(() =>
    filteredTechs.filter(t => (pj(t.tags, []) || []).includes('matlab')),
    [filteredTechs]
  );

  const nonMatlabByFamily = useMemo(() => {
    const matlabSlugs = new Set(matlabFuncs.map(t => t.slug));
    const g = {};
    filteredTechs.filter(t => !matlabSlugs.has(t.slug)).forEach(t => {
      const f = t.family || 'outros';
      if (!g[f]) g[f] = [];
      g[f].push(t);
    });
    return g;
  }, [filteredTechs, matlabFuncs]);

  const iSchema = selectedTech ? pj(selectedTech.input_schema, {}) : {};
  const oSchema = selectedTech ? pj(selectedTech.output_schema, {}) : {};
  const pSchema = selectedTech ? pj(selectedTech.parameter_schema, {}) : {};

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'var(--page-h, 100%)', minHeight: 420, overflow: 'hidden', background: cl ? '#f0f0f0' : 'var(--bg-base)', fontFamily: 'var(--font-sans)' }}>

      {/* ════════════════ TOOLBAR ════════════════ */}
      <div style={{ ...s.toolbar, flexWrap: 'wrap', rowGap: 4 }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}>
          <Table2 size={14} style={{ color: cl ? '#0a5fa8' : 'var(--accent)' }} />
          <span style={{ fontWeight: 700, fontSize: cl ? '0.82rem' : '0.83rem', color: cl ? '#1a1a1a' : 'var(--text-primary)', letterSpacing: cl ? 0 : '-0.01em' }}>
            Workspace
          </span>
        </div>

        <div style={s.sep} />

        {/* Escopo: projeto */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: cl ? '#333' : 'var(--text-muted)' }}>
          {tr('workspace.project')}
          <select value={projectId} onChange={e => chooseProject(e.target.value)} aria-label={tr('workspace.project')}
            style={{ ...s.select, width: 'auto', maxWidth: 190, padding: cl ? '1px 4px' : '2px 6px', fontSize: '0.74rem' }}>
            <option value="">{tr('workspace.allVars')}</option>
            {projects.map(p => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
          </select>
        </label>
        {project && projectCanEdit && (
          <select value="" onChange={e => linkToProject(e.target.value)} aria-label={tr('workspace.addExisting')}
            style={{ ...s.select, width: 'auto', maxWidth: 190, padding: cl ? '1px 4px' : '2px 6px', fontSize: '0.74rem' }}>
            <option value="">{tr('workspace.addExisting')}</option>
            {ownList.filter(d => !variables.some(v => v.uuid === d.uuid)).map(d => <option key={d.uuid} value={d.uuid}>{d.name}</option>)}
          </select>
        )}
        {project && !projectCanEdit && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tr('workspace.readOnlyProject')}</span>
        )}

        <div style={s.sep} />

        {/* Import */}
        <button style={s.tbBtn()} onClick={() => setShowImport(true)}
          disabled={!!projectId && !projectCanEdit}
          title={projectId && !projectCanEdit ? tr('workspace.readOnlyProject') : tr('workspace.importTip')}>
          <FolderOpen size={12} /> {tr('workspace.import')}
        </button>

        {/* Refresh */}
        <button style={s.tbBtn()} onClick={loadVars} title={tr('workspace.refreshTip')}>
          <RefreshCw size={12} style={{ animation: loadingVars ? 'spin 0.9s linear infinite' : 'none' }} />
          {!cl && tr('workspace.refresh')}
        </button>

        <div style={s.sep} />

        {/* Clear all */}
        <button style={s.tbBtn()} onClick={async () => {
          if (!variables.length) return;
          if (projectId && !projectCanEdit) return;
          if (!window.confirm(tr(projectId ? 'workspace.unlinkAllConfirm' : 'workspace.deleteAllConfirm', { count: variables.length }))) return;
          for (const v of variables) {
            try {
              if (projectId) await api.projects.removeDataset(projectId, v.uuid);
              else await client.delete(`/datasets/${v.uuid}`);
            } catch { /* ignora */ }
          }
          setVariables([]); setSelectedVar(null);
          addHist({ cmd: 'clear all', status: 'ok' });
        }}>
          <Trash2 size={12} /> Clear All
        </button>

        <div style={{ flex: 1 }} />

        {/* Running indicator */}
        {runningOp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: cl ? '#666' : 'var(--text-muted)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.1s infinite' }} />
            {tr('workspace.running')}
          </div>
        )}
        <div style={{ width: 4 }} />

        {/* Var count badge */}
        <div style={{ fontSize: '0.68rem', color: cl ? '#666' : 'var(--text-muted)', padding: '2px 8px', background: cl ? 'rgba(0,0,0,0.08)' : 'var(--bg-hover)', borderRadius: cl ? 2 : 'var(--radius-sm)', border: cl ? '1px solid #bbb' : 'none' }}>
          {tr('workspace.varCount', { count: variables.length })}
        </div>
      </div>

      {/* ════════════════ BODY ════════════════ */}
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', flex: 1, overflow: narrow ? 'auto' : 'hidden', minHeight: 0 }}>

        {/* ──── Painel esquerdo: Workspace Browser ──── */}
        <div style={{
          width: narrow ? '100%' : 300, flexShrink: 0,
          ...(narrow ? { maxHeight: 240, overflow: 'auto' } : {}),
          borderRight: narrow ? 'none' : (cl ? '1px solid #aca899' : '1px solid var(--border)'),
          borderBottom: narrow ? (cl ? '1px solid #aca899' : '1px solid var(--border)') : 'none',
          display: 'flex', flexDirection: 'column',
          background: cl ? '#f5f5f5' : 'var(--bg-surface)',
        }}>
          {/* Header */}
          <div style={s.panelHdr}>
            <Layers size={11} />
            WORKSPACE
          </div>

          {/* Search bar */}
          <div style={{
            padding: '4px 6px',
            background: cl ? '#e8e4dc' : 'var(--bg-surface)',
            borderBottom: cl ? '1px solid #bbb' : '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: cl ? '#fff' : 'var(--bg-base)', border: cl ? '1px inset #aaa' : '1px solid var(--border)', borderRadius: cl ? 1 : 'var(--radius-sm)', padding: '2px 6px', boxShadow: cl ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
              <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.76rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                placeholder={tr('workspace.filterVars')}
                value={varFilter}
                onChange={e => setVarFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', background: cl ? '#fff' : 'transparent' }}>
            <table style={s.tbl}>
              <thead>
                <tr style={s.tblHead}>
                  {['Name', 'Value', 'Size', 'Bytes', 'Class', ''].map((h, i) => (
                    <th key={i} style={{ ...s.tblTh(i), cursor: ['Name','Size','Class'].includes(h) ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (h === 'Name') setVarSort('name');
                        if (h === 'Size') setVarSort('size');
                        if (h === 'Class') setVarSort('class');
                      }}>
                      {h}
                      {(h === 'Name' && varSort === 'name') || (h === 'Size' && varSort === 'size')
                        ? ' ▴' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingVars && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr('workspace.loading')}</td></tr>
                )}
                {!loadingVars && filteredVars.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      <div style={{ marginBottom: 6 }}>
                        <Table2 size={20} style={{ opacity: 0.3 }} />
                      </div>
                      {project ? tr('workspace.emptyProject') : tr('workspace.empty')}<br />
                      <span style={{ fontSize: '0.68rem' }}>{project ? tr('workspace.emptyProjectHint') : tr('workspace.emptyHint')}</span>
                    </td>
                  </tr>
                )}
                {filteredVars.map((v) => {
                  const dims = pj(v.dimensions, []);
                  const preview = tensorPreview(v.metadata);
                  const sel = selectedVar?.uuid === v.uuid;
                  return (
                    <tr key={v.uuid}
                      style={s.varRow(sel)}
                      onClick={() => { setSelectedVar(v); if (!selectedTech) setActivePanel('editor'); }}
                      onDoubleClick={() => { setSelectedVar(v); setActivePanel('editor'); }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = cl ? '#e8f0fb' : 'var(--bg-card-hover)'; }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={s.varTd(0, sel)}>{v.name}</td>
                      <td style={{ ...s.varTd(1, sel), color: cl ? '#444' : 'var(--text-muted)' }}>{preview || '—'}</td>
                      <td style={s.varTd(2, sel)}>{fmtSizeMat(dims)}</td>
                      <td style={s.varTd(3, sel)}>{fmtBytes(dims)}</td>
                      <td style={s.varTd(4, sel)}>{fmtClass(v.data_type)}</td>
                      <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                        <button
                          onClick={e => { e.stopPropagation(); deleteVar(v); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: 2, opacity: 0.4, color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          title={projectId ? tr('workspace.unlinkTip') : tr('workspace.remove')}
                          hidden={!!projectId && !projectCanEdit}
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ──── Painel central: Operação / Variable Editor ──── */}
        <div style={{ flex: narrow ? '0 0 auto' : 1, minHeight: narrow ? 480 : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: cl ? '#f5f5f5' : 'var(--bg-base)' }}>

          {/* Sub-tabs (MATLAB-style panel tabs) */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: cl ? '#f0f0f0' : 'var(--bg-surface)',
            borderBottom: cl ? '1px solid #aca899' : '1px solid var(--border)',
            flexShrink: 0,
            paddingLeft: 4,
            gap: 0,
          }}>
            {[
              { id: 'operation', label: tr('workspace.tabOperation') },
              { id: 'editor', label: selectedVar ? `${selectedVar.name} ×` : 'Variable Editor' },
            ].map((tab) => {
              const active = activePanel === tab.id;
              return (
                <button key={tab.id} onClick={() => setActivePanel(tab.id)} style={{
                  padding: cl ? '4px 14px' : '0.42rem 1rem',
                  fontSize: cl ? '0.78rem' : '0.76rem',
                  fontWeight: active ? (cl ? 700 : 600) : 400,
                  background: active
                    ? (cl ? '#f5f5f5' : 'var(--bg-base)')
                    : 'transparent',
                  border: cl ? `1px solid ${active ? '#c8c8c8' : 'transparent'}` : 'none',
                  borderBottom: cl
                    ? (active ? '1px solid #f5f5f5' : '1px solid #aca899')
                    : `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: cl ? '3px 3px 0 0' : 0,
                  color: active ? (cl ? '#1a1a1a' : 'var(--text-primary)') : (cl ? '#555' : 'var(--text-muted)'),
                  cursor: 'pointer',
                  marginBottom: cl ? -1 : 0,
                  fontFamily: cl ? 'var(--font-sans)' : 'inherit',
                }}>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {/* Variable Editor */}
            {activePanel === 'editor' && (
              <div style={{ flex: 1, overflow: 'auto', background: cl ? '#fff' : 'var(--bg-elevated)' }}>
                {selectedVar
                  ? <VarEditor variable={selectedVar} s={s} theme={theme} />
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
                      <Table2 size={28} style={{ opacity: 0.2 }} />
                      <span style={{ fontSize: '0.78rem' }}>{tr('workspace.inspectHint')}</span>
                    </div>
                  )
                }
              </div>
            )}

            {/* Operation panel */}
            {activePanel === 'operation' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: cl ? '12px 14px' : '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: cl ? 12 : 16 }}>

                {/* Técnica */}
                <div ref={techDropRef} style={{ position: 'relative' }}>
                  <label style={s.label}>{tr('workspace.techFunction')}</label>
                  <button
                    onClick={() => setTechDropOpen(v => !v)}
                    style={{
                      ...s.select,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <span style={{ color: selectedTech ? (cl ? '#1a1a1a' : 'var(--text-primary)') : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: cl ? '0.8rem' : '0.78rem' }}>
                      {selectedTech ? `${selectedTech.slug}` : tr('workspace.selectFunction')}
                    </span>
                    {selectedTech && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--font-sans)' }}>
                        {selectedTech.name}
                      </span>
                    )}
                    <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }} />
                  </button>

                  {techDropOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
                      background: cl ? '#fff' : 'var(--bg-elevated)',
                      border: cl ? '1px solid #aaa' : '1px solid var(--border)',
                      borderRadius: cl ? 1 : 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-lg)',
                      maxHeight: 300, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{ padding: '4px 6px', borderBottom: cl ? '1px solid #ddd' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Search size={11} style={{ color: 'var(--text-muted)' }} />
                        <input autoFocus
                          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                          placeholder={tr('workspace.search')}
                          value={techFilter}
                          onChange={e => setTechFilter(e.target.value)} />
                      </div>
                      <div style={{ overflowY: 'auto' }}>
                        {/* MATLAB Functions section — shown first */}
                        {matlabFuncs.length > 0 && (
                          <div>
                            <div style={{ padding: '3px 8px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', position: 'sticky', top: 0, background: cl ? '#1a4a80' : '#1a2a4a', color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Zap size={9} /> MATLAB FUNCTIONS
                            </div>
                            {matlabFuncs.map(t => (
                              <button key={t.uuid}
                                onClick={() => { setSelectedTech(t); setTechDropOpen(false); setTechFilter(''); setActivePanel('operation'); }}
                                style={{
                                  width: '100%', textAlign: 'left',
                                  padding: cl ? '3px 12px' : '4px 10px',
                                  background: selectedTech?.uuid === t.uuid ? (cl ? '#c2d8f0' : 'var(--bg-hover)') : 'none',
                                  border: 'none', cursor: 'pointer',
                                  display: 'flex', alignItems: 'baseline', gap: 8,
                                }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: cl ? '#003880' : 'var(--text-accent)', flexShrink: 0, fontWeight: 700 }}>{t.slug}</span>
                                <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* All other techniques by family */}
                        {Object.entries(nonMatlabByFamily).map(([fam, techs]) => (
                          <div key={fam}>
                            <div style={{ padding: '3px 8px', fontSize: '0.62rem', fontWeight: 700, color: cl ? '#333' : 'var(--text-muted)', letterSpacing: '0.07em', background: cl ? '#4a7fbf' : 'var(--bg-base)', position: 'sticky', top: 0 }}>
                              {fam.replace(/^\d+_/, '').toUpperCase()}
                            </div>
                            {techs.map(t => (
                              <button key={t.uuid}
                                onClick={() => { setSelectedTech(t); setTechDropOpen(false); setTechFilter(''); setActivePanel('operation'); }}
                                style={{
                                  width: '100%', textAlign: 'left',
                                  padding: cl ? '3px 12px' : '4px 10px',
                                  background: selectedTech?.uuid === t.uuid ? (cl ? '#c2d8f0' : 'var(--bg-hover)') : 'none',
                                  border: 'none', cursor: 'pointer',
                                  display: 'flex', alignItems: 'baseline', gap: 8,
                                }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: cl ? '#003880' : 'var(--text-accent)', flexShrink: 0 }}>{t.slug}</span>
                                <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                        {!filteredTechs.length && (
                          <p style={{ padding: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>{tr('workspace.noFunction')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Painel de documentação da técnica */}
                {selectedTech && (
                  <TechInfoPanel tech={selectedTech} s={s} theme={theme} onOpenModal={() => setTechModalOpen(true)} />
                )}

                {/* Entradas */}
                {selectedTech && Object.keys(iSchema).length > 0 && (
                  <div>
                    <label style={s.label}>{tr('workspace.inputs')}</label>
                    <div style={{ background: cl ? '#fff' : 'var(--bg-card)', border: cl ? '1px solid #ccc' : '1px solid var(--border)', borderRadius: cl ? 1 : 'var(--radius-sm)', padding: cl ? '8px' : '0.625rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(iSchema).map(([key, def]) => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '50px 60px 1fr', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: cl ? '#003880' : 'var(--text-accent)', fontWeight: 700 }}>{key}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.type}</span>
                          <select style={s.select}
                            value={inputBindings[key] || ''}
                            onChange={e => setInputBindings(b => ({ ...b, [key]: e.target.value }))}>
                            <option value="">{tr('workspace.chooseVariable')}</option>
                            {variables.map(v => {
                              const dims = pj(v.dimensions, []);
                              return <option key={v.uuid} value={v.uuid}>{v.name}  [{fmtSizeMat(dims)} {fmtClass(v.data_type)}]</option>;
                            })}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parâmetros */}
                {selectedTech && Object.keys(pSchema).length > 0 && (
                  <div>
                    <label style={s.label}>{tr('workspace.params')}</label>
                    <div style={{ background: cl ? '#fff' : 'var(--bg-card)', border: cl ? '1px solid #ccc' : '1px solid var(--border)', borderRadius: cl ? 1 : 'var(--radius-sm)', padding: cl ? '8px' : '0.625rem' }}>
                      <ParamEditor schema={pSchema} values={params} onChange={setParams} s={s} />
                    </div>
                  </div>
                )}

                {/* Saídas */}
                {selectedTech && Object.keys(oSchema).length > 0 && (
                  <div>
                    <label style={s.label}>{tr('workspace.saveOutputAs')}</label>
                    <div style={{ background: cl ? '#fff' : 'var(--bg-card)', border: cl ? '1px solid #ccc' : '1px solid var(--border)', borderRadius: cl ? 1 : 'var(--radius-sm)', padding: cl ? '8px' : '0.625rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.keys(oSchema).map(k => (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k} =</span>
                          <input style={s.input} placeholder={tr('workspace.outputPh')}
                            value={outputNames[k] || ''}
                            onChange={e => setOutputNames(o => ({ ...o, [k]: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão run */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 6, borderTop: cl ? '1px solid #ccc' : '1px solid var(--border)' }}>
                  <button style={s.btnPrimary(!selectedTech || !!runningOp)} onClick={runOperation} disabled={!selectedTech || !!runningOp}>
                    <Play size={12} />
                    {runningOp ? tr('workspace.running') : tr('workspace.run')}
                  </button>
                  {selectedTech && (
                    <button style={s.btnSecondary} onClick={() => { setSelectedTech(null); setParams({}); setInputBindings({}); }}>
                      <X size={11} /> {tr('workspace.clear')}
                    </button>
                  )}
                  {!selectedTech && (
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {tr('workspace.selectHint')}
                    </span>
                  )}
                </div>

                {/* Hint: double-click on variable */}
                {!selectedTech && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Eye size={11} /> {tr('workspace.dblClickHint')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ──── Command Window ──── */}
          <div style={{ height: 155, flexShrink: 0, ...s.console, display: 'flex', flexDirection: 'column', borderTop: cl ? '1px solid #c8c8c8' : '1px solid var(--border)' }}>
            <div style={s.consoleHdr}>
              <Terminal size={11} style={{ color: cl ? '#555' : '#8b949e' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: cl ? '#555' : '#8b949e', letterSpacing: '0.08em' }}>COMMAND WINDOW</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setHistory([])} style={{ fontSize: '0.62rem', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>{tr('workspace.clearConsole')}</button>
            </div>
            <div ref={consoleRef} style={{ flex: 1, overflowY: 'auto', padding: '3px 10px 4px' }}>
              {history.length === 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: cl ? '#777' : '#555', padding: '2px 0', lineHeight: 1.5 }}>
                  {tr('workspace.cmdBanner', { year: new Date().getFullYear(), theme: tr(`themes.${theme}`) })}
                </div>
              )}
              {history.map(e => <ConsoleLine key={e.id} e={e} s={s} />)}
              {/* Blinking cursor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }}>
                <span style={{ ...s.consolePrompt, fontFamily: 'var(--font-mono)', fontSize: '0.73rem' }}>&gt;&gt;</span>
                <span style={{ display: 'inline-block', width: 7, height: 13, background: cl ? '#1a1a1a' : '#7ee787', animation: 'blink 1.1s step-end infinite' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: cl ? '1px 8px' : '2px 10px',
        background: cl ? '#f0f0f0' : 'var(--bg-surface)',
        borderTop: cl ? '1px solid #aca899' : '1px solid var(--border)',
        flexShrink: 0,
        fontSize: '0.68rem',
        color: cl ? '#666' : 'var(--text-muted)',
        gap: 12,
        fontFamily: cl ? 'var(--font-sans)' : 'inherit',
      }}>
        <span>TcheLab Workspace</span>
        <span style={{ color: cl ? '#bbb' : 'var(--border)' }}>|</span>
        {selectedVar ? (
          <>
            <span>{tr('workspace.selected')} <b style={{ color: cl ? '#003880' : 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>{selectedVar.name}</b></span>
            <span style={{ color: cl ? '#bbb' : 'var(--border)' }}>|</span>
            <span>{fmtSizeMat(pj(selectedVar.dimensions, []))} {fmtClass(selectedVar.data_type)}</span>
          </>
        ) : <span>{tr('workspace.noneSelected')}</span>}
        <div style={{ flex: 1 }} />
        <span>{tr(`themes.${theme}`)}</span>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          s={s} theme={theme}
          onClose={() => setShowImport(false)}
          onImported={async (name, uuid) => {
            if (projectId && projectCanEdit && uuid) { try { await api.projects.addDataset(projectId, uuid); } catch { /* segue */ } }
            loadVars();
            addHist({ cmd: `${name} = importdata(...)`, status: 'ok', info: tr('workspace.imported') });
          }}
        />
      )}

      {/* Modal de detalhes da técnica selecionada */}
      <TechniqueModal
        open={techModalOpen && !!selectedTech}
        onClose={() => setTechModalOpen(false)}
        technique={selectedTech}
      />

      {/* Keyframes */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </div>
  );
}
