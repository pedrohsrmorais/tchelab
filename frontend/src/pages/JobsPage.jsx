import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Search, RefreshCw, CheckCircle2, XCircle, Clock, Play, AlertCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';

const statusConfig = {
  pending:   { label: 'Pendente',   color: 'amber', icon: Clock },
  running:   { label: 'Executando', color: 'blue',  icon: Play },
  completed: { label: 'Concluído',  color: 'green', icon: CheckCircle2 },
  failed:    { label: 'Falhou',     color: 'red',   icon: XCircle },
  cancelled: { label: 'Cancelado',  color: 'slate', icon: AlertCircle },
};

function JobRow({ job }) {
  const status = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="card px-5 py-4 flex items-center gap-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-${status.color}-500/20`}>
        <StatusIcon className={`w-4 h-4 text-${status.color}-400 ${job.status === 'running' ? 'anim-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate">{job.name ?? `Job #${job.id}`}</div>
        <div className="text-xs text-slate-400 mt-0.5 truncate">{job.type ?? 'execution'}</div>
      </div>
      <span className={`badge badge-${status.color} flex-shrink-0`}>{status.label}</span>
      <div className="text-xs text-slate-500 flex-shrink-0 hidden md:block">
        {job.created_at && new Date(job.created_at).toLocaleString('pt-BR')}
      </div>
      {job.status === 'running' && job.progress != null && (
        <div className="w-20 flex-shrink-0">
          <div className="h-1.5 rounded-full bg-slate-700">
            <motion.div className="h-full rounded-full bg-blue-500" initial={{ width: 0 }} animate={{ width: `${job.progress}%` }} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5 text-right">{job.progress}%</div>
        </div>
      )}
    </motion.div>
  );
}

export default function JobsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading, refetch } = useApi(api.jobs.list, []);

  useEffect(() => {
    const interval = setInterval(refetch, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  const jobs = (data?.data ?? data ?? []).filter(j => {
    const matchSearch = j.name?.toLowerCase().includes(search.toLowerCase()) || j.type?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-slate-400 text-sm mt-0.5">Monitor de execuções em andamento e finalizadas</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={refetch} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </motion.button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input-field pl-10" placeholder="Buscar jobs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <SkeletonCard key={i} className="h-16" />)}</div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={Activity} title="Nenhum job" description={search || statusFilter ? 'Nenhum job com estes filtros.' : 'Nenhum job em execução no momento.'} />
      ) : (
        <div className="space-y-2">
          {jobs.map(j => <JobRow key={j.id} job={j} />)}
        </div>
      )}
    </div>
  );
}
