import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, GitBranch, Eye, BarChart2, Tag, Layers, Activity } from 'lucide-react';
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

export default function DatasetDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('info');

  const { data: raw, loading } = useApi(() => api.datasets.get(id), [id]);
  const { data: lineageRaw, loading: lineageLoading } = useApi(() => api.datasets.lineage(id), [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-32" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  const ds = raw?.data ?? raw;
  if (!ds) {
    return (
      <EmptyState
        icon={Database}
        title="Dataset não encontrado"
        description="Este dataset não existe ou foi removido."
      />
    );
  }

  // Parse JSON fields that come as strings from MySQL
  const dimensions  = ds.dimensions  ? (typeof ds.dimensions  === 'string' ? (() => { try { return JSON.parse(ds.dimensions);  } catch { return ds.dimensions;  } })() : ds.dimensions)  : null;
  const modeLabels  = ds.mode_labels  ? (typeof ds.mode_labels  === 'string' ? (() => { try { return JSON.parse(ds.mode_labels);  } catch { return ds.mode_labels;  } })() : ds.mode_labels)  : null;
  const modeRanges  = ds.mode_ranges  ? (typeof ds.mode_ranges  === 'string' ? (() => { try { return JSON.parse(ds.mode_ranges);  } catch { return ds.mode_ranges;  } })() : ds.mode_ranges)  : null;

  const dimensionStr = Array.isArray(dimensions) ? dimensions.join(' × ') : (dimensions ? String(dimensions) : null);

  // Resolve lineage
  const lineageList = lineageRaw?.data ?? (Array.isArray(lineageRaw) ? lineageRaw : []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/datasets"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
        >
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
                  {ds.data_type   && <Badge color="purple">{ds.data_type}</Badge>}
                  {ds.visibility  && <Badge color={ds.visibility === 'public' ? 'green' : 'amber'}>{ds.visibility}</Badge>}
                  {ds.technique   && <Badge color="blue">{ds.technique}</Badge>}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 flex-wrap">
                {ds.spectra_count != null && (
                  <span><strong className="text-slate-300">{ds.spectra_count}</strong> espectros</span>
                )}
                {dimensionStr && (
                  <span>Dimensões: <strong className="text-slate-300">{dimensionStr}</strong></span>
                )}
                {ds.file_format && (
                  <span>Formato: <strong className="text-slate-300">{ds.file_format.toUpperCase()}</strong></span>
                )}
                {ds.x_points != null && (
                  <span>Pontos: <strong className="text-slate-300">{ds.x_points}</strong></span>
                )}
                <span>Criado em: <strong className="text-slate-300">{new Date(ds.created_at).toLocaleDateString('pt-BR')}</strong></span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Tab active={tab === 'info'} onClick={() => setTab('info')}>
          <Eye className="w-4 h-4 inline mr-1.5" />Informações
        </Tab>
        <Tab active={tab === 'spectral'} onClick={() => setTab('spectral')}>
          <Activity className="w-4 h-4 inline mr-1.5" />Espectral
        </Tab>
        <Tab active={tab === 'stats'} onClick={() => setTab('stats')}>
          <BarChart2 className="w-4 h-4 inline mr-1.5" />Estatísticas
        </Tab>
        <Tab active={tab === 'lineage'} onClick={() => setTab('lineage')}>
          <GitBranch className="w-4 h-4 inline mr-1.5" />Linhagem
        </Tab>
      </div>

      {/* Tab: Informações */}
      {tab === 'info' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 space-y-1">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Detalhes do Dataset
          </h3>
          <InfoRow label="UUID"          value={ds.uuid} />
          <InfoRow label="Nome"          value={ds.name} />
          <InfoRow label="Descrição"     value={ds.description} />
          <InfoRow label="Tipo de dado"  value={ds.data_type} />
          <InfoRow label="Técnica"       value={ds.technique} />
          <InfoRow label="Visibilidade"  value={ds.visibility} />
          <InfoRow label="Formato"       value={ds.file_format} />
          <InfoRow label="Dimensões"     value={dimensionStr} />
          <InfoRow label="Ordem dos dados" value={
            ds.data_order === 0 ? 'Amostras × Variáveis' :
            ds.data_order === 1 ? 'Variáveis × Amostras' :
            ds.data_order != null ? String(ds.data_order) : null
          } />
          <InfoRow label="Eixo de amostras" value={ds.sample_axis != null ? String(ds.sample_axis) : null} />
          <InfoRow label="Caminho de armazenamento" value={ds.storage_path} />
          <InfoRow label="Criado em"     value={new Date(ds.created_at).toLocaleString('pt-BR')} />
          <InfoRow label="Atualizado em" value={ds.updated_at ? new Date(ds.updated_at).toLocaleString('pt-BR') : null} />

          {/* Dataset filho */}
          {ds.parent_dataset_id && (
            <InfoRow label="Dataset pai" value={`ID ${ds.parent_dataset_id}`} />
          )}
          {ds.derived_from_operation && (
            <InfoRow label="Derivado de" value={ds.derived_from_operation} />
          )}
        </motion.div>
      )}

      {/* Tab: Espectral */}
      {tab === 'spectral' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 space-y-1">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Informações Espectrais
          </h3>
          <InfoRow label="Espectros"     value={ds.spectra_count != null ? String(ds.spectra_count) : null} />
          <InfoRow label="Pontos por espectro" value={ds.x_points != null ? String(ds.x_points) : null} />
          <InfoRow label="X mínimo"      value={ds.x_min != null ? String(ds.x_min) : null} />
          <InfoRow label="X máximo"      value={ds.x_max != null ? String(ds.x_max) : null} />
          <InfoRow label="Unidade X"     value={ds.x_unit} />
          <InfoRow label="Unidade Y"     value={ds.y_unit} />

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

          {modeRanges && (
            <div className="py-2.5 border-b border-white/5">
              <span className="text-slate-500 text-sm block mb-2">Intervalos de modo</span>
              <pre className="text-xs text-slate-300 bg-white/5 rounded p-3 overflow-auto">
                {JSON.stringify(modeRanges, null, 2)}
              </pre>
            </div>
          )}

          {ds.reference_labels && (
            <div className="py-2.5">
              <span className="text-slate-500 text-sm block mb-2">Rótulos de referência</span>
              <pre className="text-xs text-slate-300 bg-white/5 rounded p-3 overflow-auto">
                {typeof ds.reference_labels === 'string' ? ds.reference_labels : JSON.stringify(ds.reference_labels, null, 2)}
              </pre>
            </div>
          )}

          {!ds.spectra_count && !ds.x_points && !modeLabels && (
            <EmptyState
              icon={Activity}
              title="Sem dados espectrais"
              description="Este dataset não possui metadados espectrais registrados."
            />
          )}
        </motion.div>
      )}

      {/* Tab: Estatísticas */}
      {tab === 'stats' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmptyState
            icon={BarChart2}
            title="Estatísticas não disponíveis"
            description="Execute uma análise para gerar estatísticas descritivas deste dataset."
          />
        </motion.div>
      )}

      {/* Tab: Linhagem */}
      {tab === 'lineage' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Linhagem do Dataset
          </h3>
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
