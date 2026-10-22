import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GitBranch, Database } from 'lucide-react';
import Modal from '../ui/Modal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

const muted = { color: 'var(--text-muted)' };
const parse = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };

/** Miniatura somente-leitura do grafo do workflow (sem abrir o editor). */
function WorkflowGraph({ nodes, edges }) {
  const { t } = useTranslation();
  const W = 150; const H = 44;
  const box = useMemo(() => {
    if (!nodes.length) return null;
    const xs = nodes.map(n => Number(n.position_x) || 0); const ys = nodes.map(n => Number(n.position_y) || 0);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    return { minX, minY, w: Math.max(...xs) - minX + W + 40, h: Math.max(...ys) - minY + H + 40 };
  }, [nodes]);
  if (!box) return <p className="text-sm" style={muted}>{t('communities.previewEmptyWorkflow')}</p>;
  const pos = (n) => ({ x: (Number(n.position_x) || 0) - box.minX + 20, y: (Number(n.position_y) || 0) - box.minY + 20 });
  const byKey = new Map(nodes.map(n => [n.node_key, n]));
  return (
    <div className="rounded-lg overflow-auto" style={{ background: 'var(--bg-hover)', maxHeight: '55vh' }}>
      <svg viewBox={`0 0 ${box.w} ${box.h}`} style={{ width: '100%', maxWidth: Math.max(box.w * 1.3, 380), minWidth: Math.min(box.w, 520), height: 'auto', margin: '0 auto', display: 'block' }} role="img" aria-label={t('communities.previewWorkflowAria')}>
        <defs><marker id="pv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" /></marker></defs>
        {edges.map((e, i) => {
          const a = byKey.get(e.source_node_key); const b = byKey.get(e.target_node_key);
          if (!a || !b) return null;
          const p = pos(a); const q = pos(b);
          return <line key={i} x1={p.x + W} y1={p.y + H / 2} x2={q.x} y2={q.y + H / 2} stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#pv-arrow)" />;
        })}
        {nodes.map(n => {
          const p = pos(n);
          const label = String(n.name || n.node_key || '').slice(0, 22);
          return (
            <g key={n.node_key} transform={`translate(${p.x},${p.y})`}>
              <rect width={W} height={H} rx="8" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.4" />
              <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fontSize="12" fill="#e2e8f0" fontFamily="Inter, sans-serif">{label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WorkflowPreview({ uuid }) {
  const { t } = useTranslation();
  const { data, loading, error } = useApi(() => api.workflows.get(uuid), [uuid]);
  if (loading) return <p className="text-sm" style={muted}>{t('common.loading')}</p>;
  if (error || !data) return <p className="text-sm text-red-400">{t('communities.previewError')}</p>;
  const nodes = data.nodes || []; const edges = data.edges || [];
  return (
    <div className="space-y-3">
      <p className="text-xs" style={muted}>{t('communities.previewWorkflowSummary', { nodes: nodes.length, edges: edges.length })}</p>
      <WorkflowGraph nodes={nodes} edges={edges} />
    </div>
  );
}

function DatasetPreview({ uuid }) {
  const { t } = useTranslation();
  const { data, loading, error } = useApi(() => api.datasets.get(uuid), [uuid]);
  if (loading) return <p className="text-sm" style={muted}>{t('common.loading')}</p>;
  if (error || !data) return <p className="text-sm text-red-400">{t('communities.previewError')}</p>;
  const dims = parse(data.dimensions);
  const meta = parse(data.metadata);
  const d = meta?.data;
  const cols = (d?.columns || []).slice(0, 12);
  const rows = (d?.matrix || []).slice(0, 12);
  return (
    <div className="space-y-3">
      <p className="text-xs" style={muted}>
        {Array.isArray(dims) ? `${t('communities.previewDims')}: ${dims.join(' × ')}` : ''}
        {Array.isArray(dims) && dims.length > 2 ? ` · ${t('communities.previewMultiway')}` : ''}
      </p>
      {cols.length > 0 && rows.length > 0 ? (
        <div className="overflow-auto rounded-lg" style={{ maxHeight: '50vh', border: '1px solid var(--border)' }}>
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--bg-hover)' }}>
              <th className="px-3 py-2 text-left" style={muted}>#</th>
              {cols.map((c, i) => <th key={i} className="px-3 py-2 text-left whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{c}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-1.5 font-mono" style={muted}>{ri + 1}</td>
                  {row.slice(0, 12).map((cell, ci) => <td key={ci} className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{cell == null ? '—' : Number(cell).toFixed(4)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm" style={muted}>{Array.isArray(dims) && dims.length > 2 ? t('communities.previewMultiwayNote') : t('communities.previewNoTable')}</p>}
      {d?.matrix && (d.matrix.length > 12 || (d.columns || []).length > 12) && <p className="text-xs" style={muted}>{t('communities.previewTruncated')}</p>}
    </div>
  );
}

/** Pré-visualização rápida de workflow / variável do Workspace, sem sair da comunidade. */
export default function PreviewModal({ target, onClose }) {
  const { t } = useTranslation();
  if (!target) return null;
  const isWf = target.kind === 'workflow';
  const Icon = isWf ? GitBranch : Database;
  return (
    <Modal open onClose={onClose} size="lg" title={(
      <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {target.name || (isWf ? t('communities.itemWorkflow') : t('communities.itemDataset'))}</span>
    )}>
      {isWf ? <WorkflowPreview uuid={target.uuid} /> : <DatasetPreview uuid={target.uuid} />}
      <div className="mt-4 flex justify-end">
        <Link to={isWf ? `/workflows/${target.uuid}` : `/datasets/${target.uuid}`} className="btn-primary text-sm">{t('communities.open')}</Link>
      </div>
    </Modal>
  );
}
