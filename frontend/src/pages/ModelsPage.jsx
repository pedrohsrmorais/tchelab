import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Search, Activity, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';

const statusConfig = {
  trained: { label: 'Treinado', color: 'green', icon: CheckCircle2 },
  training: { label: 'Treinando', color: 'blue', icon: Clock },
  failed: { label: 'Falhou', color: 'red', icon: XCircle },
  draft: { label: 'Rascunho', color: 'amber', icon: Clock },
};

function ModelCard({ model }) {
  const status = statusConfig[model.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  return (
    <motion.div whileHover={{ y: -3 }} className="card card-hover p-5 flex flex-col gap-4 group cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
          <Brain className="w-5 h-5 text-green-400" />
        </div>
        <span className={`badge badge-${status.color}`}><StatusIcon className="w-3 h-3 inline mr-1" />{status.label}</span>
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-white">{model.name}</h3>
        <p className="text-sm text-slate-400 mt-1">{model.algorithm ?? model.type ?? 'Algoritmo não especificado'}</p>
        {model.metrics && (
          <div className="flex items-center gap-3 mt-2">
            {model.metrics.r2 !== undefined && <span className="text-xs text-slate-500">R² <strong className="text-green-400">{Number(model.metrics.r2).toFixed(3)}</strong></span>}
            {model.metrics.rmse !== undefined && <span className="text-xs text-slate-500">RMSE <strong className="text-blue-400">{Number(model.metrics.rmse).toFixed(4)}</strong></span>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{new Date(model.created_at).toLocaleDateString('pt-BR')}</span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-green-400 group-hover:translate-x-1 transition-all" />
      </div>
    </motion.div>
  );
}

export default function ModelsPage() {
  const [search, setSearch] = useState('');
  const { data, loading } = useApi(api.models.list, []);
  const models = (data?.data ?? data ?? []).filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Modelos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Modelos quimiométricos treinados</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder="Buscar modelos..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : models.length === 0 ? (
        <EmptyState icon={Brain} title="Nenhum modelo" description={search ? 'Tente outro termo.' : 'Execute workflows para gerar modelos treinados.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map(m => <ModelCard key={m.uuid} model={m} />)}
        </div>
      )}
    </div>
  );
}
