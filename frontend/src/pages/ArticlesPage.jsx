import React, { useState } from 'react';
import { BookOpen, Plus, Search, Upload, FileText, Cpu, Trash2, Calendar, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';
import { useAuthStore } from '../store/auth';

function ArticleCard({ article, onDelete, canAnalyze }) {
  const { mutate: analyze, loading: analyzing } = useMutation(() => api.articles.analyze(article.uuid));
  const handleAnalyze = async (e) => {
    e.stopPropagation();
    const ok = await analyze();
    if (ok !== null) toast.success('Análise iniciada!');
  };
  return (
    <div className="card p-5 flex flex-col gap-3 group">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{article.title}</h3>
          {article.authors && <p className="text-xs text-slate-400 mt-0.5 truncate">{article.authors}</p>}
          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{article.abstract || article.summary || 'Sem resumo'}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(article.created_at).toLocaleDateString('pt-BR')}</span>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAnalyze && (
            <button onClick={handleAnalyze} disabled={analyzing} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-xs">
              <Cpu className="w-3 h-3" /> {analyzing ? 'Analisando...' : 'Analisar com IA'}
            </button>
          )}
          <button onClick={() => onDelete(article)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadArticleModal({ open, onClose, onUploaded }) {
  const [method, setMethod] = useState('file'); // file | manual
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ title: '', authors: '', abstract: '' });
  const { mutate: uploadPdf, loading: uploading } = useMutation((fd) => api.articles.upload(fd));
  const { mutate: createArticle, loading: creating } = useMutation(api.articles.create);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (method === 'file') {
      if (!file) { toast.error('Selecione um arquivo PDF'); return; }
      const fd = new FormData(); fd.append('file', file);
      const ok = await uploadPdf(fd);
      if (ok !== null) { toast.success('Artigo enviado!'); onUploaded(); onClose(); setFile(null); }
    } else {
      if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
      const ok = await createArticle(form);
      if (ok !== null) { toast.success('Artigo criado!'); onUploaded(); onClose(); setForm({ title: '', authors: '', abstract: '' }); }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Artigo" size="md">
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
        {[{ key: 'file', label: 'Upload PDF' }, { key: 'manual', label: 'Manual' }].map(t => (
          <button key={t.key} onClick={() => setMethod(t.key)}
            className="flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all"
            style={{ background: method === t.key ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'transparent', color: method === t.key ? '#fff' : '#94a3b8' }}>
            {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {method === 'file' ? (
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Arquivo PDF *</label>
            <label className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-white/20 hover:border-blue-500/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm text-slate-400">{file ? file.name : 'Clique para selecionar ou arraste um PDF'}</span>
              <input type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files[0])} />
            </label>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Título *</label>
              <input className="input-field" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título do artigo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Autores</label>
              <input className="input-field" value={form.authors} onChange={e => setForm(f => ({ ...f, authors: e.target.value }))} placeholder="Autor A, Autor B, ..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Resumo</label>
              <textarea className="input-field resize-none" rows={4} value={form.abstract} onChange={e => setForm(f => ({ ...f, abstract: e.target.value }))} placeholder="Abstract..." />
            </div>
          </>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" disabled={uploading || creating} className="btn-primary flex-1">{uploading || creating ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ArticlesPage() {
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { data, loading, refetch } = useApi(api.articles.list, []);
  const { mutate: deleteArticle, loading: deleting } = useMutation(api.articles.delete);
  const { isPlus } = useAuthStore();

  const articles = (data?.data ?? data ?? []).filter(a =>
    a.title?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteArticle(deleteTarget.uuid);
    if (ok !== null) { toast.success('Artigo removido.'); refetch(); }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Artigos Científicos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Sua base de conhecimento quimiométrico</p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Adicionar Artigo
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder="Buscar artigos..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <SkeletonCard key={i} className="h-24" />)}</div>
      ) : articles.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nenhum artigo"
          description={search ? 'Tente outro termo.' : 'Adicione artigos científicos à sua base.'}
          action={!search && <button onClick={() => setUploadOpen(true)} className="btn-primary">Adicionar Artigo</button>} />
      ) : (
        <div className="space-y-3">
          {articles.map(a => <ArticleCard key={a.uuid} article={a} onDelete={setDeleteTarget} canAnalyze={isPlus()} />)}
        </div>
      )}
      <UploadArticleModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={refetch} />
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remover Artigo" size="sm">
        <p className="text-slate-300 mb-6">Remover <strong className="text-white">{deleteTarget?.title}</strong>? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">{deleting ? 'Removendo...' : 'Remover'}</button>
        </div>
      </Modal>
    </div>
  );
}
