import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Database, Cpu, Users, Plus, Calendar, Globe, Lock, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
      {children}
    </button>
  );
}

export default function ProjectDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [tab, setTab] = useState('datasets');
  const [addDatasetOpen, setAddDatasetOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState('');

  const { data: project, loading } = useApi(() => api.projects.get(id), [id]);
  const { data: datasets } = useApi(() => api.projects.listDatasets(id), [id]);
  const { data: allDatasets } = useApi(api.datasets.list, []);
  const { mutate: addDataset, loading: adding } = useMutation((dsId) => api.projects.addDataset(id, dsId));

  if (loading) return (
    <div className="space-y-4">
      <SkeletonCard className="h-32" />
      <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );

  if (!project) return (
    <EmptyState icon={Database} title={t('projects.notFound')} description={t('projects.notFoundDesc')} />
  );

  const proj = project.data ?? project;

  const handleAddDataset = async () => {
    if (!selectedDataset) { toast.error(t('projects.selectDatasetError')); return; }
    const ok = await addDataset(selectedDataset);
    if (ok !== null) { toast.success(t('projects.datasetAddedSuccess')); setAddDatasetOpen(false); }
  };

  const datasetsList = datasets?.data ?? datasets ?? [];
  const allDatasetsList = allDatasets?.data ?? allDatasets ?? [];
  const available = allDatasetsList.filter(d => !datasetsList.find(pd => pd.uuid === d.uuid));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/projects" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> {t('projects.backToProjects')}
        </Link>
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{proj.name}</h1>
                <span className={`badge ${proj.is_public ? 'badge-green' : 'badge-blue'}`}>
                  {proj.is_public ? <><Globe className="w-3 h-3" /> {t('projects.public')}</> : <><Lock className="w-3 h-3" /> {t('projects.private')}</>}
                </span>
              </div>
              <p className="text-slate-400">{proj.description || t('common.noDescription')}</p>
              <div className="flex items-center gap-1 text-xs text-slate-500 mt-3">
                <Calendar className="w-3 h-3" />
                {t('common.createdAt')} {new Date(proj.created_at).toLocaleDateString(i18n.language)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Tab active={tab === 'datasets'} onClick={() => setTab('datasets')}><Database className="w-4 h-4 inline mr-1.5" />{t('nav.datasets')}</Tab>
        <Tab active={tab === 'workflows'} onClick={() => setTab('workflows')}><Cpu className="w-4 h-4 inline mr-1.5" />{t('nav.workflows')}</Tab>
        <Tab active={tab === 'members'} onClick={() => setTab('members')}><Users className="w-4 h-4 inline mr-1.5" />{t('projects.members')}</Tab>
        <Tab active={tab === 'history'} onClick={() => setTab('history')}><History className="w-4 h-4 inline mr-1.5" />{t('projects.history')}</Tab>
      </div>

      {/* Tab content */}
      {tab === 'datasets' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{t('projects.linkedDatasets')}</h2>
            <button onClick={() => setAddDatasetOpen(true)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
              <Plus className="w-3.5 h-3.5" /> {t('projects.addDataset')}
            </button>
          </div>
          {datasetsList.length === 0 ? (
            <EmptyState icon={Database} title={t('datasets.empty.title')} description={t('projects.noDatasetsDesc')} action={<button onClick={() => setAddDatasetOpen(true)} className="btn-primary">{t('projects.addDataset')}</button>} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {datasetsList.map(ds => {
                let dims = null;
                try { dims = ds.dimensions ? (typeof ds.dimensions === 'string' ? JSON.parse(ds.dimensions) : ds.dimensions) : null; } catch {}
                return (
                  <Link key={ds.uuid} to={`/datasets/${ds.uuid}`}>
                    <div className="card card-hover p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Database className="w-5 h-5 text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{ds.name}</div>
                        <div className="text-xs text-slate-400">{t('projects.dimsLabel', { rows: dims?.[0] ?? 0, cols: dims?.[1] ?? 0 })}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'workflows' && (
        <EmptyState icon={Cpu} title={t('nav.workflows')} description={t('projects.workflowsTabDesc')} />
      )}
      {tab === 'members' && (
        <EmptyState icon={Users} title={t('projects.members')} description={t('projects.membersTabDesc')} />
      )}
      {tab === 'history' && (
        <EmptyState icon={History} title={t('projects.history')} description={t('projects.historyTabDesc')} />
      )}

      {/* Add dataset modal */}
      <Modal open={addDatasetOpen} onClose={() => setAddDatasetOpen(false)} title={t('projects.addDataset')} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('projects.selectDatasetLabel')}</label>
            <select className="input-field" value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)}>
              <option value="">{t('communities.chooseOption')}</option>
              {available.map(d => <option key={d.uuid} value={d.uuid}>{d.name}</option>)}
            </select>
            {available.length === 0 && <p className="text-xs text-slate-400 mt-2">{t('projects.allDatasetsLinked')} <Link to="/datasets" className="text-blue-400 hover:underline">{t('projects.createNewDataset')}</Link></p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddDatasetOpen(false)} className="btn-ghost flex-1">{t('common.cancel')}</button>
            <button onClick={handleAddDataset} disabled={adding || !selectedDataset} className="btn-primary flex-1">
              {adding ? t('projects.adding') : t('common.add')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
