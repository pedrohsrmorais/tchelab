import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, GitBranch, Eye, BarChart2, Activity, Table } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-slate-500 text-sm w-40 flex-shrink-0">{label}</span>
      <span className="text-slate-200 text-sm break-all">{String(value)}</span>
    </div>
  );
}

function Badge({ children, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-500/20 text-blue-300',
    purple: 'bg-purple-500/20 text-purple-300',
    green:  'bg-green-500/20 text-green-300',
    amber:  'bg-amber-500/20 text-amber-300',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.blue}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-white">{value ?? '—'}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// Tab: data preview table
function PreviewTab({ meta }) {
  const data = meta?.data;
  if (!data || !data.columns?.length) {
    return (
      <EmptyState
        icon={Table}
        title="Sem dados para visualizar"
        description="Este dataset ainda não possui dados importados."
      />
    );
  }

  const { columns, matrix, row_labels, class_column } = data;
  const showClassCol = class_column && row_labels?.length;
  const displayRows = (matrix || []).slice(0, 50); // show first 50 rows

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Mostrando {displayRows.length} de {matrix?.length ?? 0} amostras · {columns.length} variável{columns.length !== 1 ? 'is' : ''}
        </span>
        {showClassCol && (
          <span className="text-xs text-slate-500">Coluna de classe: <strong className="text-slate-300">{class_column}</strong></span>
        )}
      </div>
      <div className="overflow-auto" style={{ maxHeight: '480px' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr style={{ background: 'rgba(30, 58, 138, 0.4)' }}>
              <th className="px-3 py-2.5 text-left text-slate-500 font-medium text-xs border-b border-white/10 w-12">#</th>
              {showClassCol && (
                <th className="px-3 py-2.5 text-left text-amber-300 font-medium text-xs border-b border-white/10 whitespace-nowrap">
                  {class_column}
                </th>
              )}
              {columns.map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left text-blue-300 font-medium text-xs border-b border-white/10 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{ri + 1}</td>
                {showClassCol && (
                  <td className="px-3 py-2 text-amber-300 font-mono text-xs font-medium whitespace-nowrap">
                    {row_labels[ri] ?? '—'}
                  </td>
                )}
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-300 font-mono text-xs whitespace-nowrap">
                    {cell !== null && cell !== undefined ? Number(cell).toFixed(4) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tab: statistics from col_stats
function StatsTab({ meta }) {
  const stats = meta?.col_stats;
  if (!stats?.length) {
    return (
      <EmptyState
        icon={BarChart2}
        title="Estatísticas não disponíveis"
        description="Importe um dataset para ver as estatísticas das variáveis."
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <span className="text-sm text-slate-400">{stats.length} variável{stats.length !== 1 ? 'is' : ''} analisada{stats.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-auto" style={{ maxHeight: '480px' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr style={{ background: 'rgba(30, 58, 138, 0.4)' }}>
              {['Variável', 'Mín', 'Máx', 'Média'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-blue-300 font-medium text-xs border-b border-white/10">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-2 text-slate-300 text-xs font-medium">{s.col}</td>
                <td className="px-4 py-2 text-slate-300 font-mono text-xs">{s.min?.toFixed(6)}</td>
                <td className="px-4 py-2 text-slate-300 font-mono text-xs">{s.max?.toFixed(6)}</td>
                <td className="px-4 py-2 text-slate-300 font-mono text-xs">{s.mean?.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DatasetDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('preview');

  const { data: raw, loading } = useApi(() => api.datasets.get(id), [id]);
  const { data: lineageRaw, loading: lineageLoading } = useApi(() => api.datasets.lineage(id), [id]);

  const ds = useMemo(() => raw?.data ?? raw, [raw]);

  // Parse JSON fields
  const dimensions = useMemo(() => {
    if (!ds?.dimensions) return null;
    try { return typeof ds.dimensions === 'string' ? JSON.parse(ds.dimensions) : ds.dimensions; } catch { return null; }
  }, [ds]);

  const metadata = useMemo(() => {
    if (!ds?.metadata) return null;
    try { return typeof ds.metadata === 'string' ? JSON.parse(ds.metadata) : ds.metadata; } catch { return null; }
  }, [ds]);

  const modeLabels = useMemo(() => {
    if (!ds?.mode_labels) return null;
    try { return typeof ds.mode_labels === 'string' ? JSON.parse(ds.mode_labels) : ds.mode_labels; } catch { return null; }
  }, [ds]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (!ds) {
    return (
      <EmptyState
        icon={Database}
        title="Dataset não encontrado"
        description="Este dataset não existe ou foi removido."
      />
    );
  }

  const dimensionStr = Array.isArray(dimensions) ? dimensions.join(' × ') : null;
  const nSamples   = Array.isArray(dimensions) ? dimensions[0] : null;
  const nVariables = Array.isArray(dimensions) ? dimensions[1] : null;

  const lineageList = lineageRaw?.data ?? (Array.isArray(lineageRaw) ? lineageRaw : []);
  const classValues = metadata?.class_values ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/datasets" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar aos Datasets
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold text-white">{ds.name}</h1>
                  <p className="text-slate-400 mt-1">{ds.description || 'Sem descrição'}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ds.data_type  && <Badge color="purple">{ds.data_type}</Badge>}
                  {ds.visibility && <Badge color={ds.visibility === 'public' ? 'green' : 'amber'}>{ds.visibility}</Badge>}
                  {ds.technique  && <Badge color="blue">{ds.technique}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 flex-wrap">
                {nSamples   !== null && <span><strong className="text-slate-300">{nSamples}</strong> amostras</span>}
                {nVariables !== null && <span><strong className="text-slate-300">{nVariables}</strong> variáveis</span>}
                {ds.x_points != null && ds.x_min != null && (
                  <span>Range: <strong className="text-slate-300">{ds.x_min}–{ds.x_max}</strong></span>
                )}
                {ds.file_format && <span>Formato: <strong className="text-slate-300">{ds.file_format.toUpperCase()}</strong></span>}
                {classValues.length > 0 && (
                  <span>Classes: <strong className="text-slate-300">{classValues.join(', ')}</strong></span>
                )}
                <span>Criado em: <strong className="text-slate-300">{new Date(ds.created_at).toLocaleDateString('pt-BR')}</strong></span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Stats row */}
      {(nSamples !== null || nVariables !== null || ds.x_points != null) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Amostras"   value={nSamples}   sub="linhas importadas" />
          <StatCard label="Variáveis"  value={nVariables} sub="colunas numéricas" />
          {ds.x_points != null && <StatCard label="Pontos X"  value={ds.x_points} sub={ds.x_unit || 'por espectro'} />}
          {classValues.length > 0 && <StatCard label="Classes" value={classValues.length} sub={classValues.join(', ')} />}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tab active={tab === 'preview'} onClick={() => setTab('preview')}>
          <Eye className="w-4 h-4 inline mr-1.5" />Dados
        </Tab>
        <Tab active={tab === 'stats'} onClick={() => setTab('stats')}>
          <BarChart2 className="w-4 h-4 inline mr-1.5" />Estatísticas
        </Tab>
        <Tab active={tab === 'info'} onClick={() => setTab('info')}>
          <Activity className="w-4 h-4 inline mr-1.5" />Informações
        </Tab>
        <Tab active={tab === 'lineage'} onClick={() => setTab('lineage')}>
          <GitBranch className="w-4 h-4 inline mr-1.5" />Linhagem
        </Tab>
      </div>

      {/* Tab: Preview */}
      {tab === 'preview' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PreviewTab meta={metadata} />
        </motion.div>
      )}

      {/* Tab: Stats */}
      {tab === 'stats' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <StatsTab meta={metadata} />
        </motion.div>
      )}

      {/* Tab: Informações */}
      {tab === 'info' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 space-y-1">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Metadados</h3>
          <InfoRow label="UUID"            value={ds.uuid} />
          <InfoRow label="Tipo de dado"    value={ds.data_type} />
          <InfoRow label="Técnica"         value={ds.technique} />
          <InfoRow label="Visibilidade"    value={ds.visibility} />
          <InfoRow label="Formato"         value={ds.file_format} />
          <InfoRow label="Dimensões"       value={dimensionStr} />
          <InfoRow label="Pontos X"        value={ds.x_points != null ? String(ds.x_points) : null} />
          <InfoRow label="X mínimo"        value={ds.x_min != null ? String(ds.x_min) : null} />
          <InfoRow label="X máximo"        value={ds.x_max != null ? String(ds.x_max) : null} />
          <InfoRow label="Unidade X"       value={ds.x_unit} />
          <InfoRow label="Unidade Y"       value={ds.y_unit} />
          <InfoRow label="Caminho"         value={ds.storage_path} />
          <InfoRow label="Criado em"       value={new Date(ds.created_at).toLocaleString('pt-BR')} />
          <InfoRow label="Atualizado em"   value={ds.updated_at ? new Date(ds.updated_at).toLocaleString('pt-BR') : null} />

          {modeLabels && (
            <div className="py-2.5 border-b border-white/5">
              <span className="text-slate-500 text-sm block mb-2">Rótulos de modo</span>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(modeLabels) ? modeLabels : [modeLabels]).map((label, i) => (
                  <Badge key={i} color="blue">{label}</Badge>
                ))}
              </div>
            </div>
          )}

          {metadata?.feature_headers?.length > 0 && (
            <div className="py-2.5">
              <span className="text-slate-500 text-sm block mb-2">
                Colunas detectadas ({metadata.feature_headers.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {metadata.feature_headers.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-xs text-slate-300 font-mono">{h}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Tab: Linhagem */}
      {tab === 'lineage' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Linhagem do Dataset</h3>
          {lineageLoading ? (
            <SkeletonCard className="h-24" />
          ) : lineageList.length > 0 ? (
            <div className="space-y-3">
              {lineageList.map((l, i) => (
                <div key={i} className="flex items-center gap-3 text-sm p-3 rounded-lg bg-white/5">
                  <GitBranch className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-slate-300">{l.action || l.operation || l.description || JSON.stringify(l)}</span>
                  </div>
                  {l.created_at && (
                    <span className="text-slate-500 text-xs ml-auto whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Nenhum histórico de linhagem disponível.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
