'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  addEdge,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Play, Save, Search, ChevronDown, ChevronRight,
  Database as DbIcon, X, Info, AlertCircle, CheckCircle2,
  Settings2, Trash2, GitBranch, Loader2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { api } from '../api';
import { useApi, useMutation } from '../hooks/useApi';
import SkeletonCard from '../components/ui/SkeletonCard';
import {
  FAMILIES, getFamilyConfig, getFamiliesList, isValidConnection, parseSchema, ARRAY_TYPES,
} from '../config/techniqueRegistry';

// ────────────────────────────────────────────────────────────────────────────────
// Custom node: Dataset (nó de entrada)
// ────────────────────────────────────────────────────────────────────────────────
function DatasetNode({ data, selected }) {
  const { data: dsRaw } = useApi(api.datasets.list, []);
  const datasets = (dsRaw?.data ?? dsRaw ?? []);

  const selectedDs = datasets.find(d => d.uuid === data.datasetUuid);

  return (
    <div style={{
      minWidth: 200,
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
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dataset
        </span>
      </div>

      {/* Seletor de dataset */}
      <select
        value={data.datasetUuid || ''}
        onChange={e => data.onChange && data.onChange(e.target.value, datasets.find(d => d.uuid === e.target.value))}
        className="nodrag"
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(37,99,235,0.35)',
          borderRadius: 6,
          color: data.datasetUuid ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '0.78rem',
          padding: '4px 8px',
          cursor: 'pointer',
          outline: 'none',
          marginBottom: 4,
        }}
      >
        <option value="">— Selecionar dataset —</option>
        {datasets.map(d => (
          <option key={d.uuid} value={d.uuid}>{d.name}</option>
        ))}
      </select>

      {/* Info do dataset selecionado */}
      {selectedDs && (
        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {selectedDs.data_type || 'matrix'}{selectedDs.dimensions ? ` · ${JSON.stringify(selectedDs.dimensions)}` : ''}
        </p>
      )}
      {!data.datasetUuid && (
        <p style={{ fontSize: '0.68rem', color: '#fbbf24', margin: '2px 0 0' }}>
          ⚠ Nenhum dataset selecionado
        </p>
      )}

      {/* Só tem saída */}
      <Handle type="source" position={Position.Right}
        style={{ background: '#3b82f6', width: 10, height: 10, border: '2px solid var(--bg-surface)' }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Custom node: Technique
// ────────────────────────────────────────────────────────────────────────────────
function TechniqueNode({ data, selected }) {
  const familyCfg = getFamilyConfig(data.family);
  const color  = familyCfg?.color  || '#64748b';
  const bg     = familyCfg?.bg     || 'rgba(100,116,139,0.1)';
  const border = familyCfg?.border || 'rgba(100,116,139,0.3)';

  return (
    <div style={{
      minWidth: 200,
      background: selected ? `rgba(${hexToRgb(color)},0.18)` : 'rgba(10,15,30,0.96)',
      border: `2px solid ${selected ? color : border}`,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: selected ? `0 0 0 3px rgba(${hexToRgb(color)},0.2)` : 'var(--shadow)',
      transition: 'all 0.2s',
      position: 'relative',
    }}>
      {/* Input handle */}
      <Handle type="target" position={Position.Left}
        style={{ background: color, width: 10, height: 10, border: '2px solid var(--bg-surface)' }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
          boxShadow: `0 0 6px ${color}`,
        }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {familyCfg?.labelStr || data.family}
        </span>
      </div>

      {/* Name */}
      <p style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
        {data.label}
      </p>

      {/* Slug */}
      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>
        {data.slug}
      </p>

      {/* I/O chips */}
      <div style={{ display: 'flex', gap: 4, marginTop: 7, flexWrap: 'wrap' }}>
        {data.inputType && data.inputType !== ARRAY_TYPES.ANY && (
          <span style={{
            fontSize: '0.62rem', fontWeight: 600,
            padding: '1px 6px', borderRadius: 999,
            background: 'rgba(100,116,139,0.2)',
            color: 'var(--text-muted)',
            border: '1px solid rgba(100,116,139,0.25)',
          }}>
            IN: {data.inputType}
          </span>
        )}
        {data.outputType && data.outputType !== ARRAY_TYPES.ANY && (
          <span style={{
            fontSize: '0.62rem', fontWeight: 600,
            padding: '1px 6px', borderRadius: 999,
            background: `rgba(${hexToRgb(color)},0.15)`,
            color,
            border: `1px solid rgba(${hexToRgb(color)},0.3)`,
          }}>
            OUT: {data.outputType}
          </span>
        )}
      </div>

      {/* Output handle */}
      <Handle type="source" position={Position.Right}
        style={{ background: color, width: 10, height: 10, border: '2px solid var(--bg-surface)' }}
      />
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
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
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
          {/* Família */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: familyCfg?.color || '#64748b', flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: familyCfg?.color || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {familyCfg?.labelStr || tech.family}
            </span>
          </div>

          {/* Nome */}
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
            {tech.name}
          </p>
        </div>

        {/* Info toggle */}
        <button
          onClick={e => { e.stopPropagation(); setShowInfo(v => !v); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Info size={13} />
        </button>
      </div>

      {/* I/O badges */}
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

      {/* Expanded info */}
        {showInfo && (
          <div
            style={{ overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {tech.description && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>
                  {tech.description}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                    Input
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                    {inputSchema.type}
                    {inputSchema.shape && <span style={{ color: 'var(--text-muted)' }}> {inputSchema.shape}</span>}
                  </p>
                  {inputSchema.description && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{inputSchema.description}</p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                    Output
                  </p>
                  <p style={{ fontSize: '0.7rem', color: familyCfg?.color || 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                    {outputSchema.type}
                    {outputSchema.shape && <span style={{ color: 'var(--text-muted)' }}> {outputSchema.shape}</span>}
                  </p>
                  {outputSchema.description && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{outputSchema.description}</p>
                  )}
                </div>
              </div>

              {tech.tags && tech.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {(typeof tech.tags === 'string' ? JSON.parse(tech.tags) : tech.tags).map(tag => (
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
// Main page
// ────────────────────────────────────────────────────────────────────────────────
export default function WorkflowEditorPage() {
  const { id }       = useParams();
  const { t, i18n } = useTranslation();
  const lang         = i18n.language || 'pt';

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Painel lateral
  const [panelOpen,      setPanelOpen]   = useState(true);
  const [searchQuery,    setSearchQuery] = useState('');
  const [selectedFamily, setFamily]      = useState('');
  const [familiesOpen,   setFamsOpen]    = useState({});

  // Validação
  const [errors, setErrors]     = useState([]);
  const [executing, setExec]    = useState(false);
  const [saving, setSaving]     = useState(false);

  // Node counter para IDs únicos
  const nodeCount = useRef(0);

  // ── Load workflow ────────────────────────────────────────────────────────────
  const { data: raw, loading } = useApi(() => api.workflows.get(id), [id]);
  const { data: nodesRaw }     = useApi(() => api.workflows.nodes(id), [id]);
  const { data: edgesRaw }     = useApi(() => api.workflows.edges(id), [id]);

  // ── Load techniques from API ─────────────────────────────────────────────────
  const { data: techsRaw, loading: techsLoading } = useApi(() =>
    api.techniques.list({ limit: 500, is_custom: false }), []
  );
  const techniques = (techsRaw?.data ?? techsRaw ?? []);

  // ── Populate ReactFlow from existing workflow nodes/edges ────────────────────
  useEffect(() => {
    if (!nodesRaw) return;
    const list = nodesRaw?.data ?? nodesRaw ?? [];
    const rfNodes = list.map((n, i) => ({
      id:       String(n.id || n.uuid || i),
      type:     'technique',
      position: { x: 260 + i * 230, y: 180 },
      data: {
        label:      n.name,
        slug:       n.technique_slug || n.node_key,
        family:     n.family || '',
        inputType:  parseSchema(n.input_schema).type,
        outputType: parseSchema(n.output_schema).type,
      },
    }));
    if (rfNodes.length > 0) {
      setNodes(prev => [...datasetStarterNode(), ...rfNodes]);
    } else {
      setNodes(datasetStarterNode());
    }
    nodeCount.current = rfNodes.length + 1;
  }, [nodesRaw]);

  useEffect(() => {
    if (!edgesRaw) return;
    const list = edgesRaw?.data ?? edgesRaw ?? [];
    const rfEdges = list.map(e => ({
      id:     `e-${e.source_node_key}-${e.target_node_key}`,
      source: String(e.source_node_key),
      target: String(e.target_node_key),
      animated: true,
      style: { stroke: 'var(--accent)', strokeWidth: 2 },
    }));
    setEdges(rfEdges);
  }, [edgesRaw]);

  // ── Dataset starter node ─────────────────────────────────────────────────────
  // Usamos uma ref para o callback para evitar recriar os nodes a cada render
  const onDatasetChangeRef = useRef(null);
  onDatasetChangeRef.current = (uuid, dsObj) => {
    setNodes(prev => prev.map(n =>
      n.id === 'dataset-0'
        ? { ...n, data: { ...n.data, datasetUuid: uuid, label: dsObj?.name || 'Dataset de entrada' } }
        : n
    ));
  };

  function datasetStarterNode() {
    return [{
      id:       'dataset-0',
      type:     'dataset',
      position: { x: 40, y: 180 },
      data: {
        label: 'Dataset de entrada',
        outputType: ARRAY_TYPES.DATASET,
        datasetUuid: '',
        onChange: (uuid, dsObj) => onDatasetChangeRef.current?.(uuid, dsObj),
      },
    }];
  }

  // ── onConnect — valida compatibilidade ───────────────────────────────────────
  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;

    const { valid, reason } = isValidConnection(sourceNode, targetNode);
    if (!valid) {
      const msg = `Nó "${targetNode.data?.label}": ${reason}`;
      toast.error(msg, { duration: 4000 });
      setErrors(prev => [...prev.filter(e => e !== msg), msg]);
      return;
    }

    setEdges(eds => addEdge({
      ...params,
      animated: true,
      style: { stroke: 'var(--accent)', strokeWidth: 2 },
    }, eds));
    setErrors(prev => prev.filter(e => !e.includes(targetNode.data?.label)));
  }, [nodes, setEdges]);

  // ── Adicionar técnica ao canvas ──────────────────────────────────────────────
  const handleAddTechnique = useCallback((tech) => {
    nodeCount.current += 1;
    const nodeId    = `tech-${nodeCount.current}`;
    const inputSch  = parseSchema(tech.input_schema);
    const outputSch = parseSchema(tech.output_schema);

    const newNode = {
      id:       nodeId,
      type:     'technique',
      position: { x: 260 + (nodeCount.current - 1) * 230, y: 160 + (nodeCount.current % 3) * 60 },
      data: {
        label:      tech.name,
        slug:       tech.slug,
        family:     tech.family,
        inputType:  inputSch.type,
        outputType: outputSch.type,
        techId:     tech.uuid,
      },
    };
    setNodes(prev => [...prev, newNode]);
    toast.success(`${tech.name} adicionado`, { duration: 2000 });
  }, [setNodes]);

  // ── Execute ──────────────────────────────────────────────────────────────────
  const handleDispatch = async () => {
    setExec(true);
    try {
      await api.workflows.dispatch(id, {});
      toast.success(t('workflows.executionStarted'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setExec(false);
    }
  };

  // ── Salvar (sync nodes/edges para o backend) ─────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      // Por enquanto: snapshot da versão atual
      await api.workflows.snapshot(id);
      toast.success('Snapshot salvo!');
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  // ── Famílias para o painel ───────────────────────────────────────────────────
  const families = getFamiliesList(lang);

  // ── Filtrar técnicas ─────────────────────────────────────────────────────────
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

  // Agrupa por família para exibição em accordions
  const groupedByFamily = families.map(fam => ({
    ...fam,
    techs: filteredTechs.filter(t =>
      t.family === fam.slug || t.family === fam.slug.replace(/^\d+_/, '')
    ),
  })).filter(g => g.techs.length > 0);

  // ── Loading ──────────────────────────────────────────────────────────────────
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

        {/* Errors indicator */}
        {errors.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fca5a5', fontSize: '0.74rem' }}>
            <AlertCircle size={13} />
            <span>{errors.length} erro{errors.length > 1 ? 's' : ''}</span>
          </div>
        )}
        {errors.length === 0 && nodes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6ee7b7', fontSize: '0.74rem' }}>
            <CheckCircle2 size={13} />
            <span>Pipeline válido</span>
          </div>
        )}

        <button
          onClick={() => setPanelOpen(v => !v)}
          className="btn-ghost"
          style={{ fontSize: '0.78rem', gap: 5 }}
        >
          <Settings2 size={14} />
          {panelOpen ? 'Ocultar técnicas' : 'Técnicas'}
        </button>

        <button onClick={handleSave} disabled={saving} className="btn-ghost" style={{ fontSize: '0.78rem', gap: 5 }}>
          {saving ? <Loader2 size={13} className="anim-spin" /> : <Save size={13} />}
          {t('workflows.save')}
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
        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-base)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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

            {/* Empty state */}
            {nodes.length <= 1 && (
              <Panel position="top-center">
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 18px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--text-secondary)', fontSize: '0.8rem',
                  }}
                >
                  <GitBranch size={14} />
                  <span>Arraste técnicas do painel lateral para o canvas</span>
                </div>
              </Panel>
            )}

            {/* Error list */}
            {errors.length > 0 && (
              <Panel position="bottom-left">
                <div
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '8px 12px', maxWidth: 320,
                  }}
                >
                  {errors.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.72rem', color: '#fca5a5', marginBottom: i < errors.length - 1 ? 4 : 0 }}>
                      <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* ── Painel de técnicas ──────────────────────────────────────────────── */}
          {panelOpen && (
            <aside
              style={{
                width: 300,
                background: 'var(--bg-surface)',
                borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden', flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
                {/* Search */}
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

                {/* Family filter pills */}
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
                        cursor: 'pointer', transition: 'all 0.14s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fam.labelStr}
                    </button>
                  ))}
                </div>

                {/* Loading */}
                {techsLoading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                    <Loader2 size={20} className="anim-spin" style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}

                {/* Grouped accordions */}
                {!techsLoading && groupedByFamily.map(group => (
                  <div key={group.slug} style={{ marginBottom: 8 }}>
                    {/* Group header */}
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
                      {familiesOpen[group.slug]
                        ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                      }
                    </button>

                      {(familiesOpen[group.slug] || searchQuery || selectedFamily) && (
                        <div
                          style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}
                        >
                          {group.techs.map(tech => (
                            <TechniqueCard
                              key={tech.uuid || tech.id || tech.slug}
                              tech={tech}
                              onAdd={handleAddTechnique}
                              lang={lang}
                            />
                          ))}
                        </div>
                      )}
                  </div>
                ))}

                {!techsLoading && groupedByFamily.length === 0 && (
                  <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Nenhuma técnica encontrada
                    </p>
                  </div>
                )}
              </div>

              {/* Dataset adder */}
              <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => {
                    nodeCount.current += 1;
                    setNodes(prev => [...prev, {
                      id:       `dataset-${nodeCount.current}`,
                      type:     'dataset',
                      position: { x: 40, y: 60 + nodeCount.current * 80 },
                      data:     { label: 'Dataset', outputType: ARRAY_TYPES.DATASET },
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
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Utility: hex → r,g,b string for rgba()
// ────────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return '100,116,139';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '100,116,139';
  return `${r},${g},${b}`;
}
