import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Play, Save, Plus, GitBranch, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

const NODE_TYPES = [
  { type: 'preprocessing', label: 'Pré-processamento', color: 'blue', desc: 'Normalização, filtros, transformações' },
  { type: 'decomposition', label: 'Decomposição', color: 'purple', desc: 'PCA, ICA, NMF, MCR-ALS' },
  { type: 'regression', label: 'Regressão', color: 'green', desc: 'MLR, PLS, Ridge, SVR' },
  { type: 'classification', label: 'Classificação', color: 'amber', desc: 'LDA, KNN, SVM, RF' },
  { type: 'visualization', label: 'Visualização', color: 'red', desc: 'Scores, loadings, biplot' },
  { type: 'export', label: 'Exportar', color: 'slate', desc: 'Salvar resultados' },
];

export default function WorkflowEditorPage() {
  const { id } = useParams();
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [executing, setExecuting] = useState(false);

  const { data: raw, loading } = useApi(() => api.workflows.get(id), [id]);
  const { data: nodes, refetch: refetchNodes } = useApi(() => api.workflows.nodes(id), [id]);
  const { mutate: addNode, loading: addingNode } = useMutation((n) => api.workflows.addNode(id, n));
  const { mutate: dispatch } = useMutation(() => api.workflows.dispatch(id));

  if (loading) return <div className="space-y-4"><SkeletonCard className="h-24" /><SkeletonCard className="h-96" /></div>;

  const workflow = raw?.data ?? raw;
  if (!workflow) return <EmptyState icon={Cpu} title="Workflow não encontrado" description="Este workflow não existe." />;

  const nodesList = nodes?.data ?? nodes ?? [];

  const handleAddNode = async () => {
    if (!selectedType || !nodeName.trim()) { toast.error('Selecione o tipo e informe o nome'); return; }
    const ok = await addNode({ type: selectedType, name: nodeName, parameters: {} });
    if (ok !== null) { toast.success('Nó adicionado!'); refetchNodes(); setAddNodeOpen(false); setSelectedType(''); setNodeName(''); }
  };

  const handleDispatch = async () => {
    setExecuting(true);
    const ok = await dispatch();
    setExecuting(false);
    if (ok !== null) toast.success('Execução iniciada!');
  };

  const typeConfig = Object.fromEntries(NODE_TYPES.map(t => [t.type, t]));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/workflows" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar aos Workflows
        </Link>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{workflow.name}</h1>
              <p className="text-slate-400 text-sm mt-0.5">{workflow.description || 'Sem descrição'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setAddNodeOpen(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
                <Plus className="w-3.5 h-3.5" /> Adicionar Nó
              </button>
              <motion.button onClick={handleDispatch} disabled={executing} whileTap={{ scale: 0.96 }} className="btn-primary flex items-center gap-2 text-sm">
                <Play className="w-4 h-4" /> {executing ? 'Executando...' : 'Executar'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Workflow canvas */}
      <div className="card p-6 min-h-96">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Pipeline</h2>
        {nodesList.length === 0 ? (
          <EmptyState icon={GitBranch} title="Pipeline vazio"
            description="Adicione nós para construir seu pipeline analítico."
            action={<button onClick={() => setAddNodeOpen(true)} className="btn-primary">Adicionar Nó</button>} />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            {nodesList.map((node, i) => {
              const tc = typeConfig[node.type] || { label: node.type, color: 'blue' };
              return (
                <React.Fragment key={node.id ?? i}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                    className={`card p-4 min-w-32 text-center border border-${tc.color}-500/30 hover:border-${tc.color}-500/60 transition-colors cursor-pointer`}
                  >
                    <div className={`text-xs font-semibold text-${tc.color}-400 uppercase tracking-wide mb-1`}>{tc.label}</div>
                    <div className="text-sm font-medium text-white">{node.name}</div>
                    {node.status && <div className="text-xs text-slate-500 mt-1">{node.status}</div>}
                  </motion.div>
                  {i < nodesList.length - 1 && (
                    <div className="text-slate-600">→</div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Add node modal */}
      <Modal open={addNodeOpen} onClose={() => setAddNodeOpen(false)} title="Adicionar Nó" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {NODE_TYPES.map(t => (
              <button key={t.type} onClick={() => setSelectedType(t.type)}
                className={`text-left p-3 rounded-xl border transition-all ${selectedType === t.type ? `border-${t.color}-500 bg-${t.color}-500/10` : 'border-white/10 hover:border-white/20'}`}>
                <div className={`text-xs font-semibold text-${t.color}-400 uppercase tracking-wide`}>{t.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
          {selectedType && (
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Nome do Nó *</label>
              <input className="input-field" value={nodeName} onChange={e => setNodeName(e.target.value)} placeholder={`Ex: ${typeConfig[selectedType]?.label} 1`} />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddNodeOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleAddNode} disabled={addingNode || !selectedType || !nodeName.trim()} className="btn-primary flex-1">
              {addingNode ? 'Adicionando...' : 'Adicionar Nó'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
