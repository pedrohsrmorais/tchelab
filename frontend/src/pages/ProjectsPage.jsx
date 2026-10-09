import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, Search, Calendar, Users, Database, ChevronRight, Trash2, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

function ProjectCard({ project, onDelete }) {
  return (
    <div
      className="card card-hover group"
    >
      <Link to={`/projects/${project.uuid}`} className="block p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-5 h-5 text-blue-400" />
          </div>
          <span className={`badge ${project.visibility === 'public' ? 'badge-green' : 'badge-blue'}`}>
            {project.visibility === 'public' ? 'Público' : 'Privado'}
          </span>
        </div>
        <h3 className="font-semibold text-white mb-1 truncate">{project.name}</h3>
        <p className="text-sm text-slate-400 line-clamp-2 mb-4 min-h-[2.5rem]">{project.description || 'Sem descrição'}</p>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {project.dataset_count ?? 0} datasets</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />
            {new Date(project.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </Link>
      <div className="border-t border-white/5 px-5 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 truncate">{project.owner_email || 'Você'}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.preventDefault(); onDelete(project); }}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>
    </div>
  );
}

function CreateProjectModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', is_public: false });
  const { mutate, loading } = useMutation(api.projects.create);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    const { is_public, ...rest } = form;
    const result = await mutate({ ...rest, visibility: is_public ? 'public' : 'private' });
    if (result) { toast.success('Projeto criado!'); onCreated(result); onClose(); setForm({ name: '', description: '', is_public: false }); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Projeto" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">Nome do Projeto *</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Análise de Solos 2024" />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">Descrição</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descreva o objetivo do projeto..." />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
            <div className={`w-10 h-5 rounded-full transition-colors ${form.is_public ? 'bg-blue-600' : 'bg-slate-600'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_public ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm text-slate-300">Projeto público</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Criando...' : 'Criar Projeto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { data, loading, refetch } = useApi(api.projects.list, []);
  const { mutate: deleteProject, loading: deleting } = useMutation(api.projects.delete);

  const projects = (data?.data ?? data ?? []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteProject(deleteTarget.uuid);
    if (ok !== null) { toast.success('Projeto removido.'); refetch(); }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projetos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Organize suas análises em projetos</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Projeto
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder="Buscar projetos..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Nenhum projeto encontrado"
          description={search ? 'Tente outro termo de busca.' : 'Crie seu primeiro projeto para começar.'}
          action={!search && <button onClick={() => setCreateOpen(true)} className="btn-primary">Criar Projeto</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <ProjectCard key={p.uuid} project={p} onDelete={setDeleteTarget} />
            ))}
        </div>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetch} />

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover Projeto" size="sm">
        <p className="text-slate-300 mb-6">Tem certeza que deseja remover <strong className="text-white">{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
            {deleting ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
