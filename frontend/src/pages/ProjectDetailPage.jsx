import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Database, GitBranch, Users, Plus, Calendar, Globe, Lock, History, Star, Trash2, Pencil,
  Library, Eye, PenLine, Crown, Search, X, Play,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { currentLocale } from '../i18n';
import { useAuthStore } from '../store/auth';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import { parseApiError } from '../utils/errors';

const TAB_ICONS = { datasets: Database, workflows: GitBranch, techniques: Star, communities: Library, members: Users, history: History };

function Tab({ active, onClick, icon: Icon, children, count }) {
  return (
    <button
      role="tab" aria-selected={active} onClick={onClick}
      className="px-3.5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
      style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)' }}
    >
      <Icon className="w-4 h-4" />{children}
      {count != null && <span className="text-[0.7rem] opacity-75">({count})</span>}
    </button>
  );
}

const ACCESS_BADGE = { owner: 'badge-purple', admin: 'badge-purple', editor: 'badge-amber', member: 'badge-blue', viewer: 'badge-blue' };

export function AccessBadge({ level }) {
  const { t } = useTranslation();
  if (!level) return null;
  const Icon = level === 'viewer' ? Eye : level === 'owner' ? Crown : PenLine;
  return (
    <span className={`badge ${ACCESS_BADGE[level] || 'badge-blue'} inline-flex items-center gap-1`}>
      <Icon className="w-3 h-3" /> {t(`projects.access.${level}`)}
    </span>
  );
}

