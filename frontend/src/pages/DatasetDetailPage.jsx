import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Database, GitBranch, Eye, Table, BarChart2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';

function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{children}</button>;
}

export default function DatasetDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('preview');
  const { data: raw, loading } = useApi(() => api.datasets.get(id), [id]);
  const { data: preview } = useApi(() => api.datasets.preview(id), [id]);
  const { data: lineage } = useApi(() => api.datasets.lineage(id), [id]);

  if (loading) return <div className="space-y-4"><SkeletonCard className="h-32" /><SkeletonCard className="h-64" /></div>;

  const ds = raw?.data ?? raw;
  if (!ds) return <EmptyState icon={Database} title="Dataset não encontrado" description="Este dataset não existe ou foi removido." />;

  const headers = preview?.columns ?? [];
  const rows = preview?.rows ?? [];

  return (
    <div className="space-y-6">
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
              <h1 className="text-2xl font-bold text-white">{ds.name}</h1>
              <p className="text-slate-400 mt-1">{ds.description || 'Sem descrição'}</p>
              <div className="flex items-center gap-4 text-xs text-slate-500 mt-3">
                <span><strong className="text-slate-300">{ds.rows_count ?? 0}</strong> linhas</span>
                <span><strong className="text-slate-300">{ds.columns_count ?? 0}</strong> colunas</span>
                <span>Tipo: <strong className="text-slate-300">{ds.type ?? 'tabular'}</strong></span>
                {ds.file_size && <span>Tamanho: <strong className="text-slate-300">{(ds.file_size / 1024).toFixed(1)} KB</strong></span>}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <Tab active={tab === 'preview'} onClick={() => setTab('preview')}><Eye className="w-4 h-4 inline mr-1.5" />Pré-visualização</Tab>
        <Tab active={tab === 'stats'} onClick={() => setTab('stats')}><BarChart2 className="w-4 h-4 inline mr-1.5" />Estatísticas</Tab>
        <Tab active={tab === 'lineage'} onClick={() => setTab('lineage')}><GitBranch className="w-4 h-4 inline mr-1.5" />Linhagem</Tab>
      </div>

      {tab === 'preview' && (
        <div className="card overflow-hidden">
          {headers.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'rgba(30, 58, 138, 0.3)' }}>
                    {headers.map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-blue-300 font-medium whitespace-nowrap border-b border-white/10">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      {(Array.isArray(row) ? row : Object.values(row)).map((cell, ci) => (
                        <td key={ci} className="px-4 py-2.5 text-slate-300 whitespace-nowrap font-mono text-xs">{cell ?? '–'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState icon={Table} title="Sem dados disponíveis" description="O dataset ainda não tem dados para visualizar." />
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <EmptyState icon={BarChart2} title="Estatísticas" description="Estatísticas descritivas das colunas do dataset." />
      )}

      {tab === 'lineage' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Linhagem do Dataset</h3>
          {lineage?.data?.length > 0 ? (
            <div className="space-y-3">
              {(lineage.data ?? []).map((l, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <GitBranch className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-slate-300">{l.action}</span>
                  <span className="text-slate-500 text-xs ml-auto">{new Date(l.created_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Nenhum histórico de linhagem disponível.</p>
          )}
        </div>
      )}
    </div>
  );
}
