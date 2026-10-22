import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, Search, Calendar, Database, GitBranch, ChevronRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { currentLocale } from '../i18n';
import { parseApiError } from '../utils/errors';
import Avatar from '../components/ui/Avatar';
import { AccessBadge } from './ProjectDetailPage';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

function ProjectCard({ project, onDelete }) {
  const { t } = useTranslation();
  const isOwner = project.my_access === 'owner';
  return (
    <div className="card card-hover group flex flex-col">
      <Link to={`/projects/${project.uuid}`} className="block p-5 flex-1">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <AccessBadge level={project.my_access} />
            <span className={`badge ${project.visibility === 'public' ? 'badge-green' : 'badge-blue'}`}>
              {project.visibility === 'public' ? t('projects.public') : t('projects.private')}
            </span>
          </div>
        </div>
        <h3 className="font-semibold mb-1 truncate" style={{ color: 'var(--text-primary)' }}>{project.name}</h3>
        <p className="text-sm line-clamp-2 mb-4 min-h-[2.5rem]" style={{ color: 'var(--text-muted)' }}>{project.description || t('common.noDescription')}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {project.workflow_count ?? 0}</span>
          <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {t('projects.datasetCountLabel', { count: project.dataset_count ?? 0 })}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(project.created_at).toLocaleDateString(currentLocale())}</span>
        </div>
      </Link>
      <div className="px-5 py-3 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-xs truncate flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          {isOwner ? t('projects.you') : (<><Avatar name={project.owner_name} src={project.owner_avatar_url} size={16} /> {project.owner_name}</>)}
          {project.via && <span className="opacity-70">· {project.via}</span>}
        </span>
        <div className="flex items-center gap-1">
          {isOwner && (
            <button aria-label={t('common.delete')} onClick={(e) => { e.preventDefault(); onDelete(project); }}
              className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors opacity-60 hover:opacity-100" style={{ color: 'var(--text-muted)' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </div>
  );
}

function CreateProjectModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const empty = { name: '', description: '', is_public: false };
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('projects.nameRequiredError')); return; }
    setLoading(true);
    try {
      const { is_public, ...rest } = form;
      const res = await api.projects.create({ ...rest, visibility: is_public ? 'public' : 'private' });
      toast.success(t('projects.createdSuccess'));
      setForm(empty); onClose(); onCreated(res.data?.data ?? res.data);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('projects.newProject')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.nameLabel')}</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('projects.namePlaceholder')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('projects.descriptionPlaceholder')} />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" style={{ accentColor: 'var(--accent)' }} checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
          <span>
            <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('projects.publicToggleLabel')}</span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t('projects.publicToggleHint')}</span>
          </span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? t('projects.creating') : t('projects.create')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('mine'); // mine | shared
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { data, loading, refetch } = useApi(() => api.projects.list({ scope: tab }), [tab]);

  const projects = (Array.isArray(data) ? data : []).filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await api.projects.delete(deleteTarget.uuid); toast.success(t('projects.removedSuccess')); await refetch(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('projects.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('projects.subtitle')}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('projects.newProject')}</button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div role="tablist" className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {['mine', 'shared'].map(k => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>
              {t(`projects.tab_${k}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input className="input-field pl-10" placeholder={t('projects.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderOpen}
          title={tab === 'shared' ? t('projects.sharedEmptyTitle') : t('projects.emptyTitle')}
          description={search ? t('projects.empty.noResults') : (tab === 'shared' ? t('projects.sharedEmptyDesc') : t('projects.empty.noData'))}
          action={!search && tab === 'mine' && <button onClick={() => setCreateOpen(true)} className="btn-primary">{t('projects.create')}</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => <ProjectCard key={p.uuid} project={p} onDelete={setDeleteTarget} />)}
        </div>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetch} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('projects.removeTitle')} size="sm">
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{t('projects.removeConfirmPrefix')} <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.name}</strong>{t('projects.removeConfirmSuffix')}</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">{deleting ? t('projects.removing') : t('projects.remove')}</button>
        </div>
      </Modal>
    </div>
  );
}
