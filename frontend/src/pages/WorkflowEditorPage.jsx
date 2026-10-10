'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Play, Save, Search, ChevronDown, ChevronRight,
  Database as DbIcon, X, Info, AlertCircle, CheckCircle2,
  Settings2, Trash2, GitBranch, Loader2, Eye, FolderDown,
  Clock, XCircle, Sliders,
} from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks/useApi';
import SkeletonCard from '../components/ui/SkeletonCard';
import MultiDimModal from '../components/datasets/MultiDimModal';
import {
  FAMILIES, getFamilyConfig, getFamiliesList, isValidConnection, getPorts, parseSchema, ARRAY_TYPES,
} from '../config/techniqueRegistry';

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────
function safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return '100,116,139';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '100,116,139';
  return `${r},${g},${b}`;
}

const EXEC_STATUS_META = {
  pending:   { color: '#64748b', Icon: Clock,        label: 'Pendente' },
  running:   { color: '#fbbf24', Icon: Loader2,      label: 'Executando' },
  completed: { color: '#34d399', Icon: CheckCircle2, label: 'Concluído' },
  failed:    { color: '#f87171', Icon: XCircle,      label: 'Falhou' },
};

// ────────────────────────────────────────────────────────────────────────────────
// Combobox pesquisável — substitui o <select> simples de escolha de dataset.
// Antes, com muitos datasets, a lista era um <select> nativo só por nome; o
// usuário pedia para poder digitar ("data") e já filtrar as opções em vez de
// rolar uma lista às vezes em branco (o "branco" era, na real, o bug de
// paginação/família corrigido antes — mas digitar para filtrar continua
// sendo melhor UX que um <select> simples quando o catálogo de datasets cresce).
// ────────────────────────────────────────────────────────────────────────────────
function DatasetCombobox({ datasets, value, onChange, placeholder = '— Selecionar dataset —' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const selected = datasets.find(d => d.uuid === value);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? datasets.filter(d => d.name?.toLowerCase().includes(q) || d.data_type?.toLowerCase().includes(q))
    : datasets;

  return (
    <div ref={wrapRef} className="nodrag" style={{ position: 'relative', marginBottom: 4 }}>
      <input
        value={open ? query : (selected?.name || '')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(37,99,235,0.35)',
          borderRadius: 6,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '0.78rem',
          padding: '4px 8px',
          outline: 'none',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          marginTop: 2, maxHeight: 180, overflowY: 'auto',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 7, boxShadow: 'var(--shadow)',
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
            style={{ padding: '5px 9px', fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            — Nenhum —
          </div>
          {filtered.map(d => (
            <div
              key={d.uuid}
              onClick={() => { onChange(d.uuid); setOpen(false); setQuery(''); }}
              style={{
                padding: '5px 9px', fontSize: '0.78rem', cursor: 'pointer',
                color: d.uuid === value ? 'var(--text-accent)' : 'var(--text-primary)',
                background: d.uuid === value ? 'rgba(37,99,235,0.12)' : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = d.uuid === value ? 'rgba(37,99,235,0.12)' : 'transparent'; }}
            >
              {d.name}
              <span style={{ marginLeft: 6, fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                {d.data_type || 'matrix'}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '7px 9px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Nenhum dataset encontrado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Custom node: Dataset (nó de entrada — somente local, nunca persistido no
// backend. O grafo real (workflow_nodes/workflow_edges) só conhece técnicas;
// a ligação Dataset→Técnica é resolvida no momento do dispatch via
// `dataset_bindings`, igual à "operação rápida" em datasetOperation.controller.js.
// As escolhas de dataset + a própria existência deste nó SÃO persistidas,
// via workflows.definition.canvas — ver handleAddTechnique/autosave abaixo —
// então não se perdem mais ao sair e voltar ao workflow.)
// ────────────────────────────────────────────────────────────────────────────────
function DatasetNode({ id, data, selected }) {
  const datasets = data.datasets || [];
  const selectedDs = datasets.find(d => d.uuid === data.datasetUuid);

  return (
    <div style={{
      minWidth: 210,
      background: selected ? 'rgba(37,99,235,0.18)' : 'rgba(10,15,30,0.95)',
      border: `2px solid ${selected ? 'var(--accent)' : 'rgba(37,99,235,0.5)'}`,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.2)' : 'var(--shadow)',
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'rgba(37,99,235,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DbIcon size={13} color="#60a5fa" />
        </div>
        <span style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dataset
        </span>
        <button
          className="nodrag"
          title="Visualizar dataset"
          onClick={() => data.onPreview && data.onPreview(data.datasetUuid)}
          disabled={!data.datasetUuid}
          style={{
            background: 'none', border: 'none', cursor: data.datasetUuid ? 'pointer' : 'default',
            color: data.datasetUuid ? '#93c5fd' : 'var(--text-muted)', padding: 2, opacity: data.datasetUuid ? 1 : 0.4,
          }}
        >
          <Eye size={13} />
        </button>
        <button
          className="nodrag"
          title="Remover nó"
          onClick={() => data.onRemove && data.onRemove(id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <DatasetCombobox
        datasets={datasets}
        value={data.datasetUuid || ''}
        onChange={(uuid) => data.onChange && data.onChange(id, uuid, datasets.find(d => d.uuid === uuid))}
      />

      {selectedDs && (
        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {selectedDs.data_type || 'matrix'}{selectedDs.dimensions ? ` · ${JSON.stringify(safeJson(selectedDs.dimensions, selectedDs.dimensions))}` : ''}
        </p>
      )}
      {!data.datasetUuid && (
        <p style={{ fontSize: '0.68rem', color: '#fbbf24', margin: '2px 0 0' }}>
          ⚠ Nenhum dataset selecionado
        </p>
      )}

      {/* Única saída — arraste até a porta de entrada desejada de uma técnica */}
      <Handle
        type="source" position={Position.Right} id="out"
        style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid var(--bg-surface)' }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Custom node: Technique — agora com 1 Handle por porta nomeada (de verdade,
// batendo com input_schema/output_schema do banco), em vez de um único
// Handle genérico por lado que escondia as portas reais da técnica.
// ────────────────────────────────────────────────────────────────────────────────
function TechniqueNode({ id, data, selected }) {
  const familyCfg = getFamilyConfig(data.family);
  const color  = familyCfg?.color  || '#64748b';
  const bg     = familyCfg?.bg     || 'rgba(100,116,139,0.1)';
  const border = familyCfg?.border || 'rgba(100,116,139,0.3)';

  const inputPorts  = data.inputPorts  || [];
  const outputPorts = data.outputPorts || [];
  const statusMeta = data.execStatus ? EXEC_STATUS_META[data.execStatus] : null;

  return (
    <div style={{
      minWidth: 220,
      background: selected ? `rgba(${hexToRgb(color)},0.18)` : 'rgba(10,15,30,0.96)',
      border: `2px solid ${statusMeta ? statusMeta.color : (selected ? color : border)}`,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: selected ? `0 0 0 3px rgba(${hexToRgb(color)},0.2)` : 'var(--shadow)',
      transition: 'all 0.2s',
      position: 'relative',
    }}>
      {/* Input handles — uma por porta nomeada, distribuídas na borda esquerda */}
      {inputPorts.map((p, i) => (
        <Handle
          key={`in-${p.name}`}
          type="target" position={Position.Left} id={p.name}
          style={{
            background: color, width: 10, height: 10, border: '2px solid var(--bg-surface)',
            top: inputPorts.length === 1 ? '50%' : `${((i + 1) / (inputPorts.length + 1)) * 100}%`,
          }}
        />
      ))}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
          boxShadow: `0 0 6px ${color}`,
        }} />
        <span style={{ flex: 1, fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {familyCfg?.labelStr || data.family}
        </span>
        {statusMeta && (
          <statusMeta.Icon
            size={12}
            color={statusMeta.color}
            className={data.execStatus === 'running' ? 'anim-spin' : ''}
          />
        )}
        <button
          className="nodrag"
          title={data.hasExecData ? 'Visualizar entrada/saída' : 'Execute o workflow para ver os dados'}
          onClick={() => data.onViewIO && data.onViewIO(id)}
          disabled={!data.hasExecData}
          style={{
            background: 'none', border: 'none', padding: 2,
            cursor: data.hasExecData ? 'pointer' : 'default',
            color: data.hasExecData ? '#93c5fd' : 'var(--text-muted)',
            opacity: data.hasExecData ? 1 : 0.4,
          }}
        >
          <Eye size={12} />
        </button>
        <button
          className="nodrag"
          title="Configurar parâmetros"
          onClick={() => data.onConfigure && data.onConfigure(id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
        >
          <Sliders size={12} />
        </button>
        <button
          className="nodrag"
          title="Remover nó"
          onClick={() => data.onRemove && data.onRemove(id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <p style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
        {data.label}
      </p>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>
        {data.slug}
      </p>

      {/* Portas nomeadas — texto, não só o tipo, já que agora pode haver várias */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 7 }}>
        {inputPorts.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {inputPorts.map(p => (
              <span key={p.name} style={{
                fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                background: 'rgba(100,116,139,0.2)', color: 'var(--text-muted)',
                border: '1px solid rgba(100,116,139,0.25)',
              }}>
                {p.name}: {p.type}
              </span>
            ))}
          </div>
        )}
        {outputPorts.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {outputPorts.map(p => (
              <span key={p.name} style={{
                fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                background: `rgba(${hexToRgb(color)},0.15)`, color,
                border: `1px solid rgba(${hexToRgb(color)},0.3)`,
              }}>
                {p.name}: {p.type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Output handles — uma por porta nomeada */}
      {outputPorts.map((p, i) => (
        <Handle
          key={`out-${p.name}`}
          type="source" position={Position.Right} id={p.name}
          style={{
            background: color, width: 10, height: 10, border: '2px solid var(--bg-surface)',
            top: outputPorts.length === 1 ? '50%' : `${((i + 1) / (outputPorts.length + 1)) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

const NODE_TYPES = {
  dataset:   DatasetNode,
  technique: TechniqueNode,
};

// ────────────────────────────────────────────────────────────────────────────────
// Technique Card no painel lateral
// ────────────────────────────────────────────────────────────────────────────────
function TechniqueCard({ tech, onAdd, lang }) {
  const [showInfo, setShowInfo] = useState(false);
  const familyCfg = getFamilyConfig(tech.family, lang);
  const inputSchema  = parseSchema(tech.input_schema);
  const outputSchema = parseSchema(tech.output_schema);

  return (
    <div
      draggable
      onDragStart={e => {
        // Arrastar para o canvas solta a técnica onde o usuário soltar o
        // mouse (ver onDrop em WorkflowEditorPage) — em vez de só poder
        // clicar e cair numa posição em grade pré-calculada.
        e.dataTransfer.setData('application/x-tchelab-technique', tech.uuid);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'border-color 0.18s, background 0.18s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = familyCfg?.color || 'var(--border-active)';
        e.currentTarget.style.background = familyCfg?.bg || 'var(--bg-hover)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--bg-card)';
      }}
      onClick={() => onAdd(tech)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: familyCfg?.color || '#64748b', flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: familyCfg?.color || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {familyCfg?.labelStr || tech.family}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
            {tech.name}
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setShowInfo(v => !v); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Info size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {inputSchema.type !== ARRAY_TYPES.ANY && (
          <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', border: '1px solid rgba(100,116,139,0.2)' }}>
            IN: {inputSchema.type}
          </span>
        )}
        {outputSchema.type !== ARRAY_TYPES.ANY && (
          <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: `rgba(${hexToRgb(familyCfg?.color || '#64748b')},0.12)`, color: familyCfg?.color || 'var(--text-muted)', border: `1px solid rgba(${hexToRgb(familyCfg?.color || '#64748b')},0.25)` }}>
            OUT: {outputSchema.type}
          </span>
        )}
        {tech.is_beta && (
          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
            BETA
          </span>
        )}
      </div>

      {showInfo && (
        <div style={{ overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            {tech.description && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>
                {tech.description}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Input</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                  {inputSchema.type}{inputSchema.shape && <span style={{ color: 'var(--text-muted)' }}> {inputSchema.shape}</span>}
                </p>
                {inputSchema.description && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{inputSchema.description}</p>}
              </div>
              <div>
                <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Output</p>
                <p style={{ fontSize: '0.7rem', color: familyCfg?.color || 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                  {outputSchema.type}{outputSchema.shape && <span style={{ color: 'var(--text-muted)' }}> {outputSchema.shape}</span>}
                </p>
                {outputSchema.description && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{outputSchema.description}</p>}
              </div>
            </div>
            {tech.tags && tech.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {safeJson(tech.tags, []).map(tag => (
                  <span key={tag} style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => onAdd(tech)}
              style={{
                marginTop: 8, width: '100%', padding: '5px 0',
                background: familyCfg?.bg || 'rgba(37,99,235,0.1)',
                border: `1px solid ${familyCfg?.border || 'var(--border-active)'}`,
                borderRadius: 7, cursor: 'pointer',
                fontSize: '0.74rem', fontWeight: 600,
                color: familyCfg?.color || 'var(--text-accent)',
                transition: 'opacity 0.15s',
              }}
            >
              + Adicionar ao canvas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Painel de configuração de parâmetros de um nó técnica
// ────────────────────────────────────────────────────────────────────────────────
function NodeConfigPanel({ node, onClose, onSave, saving }) {
  const schema = node?.data?.parameterSchema || {};
  const [values, setValues] = useState(() => ({ ...(node?.data?.parameters || {}) }));

  useEffect(() => {
    setValues({ ...(node?.data?.parameters || {}) });
  }, [node?.id]);

  if (!node) return null;
  const fields = Object.entries(schema);

  return (
    <div style={{
      width: 280, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 12, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Sliders size={13} style={{ color: 'var(--text-accent)' }} />
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {node.data.label}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={13} />
        </button>
      </div>

      {fields.length === 0 && (
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Esta técnica não tem parâmetros configuráveis.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {fields.map(([key, spec]) => {
          const type = spec?.type;
          const isNumber = type === 'number' || type === 'integer';
          return (
            <div key={key}>
              <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>
                {key}{spec?.description ? ` — ${spec.description}` : ''}
              </label>
              <input
                className="input-field"
                style={{ fontSize: '0.76rem', padding: '4px 8px' }}
                type={isNumber ? 'number' : 'text'}
                step={type === 'number' ? 'any' : undefined}
                placeholder={spec?.default !== undefined ? String(spec.default) : ''}
                value={values[key] ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  setValues(prev => ({
                    ...prev,
                    [key]: raw === '' ? undefined : (isNumber ? Number(raw) : raw),
                  }));
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={onClose} className="btn-ghost" style={{ flex: 1, fontSize: '0.74rem', justifyContent: 'center' }}>
          Cancelar
        </button>
        <button
          onClick={() => onSave(node.id, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)))}
          disabled={saving}
          className="btn-primary"
          style={{ flex: 1, fontSize: '0.74rem', justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={12} className="anim-spin" /> : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Painel de resultados da execução — lista os nós executados e suas portas de
// saída, com ações "Visualizar" (abre o MultiDimModal sem precisar virar
// dataset) e "Salvar como dataset" (promove a porta via
// POST /executions/:id/nodes/:nid/outputs/:port — permite, por exemplo,
// salvar train/validation/test do kennard_stone como 3 datasets nomeados).
// ────────────────────────────────────────────────────────────────────────────────
function ResultsPanel({ execution, onClose, onPreviewPort, onSavePort }) {
  if (!execution) return null;
  const nodes = execution.nodes || [];

  return (
    <div style={{
      width: 340, maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 12, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <GitBranch size={13} style={{ color: 'var(--text-accent)' }} />
        <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Execução #{execution.id ?? execution.uuid}
        </span>
        <span style={{
          fontSize: '0.64rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          color: EXEC_STATUS_META[execution.status]?.color || 'var(--text-muted)',
          background: 'rgba(255,255,255,0.05)',
        }}>
          {execution.status}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={13} />
        </button>
      </div>

      {nodes.map(n => {
        const meta = EXEC_STATUS_META[n.status] || EXEC_STATUS_META.pending;
        const outputs = n.status === 'completed' ? safeJson(n.output_data, {}) : {};
        const ports = Object.keys(outputs);
        return (
          <div key={n.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <meta.Icon size={12} color={meta.color} className={n.status === 'running' ? 'anim-spin' : ''} />
              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {n.node_name || n.technique_slug}
              </span>
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>({n.node_key})</span>
            </div>

            {n.status === 'failed' && n.error_message && (
              <p style={{ fontSize: '0.7rem', color: '#fca5a5', margin: '2px 0 4px' }}>{n.error_message}</p>
            )}

            {ports.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ports.map(port => (
                  <div key={port} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 8px',
                  }}>
                    <span style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {port}
                    </span>
                    <button
                      title="Visualizar"
                      onClick={() => onPreviewPort(n, port, outputs[port])}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 2 }}
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      title="Salvar como dataset"
                      onClick={() => onSavePort(n, port)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6ee7b7', padding: 2 }}
                    >
                      <FolderDown size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {nodes.length === 0 && (
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nenhum nó executado ainda.</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Painel de entrada/saída de UM nó — aberto pelo botão "olho" no próprio nó
// técnica do canvas (ex: clicar na PCA). Mostra, lado a lado, os dados que
// entraram (input_data, resolvido via dataset_bindings no dispatch — ver
// dispatchExecutionCore no backend) e tudo que saiu (output_data: figuras de
// mérito, PCs/scores, imagens, etc — uma porta por linha), cada uma com
// "Visualizar" (MultiDimModal) e, para saídas, "Salvar como dataset".
// ────────────────────────────────────────────────────────────────────────────────
function NodeIOPanel({ execNode, onClose, onPreviewPort, onSavePort }) {
  if (!execNode) return null;
  const meta = EXEC_STATUS_META[execNode.status] || EXEC_STATUS_META.pending;
  const inputs = safeJson(execNode.input_data, {}) || {};
  const outputs = execNode.status === 'completed' ? (safeJson(execNode.output_data, {}) || {}) : {};
  const inputPorts = Object.keys(inputs);
  const outputPorts = Object.keys(outputs);

  return (
    <div style={{
      width: 320, maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 12, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Eye size={13} style={{ color: 'var(--text-accent)' }} />
        <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {execNode.node_name || execNode.technique_slug}
        </span>
        <meta.Icon size={13} color={meta.color} className={execNode.status === 'running' ? 'anim-spin' : ''} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={13} />
        </button>
      </div>

      {execNode.status === 'failed' && execNode.error_message && (
        <p style={{ fontSize: '0.72rem', color: '#fca5a5', margin: '0 0 8px' }}>{execNode.error_message}</p>
      )}

      <p style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 6px' }}>
        Entrada
      </p>
      {inputPorts.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Este nó não recebeu dados de entrada (ex: fonte primária do pipeline).
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {inputPorts.map(port => (
          <div key={port} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(96,165,250,0.06)', borderRadius: 6, padding: '4px 8px',
          }}>
            <span style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {port}
            </span>
            <button
              title="Visualizar"
              onClick={() => onPreviewPort(execNode, port, inputs[port])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 2 }}
            >
              <Eye size={13} />
            </button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 6px' }}>
        Saída {execNode.status !== 'completed' && `(${meta.label.toLowerCase()})`}
      </p>
      {outputPorts.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {execNode.status === 'completed' ? 'Nenhuma porta de saída.' : 'Ainda não há saída — aguarde a execução terminar.'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {outputPorts.map(port => (
          <div key={port} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 8px',
          }}>
            <span style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {port}
            </span>
            <button
              title="Visualizar"
              onClick={() => onPreviewPort(execNode, port, outputs[port])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 2 }}
            >
              <Eye size={13} />
            </button>
            <button
              title="Salvar como dataset"
              onClick={() => onSavePort(execNode, port)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6ee7b7', padding: 2 }}
            >
              <FolderDown size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────────
export default function WorkflowEditorPage() {
  const { id }       = useParams();
  const { t, i18n } = useTranslation();
  const lang         = i18n.language || 'pt';

  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);

  const [panelOpen,      setPanelOpen]   = useState(true);
  const [searchQuery,    setSearchQuery] = useState('');
  const [selectedFamily, setFamily]      = useState('');
  const [familiesOpen,   setFamsOpen]    = useState({});

  const [errors, setErrors]     = useState([]);
  const [executing, setExec]    = useState(false);

  // Dataset→Técnica: ligação só existe no frontend (não há nó de dataset no
  // grafo do backend — ver dispatchExecutionCore/dataset_bindings). Guardamos
  // qual (nó técnica, porta) está ligado a qual nó-dataset do canvas.
  // Formato: { [techNodeKey]: { [portName]: datasetNodeId } }
  const [datasetBindings, setDatasetBindings] = useState({});

  // Execução + polling
  const [execution, setExecution]   = useState(null);
  const [showResults, setShowResults] = useState(false);
  const pollRef = useRef(null);

  // Config de parâmetros de nó
  const [configNodeId, setConfigNodeId] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Preview de dataset (nó dataset OU porta de resultado)
  const [previewDataset, setPreviewDataset] = useState(null);

  // Painel "visualizar entrada/saída" de um nó técnica específico (botão
  // de olho no próprio nó do canvas — ver NodeIOPanel).
  const [viewIONodeKey, setViewIONodeKey] = useState(null);

  // Instância do React Flow, capturada via onInit — usada para converter a
  // posição (em pixels de tela) do drop de uma técnica arrastada do painel
  // lateral em posição real do canvas (screenToFlowPosition). Evitamos
  // useReactFlow() aqui porque este componente não está dentro de um
  // <ReactFlowProvider> próprio (o <ReactFlow> de baixo cria o seu).
  const rfInstanceRef = useRef(null);

  // Até a 1ª hidratação a partir de workflows.definition.canvas terminar,
  // não deixamos o autosave de canvas rodar — senão ele gravaria de volta o
  // estado local (ainda vazio/default) por cima do que já estava salvo.
  const canvasHydratedRef = useRef(false);

  const nodeCount = useRef(0);

  // Se o componente do editor for reaproveitado para outro workflow sem
  // desmontar (ex: navegar de /workflows/A para /workflows/B via <Link>, o
  // que o React Router faz sem remount já que é a mesma rota) os `useRef`
  // acima sobreviveriam com o estado do workflow A — canvasHydratedRef
  // ficaria "true" para sempre e o canvas de B nunca seria hidratado (ou
  // peor: o autosave salvaria o canvas de A por cima do de B). Reseta tudo
  // que é por-workflow sempre que `id` muda.
  useEffect(() => {
    canvasHydratedRef.current = false;
    setDatasetBindings({});
    setNodes(prev => prev.filter(n => n.type !== 'dataset'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Load workflow ────────────────────────────────────────────────────────────
  const { data: raw, loading } = useApi(() => api.workflows.get(id), [id]);
  const { data: nodesRaw, refetch: refetchNodes } = useApi(() => api.workflows.nodes(id), [id]);
  const { data: edgesRaw, refetch: refetchEdges } = useApi(() => api.workflows.edges(id), [id]);

  const { data: techsRaw, loading: techsLoading } = useApi(() =>
    api.techniques.list({ limit: 500, is_custom: false }), []
  );
  const techniques = (techsRaw?.data ?? techsRaw ?? []);

  // Catálogo de datasets — carregado uma única vez aqui (em vez de cada
  // DatasetNode chamar useApi(api.datasets.list) por conta própria, o que
  // disparava N requisições idênticas com N nós de dataset no canvas) e
  // sincronizado para dentro de data.datasets de cada nó dataset abaixo.
  const { data: datasetsRaw } = useApi(() => api.datasets.list({ limit: 200 }), []);
  const datasetsList = (datasetsRaw?.data ?? datasetsRaw ?? []);

  // ── Dataset node callbacks (refs para não recriar nodes a cada render) ──────
  const onDatasetChangeRef = useRef(null);
  onDatasetChangeRef.current = (nodeId, uuid, dsObj) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, datasetUuid: uuid, label: dsObj?.name || 'Dataset de entrada' } }
        : n
    ));
  };
  const onPreviewRef = useRef(null);
  onPreviewRef.current = async (datasetUuid) => {
    if (!datasetUuid) return;
    try {
      const res = await api.datasets.get(datasetUuid);
      setPreviewDataset(res?.data?.data ?? res?.data ?? res);
    } catch {
      toast.error('Não foi possível carregar o dataset.');
    }
  };
  const onRemoveNodeRef = useRef(null);
  onRemoveNodeRef.current = (nodeId) => removeNode(nodeId);
  const onConfigureRef = useRef(null);
  onConfigureRef.current = (nodeId) => setConfigNodeId(nodeId);
  const onViewIORef = useRef(null);
  onViewIORef.current = (nodeId) => setViewIONodeKey(nodeId);

  // ── Populate ReactFlow from existing workflow nodes/edges (nós técnica —
  //    nós dataset são hidratados separadamente, a partir de
  //    workflows.definition.canvas, no efeito abaixo) ──────────────────────────
  useEffect(() => {
    if (!nodesRaw) return;
    const list = nodesRaw?.data ?? nodesRaw ?? [];
    const rfNodes = list.map((n, i) => ({
      id:       String(n.node_key),
      type:     'technique',
      position: {
        x: n.position_x != null ? Number(n.position_x) : 260 + i * 260,
        y: n.position_y != null ? Number(n.position_y) : 180,
      },
      data: {
        label:          n.name || n.technique_name,
        slug:           n.technique_slug,
        family:         n.family || '',
        techUuid:       n.technique_id,
        inputPorts:     getPorts(n.input_schema),
        outputPorts:    getPorts(n.output_schema),
        parameters:     safeJson(n.parameters, {}),
        parameterSchema: safeJson(n.parameter_schema, {}),
        onRemove:    (nid) => onRemoveNodeRef.current?.(nid),
        onConfigure: (nid) => onConfigureRef.current?.(nid),
        onViewIO:    (nid) => onViewIORef.current?.(nid),
      },
    }));
    // Preserva nós dataset existentes (e sua ordem) — este efeito só repõe
    // os nós técnica, vindos da fonte de verdade real (workflow_nodes).
    setNodes(prev => [...prev.filter(n => n.type === 'dataset'), ...rfNodes]);
    nodeCount.current = Math.max(nodeCount.current, rfNodes.length + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesRaw]);

  // ── Hidrata nós dataset + datasetBindings a partir de
  //    workflows.definition.canvas (persistido pelo autosave mais abaixo).
  //    Antes, o canvas de datasets (qual dataset foi escolhido, onde o nó
  //    dataset ficava, e a ligação dataset→porta) só existia em useState
  //    local — saía da página e isso tudo se perdia, mesmo que os nós
  //    técnica continuassem lá (eles sim já eram persistidos de verdade via
  //    workflow_nodes). Roda só uma vez por carregamento do workflow. ───────────
  useEffect(() => {
    if (canvasHydratedRef.current) return;
    if (!raw) return;
    const workflowObj = raw?.data ?? raw;
    const canvas = workflowObj?.definition?.canvas;

    if (canvas && Array.isArray(canvas.datasetNodes) && canvas.datasetNodes.length > 0) {
      const dsNodes = canvas.datasetNodes.map((dn) => ({
        id: dn.id,
        type: 'dataset',
        position: dn.position || { x: 40, y: 180 },
        data: {
          label: dn.label || 'Dataset de entrada',
          datasetUuid: dn.datasetUuid || '',
          datasets: datasetsList,
          onChange:  (nid, uuid, dsObj) => onDatasetChangeRef.current?.(nid, uuid, dsObj),
          onPreview: (uuid) => onPreviewRef.current?.(uuid),
          onRemove:  (nid) => onRemoveNodeRef.current?.(nid),
        },
      }));
      setNodes(prev => [...dsNodes, ...prev.filter(n => n.type !== 'dataset')]);
      setDatasetBindings(canvas.datasetBindings || {});
      nodeCount.current = Math.max(nodeCount.current, dsNodes.length);
    } else {
      // Workflow novo / nunca teve canvas salvo: garante pelo menos 1 nó
      // dataset em branco para o usuário começar (comportamento antigo).
      setNodes(prev => (prev.some(n => n.type === 'dataset') ? prev : [defaultDatasetNode(), ...prev]));
    }
    canvasHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  useEffect(() => {
    if (!edgesRaw) return;
    const list = edgesRaw?.data ?? edgesRaw ?? [];
    const rfEdges = list.map(e => ({
      id:           `e-${e.id}`,
      source:       String(e.source_node_key),
      sourceHandle: e.source_port,
      target:       String(e.target_node_key),
      targetHandle: e.target_port,
      animated: true,
      style: { stroke: 'var(--accent)', strokeWidth: 2 },
      data: { backendId: e.id },
    }));
    setEdges(prev => {
      const bindingEdges = prev.filter(e => e.data?.isDatasetBinding);
      return [...rfEdges, ...bindingEdges];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgesRaw]);

  function defaultDatasetNode() {
    return {
      id:       'dataset-0',
      type:     'dataset',
      position: { x: 40, y: 180 },
      data: {
        label: 'Dataset de entrada',
        datasetUuid: '',
        datasets: datasetsList,
        onChange:  (nid, uuid, dsObj) => onDatasetChangeRef.current?.(nid, uuid, dsObj),
        onPreview: (uuid) => onPreviewRef.current?.(uuid),
        onRemove:  (nid) => onRemoveNodeRef.current?.(nid),
      },
    };
  }

  // ── Mantém data.datasets de todos os nós dataset em dia quando o catálogo
  //    carrega/atualiza (ele chega depois da hidratação do canvas, então os
  //    nós dataset nascem com data.datasets=[] e precisam ser atualizados). ──
  useEffect(() => {
    if (!datasetsRaw) return;
    setNodes(prev => prev.map(n =>
      n.type === 'dataset' ? { ...n, data: { ...n.data, datasets: datasetsList } } : n
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetsRaw]);

  // ── Autosave do canvas de datasets (nós + bindings) em
  //    workflows.definition.canvas — debounced para não disparar 1 PUT por
  //    pixel arrastado / tecla digitada. Só roda depois da hidratação inicial
  //    (canvasHydratedRef) para não sobrescrever o que já estava salvo com o
  //    estado local ainda vazio do primeiro render. ───────────────────────────
  const datasetNodesKey = JSON.stringify(
    nodes.filter(n => n.type === 'dataset').map(n => ({
      id: n.id, position: n.position, datasetUuid: n.data?.datasetUuid || '', label: n.data?.label || '',
    }))
  );
  const datasetBindingsKey = JSON.stringify(datasetBindings);
  const saveCanvasTimerRef = useRef(null);
  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    if (saveCanvasTimerRef.current) clearTimeout(saveCanvasTimerRef.current);
    saveCanvasTimerRef.current = setTimeout(() => {
      api.workflows.update(id, {
        definition: {
          canvas: {
            datasetNodes: JSON.parse(datasetNodesKey),
            datasetBindings: JSON.parse(datasetBindingsKey),
          },
        },
      }).catch(() => {
        // Autosave silencioso — uma falha aqui não deve interromper o
        // usuário; a próxima mudança de canvas tenta salvar de novo.
      });
    }, 800);
    return () => { if (saveCanvasTimerRef.current) clearTimeout(saveCanvasTimerRef.current); };
  }, [datasetNodesKey, datasetBindingsKey, id]);

  // ── Deriva as arestas visuais de ligação Dataset→Técnica a partir do
  //    estado datasetBindings + da lista atual de nós (para refletir trocas
  //    de dataset selecionado em tempo real) ───────────────────────────────────
  useEffect(() => {
    setEdges(prev => {
      const real = prev.filter(e => !e.data?.isDatasetBinding);
      const binding = [];
      for (const [techNodeKey, ports] of Object.entries(datasetBindings)) {
        for (const [portName, datasetNodeId] of Object.entries(ports)) {
          if (!datasetNodeId) continue;
          binding.push({
            id: `dsedge-${techNodeKey}-${portName}`,
            source: datasetNodeId,
            sourceHandle: 'out',
            target: techNodeKey,
            targetHandle: portName,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 3' },
            data: { isDatasetBinding: true },
          });
        }
      }
      return [...real, ...binding];
    });
  }, [datasetBindings, setEdges]);

  // ── Remoção de nó (dataset ou técnica), com limpeza em cascata ──────────────
  const removeNode = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (node.type === 'technique') {
      api.workflows.deleteNode(id, nodeId).catch(() => {
        toast.error('Não foi possível remover o nó no servidor.');
      });
      // Remove arestas reais conectadas a este nó (local + backend)
      edges.forEach(e => {
        if ((e.source === nodeId || e.target === nodeId) && e.data?.backendId) {
          api.workflows.deleteEdge(id, e.data.backendId).catch(() => {});
        }
      });
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      setDatasetBindings(prev => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    } else {
      // Nó dataset: remove qualquer binding que aponte para ele
      setDatasetBindings(prev => {
        const next = {};
        for (const [techKey, ports] of Object.entries(prev)) {
          const filtered = Object.fromEntries(Object.entries(ports).filter(([, dnId]) => dnId !== nodeId));
          if (Object.keys(filtered).length) next[techKey] = filtered;
        }
        return next;
      });
    }
    setNodes(nds => nds.filter(n => n.id !== nodeId));
  }, [nodes, edges, id, setEdges, setNodes]);

  // ── onNodesChange: aplica o default do React Flow + sincroniza remoções ────
  const onNodesChange = useCallback((changes) => {
    changes.forEach(ch => {
      if (ch.type === 'remove') removeNode(ch.id);
    });
    onNodesChangeBase(changes.filter(ch => ch.type !== 'remove'));
  }, [onNodesChangeBase, removeNode]);

  // ── onNodeDragStop: persiste a posição final (evita 1 request por pixel) ───
  const onNodeDragStop = useCallback((_evt, node) => {
    if (node.type !== 'technique') return;
    api.workflows.updateNode(id, node.id, {
      position_x: Math.round(node.position.x),
      position_y: Math.round(node.position.y),
    }).catch(() => {
      toast.error('Não foi possível salvar a posição do nó.');
    });
  }, [id]);

  // ── onEdgesChange: aplica o default + sincroniza remoções ───────────────────
  const onEdgesChange = useCallback((changes) => {
    changes.forEach(ch => {
      if (ch.type !== 'remove') return;
      const edge = edges.find(e => e.id === ch.id);
      if (!edge) return;
      if (edge.data?.isDatasetBinding) {
        setDatasetBindings(prev => {
          const next = { ...prev };
          if (next[edge.target]) {
            const ports = { ...next[edge.target] };
            delete ports[edge.targetHandle];
            if (Object.keys(ports).length) next[edge.target] = ports; else delete next[edge.target];
          }
          return next;
        });
      } else if (edge.data?.backendId) {
        api.workflows.deleteEdge(id, edge.data.backendId).catch(() => {
          toast.error('Não foi possível remover a conexão no servidor.');
        });
      }
    });
    onEdgesChangeBase(changes);
  }, [edges, id, onEdgesChangeBase]);

  // ── onConnect — valida compatibilidade por PORTA e sincroniza com backend ───
  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;
    if (targetNode.type !== 'technique') {
      toast.error('Só é possível conectar a entrada de uma técnica.');
      return;
    }

    const targetPort = params.targetHandle || 'value';
    const tgtPortDef = (targetNode.data.inputPorts || []).find(p => p.name === targetPort);
    const tgtType = tgtPortDef?.type || ARRAY_TYPES.ANY;

    // Cada porta de entrada só aceita 1 ligação — remove a anterior (binding
    // de dataset ou aresta real) antes de aceitar a nova.
    const dropExisting = () => {
      setDatasetBindings(prev => {
        if (!prev[targetNode.id]?.[targetPort]) return prev;
        const next = { ...prev, [targetNode.id]: { ...prev[targetNode.id] } };
        delete next[targetNode.id][targetPort];
        return next;
      });
      const existingEdge = edges.find(e => e.target === targetNode.id && e.targetHandle === targetPort && !e.data?.isDatasetBinding);
      if (existingEdge?.data?.backendId) {
        api.workflows.deleteEdge(id, existingEdge.data.backendId).catch(() => {});
        setEdges(eds => eds.filter(e => e.id !== existingEdge.id));
      }
    };

    if (sourceNode.type === 'dataset') {
      const { valid, reason } = isValidConnection(ARRAY_TYPES.DATASET, tgtType);
      if (!valid) {
        toast.error(`Nó "${targetNode.data?.label}": ${reason}`, { duration: 4000 });
        return;
      }
      dropExisting();
      setDatasetBindings(prev => ({
        ...prev,
        [targetNode.id]: { ...(prev[targetNode.id] || {}), [targetPort]: sourceNode.id },
      }));
      setErrors(prev => prev.filter(e => !e.includes(targetNode.data?.label)));
      return;
    }

    const sourcePort = params.sourceHandle || 'value';
    const srcPortDef = (sourceNode.data.outputPorts || []).find(p => p.name === sourcePort);
    const { valid, reason } = isValidConnection(srcPortDef?.type, tgtType);
    if (!valid) {
      const msg = `Nó "${targetNode.data?.label}": ${reason}`;
      toast.error(msg, { duration: 4000 });
      setErrors(prev => [...prev.filter(e => e !== msg), msg]);
      return;
    }

    dropExisting();
    api.workflows.addEdge(id, {
      source_node_key: sourceNode.id,
      source_port:      sourcePort,
      target_node_key: targetNode.id,
      target_port:      targetPort,
    }).then(res => {
      const row = res?.data?.data ?? res?.data ?? res;
      setEdges(eds => [...eds, {
        id: `e-${row.id}`,
        source: sourceNode.id, sourceHandle: sourcePort,
        target: targetNode.id, targetHandle: targetPort,
        animated: true, style: { stroke: 'var(--accent)', strokeWidth: 2 },
        data: { backendId: row.id },
      }]);
      setErrors(prev => prev.filter(e => !e.includes(targetNode.data?.label)));
    }).catch(err => {
      const msg = err?.response?.data?.error?.details?.[0]?.message
        || err?.response?.data?.error?.message
        || 'O servidor rejeitou esta conexão.';
      toast.error(msg, { duration: 4500 });
      setErrors(prev => [...prev.filter(e => e !== msg), msg]);
    });
  }, [nodes, edges, id, setEdges]);

  // ── Adicionar técnica ao canvas (cria de verdade no backend) ────────────────
  // `dropPosition`, quando informado (arrastar do painel lateral e soltar no
  // canvas — ver onDrop mais abaixo), já vem em coordenadas do canvas via
  // screenToFlowPosition e é usado no lugar da antiga posição em grade fixa
  // (x = 300 + (n%4)*240...) — era essa grade que fazia o nó "aparecer numa
  // região aleatória" em vez de onde o usuário soltou.
  const handleAddTechnique = useCallback((tech, dropPosition) => {
    nodeCount.current += 1;
    const nodeKey = `${tech.slug}_${Date.now().toString(36)}${nodeCount.current}`;
    const position = dropPosition
      ? { x: Math.round(dropPosition.x), y: Math.round(dropPosition.y) }
      : { x: 300 + (nodeCount.current % 4) * 240, y: 140 + Math.floor(nodeCount.current / 4) * 160 };

    api.workflows.addNode(id, {
      technique_id: tech.uuid,
      node_key: nodeKey,
      name: tech.name,
      parameters: {},
      position_x: position.x,
      position_y: position.y,
    }).then(() => {
      setNodes(prev => [...prev, {
        id: nodeKey,
        type: 'technique',
        position,
        data: {
          label: tech.name,
          slug: tech.slug,
          family: tech.family,
          techUuid: tech.uuid,
          inputPorts: getPorts(tech.input_schema),
          outputPorts: getPorts(tech.output_schema),
          parameters: {},
          parameterSchema: safeJson(tech.parameter_schema, {}),
          onRemove: (nid) => onRemoveNodeRef.current?.(nid),
          onConfigure: (nid) => onConfigureRef.current?.(nid),
          onViewIO: (nid) => onViewIORef.current?.(nid),
        },
      }]);
      toast.success(`${tech.name} adicionado`, { duration: 2000 });
    }).catch(() => {
      toast.error('Não foi possível adicionar a técnica ao workflow.');
    });
  }, [id, setNodes]);

  // ── Salvar parâmetros de um nó ───────────────────────────────────────────────
  const handleSaveNodeConfig = useCallback(async (nodeId, parameters) => {
    setSavingConfig(true);
    try {
      await api.workflows.updateNode(id, nodeId, { parameters });
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, parameters } } : n));
      toast.success('Parâmetros salvos.');
      setConfigNodeId(null);
    } catch {
      toast.error('Não foi possível salvar os parâmetros.');
    } finally {
      setSavingConfig(false);
    }
  }, [id, setNodes]);

  // ── Execute: resolve dataset_bindings (uuid → tensor real) e dispara ───────
  const handleDispatch = async () => {
    if (errors.length > 0) {
      toast.error('Corrija os erros de conexão antes de executar.');
      return;
    }
    setExec(true);
    try {
      const resolvedBindings = {};
      for (const [techNodeKey, ports] of Object.entries(datasetBindings)) {
        resolvedBindings[techNodeKey] = {};
        for (const [portName, datasetNodeId] of Object.entries(ports)) {
          const dsNode = nodes.find(n => n.id === datasetNodeId);
          const uuid = dsNode?.data?.datasetUuid;
          if (!uuid) continue;
          const dsRes = await api.datasets.get(uuid);
          const dsRow = dsRes?.data?.data ?? dsRes?.data ?? dsRes;
          const meta = safeJson(dsRow?.metadata, {});
          const tensor = meta?.data?.tensor ?? meta?.data?.matrix ?? null;
          if (!tensor) {
            toast.error(`O dataset ligado à porta "${portName}" não tem dados numéricos.`);
            setExec(false);
            return;
          }
          resolvedBindings[techNodeKey][portName] = tensor;
        }
      }

      const res = await api.workflows.dispatch(id, { dataset_bindings: resolvedBindings });
      const payload = res?.data?.data ?? res?.data ?? res;
      toast.success(t('workflows.executionStarted'));
      setShowResults(true);
      startPolling(payload.execution_id);
    } catch (err) {
      const msg = err?.response?.data?.error?.details?.[0]?.message
        || err?.response?.data?.error?.message
        || t('common.error');
      toast.error(msg);
    } finally {
      setExec(false);
    }
  };

  // Reflete o resultado de uma execução (status + dados de entrada/saída por
  // nó) no canvas. Extraído do tick de polling para também ser usado na
  // hidratação ao montar a página (ver efeito abaixo) — sem isto, o único
  // jeito de ver o resultado de uma execução era ficar na mesma aba olhando
  // o polling rodar; sair e voltar (ou abrir em outra aba) mostrava o
  // workflow como se nada tivesse sido executado, daí a sensação de "preciso
  // relogar para ver o resultado da fila" relatada pelo usuário — na
  // verdade nem relogar ajudava, porque nada buscava a última execução.
  const applyExecutionToNodes = useCallback((execData) => {
    const byKey = {};
    (execData.nodes || []).forEach(n => { byKey[n.node_key] = n; });
    setNodes(prev => prev.map(n =>
      n.type === 'technique'
        ? { ...n, data: { ...n.data, execStatus: byKey[n.id]?.status || n.data.execStatus, hasExecData: !!byKey[n.id] } }
        : n
    ));
  }, [setNodes]);

  const startPolling = useCallback((executionId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await api.executions.get(executionId);
        const execData = res?.data?.data ?? res?.data ?? res;
        setExecution(execData);
        applyExecutionToNodes(execData);

        const terminal = ['completed', 'failed', 'cancelled'];
        if (terminal.includes(execData.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (execData.status === 'completed') toast.success('Execução concluída!');
          else if (execData.status === 'failed') toast.error('A execução terminou com erro em algum nó.');
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
  }, [applyExecutionToNodes]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Ao abrir o editor, busca a execução mais recente deste workflow (se
  //    houver) e: se ainda estiver rodando, retoma o polling automaticamente
  //    (em vez do usuário precisar disparar de novo ou recarregar a página
  //    repetidas vezes para eventualmente ver o resultado); se já tiver
  //    terminado, só carrega o resultado para os botões de "olho"/Resultados
  //    já funcionarem sem precisar executar de novo. ───────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.workflows.executions(id, { limit: 1, per_page: 1 });
        const list = res?.data?.data ?? res?.data ?? res ?? [];
        const latest = Array.isArray(list) ? list[0] : null;
        if (!latest || cancelled) return;

        const execRes = await api.executions.get(latest.uuid);
        const execData = execRes?.data?.data ?? execRes?.data ?? execRes;
        if (cancelled) return;
        setExecution(execData);
        applyExecutionToNodes(execData);

        const terminal = ['completed', 'failed', 'cancelled'];
        if (!terminal.includes(execData.status)) {
          setShowResults(true);
          startPolling(latest.uuid);
        }
      } catch {
        // Sem execuções anteriores (ou falha ao buscar) — tudo bem, o editor
        // só começa sem painel de resultados, como sempre começou.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Resultados: visualizar porta / salvar porta como dataset ───────────────
  const handlePreviewPort = useCallback((execNode, port, value) => {
    const dims = (() => {
      const d = []; let cur = value;
      while (Array.isArray(cur)) { d.push(cur.length); cur = cur[0]; }
      return d;
    })();
    setPreviewDataset({
      name: `${execNode.node_name || execNode.technique_slug} · ${port}`,
      dimensions: dims,
      metadata: { data: { tensor: value } },
    });
  }, []);

  const handleSavePort = useCallback((execNode, port) => {
    const name = window.prompt(`Nome do dataset para a porta "${port}" (ex: "treino", "validação", "teste"):`, `${execNode.node_name || execNode.technique_slug}_${port}`);
    if (!name || !name.trim()) return;
    // A rota exige o UUID da execução (resolveExecution busca por `uuid`,
    // não pelo id numérico) — execution.id é a PK numérica, não serve aqui.
    api.executions.saveNodeOutput(execution?.uuid, execNode.node_key, port, { name: name.trim() })
      .then(() => toast.success(`Dataset "${name.trim()}" salvo!`))
      .catch(err => {
        const msg = err?.response?.data?.error?.details?.[0]?.message || 'Não foi possível salvar este output como dataset.';
        toast.error(msg);
      });
  }, [execution]);

  // ── Famílias e filtro do painel lateral ─────────────────────────────────────
  const families = getFamiliesList(lang);
  const filteredTechs = techniques.filter(tech => {
    const matchFamily = !selectedFamily || tech.family === selectedFamily || tech.family?.includes(selectedFamily);
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q
      || tech.name?.toLowerCase().includes(q)
      || tech.slug?.toLowerCase().includes(q)
      || tech.description?.toLowerCase().includes(q)
      || tech.tags?.toString().toLowerCase().includes(q);
    return matchFamily && matchSearch;
  });
  const groupedByFamily = families.map(fam => ({
    ...fam,
    techs: filteredTechs.filter(t => t.family === fam.slug || t.family === fam.slug.replace(/^\d+_/, '')),
  })).filter(g => g.techs.length > 0);

  const configNode = nodes.find(n => n.id === configNodeId);
  const viewIONode = execution?.nodes?.find(n => n.node_key === viewIONodeKey);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonCard style={{ height: 60 }} />
        <SkeletonCard style={{ height: 'calc(100vh - 140px)' }} />
      </div>
    );
  }

  const workflow = raw?.data ?? raw;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 3rem)', gap: 0 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="card" style={{ borderRadius: '12px 12px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: 'none' }}>
        <Link
          to="/workflows"
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.8rem', transition: 'color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <ArrowLeft size={14} />
          <span>{t('workflows.back')}</span>
        </Link>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
            {workflow?.name || 'Workflow'}
          </h1>
          {workflow?.description && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {workflow.description}
            </p>
          )}
        </div>

        {errors.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fca5a5', fontSize: '0.74rem' }}>
            <AlertCircle size={13} />
            <span>{errors.length} erro{errors.length > 1 ? 's' : ''}</span>
          </div>
        )}
        {errors.length === 0 && nodes.filter(n => n.type === 'technique').length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6ee7b7', fontSize: '0.74rem' }}>
            <CheckCircle2 size={13} />
            <span>Pipeline válido</span>
          </div>
        )}

        {execution && (
          <button onClick={() => setShowResults(v => !v)} className="btn-ghost" style={{ fontSize: '0.78rem', gap: 5 }}>
            <GitBranch size={14} />
            {showResults ? 'Ocultar resultados' : 'Resultados'}
          </button>
        )}

        <button onClick={() => setPanelOpen(v => !v)} className="btn-ghost" style={{ fontSize: '0.78rem', gap: 5 }}>
          <Settings2 size={14} />
          {panelOpen ? 'Ocultar técnicas' : 'Técnicas'}
        </button>

        <button
          onClick={handleDispatch}
          disabled={executing}
          className="btn-primary"
          style={{ fontSize: '0.8rem', gap: 5 }}
        >
          {executing ? <Loader2 size={13} className="anim-spin" /> : <Play size={13} />}
          {executing ? t('workflows.executing') : t('workflows.execute')}
        </button>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderRadius: '0 0 12px 12px', border: '1px solid var(--border)', borderTop: 'none' }}>

        {/* ── ReactFlow canvas ─────────────────────────────────────────────── */}
        <div
          style={{ flex: 1, position: 'relative', background: 'var(--bg-base)' }}
          onDragOver={e => {
            // Precisa de preventDefault para o onDrop disparar (regra da
            // HTML5 Drag & Drop API) — sem isto o navegador simplesmente
            // rejeita o drop.
            if (e.dataTransfer.types.includes('application/x-tchelab-technique')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={e => {
            const techUuid = e.dataTransfer.getData('application/x-tchelab-technique');
            if (!techUuid) return;
            e.preventDefault();
            const tech = techniques.find(t => t.uuid === techUuid);
            if (!tech) return;
            const position = rfInstanceRef.current
              ? rfInstanceRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
              : { x: 300, y: 140 };
            handleAddTechnique(tech, position);
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(instance) => { rfInstanceRef.current = instance; }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: 'var(--accent)', strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === 'dataset') return '#2563eb';
                const cfg = getFamilyConfig(n.data?.family);
                return cfg?.color || '#64748b';
              }}
              maskColor="rgba(10,15,30,0.7)"
              style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
            />

            {nodes.filter(n => n.type === 'technique').length === 0 && (
              <Panel position="top-center">
                <div style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 18px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-secondary)', fontSize: '0.8rem',
                }}>
                  <GitBranch size={14} />
                  <span>Arraste técnicas do painel lateral para o canvas</span>
                </div>
              </Panel>
            )}

            {errors.length > 0 && (
              <Panel position="bottom-left">
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10, padding: '8px 12px', maxWidth: 320,
                }}>
                  {errors.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.72rem', color: '#fca5a5', marginBottom: i < errors.length - 1 ? 4 : 0 }}>
                      <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {configNode && (
              <Panel position="top-right">
                <NodeConfigPanel node={configNode} onClose={() => setConfigNodeId(null)} onSave={handleSaveNodeConfig} saving={savingConfig} />
              </Panel>
            )}

            {!configNode && viewIONode && (
              <Panel position="top-right">
                <NodeIOPanel
                  execNode={viewIONode}
                  onClose={() => setViewIONodeKey(null)}
                  onPreviewPort={handlePreviewPort}
                  onSavePort={handleSavePort}
                />
              </Panel>
            )}

            {showResults && execution && !configNode && !viewIONode && (
              <Panel position="top-right">
                <ResultsPanel
                  execution={execution}
                  onClose={() => setShowResults(false)}
                  onPreviewPort={handlePreviewPort}
                  onSavePort={handleSavePort}
                />
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* ── Painel de técnicas ──────────────────────────────────────────────── */}
        {panelOpen && (
          <aside style={{
            width: 300, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
          }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 30, paddingTop: '0.5rem', paddingBottom: '0.5rem', fontSize: '0.8rem' }}
                  placeholder={t('workflows.searchTechnique')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                <button
                  onClick={() => setFamily('')}
                  style={{
                    fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    background: !selectedFamily ? 'var(--accent)' : 'var(--bg-hover)',
                    color: !selectedFamily ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${!selectedFamily ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.14s',
                  }}
                >
                  {t('workflows.allFamilies')}
                </button>
                {families.map(fam => (
                  <button
                    key={fam.slug}
                    onClick={() => setFamily(fam.slug === selectedFamily ? '' : fam.slug)}
                    style={{
                      fontSize: '0.62rem', fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                      background: selectedFamily === fam.slug ? fam.bg : 'transparent',
                      color: selectedFamily === fam.slug ? fam.color : 'var(--text-muted)',
                      border: `1px solid ${selectedFamily === fam.slug ? fam.border : 'var(--border)'}`,
                      cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap',
                    }}
                  >
                    {fam.labelStr}
                  </button>
                ))}
              </div>

              {techsLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                  <Loader2 size={20} className="anim-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              )}

              {!techsLoading && groupedByFamily.map(group => (
                <div key={group.slug} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => setFamsOpen(p => ({ ...p, [group.slug]: !p[group.slug] }))}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 6px', borderRadius: 7,
                      background: 'none', border: 'none', cursor: 'pointer',
                      marginBottom: 4, transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = group.bg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: group.color, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {group.labelStr}
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginRight: 4 }}>
                      {group.techs.length}
                    </span>
                    {familiesOpen[group.slug] ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
                  </button>

                  {(familiesOpen[group.slug] || searchQuery || selectedFamily) && (
                    <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
                      {group.techs.map(tech => (
                        <TechniqueCard key={tech.uuid || tech.id || tech.slug} tech={tech} onAdd={handleAddTechnique} lang={lang} />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {!techsLoading && groupedByFamily.length === 0 && (
                <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhuma técnica encontrada</p>
                </div>
              )}
            </div>

            <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => {
                  nodeCount.current += 1;
                  const dsId = `dataset-${nodeCount.current}`;
                  setNodes(prev => [...prev, {
                    id: dsId,
                    type: 'dataset',
                    position: { x: 40, y: 60 + nodeCount.current * 110 },
                    data: {
                      label: 'Dataset', datasetUuid: '',
                      datasets: datasetsList,
                      onChange: (nid, uuid, dsObj) => onDatasetChangeRef.current?.(nid, uuid, dsObj),
                      onPreview: (uuid) => onPreviewRef.current?.(uuid),
                      onRemove: (nid) => onRemoveNodeRef.current?.(nid),
                    },
                  }]);
                }}
                className="btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem', gap: 5 }}
              >
                <DbIcon size={13} />
                {t('workflows.datasetNode')}
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ── Modal de visualização multidimensional (dataset ou porta de saída) ── */}
      {previewDataset && (
        <MultiDimModal dataset={previewDataset} onClose={() => setPreviewDataset(null)} />
      )}
    </div>
  );
}