const dimsOf = (ds) => {
  try { return ds.dimensions ? (typeof ds.dimensions === 'string' ? JSON.parse(ds.dimensions) : ds.dimensions) : null; } catch { return null; }
};

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const [tab, setTab] = useState('workflows');
  const [modal, setModal] = useState(null); // 'dataset' | 'workflow' | 'technique' | 'community' | 'member' | 'edit' | 'delete'
  const [busy, setBusy] = useState(false);

  const { data: project, loading, error, refetch: refetchProject } = useApi(() => api.projects.get(id), [id]);
  const { data: datasets, refetch: refetchDatasets } = useApi(() => api.projects.listDatasets(id), [id]);
  const { data: workflows, refetch: refetchWorkflows } = useApi(() => api.projects.listWorkflows(id), [id]);
  const { data: techniques, refetch: refetchTechniques } = useApi(() => api.projects.listTechniques(id), [id]);
  const { data: linked, refetch: refetchLinked } = useApi(() => api.projects.listCommunities(id), [id]);
  const { data: members, refetch: refetchMembers } = useApi(() => api.projects.listMembers(id), [id]);
  const { data: history } = useApi(() => api.projects.history(id), [id]);

  if (loading) return (
    <div className="space-y-4">
      <SkeletonCard className="h-32" />
      <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
    </div>
  );
  if (error || !project) return (
    <EmptyState icon={Database} title={t('projects.notFound')} description={t('projects.notFoundDesc')}
      action={<Link to="/projects" className="btn-primary">{t('projects.backToProjects')}</Link>} />
  );

  const proj = project;
  const canEdit = !!proj.can_edit;
  const canAdmin = !!proj.can_admin;
  const isOwner = proj.my_access === 'owner';
  const list = (x) => (Array.isArray(x) ? x : []);

  const run = async (fn, okMsg, after) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await after?.(); return true; }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); return false; }
    finally { setBusy(false); }
  };

  const fmt = (d) => new Date(d).toLocaleDateString(currentLocale());

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-2 text-sm mb-4 hover:underline" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="w-4 h-4" /> {t('projects.backToProjects')}
        </Link>
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{proj.name}</h1>
                <span className={`badge ${proj.visibility === 'public' ? 'badge-green' : 'badge-blue'} inline-flex items-center gap-1`}>
                  {proj.visibility === 'public' ? <><Globe className="w-3 h-3" /> {t('projects.public')}</> : <><Lock className="w-3 h-3" /> {t('projects.private')}</>}
                </span>
                <AccessBadge level={proj.my_access} />
              </div>
              <p style={{ color: 'var(--text-muted)' }}>{proj.description || t('common.noDescription')}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t('common.createdAt')} {fmt(proj.created_at)}</span>
                {proj.owner && (
                  <Link to={`/users/${proj.owner.uuid}`} className="flex items-center gap-1.5 hover:underline">
                    <Avatar user={proj.owner} size={18} /> {proj.owner.name}
                  </Link>
                )}
              </div>
              {!canEdit && <p className="text-xs mt-3 badge badge-blue inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {t('projects.readOnlyNotice')}</p>}
            </div>
            <div className="flex gap-2">
              {canAdmin && <button className="btn-ghost flex items-center gap-1.5" onClick={() => setModal('edit')}><Pencil className="w-4 h-4" /> {t('common.edit')}</button>}
              {isOwner && <button className="btn-danger flex items-center gap-1.5" onClick={() => setModal('delete')}><Trash2 className="w-4 h-4" /> {t('common.delete')}</button>}
            </div>
          </div>
        </div>
      </div>

      <div role="tablist" className="flex items-center gap-1 overflow-x-auto pb-1">
        {['workflows', 'datasets', 'techniques', 'communities', 'members', 'history'].map(key => (
          <Tab key={key} active={tab === key} onClick={() => setTab(key)} icon={TAB_ICONS[key]}
            count={{ workflows: list(workflows).length, datasets: list(datasets).length, techniques: list(techniques).length,
              communities: list(linked).length, members: list(members).length }[key]}>
            {t(`projects.tab_${key}`)}
          </Tab>
        ))}
      </div>

      {/* ── Workflows ───────────────────────────────────────────────────── */}
      {tab === 'workflows' && (
        <Section title={t('projects.linkedWorkflows')} action={canEdit && (
          <button onClick={() => setModal('workflow')} className="btn-primary flex items-center gap-2 text-sm py-1.5"><Plus className="w-3.5 h-3.5" /> {t('projects.addWorkflow')}</button>
        )}>
          {list(workflows).length === 0 ? (
            <EmptyState icon={GitBranch} title={t('projects.noWorkflowsTitle')} description={t('projects.workflowsTabDesc')} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list(workflows).map(w => (
                <div key={w.uuid} className="card card-hover p-4 flex items-center gap-4 group">
                  <Link to={`/workflows/${w.uuid}`} className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0"><GitBranch className="w-5 h-5 text-purple-400" /></div>
                    <div className="min-w-0">
                      <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{w.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{w.description || t('common.noDescription')}</div>
                    </div>
                  </Link>
                  {canEdit && (
                    <button aria-label={t('projects.unlink')} title={t('projects.unlink')} className="btn-ghost p-1.5 opacity-60 hover:opacity-100"
                      onClick={() => run(() => api.projects.removeWorkflow(id, w.uuid), t('projects.unlinked'), refetchWorkflows)}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Datasets ────────────────────────────────────────────────────── */}
      {tab === 'datasets' && (
        <Section title={t('projects.linkedDatasets')} action={canEdit && (
          <button onClick={() => setModal('dataset')} className="btn-primary flex items-center gap-2 text-sm py-1.5"><Plus className="w-3.5 h-3.5" /> {t('projects.addDataset')}</button>
        )}>
          {list(datasets).length === 0 ? (
            <EmptyState icon={Database} title={t('datasets.empty.title')} description={t('projects.noDatasetsDesc')} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list(datasets).map(ds => {
                const dims = dimsOf(ds);
                return (
                  <div key={ds.uuid} className="card card-hover p-4 flex items-center gap-4">
                    <Link to={`/datasets/${ds.uuid}`} className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0"><Database className="w-5 h-5 text-purple-400" /></div>
                      <div className="min-w-0">
                        <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ds.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('projects.dimsLabel', { rows: dims?.[0] ?? 0, cols: dims?.[1] ?? 0 })}</div>
                      </div>
                    </Link>
                    {canEdit && (
                      <button aria-label={t('projects.unlink')} title={t('projects.unlink')} className="btn-ghost p-1.5 opacity-60 hover:opacity-100"
                        onClick={() => run(() => api.projects.removeDataset(id, ds.uuid), t('projects.unlinked'), refetchDatasets)}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ── Técnicas ────────────────────────────────────────────────────── */}
      {tab === 'techniques' && (
        <Section title={t('projects.favoriteTechniques')} action={canEdit && (
          <button onClick={() => setModal('technique')} className="btn-primary flex items-center gap-2 text-sm py-1.5"><Plus className="w-3.5 h-3.5" /> {t('projects.addTechnique')}</button>
        )}>
          {list(techniques).length === 0 ? (
            <EmptyState icon={Star} title={t('projects.noTechniquesTitle')} description={t('projects.techniquesTabDesc')} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list(techniques).map(tc => (
                <div key={tc.uuid} className="card card-hover p-4 flex items-center gap-4">
                  <Link to={`/catalogo/${tc.uuid}`} className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0"><Star className="w-5 h-5 text-amber-400" /></div>
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        {tc.name}
                        {tc.kind === 'own' && <span className="badge badge-purple">{t('projects.ownTechnique')}</span>}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{tc.family || tc.category}</div>
                    </div>
                  </Link>
                  {canEdit && (
                    <button aria-label={t('projects.unlink')} title={t('projects.unlink')} className="btn-ghost p-1.5 opacity-60 hover:opacity-100"
                      onClick={() => run(() => api.projects.removeTechnique(id, tc.uuid), t('projects.unlinked'), refetchTechniques)}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Comunidades ─────────────────────────────────────────────────── */}
      {tab === 'communities' && (
        <Section title={t('projects.sharedWithCommunities')} action={canAdmin && (
          <button onClick={() => setModal('community')} className="btn-primary flex items-center gap-2 text-sm py-1.5"><Plus className="w-3.5 h-3.5" /> {t('projects.shareWithCommunity')}</button>
        )}>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{t('projects.communitiesTabDesc')}</p>
          {list(linked).length === 0 ? (
            <EmptyState icon={Library} title={t('projects.noCommunitiesTitle')} description={canAdmin ? t('projects.noCommunitiesDesc') : ''} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list(linked).map(c => (
                <div key={c.uuid} className="card p-4 flex items-center gap-3">
                  <Link to={`/communities/${c.uuid}`} className="min-w-0 flex-1">
                    <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.access === 'edit' ? t('communities.accessEdit') : t('communities.accessRead')}
                    </div>
                  </Link>
                  {canAdmin && (
                    <>
                      <select
                        aria-label={t('communities.accessLevel')} className="input-field !w-auto !py-1 text-xs" value={c.access}
                        onChange={e => run(() => api.communities.updateProjectLink(c.uuid, id, { access: e.target.value }), t('communities.accessUpdated'), refetchLinked)}
                      >
                        <option value="read">{t('communities.accessRead')}</option>
                        <option value="edit">{t('communities.accessEdit')}</option>
                      </select>
                      <button aria-label={t('projects.unlink')} title={t('projects.unlink')} className="btn-ghost p-1.5"
                        onClick={() => run(() => api.communities.unlinkProject(c.uuid, id), t('projects.unlinked'), refetchLinked)}>
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Membros do projeto ──────────────────────────────────────────── */}
      {tab === 'members' && (
        <Section title={t('projects.members')} action={canAdmin && (
          <button onClick={() => setModal('member')} className="btn-primary flex items-center gap-2 text-sm py-1.5"><Plus className="w-3.5 h-3.5" /> {t('projects.addMember')}</button>
        )}>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {list(members).map(m => {
              const isProjectOwner = proj.owner?.uuid === m.uuid;
              return (
                <div key={m.uuid} className="p-3 flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                  <Avatar user={m} size={34} />
                  <Link to={`/users/${m.uuid}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium text-sm truncate block" style={{ color: 'var(--text-primary)' }}>{m.name}{m.uuid === me?.uuid ? ` (${t('projects.you')})` : ''}</span>
                  </Link>
                  {canAdmin && !isProjectOwner ? (
                    <select aria-label={t('projects.role')} className="input-field !w-auto !py-1 text-xs" value={m.role}
                      onChange={e => run(() => api.projects.updateMember(id, m.uuid, { role: e.target.value }), t('projects.roleUpdated'), refetchMembers)}>
                      <option value="viewer">{t('projects.viewer')}</option>
                      <option value="editor">{t('projects.editor')}</option>
                      <option value="admin">{t('projects.admin')}</option>
                    </select>
                  ) : (
                    <span className="badge badge-purple">{isProjectOwner ? t('projects.access.owner') : t(`projects.${m.role === 'collaborator' ? 'editor' : m.role}`)}</span>
                  )}
                  {canAdmin && !isProjectOwner && (
                    <button aria-label={t('communities.remove')} className="btn-ghost p-1.5"
                      onClick={() => run(() => api.projects.removeMember(id, m.uuid), t('projects.memberRemoved'), refetchMembers)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Histórico ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <Section title={t('projects.history')}>
          {list(history).length === 0 ? (
            <EmptyState icon={History} title={t('projects.noHistoryTitle')} description={t('projects.historyTabDesc')} />
          ) : (
            <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
              {list(history).map(ex => (
                <div key={ex.uuid} className="p-3 flex items-center gap-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <Play className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{new Date(ex.created_at).toLocaleString(currentLocale())}</span>
                  <span className={`badge ${ex.status === 'completed' ? 'badge-green' : ex.status === 'failed' ? 'badge-red' : 'badge-blue'}`}>{ex.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Modais ──────────────────────────────────────────────────────── */}
      <AddDatasetModal open={modal === 'dataset'} onClose={() => setModal(null)} linked={list(datasets)} busy={busy}
        onAdd={(dsId) => run(() => api.projects.addDataset(id, dsId), t('projects.datasetAddedSuccess'), async () => { setModal(null); await refetchDatasets(); })} />
      <AddWorkflowModal open={modal === 'workflow'} onClose={() => setModal(null)} linked={list(workflows)} busy={busy}
        onAdd={(wId) => run(() => api.projects.addWorkflow(id, wId), t('projects.workflowAdded'), async () => { setModal(null); await refetchWorkflows(); })}
        onCreate={async (name) => {
          const { data } = await api.workflows.create({ name });
          await api.projects.addWorkflow(id, (data?.data ?? data).uuid);
          setModal(null); await refetchWorkflows(); toast.success(t('projects.workflowAdded'));
        }} />
      <AddTechniqueModal open={modal === 'technique'} onClose={() => setModal(null)} linked={list(techniques)} busy={busy}
        onAdd={(tId) => run(() => api.projects.addTechnique(id, tId), t('projects.techniqueAdded'), refetchTechniques)} />
      <ShareModal open={modal === 'community'} onClose={() => setModal(null)} projectId={id} linked={list(linked)}
        onDone={async () => { setModal(null); await refetchLinked(); }} />
      <AddMemberModal open={modal === 'member'} onClose={() => setModal(null)} busy={busy}
        onAdd={(email, role) => run(() => api.projects.addMember(id, { email, role }), t('projects.memberAdded'), async () => { setModal(null); await refetchMembers(); })} />
      <EditProjectModal open={modal === 'edit'} onClose={() => setModal(null)} project={proj}
        onSaved={async () => { setModal(null); await refetchProject(); }} />
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title={t('projects.removeTitle')} size="sm">
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{t('projects.removeConfirmPrefix')} <strong style={{ color: 'var(--text-primary)' }}>{proj.name}</strong>{t('projects.removeConfirmSuffix')}</p>
        <div className="flex gap-3">
          <button onClick={() => setModal(null)} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button disabled={busy} className="btn-danger flex-1"
            onClick={() => run(() => api.projects.delete(id), t('projects.removedSuccess'), () => navigate('/projects'))}>
            {busy ? t('projects.removing') : t('projects.remove')}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function PickerModal({ open, onClose, title, children, footer }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4">{children}</div>
      {footer}
    </Modal>
  );
}

function AddDatasetModal({ open, onClose, linked, onAdd, busy }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState('');
  const { data } = useApi(() => (open ? api.datasets.list({ limit: 200 }) : null), [open]);
  const available = (Array.isArray(data) ? data : []).filter(d => !linked.find(l => l.uuid === d.uuid));
  return (
    <PickerModal open={open} onClose={onClose} title={t('projects.addDataset')}>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.selectDatasetLabel')}</label>
        <select className="input-field" value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">{t('communities.chooseOption')}</option>
          {available.map(d => <option key={d.uuid} value={d.uuid}>{d.name}</option>)}
        </select>
        {available.length === 0 && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('projects.allDatasetsLinked')} <Link to="/datasets" className="underline">{t('projects.createNewDataset')}</Link></p>}
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
        <button onClick={() => onAdd(sel)} disabled={busy || !sel} className="btn-primary flex-1">{busy ? t('projects.adding') : t('common.add')}</button>
      </div>
    </PickerModal>
  );
}

function AddWorkflowModal({ open, onClose, linked, onAdd, onCreate, busy }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const { data } = useApi(() => (open ? api.workflows.list({ limit: 200 }) : null), [open]);
  const available = (Array.isArray(data) ? data : []).filter(w => !linked.find(l => l.uuid === w.uuid));
  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try { await onCreate(name.trim()); setName(''); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setCreating(false); }
  };
  return (
    <PickerModal open={open} onClose={onClose} title={t('projects.addWorkflow')}>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.existingWorkflow')}</label>
        <div className="flex gap-2">
          <select className="input-field" value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">{t('communities.chooseOption')}</option>
            {available.map(w => <option key={w.uuid} value={w.uuid}>{w.name}</option>)}
          </select>
          <button onClick={() => onAdd(sel)} disabled={busy || !sel} className="btn-primary">{t('common.add')}</button>
        </div>
      </div>
      <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.newWorkflowInProject')}</label>
        <div className="flex gap-2">
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder={t('workflows.namePlaceholder')} />
          <button onClick={create} disabled={creating || !name.trim()} className="btn-primary">{t('common.create')}</button>
        </div>
      </div>
    </PickerModal>
  );
}

function AddTechniqueModal({ open, onClose, linked, onAdd, busy }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data } = useApi(() => (open ? api.techniques.list({ limit: 200 }) : null), [open]);
  const available = (Array.isArray(data) ? data : [])
    .filter(x => !linked.find(l => l.uuid === x.uuid))
    .filter(x => !q || x.name?.toLowerCase().includes(q.toLowerCase()) || x.slug?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);
  return (
    <PickerModal open={open} onClose={onClose} title={t('projects.addTechnique')}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input className="input-field pl-10" placeholder={t('catalog.searchPlaceholder')} value={q} onChange={e => setQ(e.target.value)} autoFocus />
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y rounded-lg" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
        {available.map(x => (
          <li key={x.uuid} className="flex items-center gap-3 p-2.5" style={{ borderColor: 'var(--border)' }}>
            <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{x.name}</span>
            <button className="btn-ghost p-1.5" disabled={busy} onClick={() => onAdd(x.uuid)} aria-label={t('common.add')}><Star className="w-4 h-4" /></button>
          </li>
        ))}
        {available.length === 0 && <li className="p-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>{t('common.empty')}</li>}
      </ul>
    </PickerModal>
  );
}

function ShareModal({ open, onClose, projectId, linked, onDone }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState('');
  const [access, setAccess] = useState('read');
  const [saving, setSaving] = useState(false);
  const { data } = useApi(() => (open ? api.communities.list() : null), [open]);
  const available = (Array.isArray(data) ? data : []).filter(c => !linked.find(l => l.uuid === c.uuid));
  const submit = async () => {
    setSaving(true);
    try { await api.communities.linkProject(sel, projectId, access); toast.success(t('communities.projectLinked')); onDone(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
    finally { setSaving(false); }
  };
  return (
    <PickerModal open={open} onClose={onClose} title={t('projects.shareWithCommunity')}>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.selectCommunity')}</label>
        <select className="input-field" value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">{t('communities.chooseOption')}</option>
          {available.map(c => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
        </select>
      </div>
      <AccessPicker value={access} onChange={setAccess} />
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
        <button onClick={submit} disabled={saving || !sel} className="btn-primary flex-1">{saving ? t('communities.linking') : t('communities.link')}</button>
      </div>
    </PickerModal>
  );
}

/** Escolha leitura x edição ao vincular um projeto a uma comunidade. */
export function AccessPicker({ value, onChange }) {
  const { t } = useTranslation();
  const opts = [
    { v: 'read', icon: Eye, title: t('communities.accessRead'), desc: t('communities.accessReadDesc') },
    { v: 'edit', icon: PenLine, title: t('communities.accessEdit'), desc: t('communities.accessEditDesc') },
  ];
  return (
    <fieldset>
      <legend className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('communities.accessLevel')}</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
        {opts.map(o => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
            className="text-left rounded-xl p-3 transition-colors"
            style={{ border: `1px solid ${value === o.v ? 'var(--accent)' : 'var(--border)'}`, background: value === o.v ? 'var(--bg-hover)' : 'transparent' }}>
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><o.icon className="w-4 h-4" />{o.title}</span>
            <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{o.desc}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AddMemberModal({ open, onClose, onAdd, busy }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  return (
    <PickerModal open={open} onClose={onClose} title={t('projects.addMember')}>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('auth.email')}</label>
        <input type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.emailPlaceholder')} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.role')}</label>
        <select className="input-field" value={role} onChange={e => setRole(e.target.value)}>
          <option value="viewer">{t('projects.viewer')}</option>
          <option value="editor">{t('projects.editor')}</option>
          <option value="admin">{t('projects.admin')}</option>
        </select>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
        <button onClick={() => onAdd(email.trim(), role)} disabled={busy || !email.trim()} className="btn-primary flex-1">{t('common.add')}</button>
      </div>
    </PickerModal>
  );
}

function EditProjectModal({ open, onClose, project, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: project.name, description: project.description || '', visibility: project.visibility });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.projects.update(project.uuid, form); toast.success(t('projects.updated')); onSaved(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('projects.editProject')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('projects.nameLabel')}</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" style={{ accentColor: 'var(--accent)' }} checked={form.visibility === 'public'}
            onChange={e => setForm(f => ({ ...f, visibility: e.target.checked ? 'public' : 'private' }))} />
          <span>
            <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('projects.publicToggleLabel')}</span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t('projects.publicToggleHint')}</span>
          </span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary flex-1">{saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
