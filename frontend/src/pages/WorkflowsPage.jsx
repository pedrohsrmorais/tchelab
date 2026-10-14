import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Cpu, Search, Play, GitFork, Clock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

function WorkflowCard({ workflow }) {
  const { t } = useTranslation();
  const statusConfig = {
    draft: { label: t('workflows.statusDraft'), color: 'blue', icon: Clock },
    ready: { label: t('workflows.statusReady'), color: 'green', icon: CheckCircle2 },
    archived: { label: t('workflows.statusArchived'), color: 'amber', icon: Clock },
  };
  const status = statusConfig[workflow.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  return (
    <Link to={`/workflows/${workflow.uuid}`}>
      <div className="card card-hover p-5 flex flex-col gap-4 group cursor-pointer h-full">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <span className={`badge badge-${status.color}`}>
            <StatusIcon className="w-3 h-3 inline mr-1" />{status.label}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{workflow.name}</h3>
          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{workflow.description || t('common.noDescription')}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {t('workflows.executionCountLabel', { count: workflow.execution_count ?? 0 })}</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-600 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}

function CreateWorkflowModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', description: '' });
  const { data: templates } = useApi(api.workflows.templates, []);
  const [templateId, setTemplateId] = useState('');
  const { mutate, loading } = useMutation(api.workflows.create);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('workflows.nameRequiredError')); return; }
    const payload = { ...form };
    if (templateId) payload.template_id = templateId;
    const result = await mutate(payload);
    if (result) { toast.success(t('workflows.createdSuccess')); onCreated(); onClose(); setForm({ name: '', description: '' }); setTemplateId(''); }
  };

  const templatesList = templates?.data ?? templates ?? [];

  return (
    <Modal open={open} onClose={onClose} title={t('workflows.newWorkflow')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('workflows.nameLabel')}</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('workflows.namePlaceholder')} />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('workflows.descriptionPlaceholder')} />
        </div>
        {templatesList.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('workflows.templateLabel')}</label>
            <select className="input-field" value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">{t('workflows.startFromScratch')}</option>
              {templatesList.map(tpl => <option key={tpl.id ?? tpl.uuid} value={tpl.id ?? tpl.uuid}>{tpl.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? t('workflows.creating') : t('workflows.create')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function WorkflowsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data, loading, refetch } = useApi(api.workflows.list, []);

  const workflows = (data?.data ?? data ?? []).filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('workflows.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('workflows.subtitle')}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('workflows.newWorkflow')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder={t('workflows.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState icon={Cpu} title={t('workflows.emptyTitle')}
          description={search ? t('workflows.empty.noResults') : t('workflows.empty.noData')}
          action={!search && <button onClick={() => setCreateOpen(true)} className="btn-primary">{t('workflows.create')}</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(w => <WorkflowCard key={w.uuid} workflow={w} />)}
        </div>
      )}

      <CreateWorkflowModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetch} />
    </div>
  );
}
